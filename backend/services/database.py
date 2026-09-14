import os
import asyncio

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "").strip()
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "negotiation_simulator").strip()

_client: AsyncIOMotorClient | None = None
_db = None
_mongo_loop = None


async def connect_to_mongo() -> None:
    """Create the Motor client and verify connectivity.

    Called once from FastAPI's startup event so the app opens a single
    connection pool rather than reconnecting per-request.
    """
    global _client, _db, _mongo_loop

    if not MONGODB_URI:
        print("MONGODB_URI is not set. Skipping MongoDB connection.")
        return

    try:
        _mongo_loop = asyncio.get_running_loop()
        _client = AsyncIOMotorClient(MONGODB_URI)
        _db = _client[MONGODB_DB_NAME]
        # ping confirms the cluster is actually reachable, not just that
        # the client object was constructed.
        await _db.command("ping")
        print(f"Connected to MongoDB Atlas database '{MONGODB_DB_NAME}'.")
        await _ensure_indexes()
    except Exception as exc:
        print(f"MongoDB connection failed: {exc}")
        _client = None
        _db = None
        _mongo_loop = None


async def _ensure_indexes() -> None:
    """Create supporting indexes beyond the automatic unique index Mongo
    already puts on `_id` (which is where we store session_id — see
    negotiation_orchestrator._persist_session).

    `status` is indexed (non-unique) since it's the field most likely to
    be queried across sessions later — e.g. "find all sessions that ended
    in negotiation_breakdown" for the historical-analytics feature listed
    in the README's Future Enhancements section.
    """
    if _db is None:
        return
    try:
        await _db["sessions"].create_index("status")
    except Exception as exc:
        print(f"MongoDB index creation failed: {exc}")


async def close_mongo_connection() -> None:
    """Close the Motor client. Called from FastAPI's shutdown event."""
    global _client, _mongo_loop

    if _client is not None:
        _client.close()
        print("MongoDB connection closed.")
        _mongo_loop = None


def get_database():
    """Return the active database handle, or None if not connected."""
    return _db


def get_sessions_collection():
    """Convenience accessor for the 'sessions' collection used by the
    negotiation orchestrator to persist session state.
    """
    if _db is None:
        return None
    return _db["sessions"]


def get_mongo_loop():
    """Return the event loop that owns the active Motor client."""
    return _mongo_loop