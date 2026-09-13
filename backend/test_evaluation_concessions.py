import os
import sys

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from services.evaluation_engine import build_outcome_analysis


AGENTS = [
    {"name": "Government Agent"},
    {"name": "NGO Agent"},
    {"name": "District Administration Agent"},
]


def proposal(riverbend_food, riverbend_medicine, lakeside_food=0):
    return {
        "Riverbend District": {
            "Food": riverbend_food,
            "Medicine": riverbend_medicine,
        },
        "Lakeside District": {
            "Food": lakeside_food,
        },
    }


def state_for(history, final_allocation=None, practice=False):
    return {
        "agents": AGENTS,
        "history": history,
        "final_allocation": final_allocation,
        "consensus_reached": False,
        "accepted_proposals": {},
        "status": "ongoing",
        "practice_mode": practice,
    }


def entry(agent, action, parsed_proposal=None, round_number=1):
    return {
        "agent": agent,
        "action": action,
        "round": round_number,
        "parsed_proposal": parsed_proposal,
    }


def test_nested_ai_proposals_compare_against_immediately_previous_proposal():
    government = proposal(0, 0)
    ngo = proposal(0, 50)
    district = proposal(0, 70)
    analysis = build_outcome_analysis(state_for([
        entry("Government Agent", "OFFER", government),
        entry("NGO Agent", "COUNTER", ngo),
        entry("District Administration Agent", "COUNTER", district),
    ]))

    timeline = analysis["concession_timeline"]
    assert timeline[0]["proposal_changed"] is False
    assert timeline[1]["increased"] == {"Riverbend District/Medicine": 50}
    assert timeline[1]["decreased"] == {}
    assert timeline[2]["increased"] == {"Riverbend District/Medicine": 20}
    assert timeline[2]["decreased"] == {}

    assert analysis["concession_patterns"]["NGO Agent"]["increased"] == {
        "Riverbend District/Medicine": 50
    }
    assert analysis["concession_patterns"]["District Administration Agent"]["increased"] == {
        "Riverbend District/Medicine": 20
    }


def test_decreases_are_concessions_and_increases_are_not_automatically_concessions():
    analysis = build_outcome_analysis(state_for([
        entry("Government Agent", "OFFER", proposal(100, 50)),
        entry("NGO Agent", "COUNTER", proposal(120, 30)),
    ]))

    pattern = analysis["concession_patterns"]["NGO Agent"]
    assert pattern["increased"] == {"Riverbend District/Food": 20}
    assert pattern["decreased"] == {"Riverbend District/Medicine": 20}
    assert pattern["concession_count"] == 1
    assert pattern["total_quantity_conceded"] == 20
    assert analysis["concession_timeline"][1]["concessions"] == {
        "Riverbend District/Medicine": 20
    }


def test_unchanged_and_first_proposal_have_no_changes():
    current = proposal(10, 20)
    analysis = build_outcome_analysis(state_for([
        entry("Government Agent", "OFFER", current),
        entry("NGO Agent", "COUNTER", current),
    ]))

    first, second = analysis["concession_timeline"]
    assert first["proposal_changed"] is False
    assert first["increased"] == {}
    assert first["decreased"] == {}
    assert second["proposal_changed"] is False
    assert second["concession_quantity"] == 0


def test_multiple_district_resource_changes_are_flattened_by_path():
    previous = proposal(10, 20, lakeside_food=30)
    current = {
        "Riverbend District": {"Food": 25, "Medicine": 5},
        "Lakeside District": {"Food": 10},
    }
    analysis = build_outcome_analysis(state_for([
        entry("Government Agent", "OFFER", previous),
        entry("NGO Agent", "COUNTER", current),
    ]))

    change = analysis["concession_timeline"][1]
    assert change["increased"] == {"Riverbend District/Food": 15}
    assert change["decreased"] == {
        "Riverbend District/Medicine": 15,
        "Lakeside District/Food": 20,
    }
    assert change["concession_quantity"] == 35


def test_accept_without_parsed_proposal_does_not_create_a_change():
    current = proposal(10, 20)
    analysis = build_outcome_analysis(state_for([
        entry("Government Agent", "OFFER", current),
        entry("NGO Agent", "ACCEPT", None),
    ]))

    accepted = analysis["concession_timeline"][1]
    assert accepted["proposal"] is None
    assert accepted["proposal_changed"] is False
    assert accepted["increased"] == {}
    assert accepted["decreased"] == {}


def test_practice_style_human_and_ai_proposals_use_same_comparison_rules():
    previous = proposal(100, 50)
    current = proposal(80, 60)
    analysis = build_outcome_analysis(state_for([
        entry("Human Participant", "OFFER", previous, 1),
        entry("Government Agent", "COUNTER", current, 1),
        entry("NGO Agent", "ACCEPT", None, 1),
        entry("Human Participant", "COUNTER", proposal(70, 60), 2),
    ], practice=True))

    timeline = analysis["concession_timeline"]
    assert timeline[1]["decreased"] == {"Riverbend District/Food": 20}
    assert timeline[3]["decreased"] == {"Riverbend District/Food": 10}
    assert analysis["concession_patterns"]["Government Agent"]["total_quantity_conceded"] == 20
    assert analysis["concession_patterns"]["Human Participant"]["total_quantity_conceded"] == 10
