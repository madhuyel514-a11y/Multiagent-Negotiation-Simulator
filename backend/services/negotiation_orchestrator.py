import asyncio
import uuid
from typing import Dict, Any

from agents.government_agent import GovernmentAgent
from agents.ngo_agent import NGOAgent
from agents.district_agent import DistrictAdministrationAgent

from services.gemini_service import ask_model
from services.evaluation_engine import calculate_consensus, detect_deadlock


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

        state = {
            "session_id": session_id,

            "scenario": scenario or {},

            "resource_quantities": resource_quantities,

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
    # UNIQUE NEGOTIATION RESPONSE
    # =========================================================

    def _build_unique_response(
        self,
        agent,
        state
    ):

        role = self._get_role_type(agent)

        round_number = state.get(
            "current_round",
            1
        )

        resources = self._get_resources(state)

        history = state.get(
            "history",
            []
        )

        human_messages = [
            item.get("message", "")
            for item in history
            if item.get("agent") == "Human Participant"
        ]

        last_human = (
            human_messages[-1]
            if human_messages
            else ""
        )

        # Pick resources differently for each role
        resource_count = len(resources)

        if resource_count == 0:
            resources = [
                "Food",
                "Medicine",
                "Water"
            ]

        primary = resources[
            (round_number - 1) % len(resources)
        ]

        secondary = resources[
            (round_number) % len(resources)
        ]

        if secondary == primary and len(resources) > 1:
            secondary = resources[
                (round_number + 1) % len(resources)
            ]

        # -----------------------------------------------------
        # GOVERNMENT
        # -----------------------------------------------------

        if role == "government":

            if round_number == 1:
                message = (
                    f"I propose prioritizing {primary} for the most "
                    f"affected districts while keeping a reserve of "
                    f"{secondary} for critical emergency services."
                )

                reasoning = (
                    "Government policy prioritizes public safety, "
                    "critical infrastructure and equitable distribution."
                )

            elif round_number == 2:
                message = (
                    f"Based on the earlier proposals, I can increase "
                    f"the allocation of {primary} while reserving "
                    f"essential {secondary} for high-risk areas."
                )

                reasoning = (
                    "The government is adjusting its initial position "
                    "to accommodate stakeholder concerns."
                )

            else:
                message = (
                    f"I support a compromise focused on {primary}, "
                    f"with additional {secondary} directed to districts "
                    f"showing the greatest emergency need."
                )

                reasoning = (
                    "A targeted compromise provides emergency coverage "
                    "while maintaining a fair overall allocation."
                )

        # -----------------------------------------------------
        # NGO
        # -----------------------------------------------------

        elif role == "ngo":

            if round_number == 1:
                message = (
                    f"I recommend giving vulnerable communities priority "
                    f"for {primary}, especially children, elderly people "
                    f"and families in severely affected areas."
                )

                reasoning = (
                    "Humanitarian priorities require protecting vulnerable "
                    "groups and communities with urgent needs."
                )

            elif round_number == 2:
                message = (
                    f"I can support the government proposal if more "
                    f"{primary} is assigned to vulnerable communities "
                    f"and some {secondary} is kept for medical emergencies."
                )

                reasoning = (
                    "The NGO position is moving toward compromise while "
                    "protecting the most vulnerable groups."
                )

            else:
                message = (
                    f"I accept a balanced allocation provided that "
                    f"{primary} reaches the highest-need communities "
                    f"before lower-priority areas."
                )

                reasoning = (
                    "A need-based compromise can satisfy humanitarian "
                    "requirements while allowing other stakeholders to proceed."
                )

        # -----------------------------------------------------
        # DISTRICT ADMINISTRATION
        # -----------------------------------------------------

        else:

            if round_number == 1:
                message = (
                    f"From the district perspective, I recommend sending "
                    f"{primary} to locations with the highest immediate "
                    f"operational demand and reserving {secondary} locally."
                )

                reasoning = (
                    "District authorities understand local infrastructure, "
                    "delivery constraints and immediate operational demand."
                )

            elif round_number == 2:
                message = (
                    f"I propose reallocating part of the {primary} supply "
                    f"toward districts with the greatest shortages while "
                    f"maintaining a reserve of {secondary}."
                )

                reasoning = (
                    "Local shortages require flexible allocation based "
                    "on real district-level conditions."
                )

            else:
                message = (
                    f"I support the emerging agreement and recommend a final "
                    f"allocation that sends {primary} to the most affected "
                    f"districts while preserving essential {secondary}."
                )

                reasoning = (
                    "The district administration supports a practical "
                    "agreement that can be implemented immediately."
                )

        # Mention the human proposal when appropriate
        if last_human:
            lower_human = last_human.lower()

            if (
                "offer" in lower_human
                or "propose" in lower_human
                or "counter" in lower_human
            ):
                message += (
                    " I have considered the human participant's latest "
                    "proposal in this position."
                )

        stance = {
            "government": "moderate",
            "ngo": "cooperative",
            "district": "strategic"
        }.get(role, "moderate")

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
            "while keeping resources fairly distributed"
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
        # IMPORTANT:
        # Replace repeated/generic responses with a unique,
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
        # SAVE AI MESSAGE
        # -----------------------------------------------------

        state["history"].append(
            {
                "agent": agent.name,
                "message": message,
                "reasoning": reasoning,
                "stance": stance,
                "round": state["current_round"]
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

            # Do not finish immediately in round 1.
            # A real negotiation should have at least
            # two rounds of interaction.

            if (
                state["current_round"] >= 2
                and state["consensus"] >= 0.95
            ):

                state["consensus_reached"] = True
                state["negotiation_ended"] = True
                state["status"] = "consensus_reached"

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