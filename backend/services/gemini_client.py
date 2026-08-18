import json
import os
import time
from typing import Any

from dotenv import load_dotenv

load_dotenv()

try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None
    types = None

API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash").strip()

_client = genai.Client(api_key=API_KEY) if genai and API_KEY else None


def _fallback_response() -> str:
    return json.dumps({
        "agent": "AI Agent",
        "offer": {"food": 0, "medicine": 0, "water": 0},
        "reason": "Use a balanced, need-based allocation while protecting critical emergency needs.",
        "accept": False,
    })


def generate_response(prompt: str) -> str:
    """Generate one structured negotiation proposal with Gemini.

    If Gemini is unavailable, return a valid deterministic JSON proposal so
    the integrated simulation remains usable for demonstrations.
    """
    if _client is None:
        print("GEMINI_API_KEY is not available. Using deterministic fallback.")
        return _fallback_response()

    last_error: Exception | None = None

    for attempt in range(3):
        try:
            print(f"Calling Gemini ({MODEL})... attempt {attempt + 1}/3")

            config = None
            if types is not None:
                config = types.GenerateContentConfig(
                    response_mime_type="application/json",
                    max_output_tokens=800,
                )

            response = _client.models.generate_content(
                model=MODEL,
                contents=prompt,
                config=config,
            )

            text = (response.text or "").strip()
            if not text:
                raise RuntimeError("Gemini returned an empty response.")

            if text.startswith("```json"):
                text = text[7:]
            elif text.startswith("```"):
                text = text[3:]
            if text.endswith("```"):
                text = text[:-3]

            text = text.strip()
            json.loads(text)
            return text

        except Exception as exc:
            last_error = exc
            print(f"Gemini attempt {attempt + 1} failed: {exc}")
            if attempt < 2:
                time.sleep(2 ** attempt)

    print(f"Gemini unavailable after retries: {last_error}")
    return _fallback_response()
