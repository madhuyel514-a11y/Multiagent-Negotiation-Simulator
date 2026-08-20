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
    Calculate consensus based on whether the sum of agents' proposed
    allocations for each resource is within the available total.
    """
    last_proposals = state.get("last_proposals", {})
    agents = state.get("agents", [])
    resource_quantities = state.get("resource_quantities", {})

    if not last_proposals or len(last_proposals) < len(agents):
        # Wait until all agents have made a proposal
        return 0.0

    agent_names = [a["name"] for a in agents]
    proposals = [
        last_proposals[name]
        for name in agent_names
        if name in last_proposals and isinstance(last_proposals[name], dict)
    ]

    if not proposals:
        return 0.0

    # Get all resources available
    all_resources = set(resource_quantities.keys())
    if not all_resources:
        return 0.0

    resource_agreements = []

    for resource in all_resources:
        available = resource_quantities.get(resource, 0)
        total_requested = sum(p.get(resource, 0) for p in proposals)

        if total_requested <= available:
            resource_agreements.append(1.0)
        else:
            # Score penalizes over-allocation
            agreement = available / total_requested
            resource_agreements.append(max(0.0, agreement))

    if not resource_agreements:
        return 0.0

    numerical_score = sum(resource_agreements) / len(resource_agreements)

    return round(min(max(numerical_score, 0.0), 1.0), 2)



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

    # Need at least two complete rounds worth of history
    if len(history) < agent_count * 2:
        return False

    # Check for exact message repetition
    recent = [
        str(item.get("message", "")).strip().lower()
        for item in history[-6:]
    ]

    if len(set(recent)) == 1 and recent[0]:
        return True

    # Check for numerical stagnation — no resource moved more than 5%
    last_proposals = state.get("last_proposals", {})

    if len(last_proposals) < 2:
        return False

    # We need previous round proposals to compare — stored as "prev_proposals" if available
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

    # If average movement per resource < 3%, consider it a deadlock
    return avg_movement < 0.03


def negotiation_status(
    state: Dict[str, Any],
    max_rounds: int = 5
) -> str:

    consensus = float(state.get("consensus", 0.0))

    if consensus >= 0.95:
        return "consensus_reached"

    if state.get("current_round", 1) > max_rounds:
        return "max_rounds_reached"

    if detect_deadlock(state, max_rounds):
        return "deadlock"

    return "ongoing"


def generate_turn_evaluation(
    agent_name: str, 
    new_proposal: Dict[str, Any], 
    state: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Generate an evaluation metric for the current turn based on whether the new proposal fits 
    within the remaining budget left by other agents' latest proposals.
    """
    current_round = state.get("current_round", 1)
    max_rounds = state.get("max_rounds", 5)
    
    if current_round <= 1 or not new_proposal:
        return {
            "satisfaction": 100.0,
            "threshold": 95.0,
            "is_accepted": True,
            "trade_str": "None",
            "adjustments": {}
        }
    
    # In rounds 2-4, keep acceptance strict so agents actively negotiate and counter
    # In round 5 (final round), threshold is relaxed to 85.0% to lock in the final consensus
    if current_round < max_rounds:
        threshold = 95.0
    else:
        threshold = 85.0

    resource_quantities = state.get("resource_quantities", {})
    last_proposals = state.get("last_proposals", {})
    
    # Sum of demands from ALL OTHER agents
    others_demands = {}
    for other_name, other_prop in last_proposals.items():
        if other_name != agent_name and isinstance(other_prop, dict):
            for res, val in other_prop.items():
                others_demands[res] = others_demands.get(res, 0) + val
                
    total_resources = 0
    total_score = 0.0
    
    trades = []
    adjustments = {}
    
    for res, wanted in new_proposal.items():
        available_total = resource_quantities.get(res, 0)
        others_took = others_demands.get(res, 0)
        leftover = max(0, available_total - others_took)
        
        if leftover >= wanted:
            score = 1.0
        else:
            if wanted > 0:
                score = leftover / wanted
            else:
                score = 1.0
                
            trades.append(f"decrease demand for {res}")
            adjustments[res] = f"-{wanted - leftover}"
            
        total_score += score
        total_resources += 1
        
    satisfaction = (total_score / total_resources) * 100.0 if total_resources > 0 else 100.0
    
    is_accepted = satisfaction >= threshold
    
    trade_str = "; ".join(trades) if trades else "None"
    
    return {
        "satisfaction": round(satisfaction, 2),
        "threshold": round(threshold, 2),
        "is_accepted": is_accepted,
        "trade_str": trade_str,
        "adjustments": adjustments
    }