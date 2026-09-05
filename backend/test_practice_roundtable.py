"""
Test script to verify Multi-Agent Roundtable Practice Mode flow:
One human proposal -> Government Agent -> NGO Agent -> District Administration Agent
"""

import sys
import os

# Ensure backend directory is in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from services.negotiation_orchestrator import NegotiationOrchestrator

def test_practice_roundtable():
    orchestrator = NegotiationOrchestrator()

    scenario = {
        "id": 2,
        "title": "Earthquake Emergency Response",
        "resources": ["Rescue Teams", "Medical Aid", "Temporary Shelters", "Debris Clearance Equipment"],
        "resourceQuantities": {
            "Rescue Teams": 40,
            "Medical Aid": 300,
            "Temporary Shelters": 200,
            "Debris Clearance Equipment": 35
        },
        "recipients": [
            {"name": "North Sector", "population": 22000, "severity": "Critical", "needs": ["Rescue Teams", "Medical Aid"]},
            {"name": "Central Sector", "population": 18000, "severity": "High", "needs": ["Debris Clearance Equipment", "Temporary Shelters"]},
            {"name": "South Sector", "population": 12000, "severity": "Medium", "needs": ["Medical Aid", "Temporary Shelters"]}
        ]
    }

    agents_config = [
        {"id": 1, "name": "Government Agent", "role": "Government", "personality": "Collaborative"},
        {"id": 2, "name": "NGO Agent", "role": "NGO", "personality": "Collaborative"},
        {"id": 3, "name": "District Administration Agent", "role": "District Administration", "personality": "Collaborative"}
    ]

    config = {
        "max_rounds": 3,
        "resourceQuantities": scenario["resourceQuantities"]
    }

    session_id = orchestrator.create_session(scenario, agents_config, config)
    print(f"[TEST] Session created: {session_id}")

    # Human tables an opening master proposal
    human_msg = "I propose allocating 18 Rescue Teams to North Sector due to critical severity, 10 to Central, and 12 to South."
    human_result = orchestrator.add_human_message(
        session_id=session_id,
        message=human_msg,
        resource="Rescue Teams",
        amount=18,
        action="Offer"
    )

    assert human_result.get("success"), "Human message failed"
    print(f"[TEST] Human turn registered: {human_msg}")

    # Step all AI agents in the roundtable
    ai_responses = orchestrator.step_practice_round(session_id)
    print(f"[TEST] Total AI agents deliberated: {len(ai_responses)}")

    assert len(ai_responses) == 3, f"Expected 3 AI responses, got {len(ai_responses)}"

    agent_names = [res.get("agent") for res in ai_responses]
    print(f"[TEST] Responding agents in sequence: {agent_names}")

    expected_agents = ["Government Agent", "NGO Agent", "District Administration Agent"]
    assert agent_names == expected_agents, f"Unexpected agent sequence: {agent_names}"

    for i, res in enumerate(ai_responses):
        agent_name = res.get("agent")
        msg = res.get("message", "")
        reasoning = res.get("reasoning", "")
        safe_msg = msg[:120].encode('ascii', errors='replace').decode('ascii')
        safe_reasoning = reasoning[:80].encode('ascii', errors='replace').decode('ascii')
        print(f"\n--- [{agent_name}] ---")
        print(f"Message ({len(msg)} chars): {safe_msg}...")
        print(f"Reasoning: {safe_reasoning}...")
        assert len(msg) > 0, f"{agent_name} produced an empty message!"

    state = orchestrator.get_state(session_id)
    print(f"\n[TEST] Round after AI deliberation: {state.get('current_round')}")
    print(f"[TEST] Consensus: {state.get('consensus')}")
    print("[TEST] SUCCESS! Multi-Agent Roundtable Practice Mode works perfectly.")

if __name__ == "__main__":
    test_practice_roundtable()
