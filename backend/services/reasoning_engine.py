import asyncio
import json
from typing import Any, Dict

from prompts.prompt_builder import build_prompt
from services.gemini_client import generate_response


PERSONAS = {
    "Government Agent": {
        "name": "Government Agent",
        "role": "Represents the central disaster management authority.",
        "goal": "Save the maximum number of people by allocating resources fairly.",
        "priority": ["Population", "Critical Areas", "Public Safety"],
        "constraints": ["Limited Budget", "Limited Resources", "Government Policies"],
        "personality": "Collaborative",
        "negotiation_style": "Cooperative",
    },
    "NGO Agent": {
        "name": "NGO Agent",
        "role": "Represents humanitarian organizations working in disaster zones.",
        "goal": "Deliver food, water and shelter to the most affected people.",
        "priority": ["Children", "Elderly", "Remote Villages"],
        "constraints": ["Limited Volunteers", "Transport Availability"],
        "personality": "Empathetic",
        "negotiation_style": "Collaborative",
    },
    "District Administration Agent": {
        "name": "District Administration Agent",
        "role": "Represents the district administration.",
        "goal": "Protect people within the assigned district.",
        "priority": ["Critical Patients", "Local Population", "Essential Services"],
        "constraints": ["District Resource Limits", "Storage Capacity"],
        "personality": "Balanced",
        "negotiation_style": "Strategic",
    },
}


def _get_persona(agent: Any) -> Dict[str, Any]:
    name = str(getattr(agent, "name", ""))
    if name in PERSONAS:
        return PERSONAS[name]
    lowered = name.lower()
    if "government" in lowered:
        return PERSONAS["Government Agent"]
    if "ngo" in lowered:
        return PERSONAS["NGO Agent"]
    return PERSONAS["District Administration Agent"]


def _build_resources(context: Dict[str, Any]) -> Dict[str, Any]:
    scenario = context.get("scenario", {})
    resources = scenario.get("resources", []) if isinstance(scenario, dict) else []
    if isinstance(resources, dict):
        return resources
    if isinstance(resources, list):
        return {str(item): "Available" for item in resources}
    return {}


def _fallback(agent: Any, personality: str, round_number: int) -> Dict[str, Any]:
    name = getattr(agent, "name", "AI Agent")
    if personality.lower() == "aggressive":
        message = f"{name} proposes a firm allocation focused on its highest-priority life-saving needs in round {round_number}."
        stance = "firm"
    elif personality.lower() == "risk-averse":
        message = f"{name} proposes a conservative allocation that preserves an emergency reserve in round {round_number}."
        stance = "cautious"
    else:
        message = f"{name} proposes a balanced allocation based on need, vulnerability, and logistics in round {round_number}."
        stance = "collaborative"
    return {
        "message": message,
        "reasoning": "Fallback response used because the Gemini request was unavailable or invalid.",
        "stance": stance,
        "action": "Offer",
        "offer": {},
        "accept": False,
    }


async def generate(context: Dict[str, Any], agent: Any) -> Dict[str, Any]:
    persona = _get_persona(agent)
    personality = str(getattr(agent, "personality", "Collaborative"))
    scenario = context.get("scenario", {})
    resources = _build_resources(context)
    history = context.get("history", [])
    history_text = "\n".join(str(item) for item in history) if isinstance(history, list) else str(history)
    round_number = context.get("current_round", 1)

    prompt = build_prompt(
        persona=persona,
        personality=personality,
        scenario=scenario,
        resources=resources,
        history=history_text,
    )

    try:
        response = await asyncio.to_thread(generate_response, prompt)
    except Exception as exc:
        print(f"Gemini reasoning error: {exc}")
        return _fallback(agent, personality, round_number)

    if isinstance(response, dict):
        result = response
    else:
        try:
            result = json.loads(str(response).strip())
        except (TypeError, ValueError, json.JSONDecodeError):
            text = str(response).strip()
            if text:
                return {
                    "message": text,
                    "reasoning": "Gemini returned a non-JSON response; it was displayed as the proposal.",
                    "stance": "proposal",
                    "action": "Offer",
                }
            return _fallback(agent, personality, round_number)

    if not isinstance(result, dict):
        return _fallback(agent, personality, round_number)

    offer = result.get("offer", {})
    reason = result.get("reason", "")
    accepted = bool(result.get("accept", False))
    message = result.get("message") or f"Offer: {offer}. {reason}".strip()

    return {
        "message": message,
        "reasoning": reason,
        "stance": "accept" if accepted else "proposal",
        "action": "Offer",
        "offer": offer,
        "accept": accepted,
    }
