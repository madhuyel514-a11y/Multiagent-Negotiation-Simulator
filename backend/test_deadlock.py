"""
Gap 2/3 regression test.

Forces every agent to repeat the exact same COUNTER proposal turn after
turn (a classic stall) and checks that:

  1. detect_deadlock() actually fires before max_rounds is reached
     (Gap 2 — previously it was imported but never called, and
     prev_proposals was never populated so it always returned False).
  2. The orchestrator responds to that deadlock with a mediation
     attempt rather than silently grinding on to max_rounds (Gap 3).
  3. If agents keep stalling even after mediation, the negotiation is
     terminated with a distinct "negotiation_breakdown" status instead
     of being lumped in with "deadlock_no_consensus" (which is really
     just "ran out of rounds").

This monkeypatches Agent.act so the test doesn't depend on a live LLM
call — it only needs to exercise the orchestrator's own control flow.
"""

from services.negotiation_orchestrator import NegotiationOrchestrator


STUCK_PROPOSAL = "Government Agent: Water: 40 units | NGO Agent: Water: 30 units | District Administration Agent: Water: 30 units"


def make_stuck_act(agent_name):
    """
    Every call returns the *same* COUNTER proposal, regardless of round —
    i.e. an agent that never moves. Message deliberately varies slightly
    per round so the "identical message" shortcut in detect_deadlock
    doesn't trigger first; we want to exercise the parsed_proposal
    comparison path instead.
    """

    call_count = {"n": 0}

    async def act(context, ask_model):
        call_count["n"] += 1
        return {
            "message": (
                f"[{agent_name} round {call_count['n']}] "
                f"I hold my position: {STUCK_PROPOSAL}"
            ),
            "reasoning": "Refusing to move.",
            "stance": "firm",
            "action": "COUNTER",
        }

    return act


def run_test():
    orchestrator = NegotiationOrchestrator()

    scenario = {
        "id": "deadlock-scenario",
        "resources": ["Water"],
        "recipients": [
            {"name": "Government Agent"},
            {"name": "NGO Agent"},
            {"name": "District Administration Agent"},
        ],
    }

    agents_config = [
        {"id": "agent-1", "name": "Government Agent", "role": "Government", "personality": "Stubborn"},
        {"id": "agent-2", "name": "NGO Agent", "role": "NGO", "personality": "Stubborn"},
        {"id": "agent-3", "name": "District Administration Agent", "role": "District Administration", "personality": "Stubborn"},
    ]

    # Plenty of resource so a mediated compromise is easy to compute,
    # and plenty of rounds so we hit deadlock detection well before
    # max_rounds forces a "ran out of rounds" ending.
    config = {
        "max_rounds": 10,
        "resourceQuantities": {"Water": 100},
    }

    session_id = orchestrator.create_session(
        scenario=scenario,
        agents_config=agents_config,
        config=config,
    )

    # Monkeypatch each agent's act() so behavior is deterministic and
    # doesn't require network access / a real Gemini key.
    entry = orchestrator.sessions[session_id]
    for agent in entry["agents"]:
        agent.act = make_stuck_act(agent.name)

    deadlock_seen = False
    breakdown_seen = False
    resolution_seen = False

    turn_count = 0
    result = None

    while turn_count < 60:
        result = orchestrator.step(session_id)
        turn_count += 1

        state = orchestrator.get_state(session_id)

        print(
            f"turn={turn_count} round={result.get('round')} "
            f"status={result.get('negotiation_status')} "
            f"deadlock_detected={result.get('deadlock_detected')} "
            f"resolution_attempted={result.get('resolution_attempted')}"
        )

        if result.get("deadlock_detected"):
            deadlock_seen = True

        if state.get("resolution_attempted") or any(
            h.get("agent") == "Mediator" for h in state.get("history", [])
        ):
            resolution_seen = True

        if result.get("negotiation_status") == "negotiation_breakdown":
            breakdown_seen = True

        if result.get("negotiation_ended"):
            break

    print("\n--- RESULT ---")
    print(f"deadlock_detected at least once : {deadlock_seen}")
    print(f"mediation attempted             : {resolution_seen}")
    print(f"terminal status                 : {result.get('negotiation_status')}")
    print(f"breakdown status reached        : {breakdown_seen}")
    print(f"final_allocation                : {result.get('final_allocation')}")

    assert deadlock_seen, "detect_deadlock() never fired for a genuinely stuck negotiation (Gap 2)"
    assert resolution_seen, "No mediation attempt was made after deadlock was detected (Gap 3)"
    assert result.get("negotiation_status") in (
        "negotiation_breakdown",
        "deadlock_no_consensus",
        "agreement_reached",
    ), f"Unexpected terminal status: {result.get('negotiation_status')}"

    # Because the fake agents never move even after mediation, we expect
    # the negotiation to eventually end in a breakdown rather than
    # silently running out the clock with status == deadlock_no_consensus.
    assert breakdown_seen, "Expected a distinct 'negotiation_breakdown' status once mediation also stalled (Gap 3)"

    print("\nAll deadlock/resolution assertions passed.")


if __name__ == "__main__":
    run_test()