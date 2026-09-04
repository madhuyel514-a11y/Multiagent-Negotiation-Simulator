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
    Shows what each agent said and proposed so agents can respond realistically.
    """
    if not history:
        return "No previous messages in this negotiation — this is Round 1. Make the opening offer."

    lines = []
    for entry in history:
        agent = entry.get("agent", "Unknown Agent")
        message = entry.get("message", "")
        round_num = entry.get("round", "?")
        action = entry.get("action", "")
        speech = entry.get("speech", "")
        proposal = entry.get("parsed_proposal", {})

        # Prefer the rich speech text if available
        display_text = speech if speech else message

        lines.append(f"Round {round_num} - {agent} [{action}]: {display_text}")
        if proposal and isinstance(proposal, dict) and not any(isinstance(v, dict) for v in proposal.values()):
            prop_str = "; ".join(f"{r}: {q} units" for r, q in proposal.items())
            lines.append(f"  └─ {agent}'s proposal for themselves: {prop_str}")

    return "\n".join(lines)


def _format_other_proposals(last_proposals, current_agent_name):
    """
    Format what other agents have most recently proposed for THEMSELVES,
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

    lines = ["OTHER AGENTS' CURRENT RESOURCE REQUESTS (reference these specifically when you agree or disagree):"]
    for agent_name, props in others.items():
        if isinstance(props, dict):
            prop_str = "; ".join(f"{r}: {q} units" for r, q in props.items())
            lines.append(f"  {agent_name} is requesting: {prop_str}")
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
    current_proposal=None,
    current_round=1,
):
    """
    Builds the LLM prompt for a single agent to speak naturally in its own voice.

    CRITICAL: Each agent proposes only THEIR OWN resource allocation — what THEY
    need for their own operations. They do NOT speak for or allocate resources to
    other agents. Real negotiation happens through each agent defending their own
    position, referencing what others have asked for, and making trade-offs.
    """

    resources_formatted, allowed_resources = _format_resources(resources)
    history_formatted = _format_history(history)

    # Create strict resource list for validation
    resource_list = ", ".join([f"'{r}'" for r in allowed_resources])

    # Total budget constraint
    if total_budget:
        budget_section = f"""
TOTAL RESOURCE POOL: {total_budget} units combined across ALL agents.
This is a ZERO-SUM negotiation — the more you request, the less the other agents get.
Every unit you gain means less for others, so justify why YOU need that quantity.
Make real trade-offs: concede lower-priority resources to secure your top priorities.
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

React to these proposals in your speech — agree, disagree, or propose a compromise.
--------------------------------------------------
"""

    current_proposal = current_proposal or {}
    incoming_proposal = (
        "; ".join(
            f"{resource}: {quantity} units"
            for resource, quantity in current_proposal.items()
        )
        if current_proposal
        else "No incoming proposal yet — make your opening offer."
    )

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

CURRENT ROUND: {current_round}

LATEST INCOMING PROPOSAL ON THE TABLE:
{incoming_proposal}

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
- You are proposing YOUR OWN share — what YOUR operations need
- Your proposal must show REAL TRADE-OFFS — you cannot have maximum of everything
- Do NOT demand more than 45% of ANY single resource
- Start close to a fair 33% split, leaning higher (up to 45%) only for your top priorities

--------------------------------------------------

Conversation History:

{history_formatted}

--------------------------------------------------
{other_proposals_section}
INSTRUCTIONS FOR YOUR NEXT DECISION:

You are speaking as {persona['name']} in this negotiation. You speak ONLY for yourself.

FUNDAMENTAL RULE: You ONLY propose what YOUR operations need. You do NOT dictate what
other agents should receive. The other agents speak for themselves.

You MUST:
1. Decide whether to ACCEPT, COUNTER, or REJECT the current proposal on the table.
2. Speak in first person — use "I", "we", "our operations need", "our team requires".
3. Reference specific numbers from other agents' proposals when agreeing or disagreeing.
4. If countering: state what YOU are requesting for yourself and WHY your operations require it.
5. Make real trade-offs: explicitly say what you are giving up in exchange for something you need.
6. Consider the full conversation history; do not respond in isolation.
7. Use ONLY resource names from the allowed list: {resource_list}
8. Include concrete numerical quantities and never exceed available amounts.

You MUST NOT:
1. Propose allocations for OTHER agents — they speak for themselves
2. Say "I propose Government gets X, NGO gets Y, District gets Z" — this is WRONG
3. Simply "appreciate" every proposal without disagreement
4. Propose identical numbers to the previous round without justification
5. Invent or mention resources not in the allowed list
6. Propose quantities exceeding available amounts
7. Be vague — always use specific numbers

GOOD EXAMPLE of what your speech should look like:
"We agree that rescue operations are urgent, but 200 medicine units are insufficient for
the number of injured people. We propose increasing our medicine allocation to 300 units
and request at least 250 food units for our shelters. We can reduce our rescue team
request from 8 to 6 to accommodate the government's operational needs."

BAD EXAMPLE (DO NOT DO THIS):
"Government Agent: Rescue Teams: 20 units. NGO Agent: Medical Aid: 150 units. District: ..."

Return ONLY valid JSON.

Format:

{{
    "agent": "{persona['name']}",
    "speech": "Your natural-language dialogue paragraph — what you actually SAY in the negotiation. Must be conversational, first-person, reference other agents by name, make real arguments, state trade-offs explicitly.",
    "offer": {{
        "proposal": "Your specific resource request for YOUR OWN operations only — concrete quantities for each resource you need"
    }},
    "reason": "Your internal reasoning — what you disagree with, what you are conceding, and why",
    "accept": false
}}
"""

    return prompt