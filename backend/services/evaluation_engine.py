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
    known_resources = set(resource_quantities)

    # Detailed proposals contain one allocation per configured agent. Evaluate
    # only the current agent's allocation while consensus compares the whole map.
    agent_allocation = proposal.get(agent_name, proposal) if isinstance(proposal, dict) else {}
    if not isinstance(agent_allocation, dict):
        agent_allocation = {}

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