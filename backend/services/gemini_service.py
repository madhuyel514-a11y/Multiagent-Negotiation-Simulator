import os
import json
import re

from dotenv import load_dotenv
from google import genai

load_dotenv()

import itertools

API_KEY = os.getenv("GEMINI_API_KEY")
API_KEYS_STR = os.getenv("GEMINI_API_KEYS")

_clients = []

keys = []
if API_KEYS_STR:
    keys = [k.strip() for k in API_KEYS_STR.split(",") if k.strip()]
elif API_KEY:
    keys = [API_KEY.strip()]

for key in keys:
    try:
        _clients.append(genai.Client(api_key=key))
    except Exception as exc:
        print(f"Gemini initialization failed for key {key[:4]}...:", exc)

_client_cycle = itertools.cycle(_clients) if _clients else None

def get_client():
    return next(_client_cycle) if _client_cycle else None


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
    ROLE_WEIGHTS = {
        "government": {
            "rescue": 0.90,    # Top priority: rescue operations
            "debris": 0.80,    # High: infrastructure access
            "medical": 0.50,   # Medium: NGO handles this better
            "shelter": 0.30,   # Low: district manages shelters
        },
        "ngo": {
            "rescue": 0.50,    # Medium: need some for own operations
            "debris": 0.25,    # Low: government/district handles this
            "medical": 0.95,   # Top priority: humanitarian care
            "shelter": 0.85,   # High: displaced families need shelter
        },
        "district": {
            "rescue": 0.75,    # High: local rescue coordination
            "debris": 0.95,    # Top priority: clear roads first
            "medical": 0.35,   # Low: state medical teams incoming
            "shelter": 0.55,   # Medium: manage local camps
        },
    }

    weights = ROLE_WEIGHTS.get(agent, {r: 0.6 for r in allowed_resources})

    def _get_weight(resource_name):
        name_lower = resource_name.lower()
        for key, w in weights.items():
            if key in name_lower:
                return w
        return 0.55  # default moderate weight

    # Build proposal with role-specific allocations
    message_parts = []
    for resource in allowed_resources:
        available = resource_quantities.get(resource.lower(), 0)
        if available == 0:
            message_parts.append(f"{resource}: 0 units")
            continue

        w = _get_weight(resource)

        # Round 1: assert your opening position strongly
        # Later rounds: concede a little based on pressure
        if current_round == 1:
            quantity = max(1, int(available * w))
        elif current_round == 2:
            quantity = max(1, int(available * max(w - 0.10, 0.20)))
        else:
            quantity = max(1, int(available * max(w - 0.18, 0.15)))

        message_parts.append(f"{resource}: {quantity} units")

    proposal_str = "; ".join(message_parts)

    # Build other-agent reference for counter-arguments
    other_ref = ""
    if last_proposals:
        others = {k: v for k, v in last_proposals.items()
                  if agent_name and agent_name.lower() not in k.lower()}
        if others:
            other_ref = " Other agents have proposed different priorities, but "

    if agent == "government":
        if current_round == 1:
            message = (
                f"As the Government, our primary responsibility is immediate life-saving and "
                f"securing critical infrastructure. I am proposing: {proposal_str}. "
                f"Rescue Teams and Debris Clearance are non-negotiable for us — "
                f"without clearing access routes, no aid can reach anyone."
            )
            reasoning = (
                "Government must prioritize Rescue Teams and Debris Clearance to open "
                "access routes and save lives directly. Medical Aid is important but NGO "
                "is better positioned to manage it."
            )
            stance = "firm"
        else:
            message = (
                f"I hear the other proposals, but{other_ref}I cannot accept a drastic "
                f"reduction in Rescue Teams or Debris Clearance. My revised proposal: "
                f"{proposal_str}. I am willing to concede some Medical Aid to the NGO, "
                f"but Rescue operations must remain our top allocation."
            )
            reasoning = (
                "The Government is making a limited concession on Medical Aid "
                "while defending core Rescue and Debris priorities."
            )
            stance = "moderate"

    elif agent == "ngo":
        if current_round == 1:
            message = (
                f"The NGO's position is clear: Medical Aid and Temporary Shelters are "
                f"our absolute priorities. We have hundreds of injured civilians and "
                f"thousands of displaced families. My proposal: {proposal_str}. "
                f"I strongly disagree with any allocation that leaves Medical Aid under-resourced."
            )
            reasoning = (
                "Humanitarian principles demand that we prioritize the most vulnerable — "
                "injured civilians and displaced families. Medical Aid and Shelters are "
                "our non-negotiables."
            )
            stance = "firm"
        else:
            message = (
                f"I acknowledge the Government and District's need for Rescue and Debris resources, "
                f"but{other_ref}the current proposals are dangerously low on Medical Aid. "
                f"My counter-proposal: {proposal_str}. "
                f"I can concede some Debris Clearance, but Medical Aid must increase — "
                f"we have a humanitarian crisis on our hands."
            )
            reasoning = (
                "The NGO is willing to concede on Debris Clearance "
                "only if Medical Aid receives a meaningful increase."
            )
            stance = "strategic"

    else:  # district
        if current_round == 1:
            message = (
                f"The District Administration's position: Debris Clearance is the foundation "
                f"of our entire response. Without cleared roads, rescue teams cannot move, "
                f"medical aid cannot be delivered, and shelters cannot be supplied. "
                f"My proposal: {proposal_str}. "
                f"I insist on maximum Debris Clearance — everything else depends on it."
            )
            reasoning = (
                "District authorities know the local terrain. Debris Clearance is "
                "the operational prerequisite for every other resource to function. "
                "Without it, all other allocations are meaningless."
            )
            stance = "firm"
        else:
            message = (
                f"I understand the NGO's concern for Medical Aid and the Government's "
                f"focus on Rescue Teams, but{other_ref}reducing Debris Clearance below "
                f"a functional level puts EVERYONE at risk. My revised offer: {proposal_str}. "
                f"I can reduce my Rescue Team request slightly, but Debris Clearance "
                f"stays high — that is the District's firm requirement."
            )
            reasoning = (
                "The District is making a limited concession on Rescue Teams "
                "but holding firm on Debris Clearance as the operational priority."
            )
            stance = "strategic"

    return {
        "message": message,
        "reasoning": reasoning,
        "stance": stance
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

    client = get_client()
    if client is None:
        return _fallback_response(
            prompt, allowed_resources,
            agent_name=current_agent,
            resource_quantities=resource_quantities,
            current_round=current_round,
            last_proposals=last_proposals,
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

    # -----------------------------------------------------
    # Role-specific instructions with distinct conflict positions
    # -----------------------------------------------------

    role_instruction = {
        "government": f"""
You are the GOVERNMENT AGENT negotiating on behalf of the national disaster management authority.
This is Round {current_round} of the negotiation.

YOUR PRIORITIES (in order):
1. Rescue Teams — NON-NEGOTIABLE TOP PRIORITY. You need maximum rescue capacity.
2. Debris Clearance Equipment — HIGH PRIORITY. Critical for infrastructure access.
3. Medical Aid — MEDIUM. You acknowledge NGO handles this, but you need a share.
4. Temporary Shelters — LOW. District Administration manages these better.

YOUR OPENING POSITION STRATEGY:
- In Round 1: Assert strongly — demand a large share of Rescue Teams and Debris Clearance.
- In Round 2+: Push back on NGO taking too much. Concede a little Medical Aid but defend Rescue Teams.
- If another agent proposes too few Rescue Teams: say "I CANNOT accept only X Rescue Teams when we have Y missing persons."

YOUR CONFLICT TRIGGERS (push back hard when these happen):
- If NGO proposes < 30% of Rescue Teams for Government → object strongly
- If District proposes > 50% of Debris Clearance → negotiate for a fair share
- If Medical Aid is over 60% of total → challenge that Rescue is being deprioritized

REMEMBER: A REAL NEGOTIATOR DISAGREES. You must argue, not just accept.
""",

        "ngo": f"""
You are the NGO AGENT representing humanitarian organizations with people on the ground.
This is Round {current_round} of the negotiation.

YOUR PRIORITIES (in order):
1. Medical Aid — NON-NEGOTIABLE TOP PRIORITY. You have 300+ injured civilians waiting.
2. Temporary Shelters — HIGH PRIORITY. Thousands of displaced families need shelter NOW.
3. Rescue Teams — MEDIUM. You need some for humanitarian extractions.
4. Debris Clearance Equipment — LOW. Government and district can cover this.

YOUR OPENING POSITION STRATEGY:
- In Round 1: Demand maximum Medical Aid. Make the humanitarian case passionately.
- In Round 2+: Refuse to accept Medical Aid cuts. Offer to concede Debris Clearance in exchange.
- If another agent proposes too little Medical Aid: say "The NGO CANNOT accept only X Medical Aid — we have 300 injured civilians and zero medical infrastructure."

YOUR CONFLICT TRIGGERS (push back hard when these happen):
- If Medical Aid drops below 50% of maximum → challenge it aggressively
- If Temporary Shelters is 0 when quantities are available → object strongly
- If Government takes too much Medical Aid → argue they should focus on Rescue instead

REMEMBER: Vulnerable people are dying. USE EMOTIONAL, URGENT language. Disagree when your priorities are threatened.
""",

        "district": f"""
You are the DISTRICT ADMINISTRATION AGENT representing the local district authority.
This is Round {current_round} of the negotiation.

YOUR PRIORITIES (in order):
1. Debris Clearance Equipment — NON-NEGOTIABLE TOP PRIORITY. Without clear roads, NOTHING works.
2. Rescue Teams — HIGH PRIORITY. You need local rescue capacity to coordinate response.
3. Temporary Shelters — MEDIUM. You manage the local shelter camps.
4. Medical Aid — LOW. State medical teams are incoming. NGO can handle this.

YOUR OPENING POSITION STRATEGY:
- In Round 1: Assert that Debris Clearance is the operational prerequisite for everything else.
- In Round 2+: Hold firm on Debris Clearance but negotiate on Rescue Teams vs. Shelters.
- If another agent proposes low Debris Clearance: say "Without sufficient Debris Clearance, I CANNOT GUARANTEE delivery of ANY resources to affected areas. This is a logistics reality."

YOUR CONFLICT TRIGGERS (push back hard when these happen):
- If Debris Clearance drops below 60% → object strongly with logistics argument
- If Government takes most Rescue Teams without sharing → demand a local share
- If NGO takes Shelters without operational planning → challenge implementation

REMEMBER: You are the PRACTICAL VOICE. Use logistics, infrastructure, and operational arguments. Disagree when Debris Clearance is threatened.
"""
    }.get(
        current_agent,
        f"You are a negotiation participant in Round {current_round}. Defend your position and make specific counter-proposals."
    )

    instruction = f"""
You are a participant in a MULTI-ROUND DISASTER-RELIEF RESOURCE NEGOTIATION.
The goal is to reach a REAL AGREEMENT through genuine conflict and compromise.
{budget_str}
CURRENT AGENT: {current_agent.upper()}
CURRENT ROUND: {current_round}

YOUR ROLE AND NEGOTIATION POSITION:
{role_instruction}

{other_proposals_str}

FULL NEGOTIATION CONTEXT AND HISTORY:
{prompt}

=== YOUR TASK FOR THIS ROUND ===

Step 1 — ANALYZE other agents' proposals above. Do you agree? What do you disagree with and why?
Step 2 — DEFEND your key priorities. Be assertive. If someone is taking too much of your priority resource, say so.
Step 3 — MAKE A SPECIFIC COUNTER-PROPOSAL with exact numbers for EVERY resource.
Step 4 — EXPLAIN your trade-offs: what are you giving up and what do you need in return?
Step 5 — Show your STANCE: are you firm, making a small concession, or at a compromise point?

=== CRITICAL RULES ===

1. Include EXPLICIT numbers for EVERY resource: "Resource Name: N units"
2. Quantities MUST NOT exceed the available amounts shown in the context
3. Your proposal must reflect REAL TRADE-OFFS — you CANNOT propose maximum of everything
4. Do NOT start with "I appreciate" — engage critically and assertively
5. Do NOT simply repeat the previous proposal — show movement or explain why you're holding firm
6. Use negotiation language: "I insist on...", "I cannot accept...", "I disagree...", "However, I am willing to concede..."
7. Reference specific numbers from other agents' proposals when you disagree or counter
8. *** MINIMUM FLOOR RULE ***: NEVER propose 0 units for any resource that has available quantity > 0.
   Every resource must receive AT LEAST 10% of its available amount in your proposal.
   Even your LOWEST priority resource deserves a minimum token allocation.
   Example: If Debris Clearance has 35 units available, your minimum proposal is at least 4 units.
   If Medical Aid has 30 available, minimum is at least 3 units.
   ZERO IS NOT A VALID PROPOSAL for any resource that exists.

=== GOOD EXAMPLE (all resources get non-zero allocations) ===
"The Government's proposal gives only 10 Medical Aid units while we have 300 injured civilians. That is unacceptable.
I counter-propose: Rescue Teams: 15 units; Medical Aid: 28 units; Temporary Shelters: 6 units; Debris Clearance Equipment: 8 units.
I am conceding Debris Clearance (giving it only 8 of 35 units) to address the District's concern, but Medical Aid must increase."

=== BAD EXAMPLE (NEVER DO THIS — zeroing out resources) ===
"NGO Agent: Rescue Teams: 5 units; Medical Aid: 30 units; Temporary Shelters: 0 units; Debris Clearance Equipment: 0 units."
← WRONG: Proposing 0 for available resources is not realistic negotiation.

Return ONLY valid JSON:

{{
  "message": "Your assertive negotiation message with specific numbers for EVERY resource, referencing other proposals and explaining your trade-offs",
  "reasoning": "Why you are taking this position and what you are willing/unwilling to concede",
  "stance": "firm|moderate|conceding|strategic"
}}
"""

    # -----------------------------------------------------
    # Try Gemini
    # -----------------------------------------------------

    models = [
        "gemini-3.6-flash"
    ]

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
                        resource_quantities
                    )

                    if is_valid:
                        return {
                            "message": message,
                            "reasoning": reasoning,
                            "stance": stance
                        }
                    else:
                        print(f"Response validation failed for {model_name}: invalid resource proposal")
                        # Fall through to fallback

        except Exception as exc:

            print(
                f"Gemini {model_name} failed:",
                exc
            )

    # -----------------------------------------------------
    # Guaranteed role-specific fallback with resources
    # -----------------------------------------------------

    return _fallback_response(
        prompt, allowed_resources,
        agent_name=current_agent,
        resource_quantities=resource_quantities,
        current_round=current_round,
        last_proposals=last_proposals,
    )
