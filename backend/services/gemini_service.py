import os
import json
import re

from dotenv import load_dotenv
from google import genai

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY")

_client = None

if API_KEY:
    try:
        _client = genai.Client(api_key=API_KEY)
    except Exception as exc:
        print("Gemini initialization failed:", exc)


# =========================================================
# JSON PARSER
# =========================================================

def _extract_json(text):
    if not text:
        return None

    text = text.strip()

    text = re.sub(
        r"^```json\s*",
        "",
        text,
        flags=re.IGNORECASE
    )

    text = re.sub(r"^```\s*", "", text)
    text = re.sub(r"\s*```$", "", text)

    try:
        return json.loads(text)
    except Exception:
        pass

    match = re.search(r"\{.*\}", text, re.DOTALL)

    if match:
        try:
            return json.loads(match.group(0))
        except Exception:
            pass

    return None


# =========================================================
# STRICT CURRENT AGENT DETECTION
# =========================================================

def _detect_agent(prompt):
    """
    Detect ONLY the current agent.

    The orchestrator sends the current agent inside:

        "agent": {
            "id": "...",
            "name": "...",
            "role": "...",
            ...
        }

    We deliberately extract the LAST role/name because
    negotiation history may contain other agents.
    """

    if not prompt:
        return "unknown"

    text = str(prompt)

    # -----------------------------------------------------
    # Find all role fields and use the LAST one.
    # The last role belongs to the CURRENT agent.
    # -----------------------------------------------------

    role_matches = re.findall(
        r'"role"\s*:\s*"([^"]+)"',
        text,
        flags=re.IGNORECASE
    )

    if role_matches:
        role = role_matches[-1].lower().strip()

        if "government" in role:
            return "government"

        if "ngo" in role:
            return "ngo"

        if "district" in role:
            return "district"

    # -----------------------------------------------------
    # Find all name fields and use LAST one.
    # -----------------------------------------------------

    name_matches = re.findall(
        r'"name"\s*:\s*"([^"]+)"',
        text,
        flags=re.IGNORECASE
    )

    if name_matches:
        name = name_matches[-1].lower().strip()

        if "government" in name:
            return "government"

        if "ngo" in name:
            return "ngo"

        if "district" in name:
            return "district"

    # -----------------------------------------------------
    # Look for current-agent markers
    # -----------------------------------------------------

    current_patterns = [
        (
            r"current\s+agent\s*[:\-]\s*government",
            "government"
        ),
        (
            r"current\s+agent\s*[:\-]\s*ngo",
            "ngo"
        ),
        (
            r"current\s+agent\s*[:\-]\s*district",
            "district"
        ),
    ]

    lower = text.lower()

    for pattern, role in current_patterns:
        if re.search(pattern, lower):
            return role

    return "unknown"


# =========================================================
# RESOURCE VALIDATION
# =========================================================

def _extract_allowed_resources(prompt):
    """
    Extract the list of allowed resources from the prompt.
    Returns a list of resource names (e.g., ['Food', 'Medicine', 'Rescue Boats']).
    """
    if not prompt:
        return []

    match = re.search(
        r"ALLOWED RESOURCES \(ONLY these resources exist\):(.*?)(?=\n\n|\nCRITICAL|\Z)",
        prompt,
        re.IGNORECASE | re.DOTALL
    )

    if not match:
        match = re.search(
            r"Available Resources:(.*?)(?=\n\n|\nPrevious|\Z)",
            prompt,
            re.IGNORECASE | re.DOTALL
        )

    if not match:
        return []

    resources_section = match.group(1)

    resource_matches = re.findall(
        r"^\s*-\s+([^:]+?):\s*(\d+)\s+units?",
        resources_section,
        re.MULTILINE | re.IGNORECASE
    )

    return [r.strip() for r, _ in resource_matches if r.strip()]


def _extract_resource_quantities(prompt):
    if not prompt:
        return {}

    match = re.search(
        r"Available Resources:(.*?)(?=\n\n|\nPrevious|\Z)",
        prompt,
        re.IGNORECASE | re.DOTALL
    )

    if not match:
        return {}

    section = match.group(1)
    quantities = {}

    for line in section.splitlines():
        match_line = re.match(
            r"^\s*-\s*([^:]+?)\s*:\s*(\d+)\s*(?:units?)?\s*$",
            line,
            re.IGNORECASE
        )
        if match_line:
            name = match_line.group(1).strip()
            quantities[name.lower()] = int(match_line.group(2))

    return quantities


def _validate_response_resources(message, allowed_resources, resource_quantities=None):
    """Ensure every proposed resource is explicit, allowed, and complete."""
    if not message or not allowed_resources:
        return True

    if re.search(r"\b\d+(?:\.\d+)?%\b", message):
        print("RESOURCE VALIDATION FAILED: Percentage-based allocation detected")
        return False

    resource_entries = re.findall(
        r"([A-Za-z][A-Za-z0-9\s&/-]*)\s*:\s*(\d+)\s*(?:units?|qty\.?|quantity)?",
        message,
        re.IGNORECASE
    )

    if not resource_entries:
        print("RESOURCE VALIDATION FAILED: No explicit resource quantities found")
        return False

    parsed = {name.strip().lower(): int(quantity) for name, quantity in resource_entries}

    for resource in allowed_resources:
        key = resource.strip().lower()
        if key not in parsed:
            print(f"RESOURCE VALIDATION FAILED: Missing explicit quantity for {resource}")
            return False

        if resource_quantities and key in resource_quantities and parsed[key] > resource_quantities[key]:
            print(f"RESOURCE VALIDATION FAILED: Quantity exceeds available amount for {resource}")
            return False

    return True


# =========================================================
# ROLE-SPECIFIC FALLBACK WITH RESOURCE CONSTRAINTS
# =========================================================

def _fallback_response(prompt, allowed_resources=None, agent_name=None):

    agent = agent_name if agent_name else _detect_agent(prompt)

    print("CURRENT NEGOTIATION AGENT:", agent)

    if not allowed_resources:
        allowed_resources = _extract_allowed_resources(prompt)

    resource_quantities = _extract_resource_quantities(prompt)

    if allowed_resources:
        message_parts = []
        for index, resource in enumerate(allowed_resources):
            available = resource_quantities.get(resource.lower(), 0)
            quantity = available if available > 0 else max(1, (index + 1) * 10)
            message_parts.append(f"{resource}: {quantity} units")

        if agent == "government":
            return {
                "message": (
                    "I appreciate the previous proposal and am adjusting the allocation to protect the most urgent needs: "
                    + "; ".join(message_parts) + "."
                ),
                "reasoning": (
                    "Government priorities are public safety, critical emergency services, and equitable distribution."
                ),
                "stance": "moderate"
            }

        if agent == "ngo":
            return {
                "message": (
                    "I appreciate the previous proposal and am shifting the allocation toward immediate humanitarian needs: "
                    + "; ".join(message_parts) + "."
                ),
                "reasoning": (
                    "Humanitarian needs require additional support for people facing the greatest immediate risk."
                ),
                "stance": "cooperative"
            }

        if agent == "district":
            return {
                "message": (
                    "I appreciate the previous proposal and am refining the distribution to match local urgency and logistics: "
                    + "; ".join(message_parts) + "."
                ),
                "reasoning": (
                    "District authorities understand local damage, transport limitations, and operational requirements."
                ),
                "stance": "strategic"
            }

    return {
        "message": (
            "I appreciate the previous proposal and am adjusting the distribution to maintain urgent coverage and practical compromise: "
            "Food: 50 units; Medicine: 30 units; Rescue Boats: 5 units; Temporary Shelters: 20 units; Emergency Supplies: 40 units."
        ),
        "reasoning": (
            "A balanced allocation protects urgent needs and supports a practical negotiation."
        ),
        "stance": "moderate"
    }


# =========================================================
# GEMINI
# =========================================================

async def ask_model(prompt, agent_name=None):

    # Use provided agent_name if available, otherwise try to detect from prompt
    current_agent = agent_name.lower() if agent_name else _detect_agent(prompt)
    
    # Normalize agent name to lowercase key
    if current_agent and "government" in current_agent.lower():
        current_agent = "government"
    elif current_agent and "ngo" in current_agent.lower():
        current_agent = "ngo"
    elif current_agent and "district" in current_agent.lower():
        current_agent = "district"
    else:
        current_agent = _detect_agent(prompt)
    
    allowed_resources = _extract_allowed_resources(prompt)

    print(
        "Negotiation model called for agent:",
        agent_name or current_agent
    )
    print(f"Allowed resources: {allowed_resources}")

    # -----------------------------------------------------
    # If Gemini isn't configured, use guaranteed fallback.
    # -----------------------------------------------------

    if _client is None:
        return _fallback_response(prompt, allowed_resources, agent_name=current_agent)

    role_instruction = {
        "government": """
You are the GOVERNMENT AGENT.

Prioritize:
- public safety
- critical emergency services
- equitable distribution
- overall resource coordination
""",

        "ngo": """
You are the NGO AGENT.

Prioritize:
- vulnerable populations
- children
- elderly people
- displaced families
- food and medicine
- humanitarian needs
""",

        "district": """
You are the DISTRICT ADMINISTRATION AGENT.

Prioritize:
- district damage severity
- local urgency
- transportation
- storage
- shelters
- practical delivery of resources
"""
    }.get(
        current_agent,
        "Follow the current agent identity in the supplied context."
    )

    instruction = f"""
You are one participant in a disaster-relief resource negotiation.

CURRENT AGENT:
{current_agent}

YOUR ROLE:
{role_instruction}

FULL NEGOTIATION CONTEXT:
{prompt}

CRITICAL INSTRUCTIONS:

1. You MUST respond as the CURRENT AGENT only.
2. Do NOT copy another agent's response.
3. Do NOT repeat the previous proposal verbatim.
4. React to the latest proposal and make a meaningful counter-proposal or modification.
5. EVERY proposal must contain explicit numerical quantities for EVERY allowed resource in the scenario.
6. Use this exact format for each resource: "Resource Name: N units".
7. Do not use percentages, fractions, or vague language such as "many", "more", or "balanced".
8. Do not omit any resource from the allowed list.
9. Only propose resources and quantities that appear in the "Available Resources" section.
10. Do NOT invent resources that do not exist in the scenario.
11. Quantities must not exceed the available amount for that resource.
12. Reference the previous proposal and explain the change.
13. Example good response: "I appreciate the previous proposal and am adjusting the allocation: Food: 180 units; Medicine: 65 units; Rescue Boats: 7 units; Temporary Shelters: 30 units; Emergency Supplies: 90 units."
14. Example bad response: "I propose allocating 40% of Food and 30% of Medicine" (invalid - percentages and missing resources).

Return ONLY JSON:

{{
  "message": "A complete negotiation proposal with explicit quantities for every allowed resource in the format 'Resource: N units'. Include a short explanation of the change from the previous proposal.",
  "reasoning": "Brief reason for this proposal.",
  "stance": "cooperative|moderate|firm|strategic"
}}
"""

    # -----------------------------------------------------
    # Try Gemini
    # -----------------------------------------------------

    models = [
        "gemini-3.6-flash",
        "gemini-3.5-flash"
    ]

    for model_name in models:

        try:

            response = _client.models.generate_content(
                model=model_name,
                contents=instruction
            )

            text = getattr(
                response,
                "text",
                ""
            ) or ""

            result = _extract_json(text)

            if result:

                message = str(
                    result.get("message", "")
                ).strip()

                reasoning = str(
                    result.get("reasoning", "")
                ).strip()

                stance = str(
                    result.get(
                        "stance",
                        "moderate"
                    )
                ).strip()

                if message:
                    is_valid = _validate_response_resources(
                        message,
                        allowed_resources,
                        _extract_resource_quantities(prompt)
                    )

                    if is_valid:
                        return {
                            "message": message,
                            "reasoning": reasoning,
                            "stance": stance
                        }
                    else:
                        print(f"Response validation failed for {model_name}: invalid resource proposal")
                        # Fall through to try next model or fallback

        except Exception as exc:

            print(
                f"Gemini {model_name} failed:",
                exc
            )

    # -----------------------------------------------------
    # Guaranteed role-specific fallback with resources
    # -----------------------------------------------------

    return _fallback_response(prompt, allowed_resources, agent_name=current_agent)
