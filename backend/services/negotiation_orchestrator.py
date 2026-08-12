import asyncio
import uuid
from typing import Dict, Any

from agents.government_agent import GovernmentAgent
from agents.ngo_agent import NGOAgent
from agents.district_agent import DistrictAdministrationAgent
from services.gemini_service import ask_model
from services.evaluation_engine import calculate_consensus


class NegotiationOrchestrator:

    def __init__(self):
        self.sessions: Dict[str, Dict[str, Any]] = {}

    # ---------------------------------------------------------
    # CREATE SESSION
    # ---------------------------------------------------------

    def create_session(
        self,
        scenario: dict,
        agents_config: list,
        config: dict
    ) -> str:

        session_id = str(uuid.uuid4())

        agents = []

        scenario_agents_by_id = {
            str(agent.get("id")): agent
            for agent in scenario.get("agents", [])
            if agent is not None
        }

        # Build agents
        for idx, cfg in enumerate(agents_config):

            raw_id = cfg.get("id") or f"agent-{idx + 1}"
            pid = str(raw_id)

            personality = cfg.get(
                "personality",
                "Collaborative"
            )

            scenario_agent = scenario_agents_by_id.get(pid, {})

            raw_role = (
                cfg.get("role")
                or scenario_agent.get("role")
                or ""
            )

            raw_name = (
                cfg.get("name")
                or scenario_agent.get("name")
                or ""
            )

            role = str(raw_role)
            name = str(raw_name)

            pid_lower = pid.lower()
            role_lower = role.lower()
            name_lower = name.lower()

            # Government Agent
            if (
                "government" in pid_lower
                or "government" in role_lower
                or "government" in name_lower
            ):
                agents.append(
                    GovernmentAgent(
                        pid,
                        personality
                    )
                )

            # NGO Agent
            elif (
                "ngo" in pid_lower
                or "ngo" in role_lower
                or "ngo" in name_lower
            ):
                agents.append(
                    NGOAgent(
                        pid,
                        personality
                    )
                )

            # District Administration Agent
            else:
                agents.append(
                    DistrictAdministrationAgent(
                        pid,
                        personality
                    )
                )

        if not agents:
            raise ValueError(
                "No negotiation agents were configured."
            )

        max_rounds = config.get(
            "max_rounds",
            5
        )

        state = {
            "session_id": session_id,

            "scenario": scenario,

            "agents": [
                {
                    "id": agent.id,
                    "name": agent.name,
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

            "status": "initialized",

            "config": config,

            "max_rounds": max_rounds,
        }

        self.sessions[session_id] = {
            "state": state,
            "agents": agents
        }

        return session_id

    # ---------------------------------------------------------
    # CHECK SESSION
    # ---------------------------------------------------------

    def session_exists(
        self,
        session_id: str
    ) -> bool:

        return session_id in self.sessions

    # ---------------------------------------------------------
    # GET STATE
    # ---------------------------------------------------------

    def get_state(
        self,
        session_id: str
    ) -> Dict:

        if session_id not in self.sessions:
            raise ValueError(
                "Session not found."
            )

        return self.sessions[session_id]["state"]

    # ---------------------------------------------------------
    # ADD HUMAN MESSAGE
    # ---------------------------------------------------------

    def add_human_message(
        self,
        session_id: str,
        message: str,
        resource: str = "",
        amount: int = 0,
        action: str = "Offer"
    ) -> Dict:

        if session_id not in self.sessions:
            raise ValueError(
                "Session not found."
            )

        state = self.sessions[session_id]["state"]

        # Do not allow messages after negotiation ends
        if state.get("negotiation_ended"):
            return {
                "success": False,
                "message": "Negotiation has already ended.",
                "state": state,
            }

        # Create human negotiation entry
        human_entry = {
            "agent": "Human Participant",
            "message": message,
            "reasoning": "",
            "stance": action.lower(),
            "resource": resource,
            "amount": amount,
            "action": action,
            "round": state.get(
                "current_round",
                1
            ),
        }

        state["history"].append(
            human_entry
        )

        state["status"] = "human_message_received"

        return {
            "success": True,
            "message": message,
            "round": state.get(
                "current_round",
                1
            ),
            "history": state.get(
                "history",
                []
            ),
            "status": state.get(
                "status"
            ),
        }

    # ---------------------------------------------------------
    # AGENT STEP
    # ---------------------------------------------------------

    async def _agent_step(
        self,
        session_id: str
    ) -> Dict:

        if session_id not in self.sessions:
            raise ValueError(
                "Session not found."
            )

        entry = self.sessions[session_id]

        state = entry["state"]

        agents = entry["agents"]

        # -----------------------------------------------------
        # CHECK IF NEGOTIATION ALREADY ENDED
        # -----------------------------------------------------

        if state.get("status") in (
            "consensus_reached",
            "deadlock",
            "max_rounds_reached"
        ):

            current_idx = (
                state.get(
                    "current_agent_idx",
                    0
                ) % len(agents)
            )

            return {
                "agent": None,

                "personality": None,

                "round": state.get(
                    "current_round"
                ),

                "message": None,

                "reasoning": None,

                "stance": None,

                "consensus": state.get(
                    "consensus"
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
                    "status"
                ),

                "next_agent": agents[
                    current_idx
                ].name,

                "history": state.get(
                    "history",
                    []
                ),

                "max_rounds": state.get(
                    "max_rounds",
                    5
                ),
            }

        # -----------------------------------------------------
        # CHECK MAX ROUNDS
        # -----------------------------------------------------

        if (
            state.get("current_round", 1)
            > state.get("max_rounds", 5)
        ):

            state["consensus_reached"] = False

            state["max_rounds_reached"] = True

            state["negotiation_ended"] = True

            state["status"] = (
                "max_rounds_reached"
            )

            current_idx = (
                state.get(
                    "current_agent_idx",
                    0
                ) % len(agents)
            )

            return {
                "agent": None,

                "personality": None,

                "round": state.get(
                    "current_round"
                ),

                "message": None,

                "reasoning": None,

                "stance": None,

                "consensus": state.get(
                    "consensus"
                ),

                "consensus_reached": False,

                "negotiation_ended": True,

                "max_rounds_reached": True,

                "negotiation_status": (
                    "max_rounds_reached"
                ),

                "next_agent": agents[
                    current_idx
                ].name,

                "history": state.get(
                    "history",
                    []
                ),

                "max_rounds": state.get(
                    "max_rounds",
                    5
                ),
            }

        # -----------------------------------------------------
        # GET CURRENT AGENT
        # -----------------------------------------------------

        current_idx = (
            state["current_agent_idx"]
            % len(agents)
        )

        agent = agents[current_idx]

        # -----------------------------------------------------
        # BUILD CONTEXT
        # -----------------------------------------------------

        context = {
            "scenario": state["scenario"],

            "history": state["history"],

            "round": state["current_round"],
        }

        # -----------------------------------------------------
        # ASK GEMINI / LLM
        # -----------------------------------------------------

        result = await agent.act(
            context,
            ask_model
        )

        # -----------------------------------------------------
        # NORMALIZE RESPONSE
        # -----------------------------------------------------

        if isinstance(result, dict):

            message = result.get(
                "message",
                ""
            )

            reasoning = result.get(
                "reasoning",
                ""
            )

            stance = result.get(
                "stance",
                "neutral"
            )

        else:

            message = str(result)

            reasoning = ""

            stance = "neutral"

        # -----------------------------------------------------
        # SAVE AGENT MESSAGE
        # -----------------------------------------------------

        reported_round = state[
            "current_round"
        ]

        state["history"].append(
            {
                "agent": agent.name,

                "message": message,

                "reasoning": reasoning,

                "stance": stance,

                "round": reported_round,
            }
        )

        # -----------------------------------------------------
        # MOVE TO NEXT AGENT
        # -----------------------------------------------------

        state["current_agent_idx"] = (
            state["current_agent_idx"] + 1
        ) % len(agents)

        round_completed = (
            state["current_agent_idx"] == 0
        )

        if round_completed:

            state["current_round"] += 1

        # -----------------------------------------------------
        # CALCULATE CONSENSUS
        # -----------------------------------------------------

        if round_completed:

            try:

                state["consensus"] = (
                    calculate_consensus(
                        state
                    ) or 0.0
                )

            except Exception as error:

                print(
                    "Consensus calculation error:",
                    error
                )

                state["consensus"] = 0.0

        # -----------------------------------------------------
        # DETERMINE NEGOTIATION STATUS
        # -----------------------------------------------------

        state["consensus_reached"] = (
            state.get(
                "consensus",
                0
            ) >= 0.9
        )

        state["max_rounds_reached"] = (
            state.get(
                "current_round",
                1
            )
            > state.get(
                "max_rounds",
                5
            )
            and not state.get(
                "consensus_reached",
                False
            )
        )

        state["negotiation_ended"] = (
            state.get(
                "consensus_reached",
                False
            )
            or state.get(
                "max_rounds_reached",
                False
            )
        )

        if state["consensus_reached"]:

            state["status"] = (
                "consensus_reached"
            )

        elif state["max_rounds_reached"]:

            state["status"] = (
                "max_rounds_reached"
            )

        else:

            state["status"] = "ongoing"

        # -----------------------------------------------------
        # NEXT AGENT
        # -----------------------------------------------------

        next_idx = (
            state["current_agent_idx"]
            % len(agents)
        )

        next_agent = agents[
            next_idx
        ].name

        # -----------------------------------------------------
        # RETURN RESULT
        # -----------------------------------------------------

        return {
            "agent": agent.name,

            "personality": agent.personality,

            "round": min(
                reported_round,
                state.get(
                    "max_rounds",
                    5
                )
            ),

            "current_agent_idx": state.get(
                "current_agent_idx"
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
                "status"
            ),

            "next_agent": next_agent,

            "history": state.get(
                "history",
                []
            ),

            "max_rounds": state.get(
                "max_rounds",
                5
            ),
        }

    # ---------------------------------------------------------
    # SYNCHRONOUS STEP
    # ---------------------------------------------------------

    def step(
        self,
        session_id: str
    ) -> Dict:

        loop = asyncio.new_event_loop()

        try:

            asyncio.set_event_loop(loop)

            return loop.run_until_complete(
                self._agent_step(
                    session_id
                )
            )

        finally:

            try:

                loop.run_until_complete(
                    loop.shutdown_asyncgens()
                )

            except Exception:

                pass

            loop.close()