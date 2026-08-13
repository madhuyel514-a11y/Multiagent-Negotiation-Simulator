from services.negotiation_orchestrator import NegotiationOrchestrator


def run_test():
    orchestrator = NegotiationOrchestrator()

    # Minimal scenario with 3 agents
    scenario = {
        "id": "scenario-1",
        "agents": [
            {"id": "agent-1", "name": "Government Agent", "role": "Government"},
            {"id": "agent-2", "name": "NGO Agent", "role": "NGO"},
            {"id": "agent-3", "name": "District Administration Agent", "role": "District Administration"},
        ],
    }

    agents = [
        {"id": "agent-1", "name": "Government Agent", "role": "Government", "personality": "Collaborative"},
        {"id": "agent-2", "name": "NGO Agent", "role": "NGO", "personality": "Assertive"},
        {"id": "agent-3", "name": "District Administration Agent", "role": "District Administration", "personality": "Pragmatic"},
    ]

    config = {"max_rounds": 3}

    session_id = orchestrator.create_session(scenario=scenario, agents_config=agents, config=config)

    print(f"Created session: {session_id}")

    ended = False
    turn_count = 0

    while not ended and turn_count < 20:
        res = orchestrator.step(session_id)
        turn_count += 1
        print(f"Turn {turn_count}: agent={res.get('agent')} round={res.get('round')} next={res.get('next_agent')} status={res.get('negotiation_status')}")
        # Print last history entry
        history = res.get('history', [])
        if history:
            last = history[-1]
            print(f"  Last entry: agent={last.get('agent')} round={last.get('round')} message={last.get('message')}")

        if res.get('negotiation_ended'):
            ended = True

    print("Final state:")
    state = orchestrator.get_state(session_id)
    print(f" current_round={state.get('current_round')} max_rounds={state.get('max_rounds')} negotiation_ended={state.get('negotiation_ended')}")
    print(f" history length={len(state.get('history', []))}")
    for h in state.get('history', []):
        print(h)


if __name__ == '__main__':
    run_test()
