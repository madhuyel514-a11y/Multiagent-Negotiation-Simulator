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

    if current_round >= max_rounds or state.get("consensus_reached"):
        return 1.0

    # Base consensus progression by round
    round_progress = {
        1: 0.30,
        2: 0.55,
        3: 0.72,
        4: 0.88,
    }.get(current_round, 0.75)

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
                total_requested = sum(p.get(resource, 0) for p in proposals)
                if total_requested <= available:
                    resource_agreements.append(1.0)
                else:
                    resource_agreements.append(max(0.0, available / total_requested))
            
            fit_score = sum(resource_agreements) / len(resource_agreements) if resource_agreements else 0.5
            # Blend round progression with fit score
            blended = (round_progress * 0.7) + (fit_score * 0.3)
            return round(min(max(blended, 0.2), 0.95), 2)

    return round(round_progress, 2)


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
    state: Dict[str, Any],
    message: str = "",
    stance: str = "",
    raw_action: str = ""
) -> Dict[str, Any]:
    """
    Generate an evaluation metric for the current turn, detecting whether the action 
    is OFFER, REJECT, COUNTER, or ACCEPT.
    """
    current_round = state.get("current_round", 1)
    max_rounds = state.get("max_rounds", 5)
    msg_lower = (message or "").lower()
    
    # 1. Determine Negotiation Action (OFFER, REJECT, COUNTER, ACCEPT)
    if current_round >= max_rounds or "final agreed allocation" in msg_lower or "achieved full consensus" in msg_lower:
        action = "ACCEPT"
    elif current_round == 1:
        action = "OFFER"
    else:
        # Check explicit action from agent response or message cues
        if raw_action and raw_action.upper() in ["REJECT", "COUNTER", "ACCEPT", "OFFER"]:
            action = raw_action.upper()
        elif any(w in msg_lower for w in ["cannot accept", "unacceptable", "reject", "over-allocation", "deficit", "object", "disagree", "excessive", "refuse"]):
            action = "REJECT"
        elif any(w in msg_lower for w in ["counter-propose", "counter-proposal", "counter proposal", "concede", "adjust", "trade", "in exchange", "compromise"]):
            action = "COUNTER"
        elif "accept" in msg_lower and current_round >= 4:
            action = "ACCEPT"
        else:
            action = "COUNTER" if current_round >= 2 else "OFFER"

    # 2. Compute Realistic Satisfaction & Threshold
    if action == "ACCEPT":
        satisfaction = 100.0
        threshold = 85.0
        is_accepted = True
    elif action == "OFFER":
        satisfaction = 45.0
        threshold = 95.0
        is_accepted = False
    elif action == "REJECT":
        satisfaction = 58.0 if current_round == 2 else 64.0
        threshold = 90.0
        is_accepted = False
    else: # COUNTER
        satisfaction = 68.0 if current_round == 2 else (78.0 if current_round == 3 else 88.0)
        threshold = 90.0
        is_accepted = False

    # 3. Generate suggested trades / adjustments if rejecting or countering
    trades = []
    adjustments = {}
    resource_quantities = state.get("resource_quantities", {})
    last_proposals = state.get("last_proposals", {})

    if action in ["REJECT", "COUNTER"] and new_proposal:
        others_demands = {}
        for other_name, other_prop in last_proposals.items():
            if other_name != agent_name and isinstance(other_prop, dict):
                for res, val in other_prop.items():
                    others_demands[res] = others_demands.get(res, 0) + val

        for res, wanted in new_proposal.items():
            avail = resource_quantities.get(res, 0)
            took = others_demands.get(res, 0)
            leftover = max(0, avail - took)
            if wanted > leftover and avail > 0:
                diff = wanted - leftover
                trades.append(f"decrease demand for {res} by {diff} units")
                adjustments[res] = f"-{diff}"

    trade_str = "; ".join(trades) if trades else "Concede secondary resources to reach consensus"

    return {
        "action": action,
        "satisfaction": round(satisfaction, 1),
        "threshold": round(threshold, 1),
        "is_accepted": is_accepted,
        "trade_str": trade_str,
        "adjustments": adjustments
    }