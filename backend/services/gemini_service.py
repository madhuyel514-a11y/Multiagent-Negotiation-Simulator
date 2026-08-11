import os
import asyncio
import httpx

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")


async def ask_model(prompt: str) -> dict:
    """Call Gemini model if API key is present, otherwise return a deterministic stub.

    Returns a dict with keys: 'message', 'reasoning', 'stance'
    """
    if not GEMINI_API_KEY:
        # Deterministic stub: echo back a concise proposal based on prompt keywords
        proposal = "Proposal: Allocate resources proportional to need."
        reasoning = "Based on available data, prioritize critical needs and coordinate logistics."
        stance = "moderate"
        return {"message": proposal, "reasoning": reasoning, "stance": stance}

    # Example placeholder for real Gemini API call using httpx
    # Note: real implementation will depend on Gemini REST API specifics.
    async with httpx.AsyncClient(timeout=30) as client:
        # Placeholder URL; real API integration required.
        url = "https://api.openai.example.com/v1/gemini/complete"
        headers = {"Authorization": f"Bearer {GEMINI_API_KEY}"}
        payload = {"prompt": prompt, "max_tokens": 300}
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        # Extract fields safely
        message = data.get("text") or data.get("message") or ""
        reasoning = data.get("reasoning", "")
        stance = data.get("stance", "neutral")
        return {"message": message, "reasoning": reasoning, "stance": stance}
