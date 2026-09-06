import asyncio
import re
import uuid
from typing import Dict, Any

from agents.government_agent import GovernmentAgent
from agents.ngo_agent import NGOAgent
from agents.district_agent import DistrictAdministrationAgent

from services.gemini_service import (
    ask_model,
    get_gemini_metrics,
    generate_human_suggestion,
)
from services.evaluation_engine import (
    calculate_consensus,
    detect_deadlock,
    generate_turn_evaluation,
    _resource_priority,
    build_outcome_analysis,
)


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

            # GAP 2/3: deadlock-detection bookkeeping
            "prev_proposals": {},
            "deadlock_detected": False,
            "resolution_attempted": False,
            "resolution_succeeded": False,

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
        proposal: dict = None,
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

        normalized_action = str(action or "Offer").strip().upper()
        normalized_action = {
            "ACCEPT OFFER": "ACCEPT",
            "REJECT OFFER": "REJECT",
            "COUNTER OFFER": "COUNTER",
        }.get(normalized_action, normalized_action)
        if normalized_action not in ("OFFER", "COUNTER", "ACCEPT", "REJECT"):
            normalized_action = "OFFER"

        # -----------------------------------------------------
        # GAP 1 FIX: build a structured proposal dict in the same
        # shape used for AI turns (state["current_proposal"] /
        # state["last_proposals"][agent_name]) instead of only
        # ever appending free text to history. Without this the
        # next AI agent only "sees" the human's offer if the LLM
        # happens to parse it back out of the text blob.
        # -----------------------------------------------------

        resource_quantities = state.get("resource_quantities", {})
        structured_proposal = {}

        if normalized_action in ("OFFER", "COUNTER") and proposal is not None:
            structured_proposal = self._validate_human_proposal(
                proposal,
                state.get("current_proposal", {}),
                resource_quantities,
            )
            if structured_proposal is None:
                return {
                    "success": False,
                    "message": "Invalid proposal: expected a complete nested allocation with valid resource quantities.",
                }

        if not structured_proposal and resource and amount:
            # Only build a real proposal when the resource is one the
            # scenario actually knows about (when quantities are configured).
            if not resource_quantities or resource in resource_quantities:
                structured_proposal = {resource: int(amount)}

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

        incoming_proposal_snapshot = dict(state.get("current_proposal", {}))

        is_identical_to_incoming = (
            bool(structured_proposal)
            and bool(incoming_proposal_snapshot)
            and structured_proposal == incoming_proposal_snapshot
        )

        # If the human submits the exact same allocation as the current proposal,
        # treat it as an endorsement / acceptance of that allocation!
        if is_identical_to_incoming and normalized_action in ("OFFER", "COUNTER"):
            print("[CONSENSUS] human proposed allocation identical to active proposal; treating as endorsement/acceptance")
            normalized_action = "ACCEPT"

        if normalized_action in ("OFFER", "COUNTER") and structured_proposal:
            state["last_proposals"]["Human Participant"] = dict(structured_proposal)
            state["current_proposal"] = dict(structured_proposal)
            
            # Preserve existing acceptances from other agents that match this proposal
            preserved = {"Human Participant": dict(structured_proposal)}
            for ag_name, ag_prop in state.get("accepted_proposals", {}).items():
                if ag_prop == state["current_proposal"]:
                    preserved[ag_name] = dict(ag_prop)
                    print(f"[CONSENSUS] preserving prior acceptance for {ag_name}")
            state["accepted_proposals"] = preserved

        elif normalized_action == "ACCEPT" and state.get("current_proposal"):
            target_prop = dict(structured_proposal) if structured_proposal else dict(state["current_proposal"])
            state["last_proposals"]["Human Participant"] = dict(target_prop)
            state["current_proposal"] = dict(target_prop)
            state["accepted_proposals"]["Human Participant"] = dict(target_prop)
            print("[CONSENSUS] human accepted current proposal: Human Participant")

        # -----------------------------------------------------
        # UNANIMOUS CONSENSUS CHECK ACROSS ALL 4 PARTICIPANTS
        # -----------------------------------------------------
        agent_names = [item.name for item in self.sessions[session_id]["agents"]]
        consensus_participants = ["Human Participant", *agent_names]
        accepted_props = state.get("accepted_proposals", {})
        curr_prop = state.get("current_proposal", {})

        agreed_count = sum(
            1 for name in consensus_participants
            if accepted_props.get(name) == curr_prop
        )
        state["consensus"] = round(agreed_count / max(1, len(consensus_participants)), 2)

        if (
            curr_prop
            and agreed_count == len(consensus_participants)
        ):
            state["consensus"] = 1.0
            state["consensus_reached"] = True
            state["negotiation_ended"] = True
            state["final_allocation"] = dict(curr_prop)
            state["status"] = "agreement_reached"
            state["final_report"] = self._build_final_report(state)
            print("[TERMINATION] reason=unanimous_consensus_all_4_participants")

        state["history"].append(
            {
                "agent": "Human Participant",
                "message": final_message,
                "reasoning": "Human participant proposal.",
                "stance": "human",
                "round": state["current_round"],
                "action": normalized_action,
                "incoming_proposal": incoming_proposal_snapshot,
                "parsed_proposal": structured_proposal,
            }
        )

        # In practice mode, the human speaks at the start of each round.
        # AI agents respond next in step_practice_round before round advances.
        if state.get("practice_mode"):
            state["status"] = "ongoing"

        return {
            "success": True,
            "message": final_message,
            "round": state["current_round"],
            "history": state["history"],
            "current_proposal": state.get("current_proposal", {}),
        }

    def _validate_human_proposal(
        self,
        proposal,
        current_proposal,
        resource_quantities,
    ):
        if not isinstance(proposal, dict) or not proposal:
            return None

        available_by_resource = {
            str(resource).lower(): int(quantity)
            for resource, quantity in resource_quantities.items()
        }

        # Build clean lookup for resource names in original casing
        resource_casing = {
            str(resource).lower(): str(resource)
            for resource in resource_quantities.keys()
        }

        validated = {}

        for district, submitted_resources in proposal.items():
            if not isinstance(submitted_resources, dict):
                return None
            district_key = str(district).strip()
            validated[district_key] = {}

            for resource, quantity in submitted_resources.items():
                res_key = str(resource).strip().lower()
                if res_key not in available_by_resource:
                    # Skip or ignore unknown resources, or validate if in available
                    continue
                if isinstance(quantity, bool) or not isinstance(quantity, (int, float)):
                    return None
                val = int(quantity)
                if val < 0 or val > available_by_resource[res_key]:
                    return None
                canonical_res_name = resource_casing.get(res_key, str(resource))
                validated[district_key][canonical_res_name] = val

        if not validated:
            return None

        # Check zero-sum bounds across all districts for every resource
        for res_clean, max_avail in available_by_resource.items():
            total_for_res = sum(
                val
                for d_alloc in validated.values()
                for r_name, val in d_alloc.items()
                if r_name.lower() == res_clean
            )
            if total_for_res > max_avail:
                print(f"[VALIDATION ERROR] Resource {res_clean} total {total_for_res} exceeds max {max_avail}")
                return None

        return validated

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
        Returns a recipient-level dict when configured recipients are present.
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
        recipient_pattern = "|".join(
            re.escape(name) for name in sorted(configured_agents, key=len, reverse=True)
        )
        header_matches = list(re.finditer(
            rf"(?<![\w])(?P<recipient>{recipient_pattern})(?:'s)?"
            rf"(?:\s+(?:allocation|distribution))?\s*:",
            str(message),
            re.IGNORECASE,
        ))

        for index, header_match in enumerate(header_matches):
            recipient = next(
                name for name in configured_agents
                if name.lower() == header_match.group("recipient").lower()
            )
            section_end = (
                header_matches[index + 1].start()
                if index + 1 < len(header_matches)
                else len(str(message))
            )
            section = str(message)[header_match.end():section_end]
            allocation = sections.setdefault(recipient, {})
            for resource in resource_quantities:
                resource_match = re.search(
                    rf"(?<![\w]){re.escape(resource)}\s*:\s*(\d+)\s*(?:units?)?",
                    section,
                    re.IGNORECASE,
                )
                if resource_match:
                    allocation[resource] = int(resource_match.group(1))

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
            return sections if complete and values_valid else {}

        if header_matches:
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

    def _normalize_fallback_proposal(
        self,
        proposal,
        current_proposal,
    ):
        """Keep fallback counters in the current proposal's nested shape."""
        if (
            not proposal
            or not current_proposal
            or not isinstance(proposal, dict)
            or not isinstance(current_proposal, dict)
            or not all(isinstance(value, dict) for value in current_proposal.values())
            or not all(not isinstance(value, dict) for value in proposal.values())
        ):
            return proposal

        return {
            recipient: dict(resources)
            for recipient, resources in current_proposal.items()
        }

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

        if not state.get("practice_mode") and state["current_round"] > state["max_rounds"]:
            state["max_rounds_reached"] = True
            state["negotiation_ended"] = True

            if state.get("consensus_reached"):
                state["consensus"] = 1.0
                state["status"] = "agreement_reached"
                state["final_allocation"] = dict(
                    state.get("current_proposal", {})
                )
                print("[TERMINATION] reason=consensus/max_rounds")
            else:
                state["consensus_reached"] = False
                state["status"] = "deadlock_no_consensus"
                state["final_allocation"] = (
                    dict(state.get("current_proposal", {}))
                    if state.get("current_proposal")
                    else None
                )
                print("[TERMINATION] reason=deadlock/max_rounds")

            state["final_report"] = self._build_final_report(state)

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
        practice_mode = any(
            item.get("agent") == "Human Participant"
            for item in state.get("history", [])
        )

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
            "practice_mode": practice_mode,

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

        if (
            incoming_proposal
            and str(raw_action or "").strip().upper() == "ACCEPT"
        ):
            parsed_proposal = {}
        else:
            parsed_proposal = self._parse_proposals_from_message(
                message,
                state.get("resource_quantities", {}),
                recipient_names,
            )
            parsed_proposal = self._normalize_fallback_proposal(
                parsed_proposal,
                incoming_proposal,
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
            previous_proposal = dict(state.get("current_proposal", {}))
            state["current_proposal"] = dict(generated_proposal)
            practice_mode = (
                "Human Participant" in state.get(
                    "accepted_proposals", {}
                )
                or any(
                    item.get("agent") == "Human Participant"
                    for item in state.get("history", [])
                )
            )
            if practice_mode:
                preserved_acceptances = {}
                for accepted_agent, accepted_proposal in state.get(
                    "accepted_proposals", {}
                ).items():
                    if accepted_proposal == state["current_proposal"]:
                        preserved_acceptances[accepted_agent] = (
                            accepted_proposal
                        )
                        print(
                            "[CONSENSUS] preserving acceptance: "
                            f"{accepted_agent}"
                        )
                    else:
                        print(
                            "[CONSENSUS] invalidating acceptance: "
                            f"{accepted_agent}"
                        )
                state["accepted_proposals"] = preserved_acceptances
            else:
                state["accepted_proposals"] = {}
            if previous_proposal != state["current_proposal"]:
                print(
                    "[CONSENSUS] proposal changed; old acceptances "
                    "were invalidated unless they matched the new proposal"
                )
            print(f"[PROPOSAL] counter={generated_proposal}")
            print(f"[PROPOSAL] full_allocation={state['current_proposal']}")
        elif action == "ACCEPT" and state.get("current_proposal"):
            state["accepted_proposals"][agent.name] = dict(
                state["current_proposal"]
            )
            print(
                "[CONSENSUS] accepting current proposal: "
                f"{agent.name}"
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
        practice_mode = (
            "Human Participant" in accepted_proposals
            or any(
                item.get("agent") == "Human Participant"
                for item in state.get("history", [])
            )
        )
        consensus_participants = (
            [
                "Human Participant",
                *agent_names,
            ]
            if practice_mode
            else agent_names
        )
        unanimous_acceptance = (
            bool(current_proposal)
            and len(accepted_proposals) == len(consensus_participants)
            and all(
                accepted_proposals.get(name) == current_proposal
                for name in consensus_participants
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

            if state.get("practice_mode"):
                # In Practice Mode, the 3 AI agents have finished their turns for this round.
                # Do NOT advance round or declare termination until the Human participant has evaluated and spoken!
                state["status"] = "ongoing"
                return self._build_response(
                    state,
                    agent,
                    message,
                    reasoning,
                    stance
                )

            is_final_round = (state["current_round"] >= state["max_rounds"])

            # -----------------------------------------------------
            # GAP 2 FIX: actually call detect_deadlock(). It compares
            # state["last_proposals"] (this round's proposals) against
            # state["prev_proposals"] (snapshotted at the end of the
            # previous round, below) to see if agents are stuck.
            # -----------------------------------------------------

            deadlock_detected = False

            if not is_final_round:
                try:
                    deadlock_detected = detect_deadlock(
                        state,
                        state["max_rounds"]
                    )
                except Exception:
                    deadlock_detected = False

            state["deadlock_detected"] = deadlock_detected

            if is_final_round:
                state["max_rounds_reached"] = True
                state["negotiation_ended"] = True
                state["consensus_reached"] = False
                state["status"] = "deadlock_no_consensus"
                state["final_allocation"] = dict(state.get("current_proposal", {})) if state.get("current_proposal") else None
                state["final_report"] = self._build_final_report(state)
                print("[TERMINATION] reason=deadlock/max_rounds")

            elif deadlock_detected:
                if not state.get("resolution_attempted"):
                    # First deadlock: attempt mediation
                    state["resolution_attempted"] = True
                    resolved = self._attempt_deadlock_resolution(
                        state,
                        agents
                    )
                    state["resolution_succeeded"] = resolved

                    if resolved:
                        state["current_round"] += 1
                        state["status"] = "ongoing"
                        print("[TERMINATION] reason=none, deadlock_resolution=succeeded")
                    else:
                        state["negotiation_ended"] = True
                        state["consensus_reached"] = False
                        state["status"] = "negotiation_breakdown"
                        state["final_allocation"] = dict(state.get("current_proposal", {})) if state.get("current_proposal") else None
                        state["final_report"] = self._build_final_report(state)
                        print("[TERMINATION] reason=deadlock_breakdown")
                else:
                    # Deadlock detected again AFTER mediation was already attempted -> Breakdown
                    state["negotiation_ended"] = True
                    state["consensus_reached"] = False
                    state["status"] = "negotiation_breakdown"
                    state["final_allocation"] = dict(state.get("current_proposal", {})) if state.get("current_proposal") else None
                    state["final_report"] = self._build_final_report(state)
                    print("[TERMINATION] reason=deadlock_breakdown_post_mediation")

            else:
                state["current_round"] += 1
                state["status"] = "ongoing"

            # Snapshot this round's proposals so next round's
            # detect_deadlock() call has something to compare against.
            state["prev_proposals"] = dict(state.get("last_proposals", {}))

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
    # PRACTICE ROUNDTABLE STEP
    # =========================================================

    def step_practice_round(
        self,
        session_id: str
    ) -> list:
        """
        Executes a complete AI deliberation round in Practice Mode.
        All configured AI agents (Government, NGO, District) evaluate
        the current state and respond in sequence within the current round.
        """
        if session_id not in self.sessions:
            raise ValueError(
                "Negotiation session not found."
            )

        entry = self.sessions[session_id]
        agents = entry["agents"]
        state = entry["state"]

        if state.get("negotiation_ended"):
            return [self._build_response(state, None, None, None, None)]

        # Ensure we start from the first agent in the roster for this round
        state["current_agent_idx"] = 0
        ai_responses = []

        for _ in range(len(agents)):
            if state.get("negotiation_ended"):
                break
            ai_result = self.step(session_id)
            ai_responses.append(ai_result)

        # After all configured AI agents have responded in this round:
        if state.get("practice_mode") and not state.get("negotiation_ended"):
            if state["current_round"] >= state["max_rounds"]:
                state["awaiting_final_decision"] = True
                state["status"] = "Final Decision"
                print(f"[PRACTICE] Round {state['current_round']}/{state['max_rounds']} AI deliberation complete. Awaiting human final decision.")
            else:
                state["current_round"] += 1
                state["prev_proposals"] = dict(state.get("last_proposals", {}))
                state["status"] = "ongoing"
                state["awaiting_final_decision"] = False
                print(f"[PRACTICE] Round {state['current_round'] - 1} complete. Advanced to Round {state['current_round']}/{state['max_rounds']}.")

        return ai_responses

    # =========================================================
    # PRACTICE ROUNDTABLE STREAMING STEP
    # =========================================================

    async def stream_practice_round(
        self,
        session_id: str
    ):
        """
        Executes an AI deliberation round in Practice Mode, yielding events as each
        individual agent starts and finishes so the frontend can stream responses progressively.
        """
        if session_id not in self.sessions:
            raise ValueError(
                "Negotiation session not found."
            )

        entry = self.sessions[session_id]
        agents = entry["agents"]
        state = entry["state"]

        if state.get("negotiation_ended"):
            yield {
                "type": "round_complete",
                "ai_response": None,
                "state": self.get_state(session_id),
                "round": state.get("current_round", 1),
                "consensus": state.get("consensus", 0.0),
                "negotiation_ended": True,
                "awaiting_final_decision": False,
                "status": state.get("status", "Negotiation complete"),
                "final_allocation": state.get("final_allocation"),
                "final_report": state.get("final_report"),
            }
            return

        state["current_agent_idx"] = 0

        for i in range(len(agents)):
            if state.get("negotiation_ended"):
                break

            current_agent = agents[state["current_agent_idx"] % len(agents)]
            agent_name = getattr(current_agent, "name", f"Agent {i+1}")

            # 1. Yield start event so UI knows this agent is deliberating
            yield {
                "type": "agent_start",
                "agent": agent_name,
                "agent_index": i,
                "total_agents": len(agents),
                "round": state.get("current_round", 1),
            }

            # 2. Step the single agent
            ai_result = await self._step_async(session_id)
            current_state = self.get_state(session_id)

            # 3. Yield agent response immediately
            yield {
                "type": "agent_response",
                "agent": agent_name,
                "agent_index": i,
                "total_agents": len(agents),
                "ai_response": ai_result,
                "state": current_state,
                "consensus": current_state.get("consensus", 0.0),
                "round": current_state.get("current_round", 1),
                "negotiation_ended": current_state.get("negotiation_ended", False),
            }

        # After all configured AI agents have responded in this round:
        if state.get("practice_mode") and not state.get("negotiation_ended"):
            if state["current_round"] >= state["max_rounds"]:
                state["awaiting_final_decision"] = True
                state["status"] = "Final Decision"
                print(f"[PRACTICE] Round {state['current_round']}/{state['max_rounds']} AI deliberation complete. Awaiting human final decision.")
            else:
                state["current_round"] += 1
                state["prev_proposals"] = dict(state.get("last_proposals", {}))
                state["status"] = "ongoing"
                state["awaiting_final_decision"] = False
                print(f"[PRACTICE] Round {state['current_round'] - 1} complete. Advanced to Round {state['current_round']}/{state['max_rounds']}.")

        final_state = self.get_state(session_id)
        yield {
            "type": "round_complete",
            "state": final_state,
            "round": final_state.get("current_round", 1),
            "consensus": final_state.get("consensus", 0.0),
            "negotiation_ended": final_state.get("negotiation_ended", False),
            "awaiting_final_decision": final_state.get("awaiting_final_decision", False),
            "status": final_state.get("status", "Your turn"),
            "final_allocation": final_state.get("final_allocation"),
            "final_report": final_state.get("final_report"),
        }


    # =========================================================
    # PRACTICE MODE: FINAL EXECUTIVE DECISION
    # =========================================================

    def handle_final_decision(
        self,
        session_id: str,
        decision: str,
    ) -> Dict[str, Any]:
        """
        Handles the human's final executive decision after all AI deliberation
        rounds are complete (Accept -> agreement, Reject -> breakdown, Reset -> fresh start).
        """
        if session_id not in self.sessions:
            raise ValueError("Negotiation session not found.")

        state = self.sessions[session_id]["state"]
        normalized = str(decision or "").strip().lower()

        if normalized == "accept":
            state["consensus"] = 1.0
            state["consensus_reached"] = True
            state["negotiation_ended"] = True
            state["status"] = "agreement_reached"
            state["final_allocation"] = dict(state.get("current_proposal", {})) if state.get("current_proposal") else None
            state["final_report"] = self._build_final_report(state)
            state["awaiting_final_decision"] = False
            state["history"].append({
                "agent": "Human Participant",
                "message": "Human Crisis Coordinator accepts the agreement and finalizes the disaster relief resource distribution.",
                "reasoning": "Final executive decision: agreement accepted.",
                "stance": "accept",
                "round": state["current_round"],
                "action": "ACCEPT",
                "parsed_proposal": state.get("final_allocation", {}),
            })
            print("[PRACTICE] Human accepted agreement on final decision.")
        elif normalized == "reject":
            state["consensus_reached"] = False
            state["negotiation_ended"] = True
            state["status"] = "negotiation_breakdown"
            state["final_report"] = self._build_final_report(state)
            state["awaiting_final_decision"] = False
            state["history"].append({
                "agent": "Human Participant",
                "message": "Human Crisis Coordinator rejects the final proposal. Negotiation has concluded without reaching an agreement.",
                "reasoning": "Final executive decision: proposal rejected.",
                "stance": "reject",
                "round": state["current_round"],
                "action": "REJECT",
                "parsed_proposal": state.get("current_proposal", {}),
            })
            print("[PRACTICE] Human rejected proposal on final decision.")
        elif normalized == "reset":
            state["current_round"] = 1
            state["current_agent_idx"] = 0
            state["history"] = []
            state["consensus"] = 0.0
            state["consensus_reached"] = False
            state["negotiation_ended"] = False
            state["max_rounds_reached"] = False
            state["status"] = "ongoing"
            state["accepted_proposals"] = {}
            state["last_proposals"] = {}
            state["current_proposal"] = {}
            state["final_allocation"] = None
            state["final_report"] = None
            state["awaiting_final_decision"] = False
            print("[PRACTICE] Negotiation session reset.")

        return state

    # =========================================================
    # HUMAN STRATEGIST / AUTO-DRAFT SUGGESTION
    # =========================================================

    def get_human_suggestion(
        self,
        session_id: str
    ) -> dict:
        """
        Generates an in-character strategic move suggestion for the human
        crisis coordinator in Practice Mode based on the current round,
        other agents' recent demands, and zero-sum constraints.
        """
        if session_id not in self.sessions:
            raise ValueError(
                "Negotiation session not found."
            )

        entry = self.sessions[session_id]
        state = entry["state"]
        scenario = state.get("scenario", {})
        resource_quantities = state.get("resource_quantities", {})

        suggestion = generate_human_suggestion(
            scenario=scenario,
            current_round=state.get("current_round", 1),
            max_rounds=state.get("max_rounds", 5),
            history=state.get("history", []),
            last_proposals=state.get("last_proposals", {}),
            current_proposal=state.get("current_proposal", {}),
            resource_quantities=resource_quantities,
            agents=state.get("agents", []),
        )

        return suggestion


    # =========================================================
    # DEADLOCK RESOLUTION (GAP 3)
    # =========================================================

    def _attempt_deadlock_resolution(self, state, agents) -> bool:
        """
        Single automated mediation attempt for a genuine deadlock
        (detected before max_rounds is hit). Builds a mediated
        "midpoint" proposal from the agents' most recent individual
        proposals, scaled to fit within available resource quantities.

        Returns True if a valid mediated proposal could be produced
        (resolution attempted -> negotiation continues), False if
        there isn't enough data to mediate with (resolution failed ->
        caller should treat this as a negotiation breakdown).
        """

        last_proposals = state.get("last_proposals", {})
        resource_quantities = state.get("resource_quantities", {})

        agent_names = [item.name for item in agents]
        proposals = [
            last_proposals[name]
            for name in agent_names
            if name in last_proposals and isinstance(last_proposals[name], dict)
        ]

        if len(proposals) < 2 or not resource_quantities:
            # Not enough distinct positions on the table to mediate between.
            return False

        mediated_proposal = {}

        for resource, available in resource_quantities.items():
            values = [
                proposal.get(resource, 0)
                for proposal in proposals
                if isinstance(proposal, dict)
            ]

            if not values:
                continue

            midpoint = sum(values) / len(values)
            mediated_proposal[resource] = max(
                0,
                min(available, int(round(midpoint)))
            )

        if not mediated_proposal:
            return False

        total_requested = sum(mediated_proposal.values())
        total_available = sum(resource_quantities.values())

        if total_available and total_requested > total_available:
            # Scale down proportionally so the mediated offer is a
            # globally valid (zero-sum-respecting) allocation.
            scale = total_available / total_requested
            mediated_proposal = {
                resource: max(0, int(round(quantity * scale)))
                for resource, quantity in mediated_proposal.items()
            }

        state["current_proposal"] = dict(mediated_proposal)
        # A freshly mediated proposal invalidates any prior acceptances.
        state["accepted_proposals"] = {}

        state["history"].append(
            {
                "agent": "Mediator",
                "message": (
                    "Deadlock detected. Proposing a mediated compromise: "
                    + self._format_proposal(mediated_proposal)
                    + "."
                ),
                "reasoning": (
                    "Automated deadlock-resolution attempt: midpoint of the "
                    "agents' most recent proposals, scaled to fit available "
                    "resources."
                ),
                "stance": "mediator",
                "round": state["current_round"],
                "action": "MEDIATE",
                "parsed_proposal": mediated_proposal,
            }
        )

        return True

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
        outcome_analysis = build_outcome_analysis(state)

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
                "outcome_analysis": outcome_analysis,
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
            "status": state.get("status", "deadlock_no_consensus"),
            "consensus_reached": False,
            "final_allocation": allocation,
            "outcome_analysis": outcome_analysis,
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

            "status": state.get(
                "status",
                "ongoing"
            ),

            # GAP 4: expose deadlock/resolution info to the frontend
            "deadlock_detected": state.get("deadlock_detected", False),

            "resolution_attempted": state.get("resolution_attempted", False),

            "resolution_succeeded": state.get("resolution_succeeded", False),

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

            "agreed_agents": (
                sum(
                    accepted_proposal == state.get("current_proposal", {})
                    for accepted_proposal in state.get(
                        "accepted_proposals",
                        {}
                    ).values()
                )
                if any(
                    item.get("agent") == "Human Participant"
                    for item in state.get("history", [])
                )
                else len(state.get("accepted_proposals", {}))
            ),

            "total_agents": len(state.get("agents", [])) + (
                1
                if any(
                    item.get("agent") == "Human Participant"
                    for item in state.get("history", [])
                )
                else 0
            ),

            "gemini_metrics": get_gemini_metrics()
        }