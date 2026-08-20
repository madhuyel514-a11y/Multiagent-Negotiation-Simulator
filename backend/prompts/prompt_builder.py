def _format_resources(resources):
    """
    Format resources for the prompt. Handles both:
    - List of resource names: ['Food', 'Medicine']
    - Dict with quantities: {'Food': 100, 'Medicine': 50}

    Returns both a readable list AND the strict list of allowed resource names.
    """
    allowed_resources = []
    lines = []

    if isinstance(resources, dict):
        for name, quantity in resources.items():
            lines.append(f"  - {name}: {quantity} units available")
            allowed_resources.append(name)
        return "\n".join(lines), allowed_resources
    elif isinstance(resources, list):
        for r in resources:
            lines.append(f"  - {r}")
            allowed_resources.append(r)
        return "\n".join(lines), allowed_resources
    else:
        return str(resources), []


def _format_history(history):
    """
    Format negotiation history for the prompt.
    Shows numerical proposals clearly so agents can reference specific numbers.
    """
    if not history:
        return "No previous messages in this negotiation — this is Round 1."

    lines = []
    for entry in history:
        agent = entry.get("agent", "Unknown Agent")
        message = entry.get("message", "")
        round_num = entry.get("round", "?")
        stance = entry.get("stance", "")
        stance_tag = f" [{stance.upper()}]" if stance and stance != "human" else ""
        lines.append(f"Round {round_num} - {agent}{stance_tag}: {message}")

    return "\n".join(lines)


def _format_other_proposals(last_proposals, current_agent_name):
    """
    Format what other agents have most recently proposed,
    so the current agent can reference specific numbers and disagree.
    """
    if not last_proposals:
        return ""

    others = {
        k: v for k, v in last_proposals.items()
        if current_agent_name and current_agent_name.lower() not in k.lower()
    }

    if not others:
        return ""

    lines = ["OTHER AGENTS' CURRENT PROPOSALS (reference these specifically when you agree or disagree):"]
    for agent_name, props in others.items():
        if isinstance(props, dict):
            prop_str = "; ".join(f"{r}: {q} units" for r, q in props.items())
            lines.append(f"  {agent_name}: {prop_str}")
        else:
            lines.append(f"  {agent_name}: {props}")

    return "\n".join(lines)


def build_prompt(
    persona,
    personality,
    scenario,
    resources,
    history,
    total_budget=None,
    last_proposals=None,
):
    """
    Builds the LLM prompt using:
    - Agent persona with conflict-oriented position
    - Selected personality
    - Scenario
    - Available resources (with quantities)
    - Full negotiation history
    - Total budget constraint
    - Other agents' last proposals (for cross-referencing)

    CRITICAL: This prompt ENFORCES resource constraints AND conflict
    to make negotiations feel like real goal-driven negotiations.
    """

    resources_formatted, allowed_resources = _format_resources(resources)
    history_formatted = _format_history(history)

    # Create strict resource list for validation
    resource_list = ", ".join([f"'{r}'" for r in allowed_resources])

    # Total budget constraint
    if total_budget:
        budget_section = f"""
TOTAL RESOURCE POOL: {total_budget} units combined.
This is a ZERO-SUM negotiation — you CANNOT propose maximum amounts for all resources.
Every unit you gain in one resource means less for another.
Your proposal MUST reflect genuine trade-offs based on your priorities.
"""
    else:
        budget_section = ""

    # Other agents' proposals section
    agent_name = persona.get("name", "")
    other_proposals_section = ""
    if last_proposals:
        formatted = _format_other_proposals(last_proposals, agent_name)
        if formatted:
            other_proposals_section = f"""
--------------------------------------------------

{formatted}

--------------------------------------------------
"""

    # Role-specific conflict position (Adjusted for FAIRNESS per user request)
    CONFLICT_POSITIONS = {
        "Government Agent": {
            "top_priority": "A fair share of Rescue Teams and Debris Clearance (approx 35-45%)",
            "concede": "Medical Aid (take no more than 30%)",
            "hold_firm": "Balanced distribution",
        },
        "NGO Agent": {
            "top_priority": "A fair share of Medical Aid and Temporary Shelters (approx 35-45%)",
            "concede": "Debris Clearance (take no more than 30%)",
            "hold_firm": "Balanced distribution",
        },
        "District Administration Agent": {
            "top_priority": "A fair share of Debris Clearance and Rescue Teams (approx 35-45%)",
            "concede": "Medical Aid (take no more than 30%)",
            "hold_firm": "Balanced distribution",
        },
    }

    conflict_pos = CONFLICT_POSITIONS.get(agent_name, {})
    conflict_section = ""
    if conflict_pos:
        conflict_section = f"""
YOUR CONFLICT POSITION:
- Top Priority (fight for this): {conflict_pos.get("top_priority", "")}
- Willing to Concede: {conflict_pos.get("concede", "")}
- Hold Firm On: {conflict_pos.get("hold_firm", "")}
"""

    prompt = f"""
You are {persona['name']}.

Role:
{persona['role']}

Goal:
{persona['goal']}

Priority:
{", ".join(persona['priority'])}

Constraints:
{", ".join(persona['constraints'])}

Selected Personality:
{personality}

Negotiation Style:
{persona['negotiation_style']}
{conflict_section}

PERSONALITY BEHAVIOUR RULES:

If the personality is Aggressive:
- Be firm and confident during negotiation.
- Protect your main objectives aggressively.
- Make strong, specific offers with concrete quantities.
- Make very few concessions — only when absolutely necessary.
- Push other agents toward your priorities with forceful arguments.

If the personality is Collaborative:
- Cooperate BUT still defend your core priorities.
- Look for balanced and mutually beneficial solutions.
- Be willing to compromise on SECONDARY resources only.
- Never give away your top priority resource without something in return.

If the personality is Risk-Averse:
- Prioritize safety and emergency preparedness.
- Avoid committing too many resources at once.
- Maintain reasonable emergency reserves.
- Make conservative, specific decisions about quantities.

The selected personality MUST influence your negotiation
decisions, offer amounts, reasoning, and willingness to accept
or reject proposals.

--------------------------------------------------

Current Scenario:

{scenario}

--------------------------------------------------

ALLOWED RESOURCES (ONLY these resources exist):

{resources_formatted}
{budget_section}
CRITICAL RESOURCE CONSTRAINTS:
- You MUST ONLY use these resources: {resource_list}
- You MUST NEVER mention any other resources
- Each proposed quantity MUST NOT EXCEED the available amount
- Every resource name in your proposal MUST exactly match a name from the allowed list above
- Your proposal must show REAL TRADE-OFFS — you cannot have maximum of everything
- STRIVE FOR A FAIR NEGOTIATION: Do NOT demand more than 45% of ANY single resource. Start close to an even 33% split for all resources, only leaning slightly higher (up to 45%) for your top priorities.

--------------------------------------------------

Conversation History:

{history_formatted}

--------------------------------------------------
{other_proposals_section}
INSTRUCTIONS FOR YOUR NEXT PROPOSAL:

Generate your next negotiation offer. Make it feel like a REAL negotiation:

You MUST:
1. Use ONLY resource names from the allowed list: {resource_list}
2. Include concrete numerical quantities for each resource
3. Ensure quantities do NOT exceed available amounts
4. DISAGREE with proposals that conflict with your priorities — explain why
5. Reference other agents' specific numbers when arguing against them
6. Make a genuine counter-proposal that reflects your priorities
7. Show real trade-offs: what you are giving up and what you need in return
8. Use assertive language: "I cannot accept...", "I insist on...", "I disagree because..."

You MUST NOT:
1. Simply "appreciate" every proposal without disagreement
2. Propose identical or very similar numbers to the previous round without justification
3. Invent or mention resources not in the allowed list
4. Propose quantities exceeding available amounts
5. Be vague — always use specific numbers

Return ONLY valid JSON.

Format:

{{
    "agent": "{persona['name']}",
    "offer": {{
        "proposal": "Your specific proposal with ONLY allowed resource names and concrete quantities"
    }},
    "reason": "Your reasoning — what you disagree with, what you are conceding, and why",
    "accept": false
}}
"""

    return prompt