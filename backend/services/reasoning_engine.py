import asyncio
from typing import Any, Dict


async def generate(context: Dict[str, Any], agent: Any) -> Dict[str, str]:
    """Simple deterministic reasoning-engine stub.

    Returns a dict with keys: message, reasoning, stance, action.
    This deliberately does NOT call any external LLM.
    """
    # Create a concise deterministic proposal based on agent identity and round
    agent_name = context.get("agent", {}).get("name") or getattr(agent, "name", "Agent")
    current_round = context.get("current_round", 1)
    max_rounds = context.get("max_rounds", 5)

    message = f"{agent_name} proposes allocation plan for round {current_round}."
    reasoning = f"Deterministic stub: acting as {agent_name} (personality={context.get('agent', {}).get('personality')}) on round {current_round}/{max_rounds}."
    stance = "neutral"
    action = "Offer"

    # small async wait to simulate processing
    await asyncio.sleep(0)

    return {"message": message, "reasoning": reasoning, "stance": stance, "action": action}
