"""
Negotiation history endpoints, backed directly by the MongoDB `sessions`
collection (not the orchestrator's in-memory dict) so past negotiations
remain visible even after the backend process has restarted.
"""

from fastapi import APIRouter, HTTPException

from services.database import get_sessions_collection


router = APIRouter(
    prefix="/api/history",
    tags=["Negotiation History"],
)


def _require_collection():
    collection = get_sessions_collection()
    if collection is None:
        raise HTTPException(
            status_code=503,
            detail="MongoDB is not connected. Check MONGODB_URI in backend/.env.",
        )
    return collection


# =========================================================
# LIST ALL PAST NEGOTIATIONS (summary only)
# =========================================================

@router.get("")
async def list_negotiation_history():
    """
    Lightweight summary of every persisted session, most recently
    updated first. Powers the frontend's history list view.
    """
    collection = _require_collection()

    projection = {
        "_id": 1,
        "scenario.title": 1,
        "scenario.id": 1,
        "practice_mode": 1,
        "status": 1,
        "current_round": 1,
        "max_rounds": 1,
        "consensus": 1,
        "created_at": 1,
        "updated_at": 1,
    }

    sessions = []
    cursor = collection.find({}, projection).sort("updated_at", -1)
    async for doc in cursor:
        scenario = doc.get("scenario") or {}
        sessions.append({
            "session_id": doc.get("_id"),
            "scenario_title": scenario.get("title") or scenario.get("id") or "Untitled Scenario",
            "practice_mode": bool(doc.get("practice_mode", False)),
            "status": doc.get("status"),
            "current_round": doc.get("current_round"),
            "max_rounds": doc.get("max_rounds"),
            "consensus": doc.get("consensus"),
            "created_at": doc.get("created_at"),
            "updated_at": doc.get("updated_at"),
        })

    return {
        "success": True,
        "count": len(sessions),
        "sessions": sessions,
    }


# =========================================================
# GET ONE PAST NEGOTIATION IN FULL
# =========================================================

@router.get("/{session_id}")
async def get_negotiation_history_detail(session_id: str):
    """
    Full persisted document for one session, including the complete
    round-by-round `history` array — every agent's (and the human's, in
    Practice Mode) proposals in the order they happened.
    """
    collection = _require_collection()

    doc = await collection.find_one({"_id": session_id})
    if doc is None:
        raise HTTPException(
            status_code=404,
            detail="Negotiation session not found in history.",
        )

    return {
        "success": True,
        "session": doc,
    }


# =========================================================
# DELETE ONE PAST NEGOTIATION
# =========================================================

@router.delete("/{session_id}")
async def delete_negotiation_history(session_id: str):
    collection = _require_collection()

    result = await collection.delete_one({"_id": session_id})
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404,
            detail="Negotiation session not found in history.",
        )

    return {
        "success": True,
        "session_id": session_id,
        "deleted": True,
    }


# =========================================================
# CLEAR ALL HISTORY
# =========================================================

@router.delete("")
async def clear_negotiation_history():
    """Deletes every persisted session. Irreversible — used by a
    "Clear All History" action on the frontend."""
    collection = _require_collection()

    result = await collection.delete_many({})

    return {
        "success": True,
        "deleted_count": result.deleted_count,
    }