from prompts.prompt_builder import build_prompt
from services.gemini_client import generate_response


def generate_offer(
    persona,
    personality,
    scenario,
    resources,
    history
):
    """
    Generic LLM Reasoning Engine.

    The agent uses:
    - Persona
    - Selected personality
    - Scenario
    - Available resources
    - Full conversation history

    to generate a contextual negotiation offer.
    """

    prompt = build_prompt(
        persona,
        personality,
        scenario,
        resources,
        history
    )

    response = generate_response(prompt)

    return response