import asyncio
import re
import uuid
from typing import Dict, Any

from agents.government_agent import GovernmentAgent
from agents.ngo_agent import NGOAgent
from agents.district_agent import DistrictAdministrationAgent

from services.gemini_service import ask_model
from services.evaluation_engine import (
    calculate_consensus,
    generate_turn_evaluation,
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
        config: dict,
    ) -> str:

        session_id = str(uuid.uuid4())

        scenario = scenario or {}
        config = config or {}
        agents_config = agents_config or []

        agents = []

        # =====================================================
        # CREATE AGENTS
        # =====================================================

        for index, cfg in enumerate(agents_config):

            cfg = cfg or {}

            agent_id = str(
                cfg.get("id")
                or f"agent-{index + 1}"
            )

            personality = str(
                cfg.get("personality")
                or cfg.get("defaultPersonality")
                or "Collaborative"
            )

            role = str(cfg.get("role") or "")
            name = str(cfg.get("name") or "")

            identity = f"{role} {name}".lower()

            if "government" in identity:

                agent = GovernmentAgent(
                    agent_id,
                    personality,
                )

            elif "ngo" in identity:

                agent = NGOAgent(
                    agent_id,
                    personality,
                )

            elif (
                "district" in identity
                or "administration" in identity
            ):

                agent = DistrictAdministrationAgent(
                    agent_id,
                    personality,
                )

            else:

                agent = DistrictAdministrationAgent(
                    agent_id,
                    personality,
                )

            if cfg.get("goal"):

                agent.primary_goal = str(
                    cfg.get("goal")
                )

            if cfg.get("constraints"):

                constraints = cfg.get("constraints")

                if isinstance(constraints, list):
                    agent.constraints = constraints
                else:
                    agent.constraints = [
                        str(constraints)
                    ]

            priorities = (
                cfg.get("priorities")
                or cfg.get("priority")
                or []
            )

            if not isinstance(priorities, list):

                priorities = [
                    str(priorities)
                ]

            agent.priorities = priorities

            agents.append(agent)

        # =====================================================
        # DEFAULT AGENTS
        # =====================================================

        if not agents:

            agents = [

                GovernmentAgent(
                    "government",
                    "Aggressive",
                ),

                NGOAgent(
                    "ngo",
                    "Collaborative",
                ),

                DistrictAdministrationAgent(
                    "district",
                    "Risk-Averse",
                ),
            ]

        # =====================================================
        # MAX ROUNDS
        # =====================================================

        try:

            max_rounds = int(
                config.get("max_rounds", 5)
            )

        except (TypeError, ValueError):

            max_rounds = 5

        max_rounds = max(1, max_rounds)

        # =====================================================
        # RESOURCE QUANTITIES
        # =====================================================

        resource_quantities = (

            config.get("resourceQuantities")

            or config.get("resource_quantities")

            or scenario.get("resourceQuantities")

            or scenario.get("resource_quantities")

            or {}
        )

        if not isinstance(
            resource_quantities,
            dict,
        ):

            resource_quantities = {}

        cleaned_quantities = {}

        for resource, quantity in (
            resource_quantities.items()
        ):

            try:

                cleaned_quantities[
                    str(resource)
                ] = max(
                    0,
                    int(quantity),
                )

            except (TypeError, ValueError):

                cleaned_quantities[
                    str(resource)
                ] = 0

        resource_quantities = cleaned_quantities

        # =====================================================
        # STATE
        # =====================================================

        state = {

            "session_id": session_id,

            "scenario": scenario,

            "resource_quantities":
                resource_quantities,

            "total_budget":
                sum(resource_quantities.values()),

            "last_proposals": {},

            # Current proposal completely replaces
            # the previous proposal.
            "current_proposal": {},

            "accepted_proposals": {},

            # Human interaction preferences
            "human_preferences": {},

            "human_accepted": False,

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
                    "priorities": getattr(
                        agent,
                        "priorities",
                        [],
                    ),
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
        }

        self.sessions[session_id] = {

            "state": state,

            "agents": agents,
        }

        return session_id

    # =========================================================
    # SESSION EXISTS
    # =========================================================

    def session_exists(
        self,
        session_id: str,
    ) -> bool:

        return session_id in self.sessions

    # =========================================================
    # GET STATE
    # =========================================================

    def get_state(
        self,
        session_id: str,
    ) -> Dict[str, Any]:

        if session_id not in self.sessions:
            return {}

        return self.sessions[
            session_id
        ]["state"]

    # =========================================================
    # ADD HUMAN MESSAGE
    # =========================================================

    def add_human_message(
        self,
        session_id: str,
        human_message: str = "",
        message: str = "",
        resource: str = "",
        amount: int = 0,
        action: str = "Offer",
        **kwargs,
    ) -> Dict[str, Any]:

        if session_id not in self.sessions:

            raise ValueError(
                "Negotiation session not found."
            )

        state = self.sessions[
            session_id
        ]["state"]

        # =====================================================
        # NEGOTIATION ENDED
        # =====================================================

        if state.get("negotiation_ended"):

            return {

                "success": False,

                "message":
                    "The negotiation has already ended.",

                "current_proposal":
                    state.get(
                        "current_proposal",
                        {},
                    ),
            }

        # =====================================================
        # GET MESSAGE
        # =====================================================

        if not human_message:
            human_message = message

        human_message = str(
            human_message or ""
        ).strip()

        action = str(
            action or "Offer"
        ).strip().upper()

        resource = str(
            resource or ""
        ).strip()

        try:

            amount = int(amount)

        except (TypeError, ValueError):

            amount = 0

        # =====================================================
        # HUMAN ACCEPT
        # =====================================================

        if action == "ACCEPT":

            current_proposal = state.get(
                "current_proposal",
                {},
            )

            if not current_proposal:

                return {

                    "success": False,

                    "message":
                        "There is no proposal to accept.",
                }

            state["human_accepted"] = True

            final_message = (
                "Human Participant ACCEPTED "
                "the current proposal."
            )

        # =====================================================
        # HUMAN REJECT
        # =====================================================

        elif action == "REJECT":

            state["human_accepted"] = False

            final_message = (
                "Human Participant REJECTED "
                "the current proposal."
            )

        # =====================================================
        # HUMAN OFFER / REQUEST / COUNTER
        # =====================================================

        else:

            state["human_accepted"] = False

            if resource:

                available = state.get(
                    "resource_quantities",
                    {},
                ).get(resource)

                # Try case-insensitive resource matching
                if available is None:

                    for existing_resource in (
                        state.get(
                            "resource_quantities",
                            {},
                        ).keys()
                    ):

                        if (
                            existing_resource.lower()
                            == resource.lower()
                        ):

                            resource = existing_resource
                            available = (
                                state[
                                    "resource_quantities"
                                ][existing_resource]
                            )
                            break

                if available is not None:

                    amount = max(
                        0,
                        min(
                            amount,
                            int(available),
                        ),
                    )

                state.setdefault(
                    "human_preferences",
                    {},
                )

                state[
                    "human_preferences"
                ][resource] = {

                    "amount": amount,

                    "action": action,

                    "message": human_message,
                }

            parts = [

                f"Action: {action}",
            ]

            if resource:

                parts.append(
                    f"Resource: {resource}"
                )

            if amount > 0:

                parts.append(
                    f"Amount: {amount}"
                )

            if human_message:

                parts.append(
                    f"Message: {human_message}"
                )

            final_message = " | ".join(parts)

        # =====================================================
        # SAVE HUMAN HISTORY
        # =====================================================

        state["history"].append({

            "agent": "Human Participant",

            "message": final_message,

            "reasoning":
                "Human participant actively participated "
                "in the negotiation.",

            "stance": "human",

            "action": action,

            "resource": resource,

            "amount": amount,

            "round":
                state.get(
                    "current_round",
                    1,
                ),
        })

        return {

            "success": True,

            "message": final_message,

            "round":
                state.get(
                    "current_round",
                    1,
                ),

            "human_preferences":
                state.get(
                    "human_preferences",
                    {},
                ),

            "current_proposal":
                state.get(
                    "current_proposal",
                    {},
                ),

            "history":
                state.get(
                    "history",
                    [],
                ),
        }

    # =========================================================
    # VALIDATE ALLOCATION
    # =========================================================

    def _validate_allocation(
        self,
        proposal: dict,
        resource_quantities: dict,
        agent_names: list,
    ) -> dict:

        if not proposal:
            return {}

        validated = {

            agent_name: {}

            for agent_name in agent_names
        }

        for resource, available in (
            resource_quantities.items()
        ):

            remaining = max(
                0,
                int(available),
            )

            for agent_name in agent_names:

                requested = (
                    proposal
                    .get(agent_name, {})
                    .get(resource, 0)
                )

                try:

                    requested = int(requested)

                except (TypeError, ValueError):

                    requested = 0

                requested = max(
                    0,
                    requested,
                )

                quantity = min(
                    requested,
                    remaining,
                )

                validated[
                    agent_name
                ][resource] = quantity

                remaining -= quantity

        return validated

    # =========================================================
    # PARSE COMPLETE ALLOCATION
    # =========================================================

    def _parse_proposals_from_message(
        self,
        message: str,
        resource_quantities: dict,
        agent_names: list,
    ) -> dict:

        if not message:
            return {}

        if not resource_quantities:
            return {}

        if not agent_names:
            return {}

        text = str(message)

        result = {}

        sections = []

        for agent_name in agent_names:

            escaped_name = re.escape(agent_name)

            patterns = [

                rf"{escaped_name}\s+Allocation\s*:",

                rf"{escaped_name}\s*:",
            ]

            for pattern in patterns:

                match = re.search(
                    pattern,
                    text,
                    re.IGNORECASE,
                )

                if match:

                    sections.append({

                        "start": match.start(),

                        "end": match.end(),

                        "agent": agent_name,
                    })

                    break

        sections.sort(
            key=lambda x: x["start"]
        )

        for index, section_info in enumerate(
            sections
        ):

            agent_name = section_info["agent"]

            start = section_info["end"]

            if index + 1 < len(sections):

                end = sections[
                    index + 1
                ]["start"]

            else:

                end = len(text)

            section_text = text[start:end]

            allocation = {}

            for resource, available in (
                resource_quantities.items()
            ):

                escaped_resource = re.escape(
                    str(resource)
                )

                patterns = [

                    rf"{escaped_resource}\s*:\s*(\d+)",

                    rf"{escaped_resource}\s*[-=]\s*(\d+)",

                    rf"(\d+)\s*(?:units?\s+of\s+)?{escaped_resource}",
                ]

                for pattern in patterns:

                    match = re.search(
                        pattern,
                        section_text,
                        re.IGNORECASE,
                    )

                    if match:

                        try:

                            quantity = int(
                                match.group(1)
                            )

                            quantity = max(
                                0,
                                min(
                                    quantity,
                                    int(available),
                                ),
                            )

                            allocation[
                                resource
                            ] = quantity

                            break

                        except (
                            TypeError,
                            ValueError,
                        ):

                            pass

            if allocation:

                result[agent_name] = allocation

        if len(result) >= 2:

            return self._validate_allocation(

                result,

                resource_quantities,

                agent_names,
            )

        return {}

    # =========================================================
    # GENERATE NEGOTIATED ALLOCATION
    # IMPORTANT: NOT ALWAYS EQUAL DISTRIBUTION
    # =========================================================

    def _generate_complete_allocation(
        self,
        state,
        proposing_agent=None,
    ) -> dict:

        agents = state.get(
            "agents",
            [],
        )

        agent_names = [
            agent["name"]
            for agent in agents
        ]

        resources = state.get(
            "resource_quantities",
            {},
        )

        if not agent_names or not resources:
            return {}

        allocation = {

            agent_name: {}

            for agent_name in agent_names
        }

        # =====================================================
        # GET PERSONALITIES
        # =====================================================

        personalities = {

            agent["name"]: str(
                agent.get(
                    "personality",
                    "Collaborative",
                )
            ).lower()

            for agent in agents
        }

        # =====================================================
        # GET HUMAN PREFERENCES
        # =====================================================

        human_preferences = state.get(
            "human_preferences",
            {},
        )

        # =====================================================
        # CURRENT PROPOSAL
        # =====================================================

        previous_proposal = state.get(
            "current_proposal",
            {},
        )

        # =====================================================
        # DISTRIBUTE EACH RESOURCE
        # =====================================================

        for resource, total in resources.items():

            total = int(total)

            weights = []

            for agent_name in agent_names:

                personality = personalities.get(
                    agent_name,
                    "collaborative",
                )

                # Base weight
                weight = 1.0

                # ---------------------------------------------
                # PERSONALITY EFFECT
                # ---------------------------------------------

                if "aggressive" in personality:

                    weight = 1.60

                elif "humanitarian" in personality:

                    weight = 1.40

                elif "risk" in personality:

                    weight = 1.20

                elif "collaborative" in personality:

                    weight = 1.00

                # ---------------------------------------------
                # CURRENT AGENT INFLUENCE
                # The proposing agent should not generate
                # exactly the same allocation every time.
                # ---------------------------------------------

                if (
                    proposing_agent
                    and agent_name
                    == proposing_agent.name
                ):

                    weight += 0.35

                weights.append(weight)

            # =================================================
            # HUMAN REQUEST / OFFER INFLUENCE
            # =================================================

            preference = human_preferences.get(
                resource
            )

            if preference:

                human_action = str(
                    preference.get(
                        "action",
                        "",
                    )
                ).upper()

                human_amount = int(
                    preference.get(
                        "amount",
                        0,
                    )
                )

                # Human request affects the distribution

                if human_action in (
                    "REQUEST",
                    "OFFER",
                    "COUNTER",
                    "PROPOSE",
                ):

                    ratio = (
                        human_amount / total
                        if total > 0
                        else 0
                    )

                    # Strong human request causes agents
                    # to negotiate differently.

                    if ratio >= 0.80:

                        for i in range(
                            len(weights)
                        ):

                            weights[i] += (
                                0.15 * (i + 1)
                            )

                    elif ratio >= 0.50:

                        for i in range(
                            len(weights)
                        ):

                            weights[i] += (
                                0.10 * (i + 1)
                            )

                    elif ratio > 0:

                        for i in range(
                            len(weights)
                        ):

                            weights[i] += (
                                0.05 * (i + 1)
                            )

            # =================================================
            # PREVIOUS PROPOSAL INFLUENCE
            # MAKE COUNTER PROPOSALS ACTUALLY CHANGE
            # =================================================

            if previous_proposal:

                for i, agent_name in enumerate(
                    agent_names
                ):

                    previous_amount = (
                        previous_proposal
                        .get(agent_name, {})
                        .get(resource, 0)
                    )

                    if (
                        proposing_agent
                        and agent_name
                        == proposing_agent.name
                    ):

                        # Proposing agent attempts
                        # to improve its own position.

                        weights[i] += 0.20

                    elif previous_amount > 0:

                        weights[i] += 0.05

            # =================================================
            # CALCULATE ALLOCATION
            # =================================================

            total_weight = sum(weights)

            raw_allocations = [

                int(
                    total * weight / total_weight
                )

                for weight in weights
            ]

            allocated = sum(raw_allocations)

            remaining = total - allocated

            # Give remaining units to agents
            # based on proposal order.

            if remaining > 0:

                start_index = 0

                if proposing_agent:

                    try:

                        start_index = (
                            agent_names.index(
                                proposing_agent.name
                            )
                        )

                    except ValueError:

                        start_index = 0

                for offset in range(remaining):

                    target_index = (
                        start_index + offset
                    ) % len(raw_allocations)

                    raw_allocations[
                        target_index
                    ] += 1

            # =================================================
            # SAVE RESOURCE ALLOCATION
            # =================================================

            for index, agent_name in enumerate(
                agent_names
            ):

                allocation[
                    agent_name
                ][resource] = raw_allocations[index]

        return self._validate_allocation(

            allocation,

            resources,

            agent_names,
        )

    # =========================================================
    # BUILD FALLBACK RESPONSE
    # =========================================================

    def _build_unique_response(
        self,
        agent,
        state,
    ) -> dict:

        round_number = state.get(
            "current_round",
            1,
        )

        current_proposal = state.get(
            "current_proposal",
            {},
        )

        # =====================================================
        # FINAL ROUND
        # =====================================================

        if (
            round_number
            >= state.get("max_rounds", 5)
            and current_proposal
        ):

            proposal_text = self._format_proposal(
                current_proposal
            )

            return {

                "message": (
                    "I am willing to accept the current "
                    "negotiated allocation:\n\n"
                    f"{proposal_text}"
                ),

                "reasoning": (
                    "The negotiation is approaching "
                    "its final round."
                ),

                "stance": "accept",

                "action": "ACCEPT",
            }

        # =====================================================
        # GENERATE AGENT-SPECIFIC PROPOSAL
        # =====================================================

        proposal = self._generate_complete_allocation(

            state,

            proposing_agent=agent,
        )

        proposal_text = self._format_proposal(
            proposal
        )

        if current_proposal:

            action = "COUNTER"

            intro = (
                f"{agent.name} proposes a revised "
                "allocation based on the previous "
                "proposal and negotiation history:\n\n"
            )

        else:

            action = "OFFER"

            intro = (
                f"{agent.name} makes an initial "
                "allocation proposal:\n\n"
            )

        return {

            "message":
                intro + proposal_text,

            "reasoning": (
                f"{agent.name} generated a proposal "
                "based on personality, previous "
                "negotiation state, and human input."
            ),

            "stance": str(
                getattr(
                    agent,
                    "personality",
                    "moderate",
                )
            ),

            "action": action,
        }

    # =========================================================
    # CHECK REPEATED RESPONSE
    # =========================================================

    def _is_repeated_response(
        self,
        message: str,
        history: list,
    ) -> bool:

        normalized = (
            str(message or "")
            .strip()
            .lower()
        )

        if not normalized:
            return True

        previous_messages = [

            str(
                item.get("message", "")
            )
            .strip()
            .lower()

            for item in history

            if item.get("agent")
            != "Human Participant"
        ]

        return normalized in previous_messages

    # =========================================================
    # ASYNC NEGOTIATION STEP
    # =========================================================

    async def _step_async(
        self,
        session_id: str,
    ) -> Dict[str, Any]:

        if session_id not in self.sessions:

            raise ValueError(
                "Negotiation session not found."
            )

        entry = self.sessions[session_id]

        state = entry["state"]

        agents = entry["agents"]

        if not agents:

            raise ValueError(
                "No negotiation agents configured."
            )

        # =====================================================
        # NEGOTIATION ALREADY ENDED
        # =====================================================

        if state.get("negotiation_ended"):

            return self._build_response(

                state,

                None,

                "Negotiation has already ended.",

                "",

                "",
            )

        # =====================================================
        # MAX ROUND SAFETY
        # =====================================================

        if (
            state["current_round"]
            > state["max_rounds"]
        ):

            self._end_as_deadlock(state)

            return self._build_response(

                state,

                None,

                "Maximum rounds reached.",

                "",

                "",
            )

        # =====================================================
        # CURRENT AGENT
        # =====================================================

        index = (

            state["current_agent_idx"]

            % len(agents)
        )

        agent = agents[index]

        agent_names = [
            a.name
            for a in agents
        ]

        # =====================================================
        # AI CONTEXT
        # =====================================================

        context = {

            "scenario": state["scenario"],

            "history": state["history"],

            "current_round":
                state["current_round"],

            "max_rounds":
                state["max_rounds"],

            "resource_quantities":
                state.get(
                    "resource_quantities",
                    {},
                ),

            "current_proposal":
                state.get(
                    "current_proposal",
                    {},
                ),

            # IMPORTANT:
            # Human preferences are sent to AI.
            "human_preferences":
                state.get(
                    "human_preferences",
                    {},
                ),

            "last_proposals":
                state.get(
                    "last_proposals",
                    {},
                ),

            "agents":
                state.get(
                    "agents",
                    [],
                ),

            "agent": {

                "id": agent.id,

                "name": agent.name,

                "role": agent.role,

                "personality":
                    agent.personality,

                "goal":
                    agent.primary_goal,

                "constraints":
                    agent.constraints,

                "priorities":
                    getattr(
                        agent,
                        "priorities",
                        [],
                    ),
            },
        }

        # =====================================================
        # AGENT ACT
        # =====================================================

        result = {}

        try:

            result = await agent.act(
                context,
                ask_model,
            )

        except Exception as error:

            print(
                f"[AGENT ERROR] "
                f"{agent.name}: {error}"
            )

        if not isinstance(result, dict):

            result = {}

        message = str(
            result.get("message", "")
        ).strip()

        reasoning = str(
            result.get("reasoning", "")
        ).strip()

        stance = str(
            result.get(
                "stance",
                "moderate",
            )
        ).strip()

        raw_action = str(
            result.get("action", "")
        ).strip().upper()

        # =====================================================
        # FALLBACK
        # =====================================================

        if (

            not message

            or self._is_repeated_response(

                message,

                state["history"],
            )
        ):

            fallback = self._build_unique_response(

                agent,

                state,
            )

            message = fallback["message"]

            reasoning = fallback["reasoning"]

            stance = fallback["stance"]

            raw_action = fallback["action"]

        # =====================================================
        # INCOMING PROPOSAL
        # =====================================================

        incoming_proposal = dict(
            state.get(
                "current_proposal",
                {},
            )
        )

        # =====================================================
        # PARSE AI PROPOSAL
        # =====================================================

        parsed_proposal = (
            self._parse_proposals_from_message(

                message,

                state.get(
                    "resource_quantities",
                    {},
                ),

                agent_names,
            )
        )

        # =====================================================
        # EVALUATION ENGINE
        # =====================================================

        try:

            evaluation = (
                generate_turn_evaluation(

                    agent_name=agent.name,

                    new_proposal=parsed_proposal,

                    state=state,

                    message=message,

                    stance=stance,

                    raw_action=raw_action,

                    incoming_proposal=incoming_proposal,
                )
            )

        except Exception as error:

            print(
                f"[EVALUATION ERROR] {error}"
            )

            evaluation = {}

        action = str(
            evaluation.get(
                "action",
                raw_action or "",
            )
        ).upper()

        # =====================================================
        # VALIDATE ACTION
        # =====================================================

        if action not in (

            "OFFER",

            "COUNTER",

            "ACCEPT",

            "REJECT",
        ):

            if incoming_proposal:
                action = "COUNTER"
            else:
                action = "OFFER"

        generated_proposal = {}

        # =====================================================
        # OFFER / COUNTER
        # =====================================================

        if action in (
            "OFFER",
            "COUNTER",
        ):

            if not parsed_proposal:

                parsed_proposal = (
                    self._generate_complete_allocation(

                        state,

                        proposing_agent=agent,
                    )
                )

            if parsed_proposal:

                generated_proposal = (
                    self._validate_allocation(

                        parsed_proposal,

                        state.get(
                            "resource_quantities",
                            {},
                        ),

                        agent_names,
                    )
                )

                # IMPORTANT:
                # NEW PROPOSAL REPLACES OLD PROPOSAL

                state["current_proposal"] = dict(
                    generated_proposal
                )

                state["last_proposals"][
                    agent.name
                ] = dict(
                    generated_proposal
                )

                # New proposal resets acceptances

                state["accepted_proposals"] = {}

                state["human_accepted"] = False

        # =====================================================
        # ACCEPT
        # =====================================================

        elif action == "ACCEPT":

            if incoming_proposal:

                state["accepted_proposals"][
                    agent.name
                ] = dict(
                    incoming_proposal
                )

            else:

                action = "REJECT"

        # =====================================================
        # NORMALIZED MESSAGE
        # =====================================================

        normalized_message = (
            self._normalize_decision_message(

                action,

                incoming_proposal,

                generated_proposal,
            )
        )

        # =====================================================
        # SAVE HISTORY
        # =====================================================

        state["history"].append({

            "agent": agent.name,

            "message": normalized_message,

            "reasoning": reasoning,

            "stance": stance,

            "action": action,

            "round":
                state["current_round"],

            "incoming_proposal":
                incoming_proposal,

            "parsed_proposal":
                generated_proposal,

            "llm_action":
                raw_action,

            "llm_message":
                message,

            "evaluation":
                evaluation,
        })

        # =====================================================
        # NEXT AGENT
        # =====================================================

        state["current_agent_idx"] += 1

        # =====================================================
        # CHECK CONSENSUS
        # =====================================================

        current_proposal = state.get(
            "current_proposal",
            {},
        )

        accepted_proposals = state.get(
            "accepted_proposals",
            {},
        )

        unanimous_acceptance = (

            bool(current_proposal)

            and len(accepted_proposals)
            == len(agent_names)

            and all(

                accepted_proposals.get(name)
                == current_proposal

                for name in agent_names
            )
        )

        if unanimous_acceptance:

            state["consensus"] = 1.0

            state["consensus_reached"] = True

            state["negotiation_ended"] = True

            state["final_allocation"] = dict(
                current_proposal
            )

            state["status"] = (
                "agreement_reached"
            )

            state["final_report"] = (
                self._build_final_report(state)
            )

            return self._build_response(

                state,

                agent,

                normalized_message,

                reasoning,

                stance,
            )

        # =====================================================
        # ROUND FINISHED?
        # =====================================================

        round_finished = (

            state["current_agent_idx"]
            >= len(agents)
        )

        if round_finished:

            state["current_agent_idx"] = 0

            try:

                state["consensus"] = float(
                    calculate_consensus(state)
                )

            except Exception:

                state["consensus"] = 0.0

            if (

                state["current_round"]
                >= state["max_rounds"]
            ):

                if not state.get(
                    "consensus_reached"
                ):

                    self._end_as_deadlock(state)

            else:

                state["current_round"] += 1

                state["status"] = "ongoing"

        else:

            state["status"] = "ongoing"

        return self._build_response(

            state,

            agent,

            normalized_message,

            reasoning,

            stance,
        )

    # =========================================================
    # END DEADLOCK
    # =========================================================

    def _end_as_deadlock(
        self,
        state,
    ):

        state["max_rounds_reached"] = True

        state["negotiation_ended"] = True

        state["consensus_reached"] = False

        state["status"] = (
            "deadlock_no_consensus"
        )

        state["final_allocation"] = None

        state["final_report"] = (
            self._build_final_report(state)
        )

    # =========================================================
    # STEP
    # =========================================================

    def step(
        self,
        session_id: str,
    ) -> Dict[str, Any]:

        return asyncio.run(
            self._step_async(session_id)
        )

    # =========================================================
    # FORMAT PROPOSAL
    # =========================================================

    @staticmethod
    def _format_proposal(
        proposal,
    ):

        if not proposal:
            return ""

        if all(
            isinstance(value, dict)
            for value in proposal.values()
        ):

            lines = []

            for agent_name, resources in (
                proposal.items()
            ):

                resource_text = "; ".join(

                    f"{resource}: "
                    f"{quantity} units"

                    for (
                        resource,
                        quantity,
                    ) in resources.items()
                )

                lines.append(

                    f"{agent_name} Allocation:\n"

                    f"{resource_text}"
                )

            return "\n\n".join(lines)

        return "; ".join(

            f"{resource}: "
            f"{quantity} units"

            for resource, quantity in (
                proposal.items()
            )
        )

    # =========================================================
    # NORMALIZE MESSAGE
    # =========================================================

    def _normalize_decision_message(
        self,
        action,
        incoming_proposal,
        generated_proposal,
    ):

        if action == "ACCEPT":

            proposal_text = self._format_proposal(
                incoming_proposal
            )

            return (

                "I accept the current allocation "
                "proposal:\n\n"

                f"{proposal_text}"
            )

        if action == "COUNTER":

            proposal_text = self._format_proposal(
                generated_proposal
            )

            return (

                "I counter-propose the following "
                "revised allocation:\n\n"

                f"{proposal_text}"
            )

        if action == "REJECT":

            return (

                "I reject the current proposal based "
                "on my objectives and constraints."
            )

        proposal_text = self._format_proposal(
            generated_proposal
        )

        return (

            "I make the following allocation "
            "proposal:\n\n"

            f"{proposal_text}"
        )

    # =========================================================
    # FINAL REPORT
    # =========================================================

    def _build_final_report(
        self,
        state,
    ):

        if state.get(
            "consensus_reached"
        ):

            allocation = (

                state.get(
                    "final_allocation"
                )

                or {}
            )

            allocation_text = (
                self._format_proposal(
                    allocation
                )
            )

            return {

                "status":
                    "agreement_reached",

                "consensus_reached": True,

                "final_allocation":
                    allocation,

                "message": (

                    "FINAL AGREED ALLOCATION\n\n"

                    f"{allocation_text}\n\n"

                    "All negotiation agents accepted "
                    "the final allocation."
                ),
            }

        return {

            "status":
                "deadlock_no_consensus",

            "consensus_reached": False,

            "final_allocation": None,

            "message": (

                "NO AGREEMENT REACHED\n\n"

                "Maximum negotiation rounds were "
                "reached without unanimous acceptance."
            ),
        }

    # =========================================================
    # BUILD RESPONSE
    # =========================================================

    def _build_response(
        self,
        state,
        agent,
        message,
        reasoning,
        stance,
    ):

        agents_state = state.get(
            "agents",
            [],
        )

        next_agent = None

        if (

            agents_state

            and not state.get(
                "negotiation_ended"
            )
        ):

            current_idx = (

                state.get(
                    "current_agent_idx",
                    0,
                )

                % len(agents_state)
            )

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
                1,
            ),

            "current_agent_idx": state.get(
                "current_agent_idx",
                0,
            ),

            "message": message,

            "reasoning": reasoning,

            "stance": stance,

            "consensus": state.get(
                "consensus",
                0.0,
            ),

            "consensus_reached": state.get(
                "consensus_reached",
                False,
            ),

            "negotiation_ended": state.get(
                "negotiation_ended",
                False,
            ),

            "max_rounds_reached": state.get(
                "max_rounds_reached",
                False,
            ),

            "negotiation_status": state.get(
                "status",
                "ongoing",
            ),

            "next_agent": next_agent,

            "current_proposal": state.get(
                "current_proposal",
                {},
            ),

            "accepted_proposals": state.get(
                "accepted_proposals",
                {},
            ),

            "human_preferences": state.get(
                "human_preferences",
                {},
            ),

            "last_proposals": state.get(
                "last_proposals",
                {},
            ),

            "final_allocation": state.get(
                "final_allocation"
            ),

            "final_report": state.get(
                "final_report"
            ),

            "history": state.get(
                "history",
                [],
            ),

            "max_rounds": state.get(
                "max_rounds",
                5,
            ),
        }