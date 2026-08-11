import asyncio
import uuid
from typing import Dict

from agents.government_agent import GovernmentAgent
from agents.ngo_agent import NGOAgent
from agents.district_agent import DistrictAdministrationAgent
from services.gemini_service import ask_model
from services.evaluation_engine import calculate_consensus


class NegotiationOrchestrator:
    def __init__(self):
        self.sessions: Dict[str, Dict] = {}

    def create_session(self, scenario: dict, agents_config: list, config: dict) -> str:
        session_id = str(uuid.uuid4())
        # Build agents in order: Government, NGO, District
        agents = []
        scenario_agents_by_id = {
            str(agent.get("id")): agent
            for agent in scenario.get("agents", [])
            if agent is not None
        }
        for idx, cfg in enumerate(agents_config):
            # Ensure id and role are strings before lowercasing
            raw_id = cfg.get("id") or f"agent-{idx+1}"
            pid = str(raw_id)
            personality = cfg.get("personality", "Collaborative")
            raw_role = cfg.get("role") or scenario_agents_by_id.get(pid, {}).get("role", "")
            raw_name = cfg.get("name") or scenario_agents_by_id.get(pid, {}).get("name", "")
            role = str(raw_role)
            name = str(raw_name)
            pid_l = pid.lower()
            role_l = role.lower()
            name_l = name.lower()
            if "government" in pid_l or "government" in role_l or "government" in name_l:
                agents.append(GovernmentAgent(pid, personality))
            elif "ngo" in pid_l or "ngo" in role_l or "ngo" in name_l:
                agents.append(NGOAgent(pid, personality))
            else:
                agents.append(DistrictAdministrationAgent(pid, personality))

        max_rounds = config.get("max_rounds", 5)  # Default to 5 if not specified
        state = {
            "session_id": session_id,
            "scenario": scenario,
            "agents": [ {"id": a.id, "name": a.name, "personality": a.personality} for a in agents ],
            "current_round": 1,  # Start at round 1
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
        self.sessions[session_id] = {"state": state, "agents": agents}
        return session_id

    def session_exists(self, session_id: str) -> bool:
        return session_id in self.sessions

    def get_state(self, session_id: str) -> Dict:
        return self.sessions[session_id]["state"]

    async def _agent_step(self, session_id: str) -> Dict:
        entry = self.sessions[session_id]
        state = entry["state"]
        agents = entry["agents"]

        # If negotiation already completed, return current state without acting
        if state.get("status") in ("consensus_reached", "deadlock", "max_rounds_reached"):
            return {
                "agent": None,
                "personality": None,
                "round": state.get("current_round"),
                "message": None,
                "reasoning": None,
                "stance": None,
                "consensus": state.get("consensus"),
                "negotiation_status": state.get("status"),
                "next_agent": agents[state.get("current_agent_idx")].name,
                "history": state.get("history"),
                "max_rounds": state.get("max_rounds"),
            }

        # Prevent stepping if we've already exceeded max rounds
        if state.get("current_round", 1) > state.get("max_rounds", 5):
            state["consensus_reached"] = False
            state["max_rounds_reached"] = True
            state["negotiation_ended"] = True
            state["status"] = "max_rounds_reached"
            return {
                "agent": None,
                "personality": None,
                "round": state.get("current_round"),
                "message": None,
                "reasoning": None,
                "stance": None,
                "consensus": state.get("consensus"),
                "consensus_reached": state.get("consensus_reached"),
                "negotiation_ended": state.get("negotiation_ended"),
                "max_rounds_reached": state.get("max_rounds_reached"),
                "negotiation_status": state.get("status"),
                "next_agent": agents[state.get("current_agent_idx")].name,
                "history": state.get("history"),
                "max_rounds": state.get("max_rounds"),
            }


        idx = state["current_agent_idx"] % len(agents)
        agent = agents[idx]

        context = {"scenario": state["scenario"], "history": state["history"], "round": state["current_round"]}

        # Call agent.act which uses gemini service
        result = await agent.act(context, ask_model)

        # Normalize result
        message = result.get("message") if isinstance(result, dict) else str(result)
        reasoning = result.get("reasoning") if isinstance(result, dict) else ""
        stance = result.get("stance") if isinstance(result, dict) else "neutral"

        entry["state"]["history"].append({"agent": agent.name, "message": message, "reasoning": reasoning, "stance": stance, "round": state["current_round"]})
        reported_round = state["current_round"]

        # advance turn to the next agent
        entry["state"]["current_agent_idx"] = (state["current_agent_idx"] + 1) % len(agents)
        round_completed = entry["state"]["current_agent_idx"] == 0
        if round_completed:
            entry["state"]["current_round"] += 1

        # Only evaluate consensus after a full round completes
        if round_completed:
            entry["state"]["consensus"] = calculate_consensus(entry["state"]) or 0.0

        entry["state"]["consensus_reached"] = entry["state"].get("consensus", 0) >= 0.9
        entry["state"]["max_rounds_reached"] = entry["state"].get("current_round", 1) > entry["state"].get("max_rounds", 5) and not entry["state"].get("consensus_reached", False)
        entry["state"]["negotiation_ended"] = entry["state"].get("consensus_reached", False) or entry["state"].get("max_rounds_reached", False)
        entry["state"]["status"] = "consensus_reached" if entry["state"].get("consensus_reached") else "max_rounds_reached" if entry["state"].get("max_rounds_reached") else "ongoing"

        next_idx = entry["state"]["current_agent_idx"]
        next_agent = agents[next_idx].name
        return {
            "agent": agent.name,
            "personality": agent.personality,
            "round": min(reported_round, entry["state"].get("max_rounds", 5)),
            "current_agent_idx": entry["state"].get("current_agent_idx"),
            "message": message,
            "reasoning": reasoning,
            "stance": stance,
            "consensus": entry["state"].get("consensus"),
            "consensus_reached": entry["state"].get("consensus_reached", False),
            "negotiation_ended": entry["state"].get("negotiation_ended", False),
            "max_rounds_reached": entry["state"].get("max_rounds_reached", False),
            "negotiation_status": entry["state"].get("status"),
            "next_agent": next_agent,
            "history": entry["state"].get("history"),
            "max_rounds": entry["state"].get("max_rounds"),
        }

    def step(self, session_id: str) -> Dict:
        # Run the async agent step synchronously in a fresh event loop (safe from threadpool)
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(self._agent_step(session_id))
        finally:
            try:
                loop.run_until_complete(loop.shutdown_asyncgens())
            except Exception:
                pass
            loop.close()
