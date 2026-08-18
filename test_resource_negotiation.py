#!/usr/bin/env python3
"""
Test script to verify resource negotiation constraints.

Test case: Flood Relief with user-specified quantities
- Food = 100
- Medicine = 40
- Rescue Boats = 5
- Temporary Shelters = 20
- Emergency Supplies = 50
"""

import asyncio
import json
import sys
sys.path.insert(0, 'backend')

from services.negotiation_orchestrator import NegotiationOrchestrator

# Test scenario with USER-SPECIFIED resource quantities
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

# User-defined resource quantities (from AgentConfiguration)
user_quantities = {
    'Food': 100,
    'Medicine': 40,
    'Rescue Boats': 5,
    'Temporary Shelters': 20,
    'Emergency Supplies': 50
}

agent_configs = [
    {"id": 1, "name": "Government Agent", "role": "National Disaster Management Authority", "personality": "Collaborative"},
    {"id": 2, "name": "NGO Agent", "role": "Relief Coordination Partner", "personality": "Collaborative"},
    {"id": 3, "name": "District Administration Agent", "role": "Local Emergency Operations Office", "personality": "Collaborative"}
]

config = {
    "max_rounds": 3,
    "resourceQuantities": user_quantities  # USER-SPECIFIED quantities
}

def check_response(message, allowed_resources, max_quantities):
    """
    Validate that response uses only allowed resources and respects quantities.
    """
    import re
    
    issues = []
    
    # Check for invented resources
    invented_keywords = [
        "water", "first aid kit", "vehicle", "fuel", "electricity", 
        "blood", "vaccine", "oxygen", "tent", "blanket", "hygiene kit"
    ]
    
    message_lower = message.lower()
    for keyword in invented_keywords:
        if keyword in message_lower:
            found_in_allowed = any(
                keyword.lower() in res.lower() 
                for res in allowed_resources
            )
            if not found_in_allowed:
                issues.append(f"INVENTED RESOURCE: '{keyword}' is not in allowed resources")
    
    # Check if quantities are reasonable
    quantity_matches = re.findall(r'(\d+)\s+(?:units?(?:\s+of)?\s+)?([A-Z][a-zA-Z\s]+?)(?:,|and|\.|$)', message)
    for qty_str, resource in quantity_matches:
        qty = int(qty_str)
        # Check if resource is in allowed list
        found_resource = None
        for allowed in allowed_resources:
            if allowed.lower() in resource.lower() or resource.lower().startswith(allowed.lower()):
                found_resource = allowed
                break
        
        if found_resource and found_resource in max_quantities:
            max_qty = max_quantities[found_resource]
            if qty > max_qty:
                issues.append(f"EXCEEDS LIMIT: Proposed {qty} {found_resource} (max {max_qty})")
    
    return issues

async def test_negotiation():
    orchestrator = NegotiationOrchestrator()
    
    print("=" * 80)
    print("RESOURCE NEGOTIATION TEST")
    print("=" * 80)
    print("\nScenario: Flood Relief")
    print("\nUser-Configured Resources:")
    for resource, qty in user_quantities.items():
        print(f"  - {resource}: {qty} units")
    
    # Create session with USER-SPECIFIED quantities
    print("\nCreating negotiation session...")
    session_id = orchestrator.create_session(test_scenario, agent_configs, config)
    print(f"Session created: {session_id}\n")
    
    # Run 2 rounds to show negotiation
    all_resources = list(user_quantities.keys())
    
    for round_num in range(1, 3):
        print(f"\n{'='*80}")
        print(f"ROUND {round_num}")
        print(f"{'='*80}")
        
        # Get state
        state = orchestrator.get_state(session_id)
        current_agent = state["agents"][state["current_agent_idx"]]
        
        print(f"\nCurrent Agent: {current_agent['name']}")
        print(f"Resources in negotiation: {', '.join(all_resources)}")
        print(f"Available quantities: {user_quantities}")
        
        try:
            result = await orchestrator._step_async(session_id)
            
            # Print last 3 messages
            if result.get("history"):
                print(f"\nRecent negotiation messages:")
                for msg in result["history"][-3:]:
                    print(f"\n  [{msg.get('round', '?')}] {msg.get('agent', 'Unknown')}:")
                    print(f"      {msg.get('message', 'N/A')}")
                    
                    # Validate the message
                    issues = check_response(
                        msg.get('message', ''),
                        all_resources,
                        user_quantities
                    )
                    
                    if issues:
                        print(f"      ❌ ISSUES:")
                        for issue in issues:
                            print(f"         - {issue}")
                    else:
                        # Check for good signs
                        has_quantities = any(char.isdigit() for char in msg.get('message', ''))
                        has_resources = any(res.lower() in msg.get('message', '').lower() for res in all_resources)
                        
                        if has_quantities and has_resources:
                            print(f"      ✓ Uses specific resources and quantities")
                        elif has_quantities:
                            print(f"      ✓ Uses specific quantities")
                        elif has_resources:
                            print(f"      ✓ References specific resources")
                
        except Exception as e:
            print(f"Error during turn: {e}")
            import traceback
            traceback.print_exc()
    
    # Print summary
    final_state = orchestrator.get_state(session_id)
    print(f"\n\n{'='*80}")
    print("NEGOTIATION SUMMARY")
    print(f"{'='*80}")
    print(f"Total messages: {len(final_state['history'])}")
    print(f"Consensus: {(final_state.get('consensus', 0) * 100):.0f}%")
    
    print(f"\nFull Message History:")
    for i, msg in enumerate(final_state['history'], 1):
        print(f"\n{i}. {msg.get('agent', 'Unknown')} (Round {msg.get('round', '?')})")
        print(f"   Message: {msg.get('message', 'N/A')}")
        print(f"   Reasoning: {msg.get('reasoning', 'N/A')}")

if __name__ == "__main__":
    asyncio.run(test_negotiation())
