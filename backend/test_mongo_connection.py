"""
Standalone connectivity check for M5.2 — NOT a pytest suite.

Run directly:
    python backend/test_mongo_connection.py

Confirms the Atlas cluster is reachable and the sessions collection can be
written to and read from, before any orchestrator code depends on it.
Delete or move into a real test suite once M5 is done.
"""

import asyncio
import os
import sys

# Ensure this works whether run as `python test_mongo_connection.py` from
# inside backend/, or as `python -m backend.test_mongo_connection` from the
# project root — mirrors the sys.path bootstrap already used in main.py.
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from services.database import (
    connect_to_mongo,
    close_mongo_connection,
    get_sessions_collection,
)


async def main():
    await connect_to_mongo()

    collection = get_sessions_collection()
    if collection is None:
        print("FAILED: no database connection. Check MONGODB_URI in backend/.env")
        return

    test_doc = {"_id": "connection_test", "status": "ok"}
    await collection.replace_one({"_id": "connection_test"}, test_doc, upsert=True)
    print("Write OK: inserted/updated test document.")

    fetched = await collection.find_one({"_id": "connection_test"})
    print(f"Read OK: {fetched}")

    await collection.delete_one({"_id": "connection_test"})
    print("Cleanup OK: test document removed.")

    await close_mongo_connection()


if __name__ == "__main__":
    asyncio.run(main())