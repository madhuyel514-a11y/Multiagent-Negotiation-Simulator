import os
import json
import re
import itertools
import time
from typing import Any, Dict, List

from dotenv import load_dotenv
from google import genai


# =========================================================
# LOAD ENVIRONMENT
# =========================================================

load_dotenv()


# =========================================================
# GEMINI API CONFIGURATION
# =========================================================

API_KEY = os.getenv("GEMINI_API_KEY")
API_KEYS_STR = os.getenv("GEMINI_API_KEYS")


def _configured_keys() -> List[str]:
    """
    Returns all valid Gemini API keys configured in .env.

    Supports:

    GEMINI_API_KEY=your_key

    OR

    GEMINI_API_KEYS=key1,key2,key3
    """

    if API_KEYS_STR:
        configured = API_KEYS_STR.split(",")
    else:
        configured = [API_KEY or ""]

    placeholders = {
        "",
        "your_api_key",
        "your-key",
        "changeme",
        "replace_me",
        "none",
        "null",
    }

    keys = []

    for key in configured:
        cleaned = key.strip().strip("\"'")

        if cleaned and cleaned.lower() not in placeholders:
            keys.append(cleaned)

    return keys


# =========================================================
# CREATE GEMINI CLIENTS
# =========================================================

_clients = []

for key in _configured_keys():
    try:
        client = genai.Client(api_key=key)
        _clients.append(client)
        print("[GEMINI] Client configured successfully")

    except Exception as exc:
        print(
            "[GEMINI] Client initialization failed: "
            f"{type(exc).__name__}: {exc}"
        )


_client_cycle = itertools.cycle(_clients) if _clients else None


def get_client():
    """
    Returns the next Gemini client.
    """

    if _client_cycle is None:
        return None

    return next(_client_cycle)


def _rotated_clients(selected_client):
    """
    Returns clients starting from the selected client.
    """

    if not selected_client or not _clients:
        return []

    selected_index = 0

    for index, client in enumerate(_clients):
        if client is selected_client:
            selected_index = index
            break

    return [
        _clients[(selected_index + offset) % len(_clients)]
        for offset in range(len(_clients))
    ]


# =========================================================
# LLM METRICS
# =========================================================

_llm_metrics = {
    "api_requests": 0,
    "input_tokens": 0,
    "output_tokens": 0,
    "total_tokens": 0,
    "total_latency": 0.0,
    "successful_requests": 0,
    "failed_requests": 0,
}


def reset_metrics():
    """
    Reset all LLM metrics.
    """

    global _llm_metrics

    _llm_metrics = {
        "api_requests": 0,
        "input_tokens": 0,
        "output_tokens": 0,
        "total_tokens": 0,
        "total_latency": 0.0,
        "successful_requests": 0,
        "failed_requests": 0,
    }


# =========================================================
# TOKEN EXTRACTION
# =========================================================

def _extract_usage_metadata(response) -> Dict[str, int]:
    """
    Extract token usage from Gemini response.

    Compatible with the Google GenAI Python SDK.
    """

    input_tokens = 0
    output_tokens = 0
    total_tokens = 0

    try:
        usage = getattr(response, "usage_metadata", None)

        if usage is not None:

            input_tokens = int(
                getattr(
                    usage,
                    "prompt_token_count",
                    0
                ) or 0
            )

            output_tokens = int(
                getattr(
                    usage,
                    "candidates_token_count",
                    0
                ) or 0
            )

            total_tokens = int(
                getattr(
                    usage,
                    "total_token_count",
                    0
                ) or 0
            )

    except Exception as exc:
        print(
            f"[METRICS ERROR] "
            f"Could not extract token usage: {exc}"
        )

    # Fallback
    if total_tokens == 0:
        total_tokens = input_tokens + output_tokens

    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
    }


def _record_metrics(
    response=None,
    latency=0.0,
    success=True,
):
    """
    Store API request metrics.
    """

    _llm_metrics["api_requests"] += 1
    _llm_metrics["total_latency"] += float(latency)

    if success:
        _llm_metrics["successful_requests"] += 1
    else:
        _llm_metrics["failed_requests"] += 1

    if response is not None:

        usage = _extract_usage_metadata(response)

        _llm_metrics["input_tokens"] += usage["input_tokens"]
        _llm_metrics["output_tokens"] += usage["output_tokens"]
        _llm_metrics["total_tokens"] += usage["total_tokens"]


def get_metrics() -> Dict[str, Any]:
    """
    Returns current LLM metrics.
    """

    api_requests = _llm_metrics["api_requests"]

    average_latency = 0.0

    if api_requests > 0:
        average_latency = (
            _llm_metrics["total_latency"]
            / api_requests
        )

    return {
        "api_requests": _llm_metrics["api_requests"],
        "successful_requests": _llm_metrics["successful_requests"],
        "failed_requests": _llm_metrics["failed_requests"],
        "input_tokens": _llm_metrics["input_tokens"],
        "output_tokens": _llm_metrics["output_tokens"],
        "total_tokens": _llm_metrics["total_tokens"],
        "average_latency": round(average_latency, 2),
        "total_latency": round(
            _llm_metrics["total_latency"],
            2
        ),
    }


# =========================================================
# ERROR HANDLING
# =========================================================

def _failure_category(error):

    text = str(error).upper()

    if "429" in text or "RESOURCE_EXHAUSTED" in text:
        return "429 RESOURCE_EXHAUSTED"

    if "401" in text or "UNAUTHENTICATED" in text:
        return "401 UNAUTHENTICATED"

    if "403" in text or "PERMISSION_DENIED" in text:
        return "403 PERMISSION_DENIED"

    if "404" in text or "NOT_FOUND" in text:
        return "404 MODEL_NOT_FOUND"

    return f"{type(error).__name__}: {error}"


# =========================================================
# AGENT NORMALIZATION
# =========================================================

def _normalize_agent_name(name):

    if not name:
        return "unknown"

    name = str(name).lower().strip()

    if "government" in name:
        return "government"

    if "ngo" in name:
        return "ngo"

    if "district" in name:
        return "district"

    return name


def _display_agent_name(agent):

    mapping = {
        "government": "Government Agent",
        "ngo": "NGO Agent",
        "district": "District Administration Agent",
    }

    return mapping.get(
        agent,
        str(agent).title()
    )


# =========================================================
# JSON EXTRACTION
# =========================================================

def _extract_json(text):

    if not text:
        return None

    text = str(text).strip()

    # Remove markdown code fences
    text = re.sub(
        r"^```json\s*",
        "",
        text,
        flags=re.IGNORECASE
    )

    text = re.sub(
        r"^```\s*",
        "",
        text
    )

    text = re.sub(
        r"\s*```$",
        "",
        text
    )

    text = text.strip()

    # Direct JSON
    try:
        return json.loads(text)
    except Exception:
        pass

    # Find JSON object inside text
    match = re.search(
        r"\{.*\}",
        text,
        re.DOTALL
    )

    if match:
        try:
            return json.loads(match.group(0))
        except Exception:
            pass

    return None


# =========================================================
# ALLOCATION PARSER
# =========================================================

def _parse_allocations(message, agent_names):

    if not message:
        return {}

    allocations = {}

    normalized_agents = {
        _normalize_agent_name(name)
        for name in agent_names
    }

    current_agent = None

    lines = str(message).splitlines()

    for line in lines:

        line = line.strip()

        if not line:
            continue

        # Detect agent allocation heading
        heading_match = re.match(
            r"^(.+?)\s+Allocation\s*:\s*$",
            line,
            re.IGNORECASE
        )

        if heading_match:

            raw_name = heading_match.group(1)

            normalized = _normalize_agent_name(raw_name)

            if normalized in normalized_agents:

                current_agent = normalized

                allocations.setdefault(
                    current_agent,
                    {}
                )

            continue

        # Detect resource allocation
        resource_match = re.match(
            r"^([^:]+?)\s*:\s*(\d+)\s*units?\s*$",
            line,
            re.IGNORECASE
        )

        if resource_match and current_agent:

            resource = (
                resource_match.group(1)
                .strip()
                .lower()
            )

            quantity = int(
                resource_match.group(2)
            )

            allocations[current_agent][resource] = quantity

    return allocations


# =========================================================
# VALIDATE ALLOCATIONS
# =========================================================

def _validate_allocations(
    allocations,
    resource_quantities,
    agent_names,
):

    if not allocations:
        return False, "No allocations found"

    expected_agents = {
        _normalize_agent_name(name)
        for name in agent_names
    }

    actual_agents = set(allocations.keys())

    missing_agents = expected_agents - actual_agents

    if missing_agents:
        return (
            False,
            f"Missing agent allocations: {sorted(missing_agents)}"
        )

    for resource, available in resource_quantities.items():

        resource = str(resource).lower()

        total = 0

        for agent in expected_agents:

            agent_allocation = allocations.get(
                agent,
                {}
            )

            if resource not in agent_allocation:

                return (
                    False,
                    f"Missing {resource} allocation for {agent}"
                )

            quantity = agent_allocation[resource]

            if quantity < 0:

                return (
                    False,
                    f"Negative quantity for {resource}"
                )

            total += quantity

        if total != int(available):

            return (
                False,
                f"{resource} total is {total}, "
                f"but available quantity is {available}"
            )

    return True, "Valid"


# =========================================================
# CREATE FALLBACK ALLOCATION
# =========================================================

def _create_dynamic_allocation(
    resource_quantities,
    agent_names,
    current_agent,
    current_round,
):

    normalized_agents = [
        _normalize_agent_name(name)
        for name in agent_names
    ]

    allocations = {
        agent: {}
        for agent in normalized_agents
    }

    priority_patterns = {
        "government": [0.45, 0.30, 0.25],
        "ngo": [0.25, 0.50, 0.25],
        "district": [0.25, 0.25, 0.50],
    }

    weights = priority_patterns.get(
        current_agent,
        [0.34, 0.33, 0.33]
    )

    rotation = (
        (current_round - 1)
        % len(weights)
    )

    weights = (
        weights[rotation:]
        + weights[:rotation]
    )

    for resource, available in resource_quantities.items():

        available = int(available)

        values = [
            int(available * weight)
            for weight in weights
        ]

        remainder = available - sum(values)

        for i in range(remainder):

            values[i % len(values)] += 1

        for index, agent in enumerate(normalized_agents):

            allocations[agent][
                str(resource).lower()
            ] = values[index]

    return allocations


# =========================================================
# FORMAT ALLOCATION MESSAGE
# =========================================================

def _format_allocation_message(
    allocations,
    action="COUNTER",
):

    if action == "OFFER":
        intro = "I propose the following allocation:"
    else:
        intro = "I counter-propose the following allocation:"

    parts = [
        intro,
        ""
    ]

    agent_order = [
        "government",
        "ngo",
        "district",
    ]

    for agent in agent_order:

        if agent not in allocations:
            continue

        parts.append(
            f"{_display_agent_name(agent)} Allocation:"
        )

        for resource, quantity in allocations[agent].items():

            parts.append(
                f"{resource.title()}: {quantity} units"
            )

        parts.append("")

    return "\n".join(parts)


# =========================================================
# FALLBACK RESPONSE
# =========================================================

def _generic_fallback_response(
    resource_quantities,
    agent_names,
    current_proposal,
    reason,
    current_agent="government",
    current_round=1,
):

    print(f"[FALLBACK] Reason: {reason}")

    allocations = _create_dynamic_allocation(
        resource_quantities=resource_quantities,
        agent_names=agent_names,
        current_agent=current_agent,
        current_round=current_round,
    )

    action = (
        "COUNTER"
        if current_proposal
        else "OFFER"
    )

    message = _format_allocation_message(
        allocations,
        action
    )

    return {
        "action": action,
        "message": message,
        "reasoning": (
            f"A valid fallback allocation was generated "
            f"for round {current_round}."
        ),
        "stance": "strategic",
    }


# =========================================================
# MAIN GEMINI FUNCTION
# =========================================================

async def ask_model(
    prompt,
    agent_name=None,
    total_budget=None,
    last_proposals=None,
    current_round=1,
    resource_quantities=None,
    current_proposal=None,
    agent_names=None,
):

    current_agent = _normalize_agent_name(agent_name)

    # =====================================================
    # RESOURCES
    # =====================================================

    if resource_quantities:

        cleaned_resources = {}

        for key, value in resource_quantities.items():

            try:
                cleaned_resources[
                    str(key).lower()
                ] = int(value)

            except (TypeError, ValueError):

                cleaned_resources[
                    str(key).lower()
                ] = 0

        resource_quantities = cleaned_resources

    else:

        resource_quantities = {
            "food": 500,
            "medicine": 200,
            "rescue boats": 25,
            "temporary shelters": 150,
            "emergency supplies": 300,
        }

    # =====================================================
    # AGENTS
    # =====================================================

    if not agent_names:

        agent_names = [
            "Government Agent",
            "NGO Agent",
            "District Administration Agent",
        ]

    current_proposal = current_proposal or {}

    if total_budget is None:

        total_budget = sum(
            resource_quantities.values()
        )

    allowed_resources = list(
        resource_quantities.keys()
    )

    print("\n========================================")
    print("[NEGOTIATION]")
    print(f"Agent: {current_agent}")
    print(f"Round: {current_round}")
    print(f"Resources: {resource_quantities}")
    print("========================================\n")

    # =====================================================
    # PREVIOUS PROPOSALS
    # =====================================================

    other_proposals_text = "No previous proposals."

    if last_proposals:

        proposal_lines = []

        for name, proposal in last_proposals.items():

            normalized = _normalize_agent_name(name)

            if normalized != current_agent:

                proposal_lines.append(
                    f"{name}: {proposal}"
                )

        if proposal_lines:

            other_proposals_text = "\n".join(
                proposal_lines
            )

    # =====================================================
    # ALLOCATION FORMAT
    # =====================================================

    allocation_format = "\n\n".join(

        f"{name} Allocation:\n"
        + "\n".join(
            f"{resource.title()}: NUMBER units"
            for resource in allowed_resources
        )

        for name in agent_names
    )

    # =====================================================
    # GEMINI PROMPT
    # =====================================================

    instruction = f"""
You are {current_agent.upper()} participating in a
MULTI-AGENT DISASTER RELIEF RESOURCE NEGOTIATION.

CURRENT ROUND:
{current_round}

AVAILABLE RESOURCES:

{chr(10).join(
    f"- {resource.title()}: {quantity} units"
    for resource, quantity in resource_quantities.items()
)}

LATEST PROPOSAL:
{current_proposal}

PREVIOUS NEGOTIATION PROPOSALS:
{other_proposals_text}

YOUR ROLE:

You must actively negotiate.

Do NOT simply repeat the previous proposal.

AGENT BEHAVIOR:

Government:
Prioritizes life-saving operations and government control.

NGO:
Prioritizes vulnerable populations and humanitarian fairness.

District Administration:
Prioritizes local district needs and risk reduction.

AVAILABLE ACTIONS:

OFFER
COUNTER
REJECT
ACCEPT

RULES:

1. Do not automatically accept a proposal.
2. If unacceptable, create a COUNTER proposal.
3. Do not repeat an identical allocation.
4. For OFFER or COUNTER, allocate every resource.
5. Use only these resources:

{", ".join(allowed_resources)}

6. No negative quantities.
7. Total allocation of every resource across all agents
   must exactly equal the available quantity.

REQUIRED ALLOCATION FORMAT:

{allocation_format}

RETURN ONLY VALID JSON.

Example:

{{
    "action": "COUNTER",
    "message": "Government Agent Allocation:\\nFood: 200 units",
    "reasoning": "Short explanation",
    "stance": "firm"
}}
"""

    # =====================================================
    # GET CLIENT
    # =====================================================

    selected_client = get_client()

    clients = _rotated_clients(selected_client)

    if not clients:

        return _generic_fallback_response(
            resource_quantities=resource_quantities,
            agent_names=agent_names,
            current_proposal=current_proposal,
            reason="No Gemini API client configured",
            current_agent=current_agent,
            current_round=current_round,
        )

    # =====================================================
    # MODELS
    # =====================================================

    models = [
        "gemini-2.5-flash",
        "gemini-2.0-flash",
    ]

    last_failure = "All Gemini attempts failed"

    # =====================================================
    # CALL GEMINI
    # =====================================================

    for client_index, client in enumerate(
        clients,
        start=1,
    ):

        for model_name in models:

            response = None
            start_time = time.perf_counter()

            try:

                print(
                    f"[GEMINI] Trying client "
                    f"{client_index}, model: {model_name}"
                )

                response = client.models.generate_content(
                    model=model_name,
                    contents=instruction,
                )

                latency = (
                    time.perf_counter()
                    - start_time
                )

                # =================================================
                # TOKEN DEBUG
                # =================================================

                print(
                    "\n========== GEMINI USAGE METADATA =========="
                )

                print(
                    getattr(
                        response,
                        "usage_metadata",
                        None
                    )
                )

                print(
                    "============================================\n"
                )

                # =================================================
                # RECORD METRICS
                # =================================================

                _record_metrics(
                    response=response,
                    latency=latency,
                    success=True,
                )

                usage = _extract_usage_metadata(
                    response
                )

                # =================================================
                # SHOW TOKEN NUMBERS
                # =================================================

                print(
                    "\n========== GEMINI TOKEN USAGE =========="
                )

                print(
                    f"Input Tokens  : "
                    f"{usage['input_tokens']}"
                )

                print(
                    f"Output Tokens : "
                    f"{usage['output_tokens']}"
                )

                print(
                    f"Total Tokens  : "
                    f"{usage['total_tokens']}"
                )

                print(
                    f"Latency       : "
                    f"{latency:.2f} seconds"
                )

                print(
                    "=========================================\n"
                )

                # =================================================
                # GET RESPONSE TEXT
                # =================================================

                response_text = (
                    getattr(response, "text", "")
                    or ""
                ).strip()

                if not response_text:

                    last_failure = "Empty Gemini response"

                    continue

                print("[GEMINI RESPONSE RECEIVED]")

                # =================================================
                # EXTRACT JSON
                # =====================================================

                result = _extract_json(response_text)

                if not result:

                    last_failure = (
                        "Gemini returned invalid JSON"
                    )

                    continue

                # =================================================
                # EXTRACT VALUES
                # =====================================================

                action = str(
                    result.get(
                        "action",
                        "COUNTER"
                    )
                ).upper()

                message = str(
                    result.get(
                        "message",
                        ""
                    )
                ).strip()

                reasoning = str(
                    result.get(
                        "reasoning",
                        ""
                    )
                ).strip()

                stance = str(
                    result.get(
                        "stance",
                        "moderate"
                    )
                ).strip()

                # =================================================
                # VALIDATE ACTION
                # =====================================================

                valid_actions = {
                    "OFFER",
                    "COUNTER",
                    "REJECT",
                    "ACCEPT",
                }

                if action not in valid_actions:

                    last_failure = (
                        f"Invalid action: {action}"
                    )

                    continue

                # =================================================
                # ACCEPT
                # =====================================================

                if action == "ACCEPT":

                    return {
                        "action": "ACCEPT",
                        "message": (
                            message
                            or "I accept the current proposal."
                        ),
                        "reasoning": reasoning,
                        "stance": "accept",
                    }

                # =================================================
                # REJECT
                # =====================================================

                if action == "REJECT":

                    return {
                        "action": "REJECT",
                        "message": (
                            message
                            or "I reject the current proposal."
                        ),
                        "reasoning": reasoning,
                        "stance": stance,
                    }

                # =================================================
                # OFFER / COUNTER
                # =====================================================

                if action in {"OFFER", "COUNTER"}:

                    allocations = _parse_allocations(
                        message,
                        agent_names,
                    )

                    valid, reason = _validate_allocations(
                        allocations,
                        resource_quantities,
                        agent_names,
                    )

                    if valid:

                        print(
                            "[GEMINI] Proposal validated successfully"
                        )

                        return {
                            "action": action,
                            "message": message,
                            "reasoning": reasoning,
                            "stance": stance,
                        }

                    last_failure = reason

                    print(
                        f"[VALIDATION FAILED] {reason}"
                    )

            except Exception as exc:

                latency = (
                    time.perf_counter()
                    - start_time
                )

                _record_metrics(
                    response=None,
                    latency=latency,
                    success=False,
                )

                last_failure = _failure_category(exc)

                print(
                    f"[GEMINI ERROR] {last_failure}"
                )

    # =====================================================
    # FINAL FALLBACK
    # =====================================================

    return _generic_fallback_response(
        resource_quantities=resource_quantities,
        agent_names=agent_names,
        current_proposal=current_proposal,
        reason=last_failure,
        current_agent=current_agent,
        current_round=current_round,
    )