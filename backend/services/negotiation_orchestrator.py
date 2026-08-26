import asyncio
import re
import uuid
from typing import Dict, Any

from agents.government_agent import GovernmentAgent
from agents.ngo_agent import NGOAgent
from agents.district_agent import DistrictAdministrationAgent

from services.gemini_service import ask_model
from services.evaluation_engine import calculate_consensus, detect_deadlock, generate_turn_evaluation, _resource_priority


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

            if cfg.get("goal"):
                agent.primary_goal = str(cfg["goal"])
            if cfg.get("constraints"):
                agent.constraints = list(cfg["constraints"])
            agent.priorities = (
                cfg.get("priorities")
                or cfg.get("priority")
                or []
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
                15
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

            # The proposal currently being evaluated by the agents.
            "current_proposal": {},

            # Agent name -> exact proposal accepted by that agent.
            "accepted_proposals": {},

            "final_allocation": None,

            "final_report": None,

            "agents": [
                {
                    "id": agent.id,
                    "name": agent.name,
                    "role": agent.role,
                    "personality": agent.personality,
                    "goal": agent.primary_goal,
                    "constraints": agent.constraints,
                    "priorities": getattr(agent, "priorities", [])
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

            "max_rounds": max_rounds,
            
            "stubborn_until": __import__("random").randint(2, max(2, max_rounds - 1))
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
        resource_quantities: dict,
        agent_names: list = None
    ) -> dict:
        """
        Extract resource: N units patterns from a message.
        Returns a dict like {"Rescue Teams": 25, "Medical Aid": 18, ...}
        Only includes resources that exist in resource_quantities.
        """

        if not message or not resource_quantities:
            return {}

        result = {}
        configured_agents = agent_names or [
            "Government Agent",
            "NGO Agent",
            "District Administration Agent",
        ]

        sections = {}
        current_agent = None
        detailed_section_found = False
        for line in str(message).splitlines():
            header = line.strip().lstrip("#-* ").rstrip(":").strip()
            matched_agent = next(
                (
                    name for name in configured_agents
                    if re.match(
                        rf"^{re.escape(name)}(?:'s)?\s+allocation$|^{re.escape(name)}$",
                        header,
                        re.IGNORECASE,
                    )
                ),
                None,
            )
            if matched_agent:
                current_agent = matched_agent
                detailed_section_found = True
                sections.setdefault(current_agent, {})
                continue
            if current_agent and re.search(
                r"total\s+(resource\s+distribution|allocation)",
                header,
                re.IGNORECASE,
            ):
                current_agent = None
                continue
            if current_agent:
                match = re.match(
                    r"^[-*]?\s*([^:]+?)\s*:\s*(\d+)\s*(?:units?)?\s*$",
                    line,
                    re.IGNORECASE,
                )
                if match:
                    name, qty = match.groups()
                    for resource in resource_quantities:
                        if resource.lower() == name.strip().lower():
                            sections[current_agent][resource] = int(qty)
                            break

        if len(sections) == len(configured_agents) and all(
            sections.get(name) for name in configured_agents
        ):
            complete = all(
                all(resource in sections[name] for resource in resource_quantities)
                for name in configured_agents
            )
            values_valid = all(
                0 <= sections[name].get(resource, -1) <= available
                for name in configured_agents
                for resource, available in resource_quantities.items()
            )
            totals_valid = all(
                sum(sections[name].get(resource, 0) for name in configured_agents) == available
                for resource, available in resource_quantities.items()
            )
            return sections if complete and values_valid and totals_valid else {}

        if detailed_section_found:
            return {}

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
        Generic fallback response that generates a valid proposal and constructs
        a message referencing the agent's actual goals from the state.
        """
        round_number = state.get("current_round", 1)
        resource_quantities = state.get("resource_quantities", {})
        agent_name = agent.get("name", "Unknown Agent")
        agent_role = agent.get("role", "Participant")
        agent_goal = agent.get("goal", "Maximize favorable outcomes")
        
        fallback_proposal = {}
        if resource_quantities:
            message_parts = []
            
            # Use _resource_priority to determine weight dynamically
            scenario_text = " ".join([str(v) for v in state.get("scenario", {}).values()])
            
            for resource, available in resource_quantities.items():
                if available == 0:
                    message_parts.append(f"{resource}: 0 units")
                    continue
                
                # Priority is between 0.4 and 1.0 based on overlap
                priority = _resource_priority(resource, agent, scenario_text)
                
                # Divide by total agents roughly to make an equitable baseline, then boost by priority
                total_agents = max(1, len(state.get("agents", [])))
                base_share = 1.0 / total_agents
                # Priority modifier: 1.0 => 1.5x, 0.4 => 0.9x
                modifier = 0.5 + priority
                
                w = min(0.9, base_share * modifier)
                quantity = max(1, int(round(available * w)))
                message_parts.append(f"{resource}: {quantity} units")
                fallback_proposal[resource] = quantity

            proposal_str = "; ".join(message_parts)
        else:
            resources = self._get_resources(state)
            primary = resources[(round_number - 1) % len(resources)] if resources else "resources"
            proposal_str = f"{primary}: [see available quantities]"

        max_rounds = state.get("max_rounds", 5)
        is_final_round = (round_number >= max_rounds)
        halfway = max(1, max_rounds // 2)

        action = "COUNTER"
        if is_final_round:
            action = "ACCEPT"
        elif round_number == 1:
            action = "OFFER"
        elif round_number <= halfway:
            action = "REJECT"

        if is_final_round:
            message = (
                f"As the {agent_role}, I accept this final consensus distribution: {proposal_str}. "
                f"This satisfies our core objective: {agent_goal}. We are prepared to proceed."
            )
            reasoning = "Final consensus reached based on current resource allocations."
            stance = "accept"
        elif round_number == 1:
            message = (
                f"As the {agent_role}, my primary mandate is to achieve the following: {agent_goal}. "
                f"Therefore, my opening proposal is: {proposal_str}. "
                f"This ensures we have the necessary resources while leaving equitable shares for partners."
            )
            reasoning = "Establishing opening position based on core objectives."
            stance = "firm"
        else:
            message = (
                f"I have reviewed the previous proposals. While I understand the competing needs, "
                f"I must prioritize my goal: {agent_goal}. "
                f"My revised proposal for Round {round_number} is: {proposal_str}. "
                f"I am willing to make minor concessions but must hold firm on critical resources."
            )
            reasoning = f"Round {round_number} strategic trade-off balancing core goals with consensus building."
            stance = "strategic"
        return {
            "message": message,
            "reasoning": reasoning,
            "stance": stance,
            "action": action
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
            state["consensus_reached"] = False
            state["status"] = "deadlock_no_consensus"
            state["final_allocation"] = None
            state["final_report"] = self._build_final_report(state)
            print("[TERMINATION] reason=deadlock/max_rounds")

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
            "current_proposal": state.get("current_proposal", {}),
            "agents": state.get("agents", []),

            "agent": {
                "id": agent.id,
                "name": agent.name,
                "role": agent.role,
                "personality": agent.personality,
                "goal": agent.primary_goal,
                "constraints": agent.constraints,
                "priorities": getattr(agent, "priorities", []),
                "current_proposal": state.get("current_proposal", {}),
                "current_round": state.get("current_round", 1)
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
        raw_action = str(result.get("action", "")).strip()

        # -----------------------------------------------------
        # Fallback to simple placeholder if completely empty
        # -----------------------------------------------------

        if not message:
            message = f"I propose we continue negotiating to find a fair distribution for all agents."
            reasoning = "Fallback generated due to empty message."
            stance = "moderate"
            raw_action = "COUNTER"

        # -----------------------------------------------------
        # PARSE AND SAVE NUMERICAL PROPOSALS
        # Track what each agent last proposed for cross-referencing
        # -----------------------------------------------------

        incoming_proposal = state.get("current_proposal", {})

        recipients = state.get("scenario", {}).get("recipients", [])
        if recipients:
            recipient_names = [r.get("name") for r in recipients]
        else:
            recipient_names = [item.name for item in agents]

        parsed_proposal = self._parse_proposals_from_message(
            message,
            state.get("resource_quantities", {}),
            recipient_names,
        )

        llm_message = message

        # -----------------------------------------------------
        # GENERATE TURN EVALUATION
        # -----------------------------------------------------

        print(f"[ROUND] round={state['current_round']}/{state['max_rounds']} agent={agent.name}")
        print(f"[PROPOSAL] incoming={incoming_proposal}")
        print(f"[CONSENSUS] current_proposal_before={state.get('current_proposal', {})}")
        
        evaluation = generate_turn_evaluation(
            agent_name=agent.name,
            new_proposal=parsed_proposal,
            state=state,
            message=message,
            stance=stance,
            raw_action=raw_action,
            incoming_proposal=incoming_proposal
        )

        action = evaluation.get("action", "COUNTER")
        print(f"[DECISION] raw_llm_action={raw_action.upper() or 'NONE'}")
        print(f"[DECISION] final_action={action} satisfaction={evaluation.get('satisfaction')}")
        generated_proposal = (
            dict(parsed_proposal)
            if action in ("OFFER", "COUNTER")
            else {}
        )

        if action in ("OFFER", "COUNTER") and generated_proposal:
            state["last_proposals"][agent.name] = generated_proposal
            print(f"Parsed proposal from {agent.name}: {generated_proposal}")
            state["current_proposal"] = dict(generated_proposal)
            state["accepted_proposals"] = {}
            print(f"[PROPOSAL] counter={generated_proposal}")
            print(f"[PROPOSAL] full_allocation={state['current_proposal']}")
        elif action == "ACCEPT" and state.get("current_proposal"):
            state["accepted_proposals"][agent.name] = dict(
                state["current_proposal"]
            )

            print(f"[PROPOSAL] counter={{}}")

        print(f"[CONSENSUS] current_proposal_after={state.get('current_proposal', {})}")
        print(f"[PROPOSAL] full_allocation={state.get('current_proposal', {})}")
        print(f"[CONSENSUS] accepted_agents={list(state.get('accepted_proposals', {}))}")

        # The original message from the LLM will be used directly.
        # No more overwriting with _normalize_decision_message!

        if action == "COUNTER" and str(raw_action or "").strip().upper() == "ACCEPT":
            message += "\n\n[System Override: The agent attempted to accept, but consensus is impossible because total requested resources exceed available resources. Action overridden to COUNTER.]"

        # -----------------------------------------------------
        # SAVE AI MESSAGE
        # -----------------------------------------------------

        state["history"].append(
            {
                "agent": agent.name,
                "message": message,
                "reasoning": reasoning,
                "stance": stance,
                "action": action,
                "round": state["current_round"],
                "incoming_proposal": dict(incoming_proposal),
                "parsed_proposal": generated_proposal,
                "llm_action": raw_action.upper() if raw_action else "",
                "llm_message": llm_message,
                "evaluation": evaluation
            }
        )

        # -----------------------------------------------------
        # MOVE TO NEXT AGENT
        # -----------------------------------------------------

        state["current_agent_idx"] += 1

        agent_names = [item.name for item in agents]
        accepted_proposals = state.get("accepted_proposals", {})
        current_proposal = state.get("current_proposal", {})
        unanimous_acceptance = (
            bool(current_proposal)
            and len(accepted_proposals) == len(agent_names)
            and all(
                accepted_proposals.get(name) == current_proposal
                for name in agent_names
            )
        )
        print(f"[CONSENSUS] unanimous={unanimous_acceptance}")

        if unanimous_acceptance:
            state["consensus"] = 1.0
            state["consensus_reached"] = True
            state["negotiation_ended"] = True
            state["final_allocation"] = dict(current_proposal)
            state["status"] = "agreement_reached"
            state["final_report"] = self._build_final_report(state)
            print(f"[CONSENSUS] final_allocation={state['final_allocation']}")
            print("[TERMINATION] reason=consensus")

            return self._build_response(
                state,
                agent,
                message,
                reasoning,
                stance
            )

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

            is_final_round = (state["current_round"] >= state["max_rounds"])

            if is_final_round:
                state["max_rounds_reached"] = True
                state["negotiation_ended"] = True
                state["consensus_reached"] = False
                state["status"] = "deadlock_no_consensus"
                state["final_allocation"] = dict(state.get("current_proposal", {})) if state.get("current_proposal") else None
                state["final_report"] = self._build_final_report(state)
                print("[TERMINATION] reason=deadlock/max_rounds")
            else:
                state["current_round"] += 1
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

    @staticmethod
    def _format_proposal(proposal):
        if proposal and all(isinstance(value, dict) for value in proposal.values()):
            return "\n".join(
                f"{agent_name}: "
                + "; ".join(
                    f"{resource}: {quantity} units"
                    for resource, quantity in resources.items()
                )
                for agent_name, resources in proposal.items()
            )
        return "; ".join(
            f"{resource}: {quantity} units"
            for resource, quantity in proposal.items()
        )

    def _normalize_decision_message(
        self,
        action,
        incoming_proposal,
        generated_proposal,
        reasoning,
    ):
        if action == "ACCEPT":
            proposal_text = self._format_proposal(incoming_proposal)
            return f"I accept the incoming proposal: {proposal_text}."

        if action == "COUNTER":
            proposal_text = self._format_proposal(generated_proposal)
            if proposal_text:
                return f"I counter-propose: {proposal_text}."
            return "I counter the incoming proposal, but no valid counterproposal was generated."

        if action == "REJECT":
            return "I reject the incoming proposal based on my objectives and constraints."

        proposal_text = self._format_proposal(generated_proposal)
        return f"I make the following opening offer: {proposal_text}."

    def _build_final_report(self, state):
        if state.get("consensus_reached"):
            allocation = state.get("final_allocation") or {}
            lines = ["FINAL AGREED ALLOCATION"]
            if allocation and all(isinstance(value, dict) for value in allocation.values()):
                totals = {}
                for agent_name, resources in allocation.items():
                    lines.append(f"\n{agent_name}:")
                    for resource, quantity in resources.items():
                        lines.append(f"{resource}: {quantity}")
                        totals[resource] = totals.get(resource, 0) + quantity
                lines.append("\nTOTAL:")
                lines.extend(f"{resource}: {quantity}" for resource, quantity in totals.items())
            return {
                "status": "agreement_reached",
                "consensus_reached": True,
                "final_allocation": state.get("final_allocation"),
                "message": "All agents accepted the same final allocation.\n" + "\n".join(lines)
            }

        allocation = state.get("final_allocation")
        lines = [
            "NO AGREEMENT REACHED", 
            "The agents did not reach unanimous agreement.", 
            "", 
            "LATEST VALID ALLOCATION"
        ]
        if allocation and all(isinstance(value, dict) for value in allocation.values()):
            totals = {}
            for agent_name, resources in allocation.items():
                lines.append(f"\n{agent_name}:")
                for resource, quantity in resources.items():
                    lines.append(f"{resource}: {quantity}")
                    totals[resource] = totals.get(resource, 0) + quantity
            lines.append("\nTOTAL:")
            lines.extend(f"{resource}: {quantity}" for resource, quantity in totals.items())
        elif allocation:
            for resource, quantity in allocation.items():
                lines.append(f"{resource}: {quantity}")

        return {
            "status": "deadlock_no_consensus",
            "consensus_reached": False,
            "final_allocation": allocation,
            "message": "\n".join(lines)
        }

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

            "current_proposal": state.get("current_proposal", {}),

            "final_allocation": state.get("final_allocation"),

            "final_report": state.get("final_report"),

            "history": state.get(
                "history",
                []
            ),

            "max_rounds": state.get(
                "max_rounds",
                5
            ),

            "agreed_agents": len(state.get("accepted_proposals", {})),

            "total_agents": len(state.get("agents", []))
        }