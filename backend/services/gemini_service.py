import os
import json
import re

from dotenv import load_dotenv
from google import genai

load_dotenv()

import itertools

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


# =========================================================
# ROLE-SPECIFIC FALLBACK WITH REALISTIC CONFLICT POSITIONS
# =========================================================

def _fallback_response(prompt, allowed_resources=None, agent_name=None,
                       resource_quantities=None, current_round=1, last_proposals=None):

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

    # Priority weights per role (0.0 = low priority, 1.0 = top priority)
    # Round 5 target weights (Exact 100% Zero-Sum Complementary Split):
    # - Rescue: Govt 45% + NGO 20% + Dist 35% = 100%
    # - Debris: Govt 40% + NGO 15% + Dist 45% = 100%
    # - Medical: Govt 25% + NGO 45% + Dist 30% = 100%
    # - Shelter: Govt 25% + NGO 45% + Dist 30% = 100%

    FINAL_TARGET_WEIGHTS = {
        "government": {"rescue": 0.45, "debris": 0.40, "medical": 0.25, "shelter": 0.25},
        "ngo":        {"rescue": 0.20, "debris": 0.15, "medical": 0.45, "shelter": 0.45},
        "district":   {"rescue": 0.35, "debris": 0.45, "medical": 0.30, "shelter": 0.30},
    }

    OPENING_EXTRA = {
        "government": {"rescue": 0.05, "debris": 0.05, "medical": 0.05, "shelter": 0.05},
        "ngo":        {"rescue": 0.05, "debris": 0.05, "medical": 0.05, "shelter": 0.05},
        "district":   {"rescue": 0.05, "debris": 0.05, "medical": 0.05, "shelter": 0.05},
    }

    target_weights = FINAL_TARGET_WEIGHTS.get(agent, {"rescue": 0.33, "debris": 0.33, "medical": 0.33, "shelter": 0.33})
    extra_weights = OPENING_EXTRA.get(agent, {"rescue": 0.05, "debris": 0.05, "medical": 0.05, "shelter": 0.05})

    # Linear convergence: Round 1 has 100% extra, Round 5 has 0% extra
    extra_ratio = max(0.0, (5 - current_round) / 4.0)

    def _get_weight(resource_name):
        name_lower = resource_name.lower()
        base_w = 0.33
        extra_w = 0.05
        for key in ["rescue", "debris", "medical", "shelter"]:
            if key in name_lower:
                base_w = target_weights.get(key, 0.33)
                extra_w = extra_weights.get(key, 0.05)
                break
        return base_w + (extra_w * extra_ratio)

    # Build proposal with role-specific allocations
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

    is_final_round = (current_round >= 5)

    action = "COUNTER"
    if is_final_round:
        action = "ACCEPT"
    elif current_round == 1:
        action = "OFFER"
    elif current_round == 2:
        action = "REJECT"

    if agent == "government":
        if is_final_round:
            message = (
                f"After 5 rounds of constructive negotiation, we have achieved full consensus. "
                f"I accept the final agreed allocation: {proposal_str}. "
                f"This secures 45% of Rescue Teams and 40% of Debris Clearance for national operations, "
                f"while fully supporting NGO medical clinics and District local infrastructure. We are ready to deploy."
            )
            reasoning = "Final consensus reached: Government's core rescue and transit mandates are fully secured alongside partners' needs."
            stance = "accept"
            action = "ACCEPT"
        elif current_round == 1:
            message = (
                f"As the Government authority leading national disaster management, our top priority is rapid search and rescue and main transit clearance. "
                f"Our opening proposal: {proposal_str}. "
                f"We are establishing a strong rescue baseline while keeping medical and shelter demands moderate for NGO and District teams."
            )
            reasoning = "Government establishing opening position prioritizing Rescue Teams and Debris Clearance."
            stance = "firm"
            action = "OFFER"
        elif current_round == 2:
            message = (
                f"While I acknowledge the District's local concerns and the NGO's clinical needs, I cannot accept the excessive heavy equipment claims from municipal partners. "
                f"Claiming high clearance capacity creates an immediate deficit on arterial highway routes. I reject this allocation and counter-propose: {proposal_str}. "
                f"We must maintain national highway clearing authority."
            )
            reasoning = "Round 2 firm pushback against disproportionate local heavy equipment claims while proposing workable limits."
            stance = "firm"
            action = "REJECT"
        else:
            message = (
                f"I have reviewed the partners' latest counter-proposals and am offering measured concessions. "
                f"My revised counter-proposal: {proposal_str}. "
                f"I am reducing our secondary shelter and medical demands to ensure the NGO has sufficient triage supplies and the District has local clearance capacity."
            )
            reasoning = f"Round {current_round} strategic concession while maintaining core search and rescue priorities."
            stance = "moderate"
            action = "COUNTER"

    elif agent == "ngo":
        if is_final_round:
            message = (
                f"The NGO fully accepts and endorses this final allocation: {proposal_str}. "
                f"Securing 45% of Medical Aid and 45% of Temporary Shelters gives our field clinics and relief teams the resources to save lives and shelter displaced families, "
                f"while respecting Government rescue command and District road clearance. All partners have reached full agreement."
            )
            reasoning = "Final consensus reached: NGO's primary humanitarian mandate for medical aid and shelters is successfully fulfilled."
            stance = "accept"
            action = "ACCEPT"
        elif current_round == 1:
            message = (
                f"The NGO's frontline humanitarian mission focuses on immediate medical triage and temporary shelters for displaced families. "
                f"Our opening proposal: {proposal_str}. "
                f"We are requesting a fair majority share of Medical Aid and Shelters while conceding heavy equipment to Government and District authorities."
            )
            reasoning = "NGO opening position prioritizing Medical Aid and Temporary Shelters for civilian casualties."
            stance = "firm"
            action = "OFFER"
        elif current_round == 2:
            message = (
                f"I cannot accept the Government's initial proposal that restricts frontline medical aid to minimal quantities when hundreds of injured civilians require urgent care. "
                f"Frontline trauma centers cannot operate without sufficient supplies. I reject that reduction and counter-propose: {proposal_str}, "
                f"conceding heavy equipment to Government and District teams in exchange for essential clinical supplies."
            )
            reasoning = "Round 2 firm rejection of insufficient clinical allocations with targeted counter-proposal."
            stance = "firm"
            action = "REJECT"
        else:
            message = (
                f"The NGO appreciates the movement from government and municipal authorities. "
                f"Our counter-proposal for Round {current_round}: {proposal_str}. "
                f"We are making further concessions on heavy equipment and rescue support in exchange for protecting frontline medical supplies."
            )
            reasoning = f"Round {current_round} constructive trade-off to converge toward joint consensus."
            stance = "strategic"
            action = "COUNTER"

    else:  # district
        if is_final_round:
            message = (
                f"The District Administration confirms full agreement with this final distribution: {proposal_str}. "
                f"With 45% of Debris Clearance dedicated to local transit arteries and 35% of Rescue Teams for municipal response, "
                f"all supply routes and distribution hubs are secured to support NGO field clinics and federal teams. Consensus is achieved."
            )
            reasoning = "Final consensus reached: District logistics baseline and municipal response capacity are guaranteed."
            stance = "accept"
            action = "ACCEPT"
        elif current_round == 1:
            message = (
                f"The District Administration's priority is clearing local road networks and coordinating municipal relief operations. "
                f"Our opening proposal: {proposal_str}. "
                f"Without cleared roads, no relief aid can move. We demand a strong clearance baseline while balancing clinical and rescue shares."
            )
            reasoning = "District opening position defending Debris Clearance as the operational foundation."
            stance = "firm"
            action = "OFFER"
        elif current_round == 2:
            message = (
                f"I acknowledge the Government's national rescue command and the NGO's clinical priorities, but we cannot accept being left without local route clearing machinery. "
                f"To bridge the gap between arterial highways and neighborhood triage sites, I counter-propose: {proposal_str}, "
                f"offering concessions on temporary shelters and medical aid to maintain local access."
            )
            reasoning = "Round 2 municipal adjustment defending local feeder road clearance with constructive trade-offs."
            stance = "strategic"
            action = "COUNTER"
        else:
            message = (
                f"I acknowledge the constructive concessions from both the Government and NGO. "
                f"My revised proposal for Round {current_round}: {proposal_str}. "
                f"We are refining our local allocations to ensure all three agencies reach an equitable, workable solution."
            )
            reasoning = f"Round {current_round} municipal adjustment balancing clearance with partner needs."
            stance = "strategic"
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
    agent_names = agent_names or [agent_name or "Current Agent"]
    allocation_format = "\n".join(
        f"  {name} Allocation: <each scenario resource>: N units"
        for name in agent_names
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

    instruction = f"""
You are a participant in a MULTI-ROUND DISASTER-RELIEF RESOURCE NEGOTIATION.
The goal is to reach a REAL AGREEMENT through genuine conflict and compromise.
{budget_str}
CURRENT AGENT: {current_agent.upper()}
CURRENT ROUND: {current_round}
LATEST INCOMING PROPOSAL BEING EVALUATED:
{incoming_proposal_str}

YOUR ROLE AND NEGOTIATION POSITION:
{role_instruction}

{other_proposals_str}

FULL NEGOTIATION CONTEXT AND HISTORY:
{prompt}

=== YOUR TASK ===

Evaluate the LATEST INCOMING PROPOSAL against your own objectives. Decide
independently whether to ACCEPT, COUNTER, or REJECT it. Do not choose an
action because of the round number, and do not automatically accept in a
final round. If you COUNTER, include a concrete proposal using only the
scenario resources and explain the concessions and trade-offs.

=== CRITICAL RULES ===

1. Include EXPLICIT numbers for EVERY resource: "Resource Name: N units"
2. Quantities MUST NOT exceed the available amounts shown in the context
3. Your proposal must reflect REAL TRADE-OFFS
4. Reference specific numbers from the incoming proposal and full history.
5. Protect high-priority objectives, but concede lower-priority resources when that improves agreement.
6. Use only the resource names defined in the current scenario; never invent resources.
7. Never exceed any available quantity shown in the context.
8. An ACCEPT response must accept the incoming proposal, not a newly invented proposal.
9. For an OFFER or COUNTER, provide the complete allocation for every configured agent,
   not aggregate totals. Use these allocation sections:
{allocation_format}
10. The sum of each resource across all agent sections must equal its available quantity.

Return ONLY valid JSON:

{{
  "action": "OFFER|REJECT|COUNTER|ACCEPT",
  "message": "Your assertive negotiation message with specific numbers for EVERY resource, referencing other proposals and explaining your trade-offs",
  "reasoning": "Why you are taking this position and what you are willing/unwilling to concede",
  "stance": "firm|moderate|conceding|strategic|accept"
}}
"""

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

                response = client.models.generate_content(
                    model=model_name,
                    contents=instruction
                )

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
                result = _extract_json(text)

                if result:
                    print("[GEMINI] parsing=success")

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

                    action = str(
                        result.get(
                            "action",
                            "COUNTER"
                        )
                    ).strip().upper()
                    print(f"[GEMINI] parsed_action={action}")

                    if message:
                        print(f"[GEMINI] extracted_message={message}")
                        entries = re.findall(
                        r"([A-Za-z][A-Za-z0-9\s&/-]*)\s*:\s*(\d+)\s*(?:units?|qty\.?|quantity)?",
                        message,
                        re.IGNORECASE,
                    )
                        print(
                            "[GEMINI] extracted_proposal="
                            + str({name.strip(): int(quantity) for name, quantity in entries})
                        )
                        is_valid = _validate_response_resources(
                            message,
                            allowed_resources,
                            resource_quantities
                        )

                        if is_valid:
                            print(f"[GEMINI] key {client_index} succeeded")
                            print(f"[GEMINI] extracted_proposal=validated_from_message")
                            return {
                                "action": action,
                                "message": message,
                                "reasoning": reasoning,
                                "stance": stance
                            }
                        last_failure = _validation_failure_reason(
                            message,
                            allowed_resources,
                            resource_quantities,
                        )
                        print(f"[GEMINI] key {client_index} failed: {last_failure}")
                    else:
                        last_failure = "schema validation failure: missing message"
                        print(f"[GEMINI] key {client_index} failed: {last_failure}")
                else:
                    last_failure = "invalid JSON"
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
