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
# GEMINI METRICS
# =========================================================

_GEMINI_METRICS = {
    "total_requests": 0,
    "successful_requests": 0,
    "failed_requests": 0,
    "total_input_tokens": 0,
    "total_output_tokens": 0,
    "total_tokens": 0,
    "total_latency": 0.0,
}


def reset_metrics():
    global _GEMINI_METRICS

    _GEMINI_METRICS = {
        "total_requests": 0,
        "successful_requests": 0,
        "failed_requests": 0,
        "total_input_tokens": 0,
        "total_output_tokens": 0,
        "total_tokens": 0,
        "total_latency": 0.0,
    }


def get_gemini_metrics():
    total_requests = _GEMINI_METRICS["total_requests"]

    average_latency = (
        _GEMINI_METRICS["total_latency"] / total_requests
        if total_requests > 0
        else 0.0
    )

    return {
        "total_requests": total_requests,
        "successful_requests": _GEMINI_METRICS["successful_requests"],
        "failed_requests": _GEMINI_METRICS["failed_requests"],
        "total_input_tokens": _GEMINI_METRICS["total_input_tokens"],
        "total_output_tokens": _GEMINI_METRICS["total_output_tokens"],
        "total_tokens": _GEMINI_METRICS["total_tokens"],
        "total_latency": round(
            _GEMINI_METRICS["total_latency"],
            2,
        ),
        "average_latency": round(
            average_latency,
            2,
        ),
    }


# This function is used by the backend/frontend
def get_metrics() -> Dict[str, Any]:
    total_requests = _GEMINI_METRICS["total_requests"]

    average_latency = (
        _GEMINI_METRICS["total_latency"] / total_requests
        if total_requests > 0
        else 0.0
    )

    return {
        "api_requests": total_requests,

        "successful_requests":
            _GEMINI_METRICS["successful_requests"],

        "failed_requests":
            _GEMINI_METRICS["failed_requests"],

        "input_tokens":
            _GEMINI_METRICS["total_input_tokens"],

        "output_tokens":
            _GEMINI_METRICS["total_output_tokens"],

        "total_tokens":
            _GEMINI_METRICS["total_tokens"],

        "average_latency":
            round(average_latency, 2),

        "total_latency":
            round(_GEMINI_METRICS["total_latency"], 2),
    }


def _usage_metadata_values(usage_metadata):
    """
    Extract token usage safely from Gemini response metadata.
    """

    if usage_metadata is None:
        return 0, 0, 0

    try:

        if hasattr(usage_metadata, "model_dump"):
            metadata = usage_metadata.model_dump(
                exclude_none=True
            )

        elif hasattr(usage_metadata, "to_dict"):
            metadata = usage_metadata.to_dict()

        elif isinstance(usage_metadata, dict):
            metadata = usage_metadata

        else:
            metadata = {
                "prompt_token_count": getattr(
                    usage_metadata,
                    "prompt_token_count",
                    0,
                ),

                "candidates_token_count": getattr(
                    usage_metadata,
                    "candidates_token_count",
                    0,
                ),

                "total_token_count": getattr(
                    usage_metadata,
                    "total_token_count",
                    0,
                ),
            }

        input_tokens = (
            metadata.get("prompt_token_count")
            or metadata.get("input_token_count")
            or metadata.get("prompt_tokens")
            or metadata.get("input_tokens")
            or 0
        )

        output_tokens = (
            metadata.get("candidates_token_count")
            or metadata.get("response_token_count")
            or metadata.get("output_token_count")
            or metadata.get("output_tokens")
            or 0
        )

        total_tokens = (
            metadata.get("total_token_count")
            or metadata.get("total_tokens")
            or (
                int(input_tokens or 0)
                + int(output_tokens or 0)
            )
        )

        return (
            int(input_tokens or 0),
            int(output_tokens or 0),
            int(total_tokens or 0),
        )

    except Exception as exc:
        print(f"[GEMINI METRICS ERROR] {exc}")
        return 0, 0, 0


def _record_successful_gemini_metrics(
    agent_name,
    current_round,
    model_name,
    latency_seconds,
    usage_metadata,
):
    input_tokens, output_tokens, total_tokens = (
        _usage_metadata_values(usage_metadata)
    )

    _GEMINI_METRICS["total_requests"] += 1
    _GEMINI_METRICS["successful_requests"] += 1

    _GEMINI_METRICS["total_input_tokens"] += input_tokens
    _GEMINI_METRICS["total_output_tokens"] += output_tokens
    _GEMINI_METRICS["total_tokens"] += total_tokens

    _GEMINI_METRICS["total_latency"] += latency_seconds

    total_requests = _GEMINI_METRICS["total_requests"]

    average_latency = (
        _GEMINI_METRICS["total_latency"] / total_requests
        if total_requests > 0
        else 0.0
    )

    print(
        f"[GEMINI METRICS] "
        f"agent={agent_name} "
        f"round={current_round} "
        f"model={model_name} "
        f"latency={latency_seconds:.2f}s "
        f"input_tokens={input_tokens} "
        f"output_tokens={output_tokens} "
        f"total_tokens={total_tokens}"
    )

    print(
        f"[GEMINI METRICS SUMMARY] "
        f"requests={total_requests} "
        f"input_tokens={_GEMINI_METRICS['total_input_tokens']} "
        f"output_tokens={_GEMINI_METRICS['total_output_tokens']} "
        f"total_tokens={_GEMINI_METRICS['total_tokens']} "
        f"average_latency={average_latency:.2f}s"
    )


def _record_failed_gemini_request(latency_seconds):
    _GEMINI_METRICS["total_requests"] += 1
    _GEMINI_METRICS["failed_requests"] += 1
    _GEMINI_METRICS["total_latency"] += latency_seconds


# =========================================================
# GEMINI API CONFIGURATION
# =========================================================

API_KEY = os.getenv("GEMINI_API_KEY")
API_KEYS_STR = os.getenv("GEMINI_API_KEYS")


def _configured_keys() -> List[str]:
    """
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

        if (
            cleaned
            and cleaned.lower() not in placeholders
        ):
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

        print(
            "[GEMINI] Client configured successfully"
        )

    except Exception as exc:

        print(
            "[GEMINI] Client initialization failed: "
            f"{type(exc).__name__}: {exc}"
        )


_client_cycle = (
    itertools.cycle(_clients)
    if _clients
    else None
)


def get_client():
    """Return the next available Gemini client."""

    if _client_cycle is None:
        return None

    return next(_client_cycle)


def _rotated_clients(selected_client):
    """Try selected client first, then other clients."""

    if not selected_client or not _clients:
        return []

    selected_index = 0

    for index, client in enumerate(_clients):

        if client is selected_client:

            selected_index = index
            break

    return [
        _clients[
            (selected_index + offset)
            % len(_clients)
        ]
        for offset in range(len(_clients))
    ]


# =========================================================
# ERROR HANDLING
# =========================================================

def _failure_category(error):

    text = str(error).upper()

    if "503" in text or "UNAVAILABLE" in text:
        return "503 UNAVAILABLE"

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
        str(agent).title(),
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
        flags=re.IGNORECASE,
    )

    text = re.sub(
        r"^```\s*",
        "",
        text,
    )

    text = re.sub(
        r"\s*```$",
        "",
        text,
    )

    text = text.strip()

    # Direct JSON

    try:
        return json.loads(text)

    except Exception:
        pass

    # Find JSON object inside response

    match = re.search(
        r"\{.*\}",
        text,
        re.DOTALL,
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

    for raw_line in lines:

        line = raw_line.strip()

        if not line:
            continue

        heading_match = re.match(
            r"^(.+?)\s+Allocation\s*:\s*$",
            line,
            re.IGNORECASE,
        )

        if heading_match:

            raw_name = heading_match.group(1)

            normalized = _normalize_agent_name(
                raw_name
            )

            if normalized in normalized_agents:

                current_agent = normalized

                allocations.setdefault(
                    current_agent,
                    {},
                )

            continue

        resource_match = re.match(
            r"^([^:]+?)\s*:\s*(\d+)\s*units?\s*$",
            line,
            re.IGNORECASE,
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

            allocations[current_agent][resource] = (
                quantity
            )

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

    missing_agents = (
        expected_agents - actual_agents
    )

    if missing_agents:

        return (
            False,
            f"Missing agent allocations: "
            f"{sorted(missing_agents)}",
        )

    for resource, available in (
        resource_quantities.items()
    ):

        resource_key = str(resource).lower()

        total = 0

        for agent in expected_agents:

            agent_allocation = allocations.get(
                agent,
                {},
            )

            if resource_key not in agent_allocation:

                return (
                    False,
                    f"Missing {resource_key} "
                    f"allocation for {agent}",
                )

            quantity = agent_allocation[
                resource_key
            ]

            if quantity < 0:

                return (
                    False,
                    f"Negative quantity for "
                    f"{resource_key}",
                )

            total += quantity

        if total != int(available):

            return (
                False,
                f"{resource_key} total is {total}, "
                f"but available quantity is {available}",
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
        [0.34, 0.33, 0.33],
    )

    rotation = (
        (current_round - 1)
        % len(weights)
    )

    weights = (
        weights[rotation:]
        + weights[:rotation]
    )

    for resource, available in (
        resource_quantities.items()
    ):

        available = int(available)

        values = [
            int(available * weight)
            for weight in weights
        ]

        remainder = available - sum(values)

        for i in range(remainder):

            values[
                i % len(values)
            ] += 1

        for index, agent in enumerate(
            normalized_agents
        ):

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

        intro = (
            "I propose the following allocation:"
        )

    else:

        intro = (
            "I propose the following revised allocation:"
        )

    parts = [
        intro,
        "",
    ]

    agent_order = [
        "government",
        "ngo",
        "district",
    ]

    processed = set()

    for agent in agent_order:

        if agent not in allocations:
            continue

        processed.add(agent)

        parts.append(
            f"{_display_agent_name(agent)} "
            f"Allocation:"
        )

        for resource, quantity in (
            allocations[agent].items()
        ):

            parts.append(
                f"{resource.title()}: "
                f"{quantity} units"
            )

        parts.append("")

    for agent, resources in (
        allocations.items()
    ):

        if agent in processed:
            continue

        parts.append(
            f"{_display_agent_name(agent)} "
            f"Allocation:"
        )

        for resource, quantity in (
            resources.items()
        ):

            parts.append(
                f"{resource.title()}: "
                f"{quantity} units"
            )

        parts.append("")

    return "\n".join(parts).strip()


# =========================================================
# GENERIC FALLBACK
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
        action,
    )

    return {
        "action": action,
        "message": message,
        "reasoning": (
            f"A valid fallback allocation was "
            f"generated for round {current_round}."
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

    max_rounds=5,

    scenario=None,

    stubborn_until=None,
):

    current_agent = _normalize_agent_name(
        agent_name
    )

    # =====================================================
    # RESOURCES
    # =====================================================

    if resource_quantities:

        cleaned_resources = {}

        for key, value in (
            resource_quantities.items()
        ):

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

    allowed_resources = list(
        resource_quantities.keys()
    )

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

    # =====================================================
    # PREVIOUS PROPOSALS
    # =====================================================

    other_proposals_text = (
        "No previous proposals."
    )

    if last_proposals:

        proposal_lines = []

        for name, proposal in (
            last_proposals.items()
        ):

            normalized = _normalize_agent_name(
                name
            )

            if normalized != current_agent:

                proposal_lines.append(
                    f"{name}: {proposal}"
                )

        if proposal_lines:

            other_proposals_text = "\n".join(
                proposal_lines
            )

    # =====================================================
    # SCENARIO RECIPIENTS
    # =====================================================

    recipients = []

    if scenario and isinstance(scenario, dict):

        recipients = scenario.get(
            "recipients",
            [],
        ) or []

    if recipients:

        recipients_text_lines = [
            "AFFECTED AREAS / RECIPIENTS:"
        ]

        for recipient in recipients:

            name = recipient.get(
                "name",
                "Unknown Area",
            )

            population = recipient.get(
                "population",
                "Unknown",
            )

            severity = recipient.get(
                "severity",
                "Unknown",
            )

            needs = recipient.get(
                "needs",
                [],
            )

            needs_text = (
                ", ".join(needs)
                if needs
                else "Not specified"
            )

            recipients_text_lines.append(
                f"- {name}: "
                f"Population {population}, "
                f"Severity {severity}, "
                f"Critical Needs: {needs_text}"
            )

        recipients_text = "\n".join(
            recipients_text_lines
        )

    else:

        recipients_text = (
            "No specific affected areas "
            "were provided."
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
    # STUBBORNNESS
    # =====================================================

    stubborn_target = (

        stubborn_until

        if stubborn_until is not None

        else max(1, max_rounds // 2)
    )

    stubbornness_instruction = f"""

NEGOTIATION BEHAVIOR:

We are currently in Round {current_round}

out of {max_rounds}.

Before Round {stubborn_target + 1}:

- Be firm and protective of your priorities.

- Do not accept proposals too easily.

- Push for better terms.

During later rounds:

- Consider reasonable concessions.

- Work toward consensus.

In the final rounds:

- Avoid unnecessary deadlock.

- Accept a genuinely reasonable proposal when appropriate.

"""

    # =====================================================
    # DEBUG
    # =====================================================

    print("\n========================================")

    print("[NEGOTIATION]")

    print(f"Agent: {current_agent}")

    print(f"Round: {current_round}")

    print(
        f"Resources: {resource_quantities}"
    )

    print("========================================\n")

    # =====================================================
    # GEMINI PROMPT
    # =====================================================

    instruction = f"""

You are {_display_agent_name(current_agent)}

participating in a MULTI-AGENT DISASTER RELIEF
RESOURCE NEGOTIATION.

You must behave like a realistic human decision-maker.

CURRENT ROUND:

{current_round} of {max_rounds}

YOUR ROLE:

{_display_agent_name(current_agent)}

AVAILABLE RESOURCES:

{chr(10).join(
    f"- {resource.title()}: {quantity} units"
    for resource, quantity
    in resource_quantities.items()
)}

AFFECTED AREAS:

{recipients_text}

LATEST PROPOSAL:

{current_proposal}

PREVIOUS NEGOTIATION PROPOSALS:

{other_proposals_text}

ROLE PRIORITIES:

Government:

Prioritizes life-saving operations,
national coordination, and operational control.

NGO:

Prioritizes vulnerable populations,
humanitarian fairness, and urgent relief.

District Administration:

Prioritizes local communities,
district-level risk reduction,
and immediate operational needs.

{stubbornness_instruction}

YOUR TASK:

Actively negotiate.

Speak naturally and professionally.

Do not sound robotic.

You may:

- OFFER

- COUNTER

- REJECT

- ACCEPT

IMPORTANT RULES:

1. Do not automatically accept a proposal.

2. Review previous proposals carefully.

3. Do not repeat an identical allocation unless you are ACCEPTING it.

4. For OFFER or COUNTER, allocate EVERY resource.

5. Use ONLY these resources:

{", ".join(allowed_resources)}

6. No negative quantities.

7. The total allocation of EACH resource across all agents
must exactly equal the available quantity.

8. Use explicit numbers.

9. An ACCEPT action must accept the existing proposal
without changing the allocation.

10. Your response must contain the complete allocation
sections exactly in this format:

{allocation_format}

RETURN ONLY VALID JSON.

Required JSON format:

{{
    "action": "OFFER|COUNTER|REJECT|ACCEPT",
    "message": "Your negotiation response with complete allocations when required",
    "reasoning": "Brief explanation of the decision",
    "stance": "firm|moderate|conceding|strategic|accept"
}}

"""

    # =====================================================
    # GET CLIENT
    # =====================================================

    selected_client = get_client()

    clients = _rotated_clients(
        selected_client
    )

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
        "gemini-flash-latest",
        "gemini-flash-lite-latest",
    ]

    last_failure = (
        "All Gemini attempts failed"
    )

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
                    f"{client_index}, "
                    f"model: {model_name}"
                )

                response = (
                    client.models.generate_content(
                        model=model_name,
                        contents=instruction,
                    )
                )

                latency_seconds = (
                    time.perf_counter()
                    - start_time
                )

                response_text = (
                    getattr(response, "text", "")
                    or ""
                ).strip()

                if not response_text:

                    last_failure = (
                        "Empty Gemini response"
                    )

                    _record_failed_gemini_request(
                        latency_seconds
                    )

                    continue

                print(
                    "[GEMINI RESPONSE RECEIVED]"
                )

                # =========================================
                # EXTRACT JSON
                # =========================================

                result = _extract_json(
                    response_text
                )

                if not result:

                    last_failure = (
                        "Gemini returned invalid JSON"
                    )

                    _record_failed_gemini_request(
                        latency_seconds
                    )

                    continue

                action = str(
                    result.get(
                        "action",
                        "COUNTER",
                    )
                ).upper()

                message = str(
                    result.get(
                        "message",
                        "",
                    )
                ).strip()

                reasoning = str(
                    result.get(
                        "reasoning",
                        "",
                    )
                ).strip()

                stance = str(
                    result.get(
                        "stance",
                        "moderate",
                    )
                ).strip()

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

                    _record_failed_gemini_request(
                        latency_seconds
                    )

                    continue

                # =========================================
                # ACCEPT
                # =========================================

                if action == "ACCEPT":

                    usage_metadata = getattr(
                        response,
                        "usage_metadata",
                        None,
                    )

                    _record_successful_gemini_metrics(
                        agent_name=(
                            agent_name
                            or current_agent
                        ),
                        current_round=current_round,
                        model_name=model_name,
                        latency_seconds=latency_seconds,
                        usage_metadata=usage_metadata,
                    )

                    return {
                        "action": "ACCEPT",

                        "message": (
                            message
                            or "I accept the current proposal."
                        ),

                        "reasoning": reasoning,

                        "stance": "accept",
                    }

                # =========================================
                # REJECT
                # =========================================

                if action == "REJECT":

                    usage_metadata = getattr(
                        response,
                        "usage_metadata",
                        None,
                    )

                    _record_successful_gemini_metrics(
                        agent_name=(
                            agent_name
                            or current_agent
                        ),
                        current_round=current_round,
                        model_name=model_name,
                        latency_seconds=latency_seconds,
                        usage_metadata=usage_metadata,
                    )

                    return {
                        "action": "REJECT",

                        "message": (
                            message
                            or "I reject the current proposal."
                        ),

                        "reasoning": reasoning,

                        "stance": stance,
                    }

                # =========================================
                # OFFER / COUNTER
                # =========================================

                if action in {
                    "OFFER",
                    "COUNTER",
                }:

                    allocations = _parse_allocations(
                        message,
                        agent_names,
                    )

                    valid, reason = (
                        _validate_allocations(
                            allocations,
                            resource_quantities,
                            agent_names,
                        )
                    )

                    if valid:

                        print(
                            "[GEMINI] Proposal validated successfully"
                        )

                        usage_metadata = getattr(
                            response,
                            "usage_metadata",
                            None,
                        )

                        _record_successful_gemini_metrics(
                            agent_name=(
                                agent_name
                                or current_agent
                            ),
                            current_round=current_round,
                            model_name=model_name,
                            latency_seconds=latency_seconds,
                            usage_metadata=usage_metadata,
                        )

                        return {
                            "action": action,
                            "message": message,
                            "reasoning": reasoning,
                            "stance": stance,
                        }

                    last_failure = reason

                    print(
                        f"[VALIDATION FAILED] "
                        f"{reason}"
                    )

                    _record_failed_gemini_request(
                        latency_seconds
                    )

            except Exception as exc:

                latency_seconds = (
                    time.perf_counter()
                    - start_time
                )

                _record_failed_gemini_request(
                    latency_seconds
                )

                last_failure = (
                    _failure_category(exc)
                )

                print(
                    f"[GEMINI ERROR] "
                    f"{last_failure}"
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