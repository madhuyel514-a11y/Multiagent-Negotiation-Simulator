import asyncio
import re
import uuid
from typing import Dict, Any

from agents.government_agent import GovernmentAgent
from agents.ngo_agent import NGOAgent
from agents.district_agent import DistrictAdministrationAgent

from services.gemini_service import ask_model
from services.evaluation_engine import calculate_consensus, detect_deadlock, generate_turn_evaluation


class NegotiationOrchestrator:

    def __init__(self):
        self.sessions: Dict[str, Dict[str, Any]] = {}

    # =========================================================
    # CREATE SESSION
    # =========================================================

    def create_session(
        self,
        scenario: dict,
        agents_config: list,
        config: dict
    ) -> str:

        session_id = str(uuid.uuid4())

        agents = []

        for index, cfg in enumerate(agents_config or []):

            cfg = cfg or {}

            agent_id = str(
                cfg.get("id")
                or f"agent-{index + 1}"
            )

            personality = (
                cfg.get("personality")
                or cfg.get("defaultPersonality")
                or "Collaborative"
            )

            role = str(
                cfg.get("role")
                or ""
            )

            name = str(
                cfg.get("name")
                or ""
            )

            identity = f"{role} {name}".lower()

            if "government" in identity:
                agent = GovernmentAgent(
                    agent_id,
                    personality
                )

            elif "ngo" in identity:
                agent = NGOAgent(
                    agent_id,
                    personality
                )

            else:
                agent = DistrictAdministrationAgent(
                    agent_id,
                    personality
                )

            agents.append(agent)

        # Safety fallback
        if not agents:
            agents = [
                GovernmentAgent(
                    "government",
                    "Collaborative"
                ),
                NGOAgent(
                    "ngo",
                    "Collaborative"
                ),
                DistrictAdministrationAgent(
                    "district",
                    "Collaborative"
                )
            ]

        config = config or {}

        max_rounds = int(
            config.get(
                "max_rounds",
                5
            )
        )

        # Extract resource quantities from config or scenario
        resource_quantities = (
            config.get("resourceQuantities")
            or scenario.get("resourceQuantities")
            or {}
        )

        # Compute total budget from resource quantities
        total_budget = (
            sum(resource_quantities.values())
            if resource_quantities
            else None
        )

        state = {
            "session_id": session_id,

            "scenario": scenario or {},

            "resource_quantities": resource_quantities,

            # Total pool of all resources combined — enforces zero-sum constraint
            "total_budget": total_budget,

            # Tracks last numerical proposal per agent for cross-referencing
            "last_proposals": {},

            "agents": [
                {
                    "id": agent.id,
                    "name": agent.name,
                    "role": agent.role,
                    "personality": agent.personality
                }
                for agent in agents
            ],

            "current_round": 1,

            "current_agent_idx": 0,

            "history": [],

            "consensus": 0.0,

            "consensus_reached": False,

            "negotiation_ended": False,

            "max_rounds_reached": False,

            "status": "ongoing",

            "max_rounds": max_rounds
        }

        self.sessions[session_id] = {
            "state": state,
            "agents": agents
        }

        return session_id

    # =========================================================
    # SESSION CHECK
    # =========================================================

    def session_exists(
        self,
        session_id: str
    ) -> bool:

        return session_id in self.sessions

    # =========================================================
    # GET STATE
    # =========================================================

    def get_state(
        self,
        session_id: str
    ) -> Dict[str, Any]:

        if session_id not in self.sessions:
            return {}

        return self.sessions[
            session_id
        ]["state"]

    # =========================================================
    # HUMAN MESSAGE
    # =========================================================

    def add_human_message(
        self,
        session_id: str,
        human_message: str = "",
        message: str = "",
        resource: str = "",
        amount: int = 0,
        action: str = "Offer",
        **kwargs
    ) -> Dict[str, Any]:

        if session_id not in self.sessions:
            raise ValueError(
                "Negotiation session not found."
            )

        state = self.sessions[
            session_id
        ]["state"]

        if state.get("negotiation_ended"):
            return {
                "success": False,
                "message": "The negotiation has already ended.",
                "consensus": state.get("consensus", 0.0),
                "negotiation_ended": True
            }

        if not human_message:
            human_message = message

        human_message = str(
            human_message or ""
        ).strip()

        proposal_parts = []

        if action:
            proposal_parts.append(
                f"Action: {action}"
            )

        if resource:
            proposal_parts.append(
                f"Resource: {resource}"
            )

        if amount:
            proposal_parts.append(
                f"Amount: {amount}"
            )

        if human_message:
            proposal_parts.append(
                f"Message: {human_message}"
            )

        final_message = (
            " | ".join(proposal_parts)
            if proposal_parts
            else
            "Human participant requests a fair allocation."
        )

        state["history"].append(
            {
                "agent": "Human Participant",
                "message": final_message,
                "reasoning": "Human participant proposal.",
                "stance": "human",
                "round": state["current_round"]
            }
        )

        return {
            "success": True,
            "message": final_message,
            "round": state["current_round"],
            "history": state["history"]
        }

    # =========================================================
    # ROLE DETECTION
    # =========================================================

    def _get_role_type(self, agent) -> str:

        identity = (
            f"{getattr(agent, 'name', '')} "
            f"{getattr(agent, 'role', '')} "
            f"{getattr(agent, 'id', '')}"
        ).lower()

        if "government" in identity:
            return "government"

        if "ngo" in identity:
            return "ngo"

        if "district" in identity:
            return "district"

        return "district"

    # =========================================================
    # SCENARIO RESOURCE HELPERS
    # =========================================================

    def _get_resources(self, state):

        scenario = state.get("scenario") or {}

        resources = (
            scenario.get("resources")
            or scenario.get("available_resources")
            or []
        )

        if isinstance(resources, dict):
            resources = list(resources.keys())

        if not isinstance(resources, list):
            resources = []

        cleaned = []

        for item in resources:
            if isinstance(item, dict):
                name = (
                    item.get("name")
                    or item.get("resource")
                    or item.get("type")
                )
                if name:
                    cleaned.append(str(name))
            else:
                cleaned.append(str(item))

        if not cleaned:
            cleaned = [
                "Food",
                "Medicine",
                "Water"
            ]

        return cleaned

    # =========================================================
    # PARSE NUMERICAL PROPOSALS FROM MESSAGE
    # =========================================================

    def _parse_proposals_from_message(
        self,
        message: str,
        resource_quantities: dict
    ) -> dict:
        """
        Extract resource: N units patterns from a message.
        Returns a dict like {"Rescue Teams": 25, "Medical Aid": 18, ...}
        Only includes resources that exist in resource_quantities.
        """

        if not message or not resource_quantities:
            return {}

        result = {}

        matches = re.findall(
            r"([A-Za-z][A-Za-z0-9\s&/-]*?)\s*:\s*(\d+)\s*(?:units?)?",
            message,
            re.IGNORECASE
        )

        for name, qty in matches:
            name = name.strip()
            for resource in resource_quantities:
                if resource.lower() == name.lower():
                    result[resource] = int(qty)
                    break

        return result

    # =========================================================
    # UNIQUE NEGOTIATION RESPONSE (FALLBACK)
    # =========================================================

    def _build_unique_response(
        self,
        agent,
        state
    ):
        """
        Role-specific fallback response with DIFFERENT allocation numbers
        per agent to create genuine conflict, not identical proposals.
        """

        role = self._get_role_type(agent)
        round_number = state.get("current_round", 1)
        resource_quantities = state.get("resource_quantities", {})
        last_proposals = state.get("last_proposals", {})

        # Priority weights per role
        ROLE_WEIGHTS = {
            "government": {"rescue": 0.90, "debris": 0.80, "medical": 0.50, "shelter": 0.30},
            "ngo":        {"rescue": 0.50, "debris": 0.25, "medical": 0.95, "shelter": 0.85},
            "district":   {"rescue": 0.75, "debris": 0.95, "medical": 0.35, "shelter": 0.55},
        }

        weights = ROLE_WEIGHTS.get(role, {})

        def _get_weight(resource_name):
            name_lower = resource_name.lower()
            for key, w in weights.items():
                if key in name_lower:
                    return w
            return 0.55

        if resource_quantities:
            message_parts = []
            for resource, available in resource_quantities.items():
                if available == 0:
                    message_parts.append(f"{resource}: 0 units")
                    continue
                w = _get_weight(resource)
                # Gradually concede in later rounds
                concession = min((round_number - 1) * 0.08, 0.25)
                quantity = max(1, int(available * max(w - concession, 0.15)))
                message_parts.append(f"{resource}: {quantity} units")

            proposal_str = "; ".join(message_parts)
        else:
            resources = self._get_resources(state)
            primary = resources[(round_number - 1) % len(resources)] if resources else "resources"
            proposal_str = f"{primary}: [see available quantities]"

        # Build other-agent reference
        other_ref_parts = []
        other_agents = {k: v for k, v in last_proposals.items()
                        if agent.name.lower() not in k.lower()}
        for other_name, props in other_agents.items():
            if isinstance(props, dict):
                prop_str = ", ".join(f"{r}: {q}" for r, q in list(props.items())[:2])
                other_ref_parts.append(f"{other_name} proposed {prop_str}")

        other_ref = (
            f"While I have reviewed {'; '.join(other_ref_parts[:2])}, "
            if other_ref_parts else ""
        )

        if role == "government":
            if round_number == 1:
                message = (
                    f"As the Government, our mandate is immediate public safety and rescue operations. "
                    f"I am putting forward our opening position: {proposal_str}. "
                    f"Rescue Teams and Debris Clearance must be prioritized — "
                    f"without them, we cannot reach the affected population at all."
                )
                reasoning = (
                    "Government policy: Rescue Teams and Debris Clearance are the first-response "
                    "backbone. Medical Aid is important but NGO is better positioned for that."
                )
                stance = "firm"
            else:
                message = (
                    f"{other_ref}I cannot accept a significant reduction in Rescue capacity. "
                    f"My revised proposal: {proposal_str}. "
                    f"I am making a small concession on Medical Aid to accommodate the NGO's concerns, "
                    f"but Rescue Teams and Debris Clearance cannot drop further."
                )
                reasoning = (
                    "The Government is offering a limited concession on Medical Aid "
                    "while firmly defending Rescue and Debris priorities."
                )
                stance = "moderate"

        elif role == "ngo":
            if round_number == 1:
                message = (
                    f"The NGO's position is non-negotiable on Medical Aid — "
                    f"we have hundreds of injured civilians and no medical infrastructure. "
                    f"Our opening offer: {proposal_str}. "
                    f"I urge the Government and District to recognize that without adequate "
                    f"Medical Aid, lives will be lost before rescue teams even arrive."
                )
                reasoning = (
                    "Humanitarian principle: the most vulnerable — injured, elderly, children — "
                    "must receive Medical Aid and Shelters as a top priority."
                )
                stance = "firm"
            else:
                message = (
                    f"{other_ref}reducing Medical Aid any further is not acceptable. "
                    f"My counter-proposal: {proposal_str}. "
                    f"I am willing to concede on Debris Clearance since the District "
                    f"can manage that, but Medical Aid must increase significantly."
                )
                reasoning = (
                    "The NGO is offering Debris Clearance concessions in exchange for "
                    "a meaningful increase in Medical Aid allocation."
                )
                stance = "strategic"

        else:  # district
            if round_number == 1:
                message = (
                    f"The District Administration's non-negotiable: Debris Clearance first. "
                    f"Our opening position: {proposal_str}. "
                    f"I must insist — without cleared roads, rescue teams cannot move, "
                    f"medical aid cannot be delivered, and shelters cannot be supplied. "
                    f"Debris Clearance is the operational prerequisite for everything else."
                )
                reasoning = (
                    "Local infrastructure reality: Debris Clearance is the prerequisite "
                    "for all other resource deliveries. Without it, no other allocation matters."
                )
                stance = "firm"
            else:
                message = (
                    f"{other_ref}I understand the NGO's medical concerns and the Government's "
                    f"rescue priorities, but Debris Clearance cannot drop below operational levels. "
                    f"My revised proposal: {proposal_str}. "
                    f"I am reducing my Rescue Team request to give Government more flexibility, "
                    f"but Debris Clearance must stay high."
                )
                reasoning = (
                    "The District is conceding some Rescue Teams while defending "
                    "Debris Clearance as the critical operational requirement."
                )
                stance = "strategic"

        return {
            "message": message,
            "reasoning": reasoning,
            "stance": stance
        }

    # =========================================================
    # CHECK FOR REPETITION
    # =========================================================

    def _is_repeated_response(
        self,
        message: str,
        history: list
    ) -> bool:

        normalized = (
            str(message or "")
            .strip()
            .lower()
        )

        if not normalized:
            return True

        previous_ai_messages = [
            str(item.get("message", "")).strip().lower()
            for item in history
            if item.get("agent") != "Human Participant"
        ]

        if normalized in previous_ai_messages:
            return True

        generic_phrases = [
            "i propose a balanced allocation",
            "i propose a fair allocation",
            "balanced need-based allocation",
            "while keeping resources fairly distributed",
            "i appreciate the previous proposal and am adjusting",
        ]

        generic_count = sum(
            phrase in normalized
            for phrase in generic_phrases
        )

        return generic_count >= 2

    # =========================================================
    # ASYNC AGENT STEP
    # =========================================================

    async def _step_async(
        self,
        session_id: str
    ) -> Dict[str, Any]:

        if session_id not in self.sessions:
            raise ValueError(
                "Negotiation session not found."
            )

        entry = self.sessions[
            session_id
        ]

        state = entry["state"]

        agents = entry["agents"]

        if not agents:
            raise ValueError(
                "No negotiation agents configured."
            )

        if state["negotiation_ended"]:
            return self._build_response(
                state,
                None,
                None,
                None,
                None
            )

        if (
            state["current_round"]
            > state["max_rounds"]
        ):

            state["max_rounds_reached"] = True
            state["negotiation_ended"] = True
            state["status"] = "max_rounds_reached"

            return self._build_response(
                state,
                None,
                None,
                None,
                None
            )

        index = (
            state["current_agent_idx"]
            % len(agents)
        )

        agent = agents[index]

        context = {
            "scenario": state["scenario"],
            "history": state["history"],
            "current_round": state["current_round"],
            "max_rounds": state["max_rounds"],
            "resource_quantities": state.get("resource_quantities", {}),
            # Pass budget and cross-agent proposals for realistic conflict
            "total_budget": state.get("total_budget"),
            "last_proposals": state.get("last_proposals", {}),

            "agent": {
                "id": agent.id,
                "name": agent.name,
                "role": agent.role,
                "personality": agent.personality,
                "goal": agent.primary_goal,
                "constraints": agent.constraints
            }
        }

        # -----------------------------------------------------
        # TRY EXISTING AGENT / GEMINI LOGIC
        # -----------------------------------------------------

        result = None

        try:
            result = await agent.act(
                context,
                ask_model
            )
        except Exception as error:
            print(
                f"Agent error: {error}"
            )

        if not isinstance(result, dict):
            result = {}

        message = str(
            result.get(
                "message",
                ""
            )
        ).strip()

        reasoning = str(
            result.get(
                "reasoning",
                ""
            )
        ).strip()

        stance = str(
            result.get(
                "stance",
                "moderate"
            )
        ).strip()

        # -----------------------------------------------------
        # Replace repeated/generic responses with unique,
        # role-specific negotiation response.
        # -----------------------------------------------------

        if self._is_repeated_response(
            message,
            state["history"]
        ):
            unique_result = self._build_unique_response(
                agent,
                state
            )

            message = unique_result["message"]
            reasoning = unique_result["reasoning"]
            stance = unique_result["stance"]

        # Safety fallback
        if not message:
            unique_result = self._build_unique_response(
                agent,
                state
            )

            message = unique_result["message"]
            reasoning = unique_result["reasoning"]
            stance = unique_result["stance"]

        # -----------------------------------------------------
        # PARSE AND SAVE NUMERICAL PROPOSALS
        # Track what each agent last proposed for cross-referencing
        # -----------------------------------------------------

        parsed_proposal = self._parse_proposals_from_message(
            message,
            state.get("resource_quantities", {})
        )

        if parsed_proposal:
            state["last_proposals"][agent.name] = parsed_proposal
            print(f"Parsed proposal from {agent.name}: {parsed_proposal}")

        # -----------------------------------------------------
        # GENERATE TURN EVALUATION
        # -----------------------------------------------------
        
        incoming_proposal = {}
        for item in reversed(state["history"]):
            if item.get("agent") != agent.name and item.get("parsed_proposal"):
                incoming_proposal = item["parsed_proposal"]
                break

        evaluation = generate_turn_evaluation(
            agent_name=agent.name,
            new_proposal=parsed_proposal,
            incoming_proposal=incoming_proposal,
            current_round=state["current_round"],
            max_rounds=state["max_rounds"]
        )

        # -----------------------------------------------------
        # SAVE AI MESSAGE
        # -----------------------------------------------------

        state["history"].append(
            {
                "agent": agent.name,
                "message": message,
                "reasoning": reasoning,
                "stance": stance,
                "round": state["current_round"],
                "parsed_proposal": parsed_proposal,
                "evaluation": evaluation
            }
        )

        # -----------------------------------------------------
        # MOVE TO NEXT AGENT
        # -----------------------------------------------------

        state["current_agent_idx"] += 1

        round_finished = (
            state["current_agent_idx"]
            >= len(agents)
        )

        # -----------------------------------------------------
        # ROUND FINISHED
        # -----------------------------------------------------

        if round_finished:

            state["current_agent_idx"] = 0

            try:
                state["consensus"] = calculate_consensus(
                    state
                )
            except Exception:
                state["consensus"] = 0.0

            # A real negotiation should have at least
            # two rounds before consensus can be reached.

            if (
                state["current_round"] >= 2
                and state["consensus"] >= 0.88
            ):

                state["consensus_reached"] = True
                state["negotiation_ended"] = True
                state["status"] = "consensus_reached"
                
                if state["history"]:
                    state["history"][-1]["evaluation"]["is_accepted"] = True
                    state["history"][-1]["evaluation"]["satisfaction"] = 100.0

            elif detect_deadlock(state):

                state["negotiation_ended"] = True
                state["status"] = "deadlock"

            else:

                state["current_round"] += 1

                if (
                    state["current_round"]
                    > state["max_rounds"]
                ):

                    state["max_rounds_reached"] = True
                    state["negotiation_ended"] = True
                    state["status"] = "max_rounds_reached"

                else:

                    state["status"] = "ongoing"

        else:

            state["status"] = "ongoing"

        return self._build_response(
            state,
            agent,
            message,
            reasoning,
            stance
        )

    # =========================================================
    # STEP
    # =========================================================

    def step(
        self,
        session_id: str
    ) -> Dict[str, Any]:

        return asyncio.run(
            self._step_async(
                session_id
            )
        )

    # =========================================================
    # RESPONSE
    # =========================================================

    def _build_response(
        self,
        state,
        agent,
        message,
        reasoning,
        stance
    ):

        current_idx = state.get(
            "current_agent_idx",
            0
        )

        agents_state = state.get(
            "agents",
            []
        )

        next_agent = None

        if agents_state:

            if current_idx >= len(agents_state):
                current_idx = 0

            next_agent = agents_state[
                current_idx
            ]["name"]

        return {
            "agent": (
                agent.name
                if agent
                else None
            ),

            "personality": (
                agent.personality
                if agent
                else None
            ),

            "round": state.get(
                "current_round",
                1
            ),

            "current_agent_idx": state.get(
                "current_agent_idx",
                0
            ),

            "message": message,

            "reasoning": reasoning,

            "stance": stance,

            "consensus": state.get(
                "consensus",
                0.0
            ),

            "consensus_reached": state.get(
                "consensus_reached",
                False
            ),

            "negotiation_ended": state.get(
                "negotiation_ended",
                False
            ),

            "max_rounds_reached": state.get(
                "max_rounds_reached",
                False
            ),

            "negotiation_status": state.get(
                "status",
                "ongoing"
            ),

            "next_agent": next_agent,

            "history": state.get(
                "history",
                []
            ),

            "max_rounds": state.get(
                "max_rounds",
                5
            )
        }