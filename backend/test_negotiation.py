#!/usr/bin/env python3
"""
Test script to verify resource quantities are used in AI negotiation
"""

import asyncio
import json
import sys

from services.negotiation_orchestrator import NegotiationOrchestrator

# Test scenario with resource quantities
test_scenario = {
    "id": 1,
    "title": 'Flood Relief Resource Allocation',
    "description": 'Allocate food, medicine, rescue boats...',
    "resources": ['Food', 'Medicine', 'Rescue Boats', 'Temporary Shelters', 'Emergency Supplies'],
    "resourceQuantities": {
        'Food': 500,
        'Medicine': 200,
        'Rescue Boats': 25,
        'Temporary Shelters': 150,
        'Emergency Supplies': 300
    },
    "agents": [
        {
            "id": 1,
            "name": "Government Agent",
            "role": "National Disaster Management Authority",
            "goal": "Distribute resources fairly",
            "defaultPersonality": "Collaborative"
        },
        {
            "id": 2,
            "name": "NGO Agent",
            "role": "Relief Coordination Partner",
            "goal": "Support vulnerable communities",
            "defaultPersonality": "Collaborative"
        },
        {
            "id": 3,
            "name": "District Administration Agent",
            "role": "Local Emergency Operations Office",
            "goal": "Manage local needs",
            "defaultPersonality": "Collaborative"
        }
    ]
}

agent_configs = [
    {"id": 1, "name": "Government Agent", "role": "National Disaster Management Authority", "personality": "Collaborative"},
    {"id": 2, "name": "NGO Agent", "role": "Relief Coordination Partner", "personality": "Collaborative"},
    {"id": 3, "name": "District Administration Agent", "role": "Local Emergency Operations Office", "personality": "Collaborative"}
]

config = {
    "max_rounds": 3,
    "resourceQuantities": test_scenario["resourceQuantities"]
}

async def test_negotiation():
    orchestrator = NegotiationOrchestrator()
    
    # Create session
    print("Creating negotiation session...")
    session_id = orchestrator.create_session(test_scenario, agent_configs, config)
    print(f"Session created: {session_id}\n")
    
    # Run 3 rounds
    for round_num in range(1, 4):
        print(f"\n{'='*80}")
        print(f"ROUND {round_num}")
        print(f"{'='*80}")
        
        # Get a turn
        state = orchestrator.get_state(session_id)
        current_agent = state["agents"][state["current_agent_idx"]]
        
        print(f"\nCurrent Agent: {current_agent['name']}")
        print(f"Round: {state['current_round']}/{state['max_rounds']}")
        print(f"\nAvailable Resources: {state.get('resource_quantities', {})}")
        
        try:
            result = await orchestrator._step_async(session_id)
            
            # Print last message
            if result.get("history"):
                last_msg = result["history"][-1]
                print(f"\nAgent Response:")
                print(f"  Message: {last_msg.get('message', 'N/A')}")
                print(f"  Reasoning: {last_msg.get('reasoning', 'N/A')}")
                print(f"  Stance: {last_msg.get('stance', 'N/A')}")
                
                # Check if message contains actual resource names and quantities
                message_lower = last_msg.get('message', '').lower()
                has_quantities = any(char.isdigit() for char in last_msg.get('message', ''))
                has_resource_names = any(res.lower() in message_lower for res in state.get('resource_quantities', {}).keys())
                
                print(f"\n  [OK] Contains quantity numbers: {has_quantities}")
                print(f"  [OK] Contains resource names: {has_resource_names}")
                
        except Exception as e:
            print(f"Error during turn: {e}")
            import traceback
            traceback.print_exc()
    
    # Print final summary
    final_state = orchestrator.get_state(session_id)
    print(f"\n\n{'='*80}")
    print(f"NEGOTIATION SUMMARY")
    print(f"{'='*80}")
    print(f"Total Rounds: {final_state['current_round']}")
    print(f"Status: {final_state['status']}")
    print(f"\nFull History:")
    for i, msg in enumerate(final_state['history'], 1):
        print(f"\n{i}. {msg.get('agent', 'Unknown')}")
        print(f"   Round: {msg.get('round', '?')}")
        print(f"   Message: {msg.get('message', 'N/A')}")
        print(f"   Reasoning: {msg.get('reasoning', 'N/A')}")

if __name__ == "__main__":
    asyncio.run(test_negotiation())
