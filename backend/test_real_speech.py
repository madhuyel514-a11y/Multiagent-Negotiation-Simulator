import asyncio
import time
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.negotiation_orchestrator import NegotiationOrchestrator

async def main():
    orchestrator = NegotiationOrchestrator()
    scenario = {
        "id": "scenario-flood",
        "disaster_type": "Severe Floods",
        "severity": "High",
        "recipients": [
            {"name": "Riverbend District", "population": 15000, "severity": "Severe", "needs": ["Rescue Boats", "Food", "Medicine"]},
            {"name": "Lakeside District", "population": 8000, "severity": "Moderate", "needs": ["Medicine", "Emergency Supplies"]},
            {"name": "Hillside District", "population": 4000, "severity": "Low", "needs": ["Food", "Temporary Shelters"]}
        ],
        "resource_quantities": {
            "Food": 500,
            "Medicine": 200,
            "Rescue Boats": 25,
            "Temporary Shelters": 150,
            "Emergency Supplies": 300
        },
        "rules": ["Consensus required"]
    }
    agents = [
        {"id": "agent-1", "name": "Government Agent", "role": "Government", "personality": "Collaborative"},
        {"id": "agent-2", "name": "NGO Agent", "role": "NGO", "personality": "Assertive"},
        {"id": "agent-3", "name": "District Administration Agent", "role": "District Administration", "personality": "Pragmatic"}
    ]
    
    session_id = await orchestrator.create_session(scenario=scenario, agents_config=agents, config={"max_rounds": 2})
    print(f"Session started: {session_id[:8]}...\n", flush=True)
    
    for step_num in range(1, 4):
        t0 = time.perf_counter()
        res = await orchestrator._step_async(session_id)
        dt = time.perf_counter() - t0
        print(f"=== Step {step_num} | {res.get('agent')} (Took {dt:.2f}s) ===", flush=True)
        print(f"Speech: {res.get('message')}\n", flush=True)
        print(f"Allocations: {res.get('allocations')}\n", flush=True)

if __name__ == "__main__":
    asyncio.run(main())
