from typing import Dict, Any


def _normalise(text: str) -> set:
    if not text:
        return set()

    words = []

    for word in text.lower().split():
        cleaned = "".join(ch for ch in word if ch.isalnum())

        if len(cleaned) >= 4:
            words.append(cleaned)

    return set(words)


def _word_similarity_fallback(state: Dict[str, Any]) -> float:
    """
    Legacy word-similarity consensus.
    Used only when no numerical proposals are available.
    """

    history = state.get("history", [])
    agents = state.get("agents", [])

    if not history or not agents:
        return 0.0

    agent_count = len(agents)

    if len(history) < agent_count:
        return 0.0

    recent = history[-agent_count:]

    messages = [
        str(item.get("message", ""))
        for item in recent
        if item.get("message")
    ]

    if len(messages) < agent_count:
        return 0.0

    word_sets = [_normalise(message) for message in messages]

    similarities = []

    for i in range(len(word_sets)):
        for j in range(i + 1, len(word_sets)):
            union = word_sets[i] | word_sets[j]
            intersection = word_sets[i] & word_sets[j]

            if union:
                similarities.append(len(intersection) / len(union))

    return round(
        sum(similarities) / len(similarities)
        if similarities
        else 0.0,
        2
    )


def calculate_consensus(state: Dict[str, Any]) -> float:
    """
    Calculate consensus progress across rounds, reaching 100% upon final agreement.
    """
    current_round = state.get("current_round", 1)
    max_rounds = state.get("max_rounds", 5)
    last_proposals = state.get("last_proposals", {})
    agents = state.get("agents", [])
    resource_quantities = state.get("resource_quantities", {})

    if not last_proposals or len(last_proposals) < len(agents):
        # Initial exploration
        return 0.25

    if state.get("consensus_reached"):
        return 1.0

    # Check resource constraint fit
    all_resources = set(resource_quantities.keys())
    if all_resources:
        agent_names = [a["name"] for a in agents]
        proposals = [
            last_proposals[name]
            for name in agent_names
            if name in last_proposals and isinstance(last_proposals[name], dict)
        ]
        
        if proposals:
            resource_agreements = []
            for resource in all_resources:
                available = resource_quantities.get(resource, 0)
                total_requested = sum(
                    p.get(resource, 0)
                    if resource in p
                    else sum(
                        allocation.get(resource, 0)
                        for allocation in p.values()
                        if isinstance(allocation, dict)
                    )
                    for p in proposals
                )
                if total_requested <= available:
                    resource_agreements.append(1.0)
                else:
                    resource_agreements.append(max(0.0, available / total_requested))
            
            fit_score = sum(resource_agreements) / len(resource_agreements) if resource_agreements else 0.5
            return round(min(max(fit_score, 0.0), 0.99), 2)

    return 0.5


def detect_deadlock(
    state: Dict[str, Any],
    max_rounds: int = 10
) -> bool:
    """
    Detect deadlock when no meaningful numerical movement occurs
    across the last two complete rounds.
    Also catches identical message content.
    """
    history = state.get("history", [])
    agents = state.get("agents", [])
    agent_count = max(len(agents), 1)

    if len(history) < agent_count * 2:
        return False

    recent = [
        str(item.get("message", "")).strip().lower()
        for item in history[-6:]
    ]

    if len(set(recent)) == 1 and recent[0]:
        return True

    # Explicit check: the last full round of agents all COUNTERed again
    # with the exact same allocation they proposed the round before
    # (not just similar wording — an unchanged parsed_proposal).
    round_start_index = len(history) - agent_count
    recent_round = history[round_start_index:]

    if len(recent_round) == agent_count and all(
        entry.get("action") == "COUNTER" for entry in recent_round
    ):
        all_unchanged = True

        for offset, entry in enumerate(recent_round):
            entry_index = round_start_index + offset
            agent_name = entry.get("agent")
            current_proposal = entry.get("parsed_proposal") or {}

            prior_entry = next(
                (
                    item for item in reversed(history[:entry_index])
                    if item.get("agent") == agent_name
                ),
                None,
            )

            if prior_entry is None:
                all_unchanged = False
                break

            prior_proposal = prior_entry.get("parsed_proposal") or {}

            if current_proposal != prior_proposal:
                all_unchanged = False
                break

        if all_unchanged:
            return True

    last_proposals = state.get("last_proposals", {})
    if len(last_proposals) < 2:
        return False

    prev_proposals = state.get("prev_proposals", {})
    if not prev_proposals:
        return False

    total_movement = 0
    comparison_count = 0

    for agent_name, current in last_proposals.items():
        previous = prev_proposals.get(agent_name, {})
        if not previous:
            continue

        for resource, current_qty in current.items():
            prev_qty = previous.get(resource, current_qty)
            max_val = max(current_qty, prev_qty, 1)
            movement = abs(current_qty - prev_qty) / max_val
            total_movement += movement
            comparison_count += 1

    if comparison_count == 0:
        return False

    avg_movement = total_movement / comparison_count
    return avg_movement < 0.03


def negotiation_status(
    state: Dict[str, Any],
    max_rounds: int = 5
) -> str:
    consensus = float(state.get("consensus", 0.0))

    if state.get("consensus_reached"):
        return "consensus_reached"

    if state.get("current_round", 1) > max_rounds:
        return "max_rounds_reached"

    if detect_deadlock(state, max_rounds):
        return "deadlock"

    return "ongoing"


def _text_tokens(value: Any) -> set:
    if isinstance(value, (list, tuple, set)):
        value = " ".join(str(item) for item in value)
    return _normalise(str(value or ""))


def _resource_priority(resource: str, agent: Dict[str, Any], scenario: Any) -> float:
    """Return a preference weight derived from the agent and scenario text."""
    resource_tokens = _text_tokens(resource)
    preference_text = " ".join(
        str(agent.get(field, ""))
        for field in ("goal", "primary_goal", "priority", "priorities", "role")
    )
    preference_tokens = _text_tokens(preference_text)
    scenario_tokens = _text_tokens(scenario)

    explicit_match = bool(resource_tokens & preference_tokens)
    scenario_match = bool(resource_tokens & scenario_tokens)

    if explicit_match:
        return 1.0
    if scenario_match:
        return 0.75
    return 0.4


def _incoming_proposal(
    agent_name: str,
    state: Dict[str, Any],
    explicit_proposal: Any,
) -> Dict[str, Any]:
    if isinstance(explicit_proposal, dict):
        return explicit_proposal

    history = state.get("history", [])
    for entry in reversed(history):
        if entry.get("agent") != agent_name and isinstance(entry.get("parsed_proposal"), dict):
            return entry["parsed_proposal"]

    last_proposals = state.get("last_proposals", {})
    for name, proposal in reversed(list(last_proposals.items())):
        if name != agent_name and isinstance(proposal, dict):
            return proposal
    return {}


def generate_turn_evaluation(
    agent_name: str, 
    new_proposal: Dict[str, Any], 
    state: Dict[str, Any],
    message: str = "",
    stance: str = "",
    raw_action: str = "",
    incoming_proposal: Dict[str, Any] = None,
) -> Dict[str, Any]:
    """Evaluate the latest other-agent proposal against this agent's objectives."""
    agent = next(
        (item for item in state.get("agents", []) if item.get("name") == agent_name),
        {"name": agent_name},
    )
    resource_quantities = state.get("resource_quantities", {}) or {}
    proposal = _incoming_proposal(agent_name, state, incoming_proposal)
    if not proposal and isinstance(new_proposal, dict) and new_proposal:
        proposal = new_proposal
    known_resources = set(resource_quantities)

    # Preserve agent-specific allocations, but aggregate recipient allocations
    # when the proposal is keyed by districts rather than agent names.
    agent_allocation = {}
    if isinstance(proposal, dict):
        agent_specific_allocation = proposal.get(agent_name)
        if isinstance(agent_specific_allocation, dict):
            agent_allocation = agent_specific_allocation
        elif proposal and all(
            isinstance(allocation, dict)
            for allocation in proposal.values()
        ):
            for allocation in proposal.values():
                for resource, quantity in allocation.items():
                    if isinstance(quantity, (int, float)) and not isinstance(quantity, bool):
                        agent_allocation[resource] = (
                            agent_allocation.get(resource, 0) + quantity
                        )
        else:
            agent_allocation = proposal

    recipient_allocations = (
        list(proposal.values())
        if isinstance(proposal, dict)
        and proposal
        and all(isinstance(allocation, dict) for allocation in proposal.values())
        else [agent_allocation]
    )
    invalid = any(
        resource not in known_resources
        or not isinstance(quantity, (int, float))
        or quantity < 0
        or quantity > resource_quantities.get(resource, 0)
        for allocation in recipient_allocations
        for resource, quantity in allocation.items()
    )

    if not proposal:
        # There is no incoming offer on an agent's opening turn to evaluate.
        return {
            "action": "OFFER",
            "satisfaction": 0.0,
            "threshold": 70.0,
            "is_accepted": False,
            "trade_str": "Await an incoming proposal before evaluating acceptance",
            "adjustments": {},
        }

    agent_count = max(len(state.get("agents", [])), 1)
    weighted_score = 0.0
    total_weight = 0.0
    adjustments = {}
    trades = []

    for resource, available in resource_quantities.items():
        priority = _resource_priority(resource, agent, state.get("scenario", {}))
        weight = 0.5 + priority
        desired_share = min(0.45, max(0.15, priority / agent_count))
        desired_quantity = available * desired_share
        received = max(0.0, float(agent_allocation.get(resource, 0)))
        fulfillment = min(received / desired_quantity, 1.0) if desired_quantity else 1.0
        weighted_score += fulfillment * weight
        total_weight += weight

        gap = max(0, int(round(desired_quantity - received)))
        if gap and priority < 0.85:
            adjustments[resource] = f"+{min(gap, max(0, available - received))}"
            trades.append(f"increase {resource} by {min(gap, max(0, available - received))} units")
        elif received > desired_quantity and priority < 0.85:
            reduction = int(round(received - desired_quantity))
            adjustments[resource] = f"-{reduction}"
        if gap and priority > 0.6:
            adj = min(gap, max(0, available - int(received)))
            if adj > 0:
                adjustments[resource] = f"+{adj}"

    satisfaction = (weighted_score / total_weight * 100) if total_weight else 0.0

    # Determine global state validity
    is_valid_global_state = True
    proposal_to_validate = new_proposal if new_proposal else proposal
    if isinstance(proposal_to_validate, dict):
        for res, available in resource_quantities.items():
            total_req = sum(
                alloc.get(res, 0)
                for name, alloc in proposal_to_validate.items()
                if isinstance(alloc, dict)
            )
            if total_req > available:
                is_valid_global_state = False
                break
    else:
        is_valid_global_state = False

    agent_last_proposal = state.get("last_proposals", {}).get(agent_name, {})

    # 4. Determine Objective Action
    if invalid:
        objective_action = "REJECT"
    elif is_valid_global_state:
        # Everyone fits! 
        # If the agent changed its proposal to make it fit, it must COUNTER so the new proposal gets saved.
        # If it didn't change its proposal, it can safely ACCEPT the global consensus.
        if agent_allocation != agent_last_proposal or not agent_last_proposal:
            objective_action = "COUNTER"
        else:
            objective_action = "ACCEPT"
    else:
        # Proposals don't fit yet, or someone hasn't spoken. Must keep negotiating.
        objective_action = "COUNTER"

    # 5. Reconcile with LLM's requested action
    requested_action = str(raw_action or "").strip().upper()
    
    if requested_action == "ACCEPT":
        if is_valid_global_state:
            action = "ACCEPT"
        else:
            action = "COUNTER"  # Can't accept an invalid state
    elif requested_action in ("COUNTER", "REJECT", "OFFER"):
        action = requested_action
    else:
        action = "COUNTER"

    # 6. Explanations
    if action == "ACCEPT":
        decision_explanation = "The global resource allocations are valid and the agent accepts the consensus."
    elif action == "REJECT" and invalid:
        decision_explanation = "The proposed allocation requests non-existent resources or exceeds total availability."
    elif requested_action == "ACCEPT" and action == "COUNTER":
        decision_explanation = "The agent attempted to accept, but consensus is impossible because total requests exceed available resources."
    else:
        decision_explanation = "The agent is negotiating to secure its operational priorities."

    trades = [f"adjust {res} by {val}" for res, val in adjustments.items()]
    trade_str = "; ".join(trades) if trades else "Maintain the offered allocation"

    return {
        "action": action,
        "satisfaction": round(max(0.0, min(satisfaction, 100.0)), 1),
        "threshold": 100.0 if not is_valid_global_state else 0.0,
        "is_accepted": action == "ACCEPT",
        "explanation": decision_explanation,
        "trade_str": trade_str,
        "adjustments": adjustments,
    }


def _flatten_allocation(proposal):
    totals = {}
    if not isinstance(proposal, dict):
        return totals

    for resource, quantity in proposal.items():
        if isinstance(quantity, dict):
            for nested_resource, nested_quantity in _flatten_allocation(
                quantity
            ).items():
                totals[nested_resource] = totals.get(nested_resource, 0) + nested_quantity
        elif isinstance(quantity, (int, float)) and not isinstance(quantity, bool):
            totals[resource] = totals.get(resource, 0) + quantity

    return totals


def _allocation_paths(proposal, prefix=""):
    values = {}
    if not isinstance(proposal, dict):
        return values

    for resource, quantity in proposal.items():
        path = f"{prefix}/{resource}" if prefix else str(resource)
        if isinstance(quantity, dict):
            values.update(_allocation_paths(quantity, path))
        elif isinstance(quantity, (int, float)) and not isinstance(quantity, bool):
            values[path] = quantity

    return values


def _proposal_delta(previous, current):
    previous_totals = _allocation_paths(previous)
    current_totals = _allocation_paths(current)
    increased = {}
    decreased = {}

    for resource in sorted(set(previous_totals) | set(current_totals)):
        change = current_totals.get(resource, 0) - previous_totals.get(resource, 0)
        if change > 0:
            increased[resource] = change
        elif change < 0:
            decreased[resource] = abs(change)

    return increased, decreased


def _analysis_participants(state):
    participants = [agent.get("name") for agent in state.get("agents", [])]
    if any(
        entry.get("agent") == "Human Participant"
        for entry in state.get("history", [])
    ):
        participants.append("Human Participant")
    return participants


def _proposal_history_by_agent(state):
    grouped = {}
    for entry in state.get("history", []):
        proposal = entry.get("parsed_proposal")
        agent = entry.get("agent")
        if agent and isinstance(proposal, dict) and proposal:
            grouped.setdefault(agent, []).append({
                "round": entry.get("round"),
                "proposal": proposal,
                "action": str(entry.get("action", "")).upper(),
            })
    return grouped


def _concession_patterns(state, final_allocation, participants):
    history_by_agent = _proposal_history_by_agent(state)
    agreement_reached = bool(state.get("consensus_reached"))
    accepted = state.get("accepted_proposals", {})
    patterns = {}

    for agent in participants:
        entries = history_by_agent.get(agent, [])
        increased = {}
        decreased = {}
        concession_count = 0
        total_conceded = 0
        first_concession = False
        first_change_seen = False

        for previous_entry, current_entry in zip(entries, entries[1:]):
            current_increased, current_decreased = _proposal_delta(
                previous_entry["proposal"],
                current_entry["proposal"],
            )
            for resource, quantity in current_increased.items():
                increased[resource] = increased.get(resource, 0) + quantity
            for resource, quantity in current_decreased.items():
                decreased[resource] = decreased.get(resource, 0) + quantity
                concession_count += 1
                total_conceded += quantity
                if not first_change_seen:
                    first_concession = True
            if current_increased or current_decreased:
                first_change_seen = True

        last_proposal = entries[-1]["proposal"] if entries else None
        contributed = bool(
            agreement_reached
            and total_conceded > 0
            and (
                accepted.get(agent) == final_allocation
                or last_proposal == final_allocation
            )
        )

        patterns[agent] = {
            "increased": increased,
            "decreased": decreased,
            "concession_count": concession_count,
            "total_quantity_conceded": total_conceded,
            "made_first_concession": first_concession,
            "contributed_to_final_agreement": contributed,
        }

    return patterns


def _agent_performance(state, final_allocation, participants, concession_patterns):
    history_by_agent = {}
    for entry in state.get("history", []):
        agent = entry.get("agent")
        if agent:
            history_by_agent.setdefault(agent, []).append(entry)

    performance = {}
    final_totals = _flatten_allocation(final_allocation)
    agreement_reached = bool(state.get("consensus_reached"))
    accepted = state.get("accepted_proposals", {})

    for agent in participants:
        entries = history_by_agent.get(agent, [])
        action_counts = {
            action: sum(
                str(entry.get("action", "")).upper() == action
                for entry in entries
            )
            for action in ("OFFER", "COUNTER", "ACCEPT", "REJECT")
        }
        scores = [
            entry.get("evaluation", {}).get("satisfaction")
            for entry in entries
            if isinstance(entry.get("evaluation"), dict)
            and isinstance(entry.get("evaluation", {}).get("satisfaction"), (int, float))
        ]
        proposals = [
            entry.get("parsed_proposal")
            for entry in entries
            if isinstance(entry.get("parsed_proposal"), dict)
            and entry.get("parsed_proposal")
        ]
        stable_comparisons = sum(
            proposals[index] == proposals[index - 1]
            for index in range(1, len(proposals))
        )
        comparison_count = max(0, len(proposals) - 1)
        initial_proposal = proposals[0] if proposals else None
        last_proposal = proposals[-1] if proposals else None
        final_paths = _allocation_paths(final_allocation)
        initial_paths = _allocation_paths(initial_proposal)
        final_comparison = {
            path: final_paths.get(path, 0) - initial_paths.get(path, 0)
            for path in sorted(set(initial_paths) | set(final_paths))
        }

        total_turns = len(entries)
        performance[agent] = {
            "average_satisfaction": round(sum(scores) / len(scores), 2) if scores else 0.0,
            "offers": action_counts["OFFER"],
            "counters": action_counts["COUNTER"],
            "accepts": action_counts["ACCEPT"],
            "rejects": action_counts["REJECT"],
            "acceptance_rate": round(
                action_counts["ACCEPT"] / total_turns,
                2,
            ) if total_turns else 0.0,
            "concession_count": concession_patterns[agent]["concession_count"],
            "total_quantity_conceded": concession_patterns[agent]["total_quantity_conceded"],
            "proposal_stability": round(
                stable_comparisons / comparison_count,
                2,
            ) if comparison_count else 1.0,
            "contribution_to_agreement": bool(
                agreement_reached
                and (
                    accepted.get(agent) == final_allocation
                    or last_proposal == final_allocation
                )
            ),
            "initial_proposal": initial_proposal,
            "final_allocation_comparison": {
                "final_paths": final_paths,
                "changes_from_initial": final_comparison,
            },
        }

    return performance


def build_outcome_analysis(state):
    final_allocation = state.get("final_allocation")
    participants = _analysis_participants(state)
    accepted = state.get("accepted_proposals", {})
    unanimous = bool(state.get("consensus_reached"))
    accepted_participants = [
        agent
        for agent in participants
        if accepted.get(agent) == final_allocation
    ]
    resource_totals = _flatten_allocation(final_allocation)
    concession_patterns = _concession_patterns(
        state,
        final_allocation,
        participants,
    )

    return {
        "status": state.get("status", "ongoing"),
        "outcome": "agreement_reached" if unanimous else "no_agreement",
        "rounds": state.get("current_round", 1),
        "agreement_terms": {
            "final_allocation": final_allocation,
            "per_resource_totals": resource_totals,
            "agreement_round": state.get("current_round") if unanimous else None,
            "accepted_participants": accepted_participants,
            "total_participants": len(participants),
            "unanimous_agreement": unanimous,
            "outcome": state.get("status", "ongoing"),
        },
        "concession_patterns": concession_patterns,
        "agent_performance": _agent_performance(
            state,
            final_allocation,
            participants,
            concession_patterns,
        ),
        "final_allocation": final_allocation,
    }