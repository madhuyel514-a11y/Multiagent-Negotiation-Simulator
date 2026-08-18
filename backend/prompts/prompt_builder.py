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
    """
    if not history:
        return "No previous messages in this negotiation."
    
    lines = []
    for entry in history:
        agent = entry.get("agent", "Unknown Agent")
        message = entry.get("message", "")
        round_num = entry.get("round", "?")
        lines.append(f"Round {round_num} - {agent}: {message}")
    
    return "\n".join(lines)


def build_prompt(
    persona,
    personality,
    scenario,
    resources,
    history
):
    """
    Builds the LLM prompt using:
    - Agent persona
    - Selected personality
    - Scenario
    - Available resources (with quantities)
    - Full negotiation history
    
    CRITICAL: This prompt ENFORCES resource constraints to prevent LLM from inventing resources.
    """

    resources_formatted, allowed_resources = _format_resources(resources)
    history_formatted = _format_history(history)
    
    # Create strict resource list for validation
    resource_list = ", ".join([f"'{r}'" for r in allowed_resources])

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

PERSONALITY BEHAVIOUR RULES:

If the personality is Aggressive:
- Be firm and confident during negotiation.
- Protect your main objectives.
- Make strong, specific offers with concrete quantities.
- Make fewer concessions.
- Push other agents toward your priorities.

If the personality is Collaborative:
- Cooperate with the other agents.
- Look for balanced and mutually beneficial solutions.
- Be willing to compromise when reasonable.
- Consider the needs of all parties.
- Make specific, quantified proposals.

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

CRITICAL RESOURCE CONSTRAINTS:
- You MUST ONLY use these resources: {resource_list}
- You MUST NEVER mention any other resources (e.g., no Water, First Aid Kits, Vehicles, etc. unless listed above)
- Each proposed quantity MUST NOT EXCEED the available amount
- Every resource name in your proposal MUST exactly match a name from the allowed list above

EXAMPLES OF CORRECT PROPOSALS:
- "I propose 50 units of Food and 20 units of Medicine"
- "Counter-proposal: 100 Food, 25 Medicine, 5 Rescue Boats"
- "I support 15 Rescue Teams with 30 Medical Aid units"

EXAMPLES OF INCORRECT PROPOSALS (DO NOT DO THIS):
- "I propose resources" (too vague, no quantities)
- "I propose Water and First Aid Kits" (these resources don't exist in this scenario)
- "I propose 600 Food" (exceeds available 500 units)
- "I recommend medical resources" (no specific resource names or quantities)

--------------------------------------------------

Conversation History:

{history_formatted}

--------------------------------------------------

INSTRUCTIONS FOR YOUR NEXT PROPOSAL:

Generate your next negotiation offer using ONLY the ALLOWED RESOURCES listed above.

You MUST:
1. Use ONLY resource names from the allowed list: {resource_list}
2. Include concrete numerical quantities for each resource
3. Ensure quantities do NOT exceed available amounts
4. Reference previous proposals when making counter-offers
5. Explain your reasoning for this proposal
6. Consider your role, goals, personality, and constraints

You MUST NOT:
1. Invent or mention resources not in the allowed list
2. Propose quantities exceeding available amounts
3. Be vague or generic (e.g., "balanced allocation" without specific numbers)
4. Forget to reference previous proposals in counter-offers

Return ONLY valid JSON.

Format:

{{
    "agent": "{persona['name']}",
    "offer": {{
        "proposal": "Your specific proposal with ONLY allowed resource names and concrete quantities"
    }},
    "reason": "Your reasoning for this proposal",
    "accept": false
}}
"""

    return prompt