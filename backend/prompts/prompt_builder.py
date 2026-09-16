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


def _format_history(history, window_size=6):
    """
    Format negotiation history for the prompt using dynamic history windowing.
    Keeps the last 4 to 6 turns (the current round and the immediate prior round),
    guaranteeing that every agent's latest stance, arguments, and point of view
    are fully represented while eliminating repetitive input tokens.
    """
    if not history:
        return "No previous messages in this negotiation — this is Round 1. Make the opening offer."

    lines = []
    if len(history) > window_size:
        omitted_count = len(history) - window_size
        window = history[-window_size:]
        lines.append(f"[Context note: Prior {omitted_count} turns summarized. Showing recent round context below:]")
    else:
        window = history

    for entry in window:
        agent = entry.get("agent", "Unknown Agent")
        message = entry.get("message", "")
        round_num = entry.get("round", "?")
        action = entry.get("action", "")
        speech = entry.get("speech", "")
        proposal = entry.get("parsed_proposal", {})

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
            if any(isinstance(v, dict) for v in props.values()):
                dist_parts = []
                for dist, r_map in props.items():
                    if isinstance(r_map, dict):
                        r_str = ", ".join(f"{r}: {q}" for r, q in r_map.items())
                        dist_parts.append(f"{dist} [{r_str}]")
                    else:
                        dist_parts.append(f"{dist}: {r_map}")
                lines.append(f"  {agent_name}: {'; '.join(dist_parts)}")
            else:
                prop_str = "; ".join(f"{r}: {q} units" for r, q in props.items())
                lines.append(f"  {agent_name} is requesting: {prop_str}")
        else:
            lines.append(f"  {agent_name}: {props}")

    return "\n".join(lines)


def _calculate_resource_balance(last_proposals, resources):
    """
    Compute live total requests vs available pool to show agents the real deficit/surplus.
    """
    if not isinstance(resources, dict) or not last_proposals:
        return ""

    lines = ["LIVE RESOURCE POOL BALANCE (across latest proposals):"]
    for res, total_avail in resources.items():
        total_requested = 0
        for ag, prop in last_proposals.items():
            if isinstance(prop, dict):
                if res in prop and isinstance(prop[res], (int, float)):
                    total_requested += prop[res]
                else:
                    for sub in prop.values():
                        if isinstance(sub, dict) and res in sub and isinstance(sub[res], (int, float)):
                            total_requested += sub[res]

        diff = total_avail - total_requested
        if diff < 0:
            lines.append(f"  - {res}: Requested {total_requested}/{total_avail} -> OVERBUDGET by {abs(diff)} units (concession required!)")
        elif diff == 0:
            lines.append(f"  - {res}: Requested {total_requested}/{total_avail} -> PERFECTLY BALANCED (100% utilized)")
        else:
            lines.append(f"  - {res}: Requested {total_requested}/{total_avail} -> {diff} units remaining available")

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
    max_rounds=5,
):
    """
    Builds the LLM prompt for a single agent to speak and negotiate dynamically.
    """

    resources_formatted, allowed_resources = _format_resources(resources)
    history_formatted = _format_history(history)
    resource_balance_str = _calculate_resource_balance(last_proposals, resources) if isinstance(resources, dict) else ""

    # Create strict resource list for validation
    resource_list = ", ".join([f"'{r}'" for r in allowed_resources])

    # Total budget constraint
    if total_budget:
        budget_section = f"""
TOTAL RESOURCE POOL: {total_budget} units combined across ALL agents.
This is a zero-sum crisis negotiation — each unit you gain means less for other life-saving operations.
"""
    else:
        budget_section = ""

    # Dynamic round stage strategy
    if current_round <= 1:
        round_strategy = """ROUND 1 STRATEGY: OPENING STAGE
- State your agency's core operational priorities and emergency needs clearly.
- Make a strong, justified opening offer. Do not concede too early in Round 1."""
    elif current_round < max_rounds:
        round_strategy = f"""ROUND {current_round}/{max_rounds} STRATEGY: ACTIVE NEGOTIATION & STRATEGIC TRADE-OFFS
- Scrutinize other agents' claims and the LIVE RESOURCE BALANCE.
- If resources are overbudget, propose a specific trade-off: give up units in lower-priority resources in exchange for what you critically need.
- If the current active proposal is fair, balanced, and meets your primary goal, consider choosing ACCEPT."""
    else:
        round_strategy = f"""ROUND {current_round}/{max_rounds} STRATEGY: FINAL CONVERGENCE ROUND (DEADLINE)
- THIS IS THE FINAL ROUND. If consensus is not reached now, the negotiation ends in a DEADLOCK failure.
- If your core operational priority is reasonably met (even with minor compromises on secondary items), choose ACCEPT to secure a unified disaster relief deployment.
- If you must COUNTER, ensure your proposal strictly fits within available limits and offers a realistic compromise."""

    # Other agents' proposals section
    agent_name = persona.get("name", "")
    other_proposals_section = ""
    if last_proposals:
        formatted = _format_other_proposals(last_proposals, agent_name)
        if formatted:
            other_proposals_section = f"""
--------------------------------------------------

{formatted}
{resource_balance_str}

React to these numbers directly in your speech — agree, challenge, or offer compromises.
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

CURRENT ROUND: {current_round} of {max_rounds}
{round_strategy}

LATEST INCOMING PROPOSAL ON THE TABLE:
{incoming_proposal}

PERSONALITY BEHAVIOUR RULES:
If the personality is Aggressive:
- Be firm, direct, and assert your highest priorities.
- Defend core needs vigorously and make concessions only when compensated with concessions from others.

If the personality is Collaborative:
- Look for balanced, equitable solutions that keep all districts safe.
- Concede on secondary resources to build consensus while defending essential requirements.

If the personality is Risk-Averse:
- Focus on safety margins, worst-case scenarios, and critical reserves.
- Avoid over-committing resources to single points of failure.

--------------------------------------------------

Current Scenario:
{scenario}

--------------------------------------------------

ALLOWED RESOURCES (ONLY these resources exist):
{resources_formatted}
{budget_section}
CRITICAL RESOURCE CONSTRAINTS:
- You MUST ONLY use these resources: {resource_list}
- Each proposed quantity MUST NOT EXCEED the available amount
- Your proposal must show REAL TRADE-OFFS

--------------------------------------------------

Conversation History:
{history_formatted}

--------------------------------------------------
{other_proposals_section}
INSTRUCTIONS FOR YOUR NEXT DECISION:

You MUST:
1. Dynamically decide whether to ACCEPT, COUNTER, or REJECT based on current round ({current_round}/{max_rounds}), your priorities, and whether the proposal is fair and feasible.
2. Speak naturally in first person ("I", "we", "our operations need").
3. Reference specific quantities and other stakeholders when proposing trade-offs.
4. Output RAW JSON only.

JSON Format:
{{
    "agent": "{persona['name']}",
    "speech": "Your natural-language dialogue paragraph explaining your stance, trade-offs, and reaction to others.",
    "action": "ACCEPT|COUNTER|REJECT",
    "offer": {{
        "proposal": "Your specific numerical resource request for your operations"
    }},
    "reason": "Internal reasoning for your decision and trade-offs.",
    "accept": false
}}
"""
    return prompt