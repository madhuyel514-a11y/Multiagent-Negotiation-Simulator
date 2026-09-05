"""
Test script for Practice Mode AI Suggestion & Autofill feature
"""

import sys
import os

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from services.negotiation_orchestrator import NegotiationOrchestrator


def test_human_suggestion():
    orchestrator = NegotiationOrchestrator()

    scenario = {
        "id": 1,
        "title": "Flood Relief Coordination",
        "resources": ["Clean Water", "Food Packets", "Medical Kits", "Rescue Boats"],
        "resourceQuantities": {
            "Clean Water": 500,
            "Food Packets": 400,
            "Medical Kits": 150,
            "Rescue Boats": 30,
        },
        "recipients": [
            {"name": "Sector Alpha", "population": 15000, "severity": "Critical", "needs": ["Rescue Boats", "Clean Water"]},
            {"name": "Sector Beta", "population": 25000, "severity": "High", "needs": ["Food Packets", "Medical Kits"]},
            {"name": "Sector Gamma", "population": 8000, "severity": "Medium", "needs": ["Clean Water", "Food Packets"]},
        ],
    }

    agents_config = [
        {"id": 1, "name": "Government Agent", "role": "Government", "personality": "Collaborative"},
        {"id": 2, "name": "NGO Agent", "role": "NGO", "personality": "Collaborative"},
        {"id": 3, "name": "District Administration Agent", "role": "District Administration", "personality": "Collaborative"},
    ]

    config = {
        "max_rounds": 4,
        "resourceQuantities": scenario["resourceQuantities"],
    }

    session_id = orchestrator.create_session(scenario, agents_config, config)
    print(f"[TEST] Session created: {session_id}")

    # 1. Test get_human_suggestion on a fresh session
    suggestion = orchestrator.get_human_suggestion(session_id)
    print("\n--- SUGGESTION TEST (Round 1) ---")
    print(f"Action: {suggestion.get('action')}")
    print(f"Resource: {suggestion.get('resource')}")
    print(f"Amount: {suggestion.get('amount')}")
    print(f"Reasoning: {suggestion.get('reasoning')}")
    safe_msg = suggestion.get("message", "")[:120].encode('ascii', errors='replace').decode('ascii')
    print(f"Message: {safe_msg}...")
    print(f"Proposal: {suggestion.get('proposal')}")

    assert suggestion.get("action") in ("Offer", "Counter Offer", "Accept Offer"), f"Invalid action: {suggestion.get('action')}"
    assert suggestion.get("resource") in scenario["resources"], f"Invalid resource: {suggestion.get('resource')}"
    assert isinstance(suggestion.get("amount"), (int, float)) and suggestion.get("amount") > 0, "Invalid amount"
    assert len(suggestion.get("message", "").strip()) > 0, "Empty message"
    assert len(suggestion.get("reasoning", "").strip()) > 0, "Empty reasoning"

    # Verify zero-sum allocation constraint in the suggested proposal
    prop = suggestion.get("proposal")
    assert isinstance(prop, dict) and len(prop) == 3, "Proposal should cover all 3 sectors"
    for res, total_expected in scenario["resourceQuantities"].items():
        allocated_sum = sum(prop[sector].get(res, 0) for sector in prop)
        assert allocated_sum == total_expected, f"Zero-sum violated for {res}: sum={allocated_sum}, expected={total_expected}"
    print("[TEST] Zero-sum constraint verified for all resources in suggestion!")

    # 2. Human applies the suggestion
    human_res = orchestrator.add_human_message(
        session_id=session_id,
        message=suggestion["message"],
        resource=suggestion["resource"],
        amount=suggestion["amount"],
        action=suggestion["action"],
        structured_proposal=prop,
    )
    assert human_res.get("success"), "Human move failed"
    print("[TEST] Applied suggestion as human move successfully!")

    # 3. Deliberate round table
    ai_responses = orchestrator.step_practice_round(session_id)
    assert len(ai_responses) == 3, f"Expected 3 AI responses, got {len(ai_responses)}"
    print(f"[TEST] AI Agents responded to suggested proposal: {[r.get('agent') for r in ai_responses]}")

    # 4. Request suggestion for Round 2 after AI agents pushed back / countered
    suggestion_r2 = orchestrator.get_human_suggestion(session_id)
    print("\n--- SUGGESTION TEST (Round 2) ---")
    print(f"Action: {suggestion_r2.get('action')}")
    print(f"Resource: {suggestion_r2.get('resource')}")
    print(f"Amount: {suggestion_r2.get('amount')}")
    print(f"Reasoning: {suggestion_r2.get('reasoning')}")
    safe_msg2 = suggestion_r2.get("message", "")[:120].encode('ascii', errors='replace').decode('ascii')
    print(f"Message: {safe_msg2}...")

    assert suggestion_r2.get("action") in ("Offer", "Counter Offer", "Accept Offer")
    assert len(suggestion_r2.get("message", "").strip()) > 0

    print("\n[TEST] ALL SUGGESTION & AUTOFILL TESTS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    test_human_suggestion()
