"""
Regression tests for the Practice Mode deadlock condition.

Practice Mode uses a different deadlock rule from AI-vs-AI mode:
the Human Participant and the three configured AI participants must
keep the same allocation across two consecutive completed rounds.

These tests are deterministic and do not call an LLM.
"""

import os
import sys

import pytest

# Ensure backend is importable when pytest is launched from the repository root.
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from services.evaluation_engine import detect_practice_deadlock
from services.negotiation_orchestrator import NegotiationOrchestrator


AI_NAMES = [
    "Government Agent",
    "NGO Agent",
    "District Administration Agent",
]

ALLOCATION = {
    "Riverbend District": {
        "Food": 30,
        "Medicine": 20,
        "Water": 50,
    },
    "Lakeside District": {
        "Food": 20,
        "Medicine": 30,
        "Water": 50,
    },
}


def make_round(human_allocation=None, ai_allocations=None):
    human_allocation = human_allocation or ALLOCATION
    ai_allocations = ai_allocations or {
        name: ALLOCATION
        for name in AI_NAMES
    }

    return {
        "Human Participant": {
            "allocation": human_allocation,
        },
        **{
            name: {
                "allocation": ai_allocations[name],
            }
            for name in AI_NAMES
        },
    }


@pytest.mark.parametrize(
    "scenario_name",
    ["Flood", "Earthquake", "Cyclone"],
)
def test_practice_deadlock_triggers_when_all_four_allocations_are_unchanged(
    scenario_name,
):
    """The same complete allocation state in two rounds is a deadlock."""
    previous = make_round()
    current = make_round()

    assert detect_practice_deadlock(
        previous,
        current,
        participant_names=AI_NAMES,
    ) is True


def test_practice_deadlock_does_not_trigger_when_human_allocation_changes():
    previous = make_round()

    changed_human = {
        "Riverbend District": {
            "Food": 31,
            "Medicine": 20,
            "Water": 49,
        },
        "Lakeside District": {
            "Food": 19,
            "Medicine": 30,
            "Water": 51,
        },
    }

    current = make_round(human_allocation=changed_human)

    assert detect_practice_deadlock(
        previous,
        current,
        participant_names=AI_NAMES,
    ) is False


@pytest.mark.parametrize("changed_agent", AI_NAMES)
def test_practice_deadlock_does_not_trigger_when_any_ai_allocation_changes(
    changed_agent,
):
    previous = make_round()

    ai_allocations = {
        name: ALLOCATION
        for name in AI_NAMES
    }
    ai_allocations[changed_agent] = {
        "Riverbend District": {
            "Food": 31,
            "Medicine": 20,
            "Water": 49,
        },
        "Lakeside District": {
            "Food": 19,
            "Medicine": 30,
            "Water": 51,
        },
    }

    current = make_round(ai_allocations=ai_allocations)

    assert detect_practice_deadlock(
        previous,
        current,
        participant_names=AI_NAMES,
    ) is False


def test_practice_deadlock_requires_all_participants():
    previous = make_round()
    current = make_round()
    current.pop("NGO Agent")

    assert detect_practice_deadlock(
        previous,
        current,
        participant_names=AI_NAMES,
    ) is False


def test_orchestrator_practice_deadlock_sets_breakdown_without_ai_mediation():
    """
    Verify the Practice Mode orchestrator path terminates directly on the
    new condition. It must not call the AI-vs-AI mediation path.
    """
    orchestrator = NegotiationOrchestrator()

    state = {
        "session_id": "practice-test",
        "practice_mode": True,
        "current_round": 2,
        "max_rounds": 10,
        "history": [
            {
                "agent": "Human Participant",
                "round": 2,
                "action": "COUNTER",
                "parsed_proposal": ALLOCATION,
                "incoming_proposal": {},
            }
        ],
        "last_proposals": {
            name: ALLOCATION
            for name in AI_NAMES
        },
        "accepted_proposals": {},
        "current_proposal": ALLOCATION,
        "agents": [
            {"name": name}
            for name in AI_NAMES
        ],
        "prev_practice_round": make_round(),
        "deadlock_detected": False,
        "negotiation_ended": False,
        "consensus_reached": False,
        "status": "ongoing",
        "final_report": None,
        "final_allocation": None,
    }

    orchestrator.sessions["practice-test"] = {
        "state": state,
        "agents": [],
    }

    assert orchestrator._check_practice_deadlock(state) is True
    assert state["deadlock_detected"] is True
    assert state["negotiation_ended"] is True
    assert state["consensus_reached"] is False
    assert state["status"] == "negotiation_breakdown"
    assert state["final_allocation"] == ALLOCATION


def test_practice_deadlock_does_not_override_existing_final_round_flow():
    """
    The new condition must not replace the existing max-round/final-decision
    behavior. On the final configured round the helper leaves the state alone.
    """
    orchestrator = NegotiationOrchestrator()

    state = {
        "session_id": "practice-final-round-test",
        "practice_mode": True,
        "current_round": 3,
        "max_rounds": 3,
        "history": [
            {
                "agent": "Human Participant",
                "round": 3,
                "action": "COUNTER",
                "parsed_proposal": ALLOCATION,
                "incoming_proposal": {},
            }
        ],
        "last_proposals": {
            name: ALLOCATION
            for name in AI_NAMES
        },
        "accepted_proposals": {},
        "current_proposal": ALLOCATION,
        "agents": [{"name": name} for name in AI_NAMES],
        "prev_practice_round": make_round(),
        "deadlock_detected": False,
        "negotiation_ended": False,
        "consensus_reached": False,
        "status": "ongoing",
        "final_report": None,
        "final_allocation": None,
    }

    orchestrator.sessions["practice-final-round-test"] = {
        "state": state,
        "agents": [],
    }

    assert orchestrator._check_practice_deadlock(state) is False
    assert state["deadlock_detected"] is False
    assert state["negotiation_ended"] is False
    assert state["status"] == "ongoing"
