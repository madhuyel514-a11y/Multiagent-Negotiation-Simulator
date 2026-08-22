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
        Role-specific fallback response with DIFFERENT allocation numbers
        per agent to create genuine conflict, not identical proposals.
        """

        role = self._get_role_type(agent)
        round_number = state.get("current_round", 1)
        resource_quantities = state.get("resource_quantities", {})
        last_proposals = state.get("last_proposals", {})        # Round 5 target weights (Exact 100% Zero-Sum Complementary Split):
        FINAL_TARGET_WEIGHTS = {
            "government": {"rescue": 0.45, "debris": 0.40, "medical": 0.25, "shelter": 0.25},
            "ngo":        {"rescue": 0.20, "debris": 0.15, "medical": 0.45, "shelter": 0.45},
            "district":   {"rescue": 0.35, "debris": 0.45, "medical": 0.30, "shelter": 0.30},
        }

        OPENING_EXTRA = {
            "government": {"rescue": 0.05, "debris": 0.05, "medical": 0.05, "shelter": 0.05},
            "ngo":        {"rescue": 0.05, "debris": 0.05, "medical": 0.05, "shelter": 0.05},
            "district":   {"rescue": 0.05, "debris": 0.05, "medical": 0.05, "shelter": 0.05},
        }

        target_weights = FINAL_TARGET_WEIGHTS.get(role, {"rescue": 0.33, "debris": 0.33, "medical": 0.33, "shelter": 0.33})
        extra_weights = OPENING_EXTRA.get(role, {"rescue": 0.05, "debris": 0.05, "medical": 0.05, "shelter": 0.05})

        extra_ratio = max(0.0, (5 - round_number) / 4.0)

        def _get_weight(resource_name):
            name_lower = resource_name.lower()
            base_w = 0.33
            extra_w = 0.05
            for key in ["rescue", "debris", "medical", "shelter"]:
                if key in name_lower:
                    base_w = target_weights.get(key, 0.33)
                    extra_w = extra_weights.get(key, 0.05)
                    break
            return base_w + (extra_w * extra_ratio)

        fallback_proposal = {}
        if resource_quantities:
            message_parts = []
            for resource, available in resource_quantities.items():
                if available == 0:
                    message_parts.append(f"{resource}: 0 units")
                    continue
                w = _get_weight(resource)
                quantity = max(1, int(round(available * w)))
                message_parts.append(f"{resource}: {quantity} units")
                fallback_proposal[resource] = quantity

            proposal_str = "; ".join(message_parts)
        else:
            resources = self._get_resources(state)
            primary = resources[(round_number - 1) % len(resources)] if resources else "resources"
            proposal_str = f"{primary}: [see available quantities]"

        is_final_round = (round_number >= 5)

        action = "COUNTER"
        if is_final_round:
            action = "ACCEPT"
        elif round_number == 1:
            action = "OFFER"
        elif round_number == 2:
            action = "REJECT"

        if role == "government":
            if is_final_round:
                message = (
                    f"After 5 rounds of constructive negotiation, we have achieved full consensus. "
                    f"I accept the final agreed allocation: {proposal_str}. "
                    f"This secures 45% of Rescue Teams and 40% of Debris Clearance for national operations, "
                    f"while fully supporting NGO medical clinics and District local infrastructure. We are ready to deploy."
                )
                reasoning = "Final consensus reached: Government's core rescue and transit mandates are fully secured alongside partners' needs."
                stance = "accept"
                action = "ACCEPT"
            elif round_number == 1:
                message = (
                    f"As the Government authority leading national disaster management, our top priority is rapid search and rescue and main transit clearance. "
                    f"Our opening proposal: {proposal_str}. "
                    f"We are establishing a strong rescue baseline while keeping medical and shelter demands moderate for NGO and District teams."
                )
                reasoning = "Government establishing opening position prioritizing Rescue Teams and Debris Clearance."
                stance = "firm"
                action = "OFFER"
            elif round_number == 2:
                message = (
                    f"While I acknowledge the District's local concerns and the NGO's clinical needs, I cannot accept the excessive heavy equipment claims from municipal partners. "
                    f"Claiming high clearance capacity creates an immediate deficit on arterial highway routes. I reject this allocation and counter-propose: {proposal_str}. "
                    f"We must maintain national highway clearing authority."
                )
                reasoning = "Round 2 firm pushback against disproportionate local heavy equipment claims while proposing workable limits."
                stance = "firm"
                action = "REJECT"
            else:
                message = (
                    f"I have reviewed the partners' latest counter-proposals and am offering measured concessions. "
                    f"My revised counter-proposal: {proposal_str}. "
                    f"I am reducing our secondary shelter and medical demands to ensure the NGO has sufficient triage supplies and the District has local clearance capacity."
                )
                reasoning = f"Round {round_number} strategic trade-off while maintaining core search and rescue priorities."
                stance = "moderate"
                action = "COUNTER"

        elif role == "ngo":
            if is_final_round:
                message = (
                    f"The NGO fully accepts and endorses this final allocation: {proposal_str}. "
                    f"Securing 45% of Medical Aid and 45% of Temporary Shelters gives our field clinics and relief teams the resources to save lives and shelter displaced families, "
                    f"while respecting Government rescue command and District road clearance. All partners have reached full agreement."
                )
                reasoning = "Final consensus reached: NGO's primary humanitarian mandate for medical aid and shelters is successfully fulfilled."
                stance = "accept"
                action = "ACCEPT"
            elif round_number == 1:
                message = (
                    f"The NGO's frontline humanitarian mission focuses on immediate medical triage and temporary shelters for displaced families. "
                    f"Our opening proposal: {proposal_str}. "
                    f"We are requesting a fair majority share of Medical Aid and Shelters while conceding heavy equipment to Government and District authorities."
                )
                reasoning = "NGO opening position prioritizing Medical Aid and Temporary Shelters for civilian casualties."
                stance = "firm"
                action = "OFFER"
            elif round_number == 2:
                message = (
                    f"I cannot accept the Government's initial proposal that restricts frontline medical aid to minimal quantities when hundreds of injured civilians require urgent care. "
                    f"Frontline trauma centers cannot operate without sufficient supplies. I reject that reduction and counter-propose: {proposal_str}, "
                    f"conceding heavy equipment to Government and District teams in exchange for essential clinical supplies."
                )
                reasoning = "Round 2 firm rejection of insufficient clinical allocations with targeted counter-proposal."
                stance = "firm"
                action = "REJECT"
            else:
                message = (
                    f"The NGO appreciates the movement from government and municipal authorities. "
                    f"Our counter-proposal for Round {round_number}: {proposal_str}. "
                    f"We are making further concessions on heavy equipment and rescue support in exchange for protecting frontline medical supplies."
                )
                reasoning = f"Round {round_number} constructive trade-off to converge toward joint consensus."
                stance = "strategic"
                action = "COUNTER"

        else:  # district
            if is_final_round:
                message = (
                    f"The District Administration confirms full agreement with this final distribution: {proposal_str}. "
                    f"With 45% of Debris Clearance dedicated to local transit arteries and 35% of Rescue Teams for municipal response, "
                    f"all supply routes and distribution hubs are secured to support NGO field clinics and federal teams. Consensus is achieved."
                )
                reasoning = "Final consensus reached: District logistics baseline and municipal response capacity are guaranteed."
                stance = "accept"
                action = "ACCEPT"
            elif round_number == 1:
                message = (
                    f"The District Administration's priority is clearing local road networks and coordinating municipal relief operations. "
                    f"Our opening proposal: {proposal_str}. "
                    f"Without cleared roads, no relief aid can move. We demand a strong clearance baseline while balancing clinical and rescue shares."
                )
                reasoning = "District opening position defending Debris Clearance as the operational foundation."
                stance = "firm"
                action = "OFFER"
            elif round_number == 2:
                message = (
                    f"I acknowledge the Government's national rescue command and the NGO's clinical priorities, but we cannot accept being left without local route clearing machinery. "
                    f"To bridge the gap between arterial highways and neighborhood triage sites, I counter-propose: {proposal_str}, "
                    f"offering concessions on temporary shelters and medical aid to maintain local access."
                )
                reasoning = "Round 2 municipal adjustment defending local feeder road clearance with constructive trade-offs."
                stance = "strategic"
                action = "COUNTER"
            else:
                message = (
                    f"I acknowledge the constructive concessions from both the Government and NGO. "
                    f"My revised proposal for Round {round_number}: {proposal_str}. "
                    f"We are refining our local allocations to ensure all three agencies reach an equitable, workable solution."
                )
                reasoning = f"Round {round_number} municipal adjustment balancing clearance with partner needs."
                stance = "strategic"
                action = "COUNTER"

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
            raw_action = unique_result.get("action", "")

        # Safety fallback
        if not message:
            unique_result = self._build_unique_response(
                agent,
                state
            )

            message = unique_result["message"]
            reasoning = unique_result["reasoning"]
            stance = unique_result["stance"]
            raw_action = unique_result.get("action", "")

        # -----------------------------------------------------
        # PARSE AND SAVE NUMERICAL PROPOSALS
        # Track what each agent last proposed for cross-referencing
        # -----------------------------------------------------

        incoming_proposal = state.get("current_proposal", {})

        parsed_proposal = self._parse_proposals_from_message(
            message,
            state.get("resource_quantities", {}),
            [item.name for item in agents],
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

        message = self._normalize_decision_message(
            action,
            incoming_proposal,
            generated_proposal,
            reasoning,
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
                state["final_allocation"] = None
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

        return {
            "status": "deadlock_no_consensus",
            "consensus_reached": False,
            "final_allocation": None,
            "message": "NO AGREEMENT REACHED\nMaximum negotiation rounds were reached without unanimous acceptance."
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
            )
        }