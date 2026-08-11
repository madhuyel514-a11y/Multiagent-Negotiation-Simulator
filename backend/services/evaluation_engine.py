from typing import Dict, Any


def calculate_consensus(state: Dict[str, Any]) -> float:
    """Stub consensus evaluation is disabled until genuine LLM-based agreement checks are implemented."""
    return 0.0


def detect_deadlock(state: Dict[str, Any], max_rounds: int = 10) -> bool:
    # naive deadlock detection: if last 4 messages are identical or no progress
    history = state.get("history", [])
    if len(history) >= 4:
        last_msgs = [m.get("message", "") for m in history[-4:]]
        if len(set(last_msgs)) == 1 and last_msgs[0]:
            return True
    return False


def negotiation_status(state: Dict[str, Any], max_rounds: int = 5) -> str:
    # Consensus check first
    if state.get("consensus", 0) >= 0.9:
        return "consensus_reached"
    # Max rounds reached (exceeded)
    if state.get("current_round", 1) > max_rounds:
        return "max_rounds_reached"
    # Deadlock heuristic
    if detect_deadlock(state, max_rounds):
        return "deadlock"
    return "ongoing"
