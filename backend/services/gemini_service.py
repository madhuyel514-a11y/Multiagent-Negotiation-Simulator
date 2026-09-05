import os
import json
import re
import time

from dotenv import load_dotenv
from google import genai

try:
    from groq import Groq
except ImportError:
    Groq = None

load_dotenv()

import itertools

_GEMINI_METRICS = {
    "total_requests": 0,
    "total_input_tokens": 0,
    "total_output_tokens": 0,
    "total_tokens": 0,
    "total_latency": 0.0,
}


def get_gemini_metrics():
    total_requests = _GEMINI_METRICS["total_requests"]
    return {
        "total_requests": total_requests,
        "total_input_tokens": _GEMINI_METRICS["total_input_tokens"],
        "total_output_tokens": _GEMINI_METRICS["total_output_tokens"],
        "total_tokens": _GEMINI_METRICS["total_tokens"],
        "total_latency": _GEMINI_METRICS["total_latency"],
        "average_latency": (
            _GEMINI_METRICS["total_latency"] / total_requests
            if total_requests
            else 0.0
        ),
    }


def _friendly_agent_name(agent_name=None, fallback_agent=None):
    if agent_name and str(agent_name).strip():
        return str(agent_name).strip()

    fallback = (fallback_agent or "").strip().lower()
    mapping = {
        "government": "Government Agent",
        "ngo": "NGO Agent",
        "district": "District Administration Agent",
    }
    return mapping.get(fallback, fallback.title() if fallback else "Unknown Agent")


def _usage_metadata_values(usage_metadata):
    if usage_metadata is None:
        return 0, 0, 0

    if hasattr(usage_metadata, "model_dump"):
        metadata = usage_metadata.model_dump(exclude_none=True)
    elif hasattr(usage_metadata, "to_dict"):
        metadata = usage_metadata.to_dict()
    elif isinstance(usage_metadata, dict):
        metadata = usage_metadata
    else:
        metadata = {
            "prompt_token_count": getattr(usage_metadata, "prompt_token_count", None),
            "response_token_count": getattr(usage_metadata, "response_token_count", None),
            "candidates_token_count": getattr(usage_metadata, "candidates_token_count", None),
            "total_token_count": getattr(usage_metadata, "total_token_count", None),
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
        or metadata.get("completion_tokens")
        or metadata.get("output_tokens")
        or 0
    )
    total_tokens = (
        metadata.get("total_token_count")
        or metadata.get("total_tokens")
        or (int(input_tokens or 0) + int(output_tokens or 0))
    )

    return int(input_tokens or 0), int(output_tokens or 0), int(total_tokens or 0)


def _record_successful_gemini_metrics(agent_name, current_round, model_name, latency_seconds, usage_metadata):
    input_tokens, output_tokens, total_tokens = _usage_metadata_values(usage_metadata)

    _GEMINI_METRICS["total_requests"] += 1
    _GEMINI_METRICS["total_input_tokens"] += input_tokens
    _GEMINI_METRICS["total_output_tokens"] += output_tokens
    _GEMINI_METRICS["total_tokens"] += total_tokens
    _GEMINI_METRICS["total_latency"] += latency_seconds

    total_requests = _GEMINI_METRICS["total_requests"]
    average_latency = (
        _GEMINI_METRICS["total_latency"] / total_requests if total_requests else 0.0
    )

    print(
        f"[GEMINI_METRICS] agent={_friendly_agent_name(agent_name, fallback_agent='')} "
        f"round={current_round} model={model_name} latency={latency_seconds:.2f}s "
        f"input_tokens={input_tokens} output_tokens={output_tokens} total_tokens={total_tokens}"
    )
    print(
        f"[GEMINI_METRICS_SUMMARY] total_requests={total_requests} "
        f"total_input_tokens={_GEMINI_METRICS['total_input_tokens']} "
        f"total_output_tokens={_GEMINI_METRICS['total_output_tokens']} "
        f"total_tokens={_GEMINI_METRICS['total_tokens']} "
        f"total_api_latency={_GEMINI_METRICS['total_latency']:.2f}s "
        f"average_latency={average_latency:.2f}s"
    )


API_KEY = os.getenv("GEMINI_API_KEY")
API_KEYS_STR = os.getenv("GEMINI_API_KEYS")


def _configured_keys():
    configured = API_KEYS_STR.split(",") if API_KEYS_STR else [API_KEY or ""]
    placeholders = {"", "your_api_key", "your-key", "changeme", "replace_me", "none", "null"}
    return [
        key.strip().strip("\"'")
        for key in configured
        if key.strip().strip("\"'").lower() not in placeholders
    ]

_clients = []

keys = _configured_keys()

for key in keys:
    try:
        _clients.append(genai.Client(api_key=key))
    except Exception as exc:
        print(f"[GEMINI] client initialization failed: {type(exc).__name__}")

_client_cycle = itertools.cycle(_clients) if _clients else None

GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

_raw_groq_keys = []
if os.getenv("GROQ_API_KEY"):
    _raw_groq_keys.append(os.getenv("GROQ_API_KEY"))
if os.getenv("GROQ_API_KEYS"):
    _raw_groq_keys.extend(os.getenv("GROQ_API_KEYS").split(","))
if os.getenv("GROQ_API_KEY_1"):
    _raw_groq_keys.append(os.getenv("GROQ_API_KEY_1"))
if os.getenv("GROQ_API_KEY_2"):
    _raw_groq_keys.append(os.getenv("GROQ_API_KEY_2"))

_GROQ_KEYS = []
_seen_groq = set()
for k in _raw_groq_keys:
    cleaned = k.strip().strip("\"'")
    if (
        cleaned
        and cleaned.lower() not in {"", "your_api_key", "your-key", "changeme", "replace_me", "none", "null"}
        and cleaned not in _seen_groq
    ):
        _seen_groq.add(cleaned)
        _GROQ_KEYS.append(cleaned)

_groq_clients = []

if Groq is not None:
    for key in _GROQ_KEYS:
        try:
            _groq_clients.append(Groq(api_key=key))
        except Exception as exc:
            print(
                f"[GROQ] client initialization failed: "
                f"{type(exc).__name__}"
            )
    print(f"[GROQ] Initialized {len(_groq_clients)} client(s) with model={GROQ_MODEL}")
else:
    print("[GROQ] groq package not installed or import failed")

def get_client():
    return next(_client_cycle) if _client_cycle else None


def _rotated_clients(selected_client):
    if not selected_client or not _clients:
        return []

    selected_index = next(
        (index for index, client in enumerate(_clients) if client is selected_client),
        0,
    )
    return [
        _clients[(selected_index + offset) % len(_clients)]
        for offset in range(len(_clients))
    ]


def _failure_category(error):
    text = str(error).upper()
    if "429" in text or "RESOURCE_EXHAUSTED" in text:
        return "429 RESOURCE_EXHAUSTED"
    if "401" in text or "UNAUTHENTICATED" in text:
        return "401 UNAUTHENTICATED"
    if "403" in text or "PERMISSION_DENIED" in text:
        return "403 PERMISSION_DENIED"
    return type(error).__name__


def _record_successful_groq_metrics(
    agent_name,
    current_round,
    model_name,
    latency_seconds,
    usage,
):
    input_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
    output_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
    total_tokens = int(
        getattr(usage, "total_tokens", 0) or input_tokens + output_tokens
    )

    _GEMINI_METRICS["total_requests"] += 1
    _GEMINI_METRICS["total_input_tokens"] += input_tokens
    _GEMINI_METRICS["total_output_tokens"] += output_tokens
    _GEMINI_METRICS["total_tokens"] += total_tokens
    _GEMINI_METRICS["total_latency"] += latency_seconds

    print(
        f"[GROQ_METRICS] agent={_friendly_agent_name(agent_name, fallback_agent='')} "
        f"round={current_round} model={model_name} latency={latency_seconds:.2f}s "
        f"input_tokens={input_tokens} output_tokens={output_tokens} total_tokens={total_tokens}"
    )


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


def _extract_recipient_allocations(message, recipient_names, resource_quantities):
    if not message or not recipient_names or not resource_quantities:
        return {}

    recipient_pattern = "|".join(
        re.escape(name) for name in sorted(recipient_names, key=len, reverse=True)
    )
    headers = list(re.finditer(
        rf"(?<![\w])(?P<recipient>{recipient_pattern})(?:'s)?\s+"
        rf"(?:allocation|distribution)\s*:",
        str(message),
        re.IGNORECASE,
    ))
    allocations = {}
    for index, header in enumerate(headers):
        recipient = next(
            name for name in recipient_names
            if name.lower() == header.group("recipient").lower()
        )
        end = headers[index + 1].start() if index + 1 < len(headers) else len(str(message))
        section = str(message)[header.end():end]
        allocations[recipient] = {}
        for resource in resource_quantities:
            match = re.search(
                rf"(?<![\w]){re.escape(resource)}\s*:\s*(\d+)\s*(?:units?|qty\.?|quantity)?",
                section,
                re.IGNORECASE,
            )
            if match:
                allocations[recipient][resource] = int(match.group(1))
    return allocations


def _validate_response_resources(
    message,
    allowed_resources,
    resource_quantities=None,
    recipient_names=None,
):
    """
    Ensure every proposed resource is explicit, allowed, within limits,
    and has a non-zero quantity for any resource that is actually available.
    """
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

    recipient_allocations = _extract_recipient_allocations(
        message,
        recipient_names,
        resource_quantities,
    )
    if recipient_allocations:
        for resource in allowed_resources:
            resource_key = resource.strip().lower()
            quantities = [
                quantity
                for allocation in recipient_allocations.values()
                for name, quantity in allocation.items()
                if name.strip().lower() == resource_key
            ]
            if not quantities:
                print(f"RESOURCE VALIDATION FAILED: Missing explicit quantity for {resource}")
                return False
            if any(quantity < 0 for quantity in quantities):
                print(f"RESOURCE VALIDATION FAILED: Negative quantity for {resource}")
                return False
            if resource_quantities:
                available = resource_quantities.get(resource_key, 0)
                if sum(quantities) > available:
                    print(f"RESOURCE VALIDATION FAILED: Total quantity exceeds available amount for {resource}")
                    return False
        return True

    parsed = {name.strip().lower(): int(quantity) for name, quantity in resource_entries}

    for resource in allowed_resources:
        key = resource.strip().lower()
        if key not in parsed:
            print(f"RESOURCE VALIDATION FAILED: Missing explicit quantity for {resource}")
            return False

        if resource_quantities and key in resource_quantities and parsed[key] > resource_quantities[key]:
            print(f"RESOURCE VALIDATION FAILED: Quantity exceeds available amount for {resource}")
            return False

        # Reject 0 proposals for resources that are actually available
        if resource_quantities and key in resource_quantities:
            available = resource_quantities[key]
            if available > 0 and parsed[key] == 0:
                print(f"RESOURCE VALIDATION FAILED: Proposed 0 for '{resource}' which has {available} units available — minimum floor required")
                return False

    return True


def _validation_failure_reason(message, allowed_resources, resource_quantities):
    entries = re.findall(
        r"([A-Za-z][A-Za-z0-9\s&/-]*)\s*:\s*(\d+)\s*(?:units?|qty\.?|quantity)?",
        message or "",
        re.IGNORECASE,
    )
    if not entries:
        return "schema validation failure: no resource quantities"

    allowed = {resource.lower() for resource in allowed_resources}
    extracted = {name.strip().lower(): int(quantity) for name, quantity in entries}
    unknown = set(extracted) - allowed
    if unknown:
        return f"invalid resource names: {sorted(unknown)}"

    for resource, quantity in extracted.items():
        available = next(
            (value for name, value in resource_quantities.items() if name.lower() == resource),
            None,
        )
        if available is not None and (quantity < 0 or quantity > available):
            return f"invalid quantities: {resource}={quantity}, available={available}"

    return "schema validation failure: missing or zero allocation"


def _process_provider_response(
    text,
    allowed_resources,
    resource_quantities,
    scenario,
):
    result = _extract_json(text)
    if not result or not isinstance(result, dict):
        return None, "invalid JSON"

    action = str(result.get("action", "COUNTER")).strip().upper()
    if action not in {"OFFER", "REJECT", "COUNTER", "ACCEPT"}:
        return None, f"invalid action: {action}"

    message = str(result.get("message", "")).strip()
    reasoning = str(result.get("reasoning", "")).strip()
    stance = str(result.get("stance", "moderate")).strip()

    if action == "ACCEPT":
        return {
            "action": action,
            "message": message,
            "reasoning": reasoning,
            "stance": stance,
        }, None

    if not message:
        return None, "schema validation failure: missing message"

    recipient_names = [
        recipient.get("name")
        for recipient in (scenario or {}).get("recipients", [])
        if recipient.get("name")
    ]
    if not _validate_response_resources(
        message,
        allowed_resources,
        resource_quantities,
        recipient_names,
    ):
        return None, _validation_failure_reason(
            message,
            allowed_resources,
            resource_quantities,
        )

    return {
        "action": action,
        "message": message,
        "reasoning": reasoning,
        "stance": stance,
    }, None


# =========================================================
# ROLE-SPECIFIC FALLBACK WITH REALISTIC CONFLICT POSITIONS
# =========================================================

def _fallback_response(prompt, allowed_resources=None, agent_name=None,
                       resource_quantities=None, current_round=1, last_proposals=None, max_rounds=5):

    agent = agent_name if agent_name else _detect_agent(prompt)

    print("CURRENT NEGOTIATION AGENT:", agent)

    if not allowed_resources:
        allowed_resources = _extract_allowed_resources(prompt)

    if not resource_quantities:
        resource_quantities = _extract_resource_quantities(prompt)

    if not allowed_resources:
        return {
            "message": "I need more information about the available resources before making a proposal.",
            "reasoning": "Cannot negotiate without resource data.",
            "stance": "moderate"
        }

    # -------------------------------------------------------
    # Compute role-specific allocation weights.
    # Each role prioritizes different resources, creating
    # genuine conflict when totals are constrained.
    # -------------------------------------------------------

    import hashlib
    
    # Linear convergence: Round 1 has 100% extra, Round max_rounds has 0% extra
    extra_ratio = max(0.0, (max_rounds - current_round) / max(1.0, float(max_rounds - 1)))

    def _get_weight(resource_name):
        # Create deterministic pseudo-random base weight between 0.2 and 0.5 based on agent and resource names
        seed_str = f"{agent}_{resource_name}".lower()
        h = int(hashlib.md5(seed_str.encode()).hexdigest(), 16)
        base_w = 0.2 + (h % 30) / 100.0  # between 0.20 and 0.49
        extra_w = 0.05
        return base_w + (extra_w * extra_ratio)

    # Build proposal with dynamic allocations
    message_parts = []
    for resource in allowed_resources:
        available = resource_quantities.get(resource.lower(), 0)
        if available == 0:
            message_parts.append(f"{resource}: 0 units")
            continue

        w = _get_weight(resource)
        quantity = max(1, int(round(available * w)))
        message_parts.append(f"{resource}: {quantity} units")

    proposal_str = "; ".join(message_parts)

    is_final_round = (current_round >= max_rounds)
    halfway = max(1, max_rounds // 2)

    action = "COUNTER"
    if is_final_round:
        action = "ACCEPT"
    elif current_round == 1:
        action = "OFFER"
    elif current_round <= halfway:
        action = "REJECT"

    if is_final_round:
        message = (
            f"After {max_rounds} rounds of constructive negotiation, we have achieved consensus. "
            f"I accept the final agreed allocation: {proposal_str}. "
            f"We are ready to deploy."
        )
        reasoning = f"Final consensus reached in round {max_rounds}."
        stance = "accept"
        action = "ACCEPT"
    elif current_round == 1:
        message = (
            f"As the {agent.capitalize()} representative, my primary mandate requires these resources. "
            f"Our opening proposal: {proposal_str}. "
            f"We are establishing a strong baseline."
        )
        reasoning = f"{agent.capitalize()} establishing opening position."
        stance = "firm"
        action = "OFFER"
    elif current_round <= halfway:
        message = (
            f"I have reviewed the previous proposals. While I understand the competing needs, "
            f"I cannot accept the current terms. I reject the incoming allocation and counter-propose: {proposal_str}. "
            f"We must maintain our operational capacity."
        )
        reasoning = f"Round {current_round} firm pushback."
        stance = "firm"
        action = "REJECT"
    else:
        message = (
            f"I have reviewed the partners' latest counter-proposals and am offering measured concessions. "
            f"My revised counter-proposal: {proposal_str}."
        )
        reasoning = f"Round {current_round} strategic concession."
        stance = "moderate"
        action = "COUNTER"

    return {
        "message": message,
        "reasoning": reasoning,
        "stance": stance,
        "action": action
    }


def _generic_fallback_response(allowed_resources, resource_quantities, last_proposals, reason):
    """Return a scenario-safe response when no Gemini client is configured."""
    print(f"[FALLBACK] reason={reason}")
    proposal_parts = []
    for resource in allowed_resources or []:
        available = int(resource_quantities.get(resource.lower(), 0))
        quantity = min(available, max(1, round(available / 3))) if available else 0
        proposal_parts.append(f"{resource}: {quantity} units")

    proposal = "; ".join(proposal_parts)
    action = "COUNTER" if last_proposals else "OFFER"
    return {
        "message": (
            f"I have reviewed the current negotiation context. "
            f"My {action.lower()} is: {proposal}."
        ),
        "reasoning": "Fallback response uses only the resources and quantities supplied by the scenario.",
        "stance": "moderate",
        "action": action,
    }


# =========================================================
# GEMINI
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
    practice_mode=False,
):
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

    # Normalize resource quantities keys to lowercase
    if resource_quantities:
        resource_quantities = {k.lower(): v for k, v in resource_quantities.items()}
    else:
        resource_quantities = _extract_resource_quantities(prompt)

    # Compute total budget if not provided
    if total_budget is None and resource_quantities:
        total_budget = sum(resource_quantities.values())

    current_proposal = current_proposal or {}
    
    recipients = scenario.get("recipients", []) if scenario else []
    if recipients:
        recipient_names = [r.get("name") for r in recipients]
        recipients_str = "AFFECTED AREAS (RECIPIENTS):\n" + "\n".join(
            f" - {r.get('name')}: Population {r.get('population', 'Unknown')}, Severity {r.get('severity', 'Unknown')}. Critical Needs: {', '.join(r.get('needs', []))}"
            for r in recipients
        )
    else:
        recipient_names = agent_names or [agent_name or "Current Agent"]
        recipients_str = "No specific affected areas provided. Allocate to the agents instead."

    allocation_format = "\n".join(
        f"  {name} Allocation: <each scenario resource>: N units"
        for name in recipient_names
    )
    incoming_proposal_str = (
        "; ".join(f"{name}: {quantity} units" for name, quantity in current_proposal.items())
        if current_proposal
        else "No incoming proposal yet; make the opening offer."
    )

    print(
        "Negotiation model called for agent:",
        agent_name or current_agent,
        f"| Round: {current_round}"
    )
    print(f"Allowed resources: {allowed_resources}")
    print(f"Total budget: {total_budget}")

    # -----------------------------------------------------
    # If Gemini isn't configured, use guaranteed fallback.
    # -----------------------------------------------------

    selected_client = get_client()
    clients = _rotated_clients(selected_client)
    print(f"[GEMINI] client_available={selected_client is not None}")
    if not clients:
        return _generic_fallback_response(
            allowed_resources,
            resource_quantities,
            last_proposals,
            "no client/API key",
        )

    # -----------------------------------------------------
    # Build the "what others proposed" section
    # -----------------------------------------------------

    other_proposals_str = ""
    if last_proposals:
        others = {
            k: v for k, v in last_proposals.items()
            if agent_name and agent_name.lower() not in k.lower()
        }
        if others:
            lines = ["WHAT OTHER AGENTS ARE CURRENTLY PROPOSING (respond to these specifically):"]
            for other_agent, props in others.items():
                if isinstance(props, dict):
                    prop_str = ", ".join(
                        f"{r}: {q} units" for r, q in props.items()
                    )
                else:
                    prop_str = str(props)
                lines.append(f"  - {other_agent}: {prop_str}")
            other_proposals_str = "\n".join(lines)
        else:
            other_proposals_str = "No other agents have proposed yet — make your opening offer."
    else:
        other_proposals_str = "No other agents have proposed yet — make your opening offer."

    # -----------------------------------------------------
    # Build budget constraint string
    # -----------------------------------------------------

    budget_str = ""
    if total_budget:
        budget_str = (
            f"\nTOTAL RESOURCE POOL: {total_budget} units combined across all resources.\n"
            f"This is a ZERO-SUM environment — if one agent gets more of a resource,\n"
            f"another gets less. You CANNOT propose maximum amounts for everything.\n"
            f"Your proposal must reflect GENUINE TRADE-OFFS.\n"
        )

    role_instruction = (
        "Use the current agent's role, goal, priorities, constraints, personality, "
        "and negotiation style from the context above. Protect high-priority "
        "objectives while making practical concessions on lower-priority items."
    )

    stubborn_target = stubborn_until if stubborn_until is not None else max(1, max_rounds // 2)
    stubbornness_instruction = f"""=== NEGOTIATION STUBBORNNESS ===
- Real negotiations take time and require pushback.
- We are currently in Round {current_round} out of {max_rounds} total rounds.
- Before Round {stubborn_target + 1}, you should be EXTREMELY STUBBORN and almost NEVER accept the first counter-proposal unless it perfectly meets your core objectives. Push back and demand better terms.
- Only consider ACCEPTING easily in the final rounds (Round {max_rounds - 1} or {max_rounds}) to avoid a total failure to reach consensus."""

    practice_mode_instruction = """
=== MULTI-AGENT ROUNDTABLE PRACTICE MODE ===
- You are seated in an Emergency Operations Center conference room alongside a Human Crisis Coordinator and other agency leaders (Government, NGO, District Administration).
- All 4 of you are negotiating the SAME disaster relief resource pool for the affected areas.
- The Human Coordinator has just submitted/revised a master proposal.
- Evaluate the Human Coordinator's proposal and speech carefully against your core operational priorities and constraints.
- If other AI department heads have already spoken earlier in this round, DIRECTLY ADDRESS their points (e.g. agree with their valid points, push back if they are taking too much, or offer specific compromises).
- If the allocation is fair, adheres to total resource availability, and reasonably meets your high-priority needs, choose ACCEPT.
- If an essential requirement is unmet, choose COUNTER with concrete numbers for all areas and explain the exact trade-offs needed.
- Speak naturally and passionately in the first person ("As the Government authority...", "Our medical teams at the NGO cannot...", "The District roads are blocked..."). Never sound robotic or generic.
- As the round number approaches the maximum deadline, demonstrate increasing urgency to collaborate and reach a life-saving consensus before time runs out.
""" if practice_mode else ""
    practice_mode_section = (
        f"\n{practice_mode_instruction}\n"
        if practice_mode
        else ""
    )

    instruction = f"""
You are a department head participating in a high-stakes, real-life DISASTER-RELIEF RESOURCE NEGOTIATION.
You are sitting in a room with the other department heads. You must act entirely human and in-character.
{budget_str}
YOUR CURRENT PERSONA: {current_agent.upper()}
CURRENT ROUND: {current_round}
LATEST INCOMING PROPOSAL:
{incoming_proposal_str}

YOUR ROLE AND NEGOTIATION POSITION:
{role_instruction}

{recipients_str}

{other_proposals_str}

FULL NEGOTIATION CONTEXT AND HISTORY:
{prompt}

=== YOUR TASK ===
Act like a real human being fighting for their department's survival and success.
Speak passionately in the first person ("I need...", "My team cannot survive without...", "You are asking us to give up too much...").
Argue FIERCELY for the specific resources you need the most according to your priorities.
Do NOT sound like an AI or a robot. Be professional but firm, and express frustration if others are being greedy.

Evaluate the LATEST INCOMING PROPOSAL. Decide independently whether to ACCEPT, COUNTER, or REJECT it.
If you COUNTER, include a concrete proposal and explain why the other departments must accept your concessions.

{stubbornness_instruction}{practice_mode_section}

=== CRITICAL RULES ===
1. Speak NATURALLY as a human department head. Do NOT use boilerplate like "I counter-propose". Say things like "Look, we absolutely cannot accept this..." or "I understand your need, but my department..."
2. Include EXPLICIT numbers for EVERY resource: "Resource Name: N units" in your message text so we know what you're proposing.
3. Quantities MUST NOT exceed the available amounts shown in the context.
4. Your proposal must reflect REAL TRADE-OFFS. Concede things you don't urgently need.
5. Reference specific numbers from the incoming proposal and explain why they don't work for you.
6. Use only the resource names defined in the current scenario; never invent resources.
7. An ACCEPT response must accept the incoming proposal without changing the numbers.
8. For an OFFER or COUNTER, provide the complete allocation for EVERY RECIPIENT/AREA (not yourself). Use these exact allocation sections at the bottom of your message:
{allocation_format}
9. The sum of each resource across all recipient sections must equal its available quantity exactly.

Return ONLY valid JSON:

{{
  "action": "OFFER|REJECT|COUNTER|ACCEPT",
  "message": "Your passionate, first-person, human-like speech directed at the other department heads. Argue for what you need most, offer trade-offs, and state your final allocations clearly.",
  "reasoning": "Internal reasoning (not spoken). Why you are taking this position and what you are willing/unwilling to concede",
  "stance": "firm|moderate|conceding|strategic|accept"
}}
"""

    # -----------------------------------------------------
    # Try Groq first
    # -----------------------------------------------------

    if _groq_clients:
        for client_index, client in enumerate(_groq_clients, 1):
            print("[GROQ] attempting request")
            start_time = time.perf_counter()

            try:
                response = client.chat.completions.create(
                    model=GROQ_MODEL,
                    messages=[
                        {
                            "role": "user",
                            "content": instruction,
                        }
                    ],
                    response_format={"type": "json_object"},
                )
                latency_seconds = time.perf_counter() - start_time
                text = (
                    response.choices[0].message.content
                    if response.choices
                    else ""
                ) or ""
                result, failure = _process_provider_response(
                    text,
                    allowed_resources,
                    resource_quantities,
                    scenario,
                )

                if result:
                    _record_successful_groq_metrics(
                        agent_name=agent_name or current_agent,
                        current_round=current_round,
                        model_name=GROQ_MODEL,
                        latency_seconds=latency_seconds,
                        usage=getattr(response, "usage", None),
                    )
                    print("[GROQ] success")
                    return result

                print(f"[GROQ] validation failed: {failure}")
            except Exception as exc:
                print(f"[GROQ] request failed ({_failure_category(exc)}): {exc}")
    else:
        print(f"[GROQ] failed: no configured client (checked keys: {_GROQ_KEYS})")

    print("[GEMINI] fallback request")

    # -----------------------------------------------------
    # Try Gemini
    # -----------------------------------------------------

    models = [
        "gemini-3.6-flash"
    ]

    last_failure = "all configured keys failed"
    for client_index, client in enumerate(clients, 1):
        print(f"[GEMINI] trying key {client_index}/{len(clients)}")
        client_succeeded = False

        for model_name in models:

            try:
                start_time = time.perf_counter()

                response = client.models.generate_content(
                    model=model_name,
                    contents=instruction
                )
                latency_seconds = time.perf_counter() - start_time
                usage_metadata = getattr(response, "usage_metadata", None)

                text = getattr(
                    response,
                    "text",
                    ""
                ) or ""

                print(f"[GEMINI] request_succeeded model={model_name}")
                print(f"[GEMINI] raw_response={text}")
                if not text.strip():
                    last_failure = "empty response"
                    print(f"[GEMINI] key {client_index} failed: {last_failure}")
                    break
                result, failure = _process_provider_response(
                    text,
                    allowed_resources,
                    resource_quantities,
                    scenario,
                )

                if result:
                    print("[GEMINI] success")
                    _record_successful_gemini_metrics(
                        agent_name=agent_name or current_agent,
                        current_round=current_round,
                        model_name=model_name,
                        latency_seconds=latency_seconds,
                        usage_metadata=usage_metadata,
                    )
                    return result

                last_failure = failure
                print(f"[GEMINI] key {client_index} failed: {last_failure}")

            except Exception as exc:

                last_failure = _failure_category(exc)
                print(f"[GEMINI] key {client_index} failed: {last_failure}")
                break

    # -----------------------------------------------------
    # Guaranteed role-specific fallback with resources
    # -----------------------------------------------------

    return _generic_fallback_response(
        allowed_resources,
        resource_quantities,
        last_proposals,
        last_failure,
    )


# =========================================================
# AI STRATEGIST / HUMAN SUGGESTION GENERATOR
# =========================================================

# =========================================================
# AI STRATEGIST / HUMAN SUGGESTION GENERATOR
# =========================================================

def _generate_balanced_compromise_allocation(
    recipients: list,
    resource_quantities: dict,
    last_proposals: dict = None,
    current_proposal: dict = None,
    agents: list = None,
) -> dict:
    """
    Computes a balanced, valid sector-by-sector allocation satisfying zero-sum constraints.
    Rigorously aligns resource distribution with each region's explicit priority needs,
    emergency severity levels, and population, while reconciling recent agent proposals.
    """
    if not resource_quantities:
        return {}

    # Determine allocation targets (keys): preserve current_proposal keys if present,
    # otherwise use recipient names from scenario, or fallback to default agent names.
    if current_proposal and isinstance(current_proposal, dict) and len(current_proposal) > 0:
        target_keys = list(current_proposal.keys())
    elif recipients:
        target_keys = [
            r["name"] if isinstance(r, dict) else str(r)
            for r in recipients
        ]
    else:
        target_keys = [
            "Government Agent",
            "NGO Agent",
            "District Administration Agent",
        ]

    if not target_keys:
        return {}

    # Build recipient metadata lookup for region priority matching
    recipients_by_name = {}
    if recipients:
        for r in recipients:
            if isinstance(r, dict):
                recipients_by_name[r.get("name", "").strip().lower()] = r

    # Build agent role lookup if keys are agent names
    agents_by_name = {}
    if agents:
        for a in agents:
            if isinstance(a, dict):
                agents_by_name[a.get("name", "").strip().lower()] = a

    # Check if last_proposals has past data from communication
    has_valid_proposals = False
    avg_proposals = {k: {} for k in target_keys}
    if last_proposals and isinstance(last_proposals, dict):
        valid_props = [p for p in last_proposals.values() if isinstance(p, dict) and p]
        if valid_props:
            has_valid_proposals = True
            for res_name in resource_quantities:
                for k in target_keys:
                    vals = [
                        p.get(k, {}).get(res_name, 0)
                        for p in valid_props
                        if isinstance(p.get(k), dict) and res_name in p.get(k, {})
                    ]
                    if vals:
                        avg_proposals[k][res_name] = sum(vals) / len(vals)

    balanced_allocation = {k: {} for k in target_keys}

    for res_name, total_qty in resource_quantities.items():
        total_avail = int(total_qty)
        remaining = total_avail
        res_clean = res_name.strip().lower()

        # Compute priority demand weight for each target key for this specific resource
        demand_weights = {}
        for k in target_keys:
            k_clean = k.strip().lower()
            rec = recipients_by_name.get(k_clean)

            if rec:
                # Region-based key: weight by Severity, Population, and Explicit Needs
                sev = str(rec.get("severity", "medium")).lower()
                if "crit" in sev:
                    sev_w = 3.5
                elif "high" in sev:
                    sev_w = 2.2
                elif "med" in sev:
                    sev_w = 1.5
                else:
                    sev_w = 1.0

                pop = rec.get("population", 10000)
                try:
                    pop_num = float(pop)
                    pop_w = max(0.8, min(2.5, (pop_num / 10000.0) ** 0.5))
                except (ValueError, TypeError):
                    pop_w = 1.0

                # Check explicit regional needs for this resource
                needs = [str(n).lower() for n in rec.get("needs", [])]
                is_explicit_need = any(
                    res_clean in n or n in res_clean or
                    any(word in n for word in res_clean.split() if len(word) > 3)
                    for n in needs
                )
                need_mult = 3.5 if is_explicit_need else 0.6
                demand_weights[k] = sev_w * pop_w * need_mult

            elif "government" in k_clean:
                # Government Agent focus: search & rescue, infrastructure, critical law/order
                if any(w in res_clean for w in ["rescue", "water", "infrastructure", "transport", "boat"]):
                    demand_weights[k] = 3.0
                else:
                    demand_weights[k] = 1.5
            elif "ngo" in k_clean:
                # NGO Agent focus: medical aid, temporary shelters, humanitarian food
                if any(w in res_clean for w in ["medic", "shelter", "food", "health", "aid"]):
                    demand_weights[k] = 3.2
                else:
                    demand_weights[k] = 1.2
            elif "district" in k_clean:
                # District Administration focus: debris clearance, municipal equipment, logistics
                if any(w in res_clean for w in ["debris", "clearance", "equipment", "suppl", "comm"]):
                    demand_weights[k] = 3.0
                else:
                    demand_weights[k] = 1.5
            else:
                demand_weights[k] = 1.5

        total_demand = sum(demand_weights.values()) or len(target_keys)

        allocated_counts = {}
        for i, k in enumerate(target_keys):
            if i == len(target_keys) - 1:
                # Last recipient gets exact remaining units to satisfy zero-sum constraint
                allocated_counts[k] = max(0, remaining)
            else:
                priority_share = demand_weights[k] / total_demand
                priority_qty = total_avail * priority_share

                if has_valid_proposals and res_name in avg_proposals[k]:
                    # Blend 60% priority-based demand with 40% agent counter-demand compromise
                    compromise_qty = int(round(0.6 * priority_qty + 0.4 * avg_proposals[k][res_name]))
                else:
                    compromise_qty = int(round(priority_qty))

                qty = max(0, min(remaining, compromise_qty))
                allocated_counts[k] = qty
                remaining -= qty

        for k in target_keys:
            balanced_allocation[k][res_name] = allocated_counts[k]

    return balanced_allocation


def generate_human_suggestion(
    scenario: dict,
    current_round: int,
    max_rounds: int,
    history: list = None,
    last_proposals: dict = None,
    current_proposal: dict = None,
    resource_quantities: dict = None,
    agents: list = None,
) -> dict:
    """
    Acts as an AI Strategic Advisor to the Human Crisis Coordinator in Practice Mode.
    Produces an in-character strategic move rigorously grounded in:
      1. The preceding communication and objections raised by all AI agents.
      2. The regional crisis priorities (severity, population, and specific sector needs).
    """
    history = history or []
    last_proposals = last_proposals or {}
    current_proposal = current_proposal or {}
    scenario = scenario or {}

    recipients = scenario.get("recipients", [])
    if not recipients and current_proposal:
        recipients = [{"name": name, "severity": "High"} for name in current_proposal.keys()]

    res_quantities = resource_quantities or scenario.get("resourceQuantities", {})
    available_resources = list(res_quantities.keys()) or scenario.get("resources", [])

    # 1. Compute priority-aligned balanced compromise allocation
    balanced_proposal = _generate_balanced_compromise_allocation(
        recipients=recipients,
        resource_quantities=res_quantities,
        last_proposals=last_proposals,
        current_proposal=current_proposal,
        agents=agents,
    )

    # 2. Identify top critical region and primary resource
    sorted_recipients = sorted(
        recipients,
        key=lambda r: (
            3 if "crit" in str(r.get("severity", "")).lower() else
            2 if "high" in str(r.get("severity", "")).lower() else
            1 if "med" in str(r.get("severity", "")).lower() else 0,
            float(r.get("population", 0)) if str(r.get("population", 0)).isdigit() else 0
        ),
        reverse=True
    ) if recipients else []

    top_district_obj = sorted_recipients[0] if sorted_recipients else {}
    top_district_name = top_district_obj.get("name", "Critical Sector")
    top_district_needs = top_district_obj.get("needs", [])
    top_district_sev = top_district_obj.get("severity", "Critical")

    # Match primary resource to top district's explicit need if possible
    primary_resource = None
    if top_district_needs:
        for need in top_district_needs:
            for avail in available_resources:
                if need.lower() in avail.lower() or avail.lower() in need.lower():
                    primary_resource = avail
                    break
            if primary_resource:
                break

    if not primary_resource:
        primary_resource = available_resources[0] if available_resources else "Supplies"

    # Identify highlighted amount for the primary resource in the top district
    suggested_amount = 0
    if top_district_name in balanced_proposal and primary_resource in balanced_proposal[top_district_name]:
        suggested_amount = balanced_proposal[top_district_name][primary_resource]
    else:
        # If proposal is keyed by agent names, find the highest allocation for this resource
        for entity_alloc in balanced_proposal.values():
            if isinstance(entity_alloc, dict) and primary_resource in entity_alloc:
                suggested_amount = max(suggested_amount, entity_alloc[primary_resource])

    if suggested_amount == 0 and primary_resource in res_quantities:
        suggested_amount = max(1, int(res_quantities[primary_resource] * 0.4))

    # 3. Determine recommended action
    if current_round >= max(2, max_rounds - 1) and current_proposal:
        default_action = "Accept Offer"
    elif current_proposal:
        default_action = "Counter Offer"
    else:
        default_action = "Offer"

    # 4. Extract and analyze recent agent communication
    # Group turns to find the latest turn and objections for each agent
    latest_agent_turns = {}
    for turn in history:
        agent_name = turn.get("agent", "")
        if agent_name and agent_name != "Human Participant":
            latest_agent_turns[agent_name] = turn

    communication_lines = []
    agent_objections = []
    for agent_name, turn in latest_agent_turns.items():
        act = turn.get("action", "")
        msg = turn.get("message", "").strip()
        # Keep up to 350 chars of the actual speech
        msg_preview = (msg[:350] + "...") if len(msg) > 350 else msg
        communication_lines.append(f"- {agent_name} [{act}]: \"{msg_preview}\"")
        if act == "COUNTER" or "cannot" in msg.lower() or "reject" in msg.lower() or "need" in msg.lower():
            agent_objections.append(f"{agent_name} voiced concern in their latest counter")

    history_str = "\n".join(communication_lines) if communication_lines else "Round 1 opening: No prior agent statements recorded yet."

    # 5. Format regional priorities and requirements
    regional_priorities_lines = []
    for r in sorted_recipients:
        r_name = r.get("name", "Unknown")
        r_sev = r.get("severity", "Medium")
        r_pop = r.get("population", "N/A")
        r_needs = ", ".join(r.get("needs", [])) or "General emergency aid"
        regional_priorities_lines.append(
            f"- {r_name} | Severity: {r_sev.upper()} | Population: {r_pop} | Priority Needs: [{r_needs}]"
        )
    regions_str = "\n".join(regional_priorities_lines) if regional_priorities_lines else "No specific recipient regions specified."

    scenario_title = scenario.get("title", "Disaster Emergency Operation")

    # 6. Build high-quality default heuristic fallback
    secondary_district_name = sorted_recipients[1].get("name", "Central District") if len(sorted_recipients) > 1 else "other sectors"
    secondary_needs_str = ", ".join(sorted_recipients[1].get("needs", ["vital resources"])) if len(sorted_recipients) > 1 else "emergency relief"

    default_message = (
        f"Government Agent, NGO Agent, and District Administration: looking at our communication and the emergency map, "
        f"we must align our allocation strictly with regional urgency. Because {top_district_name} is under {top_district_sev} severity, "
        f"they receive priority with {suggested_amount} units of {primary_resource}, while {secondary_district_name} is protected with "
        f"dedicated {secondary_needs_str}. This resolves our deadlock and ensures every agency can operate effectively."
    )
    default_reasoning = (
        f"Directly answers recent agent counter-arguments by prioritizing critical supplies for {top_district_name} "
        f"({top_district_sev} severity) while guaranteeing adequate operational resources for {secondary_district_name}."
    )

    instruction = f"""
You are the Lead Crisis Operations Strategist advising the Human Incident Commander in an Emergency Operations Center.
The Human Commander is leading a high-stakes multi-agency negotiation for: {scenario_title}
Participating Agencies:
- Government Agent (National Emergency Authority: infrastructure safety, protocols, command order)
- NGO Agent (Humanitarian Relief Network: urgent medical aid, displaced persons, shelters)
- District Administration Agent (Municipal Emergency Office: local logistics, debris clearance, access routes)

CURRENT ROUND: {current_round} / {max_rounds}
AVAILABLE RESOURCE POOL (TOTAL ZERO-SUM BUDGET):
{json.dumps(res_quantities, indent=2)}

REGIONAL DISASTER PRIORITIES & SECTOR REQUIREMENTS:
{regions_str}

LATEST ROUNDTABLE COMMUNICATION (THE ACTUAL STATEMENTS & COUNTERS TO ADDRESS):
{history_str}

CURRENT ACTIVE PROPOSAL ON TABLE:
{json.dumps(current_proposal) if current_proposal else "None yet"}

RECOMMENDED ZERO-SUM COMPROMISE ALLOCATION (Strictly aligned with regional needs and previous communication):
{json.dumps(balanced_proposal, indent=2)}

YOUR MANDATE:
1. STRICTLY RESPECT THE PRIOR COMMUNICATION:
   - Your speech MUST directly address the Government Agent, NGO Agent, and District Administration Agent by name.
   - You MUST acknowledge and answer the specific counter-points, objections, or demands raised in their latest statements above.
2. STRICTLY RESPECT THE PRIORITIES OF EACH REGION:
   - Your speech and allocation MUST reflect the real emergency priorities on the ground.
   - Explicitly mention the affected sectors/regions (e.g. {top_district_name}, {secondary_district_name}) by name, citing their severity ({top_district_sev}) and urgent needs as the operational rationale.
3. IN-CHARACTER VOICE:
   - Speak as an authoritative, empathetic Incident Commander uniting the room to prevent disaster collapse.
   - Keep speech to 2-4 impactful, natural sentences.

Return ONLY valid JSON matching this exact structure:
{{
  "action": "{default_action}",
  "resource": "{primary_resource}",
  "amount": {suggested_amount},
  "message": "Spoken dialogue addressing Government, NGO, and District by name, responding to their recent communication while justifying resource allocation based on regional priorities and severity.",
  "reasoning": "1-2 sentence tactical explanation for the human commander showing how this move resolves agent friction and satisfies regional urgency.",
  "proposal": {json.dumps(balanced_proposal)}
}}
"""

    # 1. Try Groq
    if _groq_clients:
        for client in _groq_clients:
            try:
                response = client.chat.completions.create(
                    model=GROQ_MODEL,
                    messages=[{"role": "user", "content": instruction}],
                    response_format={"type": "json_object"},
                )
                text = (response.choices[0].message.content if response.choices else "") or ""
                parsed = _extract_json(text)
                if parsed and isinstance(parsed, dict) and parsed.get("message"):
                    return {
                        "action": parsed.get("action", default_action),
                        "resource": parsed.get("resource", primary_resource),
                        "amount": parsed.get("amount", suggested_amount),
                        "message": parsed.get("message", default_message),
                        "reasoning": parsed.get("reasoning", default_reasoning),
                        "proposal": parsed.get("proposal", balanced_proposal),
                    }
            except Exception as e:
                print(f"[SUGGESTION] Groq attempt failed: {e}")

    # 2. Try Gemini
    for client in _clients:
        try:
            response = client.models.generate_content(
                model="gemini-3.6-flash",
                contents=instruction,
            )
            text = getattr(response, "text", "") or ""
            parsed = _extract_json(text)
            if parsed and isinstance(parsed, dict) and parsed.get("message"):
                return {
                    "action": parsed.get("action", default_action),
                    "resource": parsed.get("resource", primary_resource),
                    "amount": parsed.get("amount", suggested_amount),
                    "message": parsed.get("message", default_message),
                    "reasoning": parsed.get("reasoning", default_reasoning),
                    "proposal": parsed.get("proposal", balanced_proposal),
                }
        except Exception as e:
            print(f"[SUGGESTION] Gemini attempt failed: {e}")

    # Fallback to calculated heuristic
    return {
        "action": default_action,
        "resource": primary_resource,
        "amount": suggested_amount,
        "message": default_message,
        "reasoning": default_reasoning,
        "proposal": balanced_proposal,
    }


