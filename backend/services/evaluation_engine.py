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


def calculate_consensus(state: Dict[str, Any]) -> float:
    """
    Estimate consensus from the most recent complete round.

    The score considers:
    - Similarity between proposals
    - Cooperative language
    - Acceptance / compromise signals
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

    similarity_score = (
        sum(similarities) / len(similarities)
        if similarities
        else 0.0
    )

    cooperative_words = {
        "agree",
        "support",
        "accept",
        "compromise",
        "cooperate",
        "balanced",
        "fair",
        "shared",
        "together",
        "consensus",
        "coordinate",
        "collaborate",
        "propose",
    }

    cooperative_hits = 0

    for message in messages:
        words = _normalise(message)
        cooperative_hits += len(words & cooperative_words)

    cooperation_score = min(
        cooperative_hits / max(agent_count * 3, 1),
        1.0,
    )

    score = (
        similarity_score * 0.65
        + cooperation_score * 0.35
    )

    return round(min(max(score, 0.0), 1.0), 2)


def detect_deadlock(
    state: Dict[str, Any],
    max_rounds: int = 10
) -> bool:

    history = state.get("history", [])

    if len(history) < 6:
        return False

    recent = [
        str(item.get("message", "")).strip().lower()
        for item in history[-6:]
    ]

    if len(set(recent)) == 1 and recent[0]:
        return True

    return False


def negotiation_status(
    state: Dict[str, Any],
    max_rounds: int = 5
) -> str:

    consensus = float(state.get("consensus", 0.0))

    if consensus >= 0.90:
        return "consensus_reached"

    if state.get("current_round", 1) > max_rounds:
        return "max_rounds_reached"

    if detect_deadlock(state, max_rounds):
        return "deadlock"

    return "ongoing"