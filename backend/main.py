import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# =========================================================
# BACKEND PATH SETUP
# =========================================================

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

if BACKEND_DIR in sys.path:
    sys.path.remove(BACKEND_DIR)

sys.path.insert(0, BACKEND_DIR)


# =========================================================
# LOAD ENVIRONMENT VARIABLES
# =========================================================

load_dotenv(
    Path(__file__).resolve().parent / ".env"
)


# =========================================================
# IMPORT ORCHESTRATOR
# =========================================================

from services.negotiation_orchestrator import NegotiationOrchestrator


# =========================================================
# CREATE FASTAPI APP
# =========================================================

app = FastAPI(
    title="Multi-Agent Negotiation Simulator",
    version="1.0.0",
)


# =========================================================
# CORS CONFIGURATION
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# CREATE ONE ORCHESTRATOR INSTANCE
# =========================================================

orchestrator = NegotiationOrchestrator()


# =========================================================
# REQUEST MODELS
# =========================================================

class HealthResponse(BaseModel):
    status: str


class StartRequest(BaseModel):
    scenario: dict
    agents: list
    config: dict | None = None


class TurnRequest(BaseModel):
    session_id: str


class PracticeTurnRequest(BaseModel):
    session_id: str
    message: str
    resource: str = ""
    amount: int = 0
    action: str = "Offer"


# =========================================================
# ROOT ENDPOINT
# =========================================================

@app.get("/")
def root():

    return {
        "message": "Negotiation System is Active"
    }


# =========================================================
# HEALTH CHECK
# =========================================================

@app.get(
    "/api/health",
    response_model=HealthResponse,
)
def health():

    return {
        "status": "ok"
    }


# =========================================================
# START NEGOTIATION SESSION
# =========================================================

@app.post("/api/negotiation/start")
def start_negotiation(body: StartRequest):

    try:

        print("\n===================================")
        print("STARTING NEGOTIATION")
        print("===================================")

        # Create a new negotiation session
        session_id = orchestrator.create_session(
            scenario=body.scenario,
            agents_config=body.agents,
            config=body.config or {},
        )

        # Get the initial state
        state = orchestrator.get_state(session_id)

        print("SESSION CREATED")
        print("SESSION ID:", session_id)

        print("===================================\n")

        return {

            "success": True,

            "session_id": session_id,

            "message":
                "Negotiation session started successfully.",

            "round":
                state.get("round", 1)
                if isinstance(state, dict)
                else 1,

            "current_proposal":
                state.get("current_proposal")
                if isinstance(state, dict)
                else None,

            "consensus_reached":
                state.get("consensus_reached", False)
                if isinstance(state, dict)
                else False,

            "max_rounds_reached":
                state.get("max_rounds_reached", False)
                if isinstance(state, dict)
                else False,

            "negotiation_ended":
                state.get("negotiation_ended", False)
                if isinstance(state, dict)
                else False,

            "state": state,

        }

    except Exception as error:

        print(
            "START NEGOTIATION ERROR:",
            str(error)
        )

        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


# =========================================================
# NORMAL AI NEGOTIATION TURN
# =========================================================

@app.post("/api/negotiation/turn")
def negotiation_turn(body: TurnRequest):

    session_id = body.session_id

    # Check whether session exists
    if not orchestrator.session_exists(session_id):

        raise HTTPException(
            status_code=404,
            detail="Session not found",
        )

    try:

        result = orchestrator.step(session_id)

        state = orchestrator.get_state(session_id)

        return {

            "success": True,

            "session_id": session_id,

            "ai_response": result,

            "round":
                state.get("round", 1)
                if isinstance(state, dict)
                else 1,

            "current_proposal":
                state.get("current_proposal")
                if isinstance(state, dict)
                else None,

            "consensus_reached":
                state.get("consensus_reached", False)
                if isinstance(state, dict)
                else False,

            "max_rounds_reached":
                state.get("max_rounds_reached", False)
                if isinstance(state, dict)
                else False,

            "negotiation_ended":
                state.get("negotiation_ended", False)
                if isinstance(state, dict)
                else False,

            "state": state,

        }

    except Exception as error:

        print(
            "NEGOTIATION TURN ERROR:",
            str(error)
        )

        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


# =========================================================
# PRACTICE MODE
# HUMAN → BACKEND → AI RESPONSE
# =========================================================

@app.post("/api/practice/turn")
def practice_turn(body: PracticeTurnRequest):

    session_id = body.session_id

    print("\n===================================")
    print("PRACTICE MODE TURN")
    print("===================================")
    print("SESSION ID:", session_id)
    print("MESSAGE:", body.message)
    print("RESOURCE:", body.resource)
    print("AMOUNT:", body.amount)
    print("ACTION:", body.action)
    print("===================================\n")


    # =====================================================
    # CHECK SESSION
    # =====================================================

    if not orchestrator.session_exists(session_id):

        print("SESSION NOT FOUND:", session_id)

        raise HTTPException(
            status_code=404,
            detail="Session not found",
        )


    try:

        # =================================================
        # STEP 1: ADD HUMAN MESSAGE
        # =================================================

        human_result = orchestrator.add_human_message(
            session_id=session_id,
            message=body.message,
            resource=body.resource,
            amount=body.amount,
            action=body.action,
        )


        print("HUMAN RESULT:")
        print(human_result)


        # =================================================
        # CHECK HUMAN MESSAGE RESULT
        # =================================================

        if not human_result.get("success", False):

            state = orchestrator.get_state(session_id)

            return {

                "success": False,

                "session_id": session_id,

                "message":
                    human_result.get(
                        "message",
                        "Could not process human message.",
                    ),

                "round":
                    state.get("round", 1)
                    if isinstance(state, dict)
                    else 1,

                "current_proposal":
                    state.get("current_proposal")
                    if isinstance(state, dict)
                    else None,

                "state": state,

            }


        # =================================================
        # STEP 2: CHECK IF NEGOTIATION ALREADY ENDED
        # =================================================

        state = orchestrator.get_state(session_id)

        if isinstance(state, dict):

            if (
                state.get("consensus_reached", False)
                or state.get("max_rounds_reached", False)
                or state.get("negotiation_ended", False)
            ):

                return {

                    "success": True,

                    "session_id": session_id,

                    "ai_response": None,

                    "round":
                        state.get("round", 1),

                    "current_proposal":
                        state.get("current_proposal"),

                    "consensus_reached":
                        state.get(
                            "consensus_reached",
                            False,
                        ),

                    "max_rounds_reached":
                        state.get(
                            "max_rounds_reached",
                            False,
                        ),

                    "negotiation_ended":
                        state.get(
                            "negotiation_ended",
                            False,
                        ),

                    "state": state,

                }


        # =================================================
        # STEP 3: LET NEXT AI AGENT RESPOND
        # =================================================

        ai_result = orchestrator.step(session_id)


        print("\nAI RESULT:")
        print(ai_result)


        # =================================================
        # STEP 4: GET UPDATED STATE
        # =================================================

        state = orchestrator.get_state(session_id)


        # =================================================
        # RETURN COMPLETE RESULT
        # =================================================

        return {

            "success": True,

            "session_id": session_id,

            "human_message": body.message,

            "human_action": body.action,

            "ai_response": ai_result,

            "round":
                state.get("round", 1)
                if isinstance(state, dict)
                else 1,

            "current_proposal":
                state.get("current_proposal")
                if isinstance(state, dict)
                else None,

            "consensus_reached":
                state.get(
                    "consensus_reached",
                    False,
                )
                if isinstance(state, dict)
                else False,

            "max_rounds_reached":
                state.get(
                    "max_rounds_reached",
                    False,
                )
                if isinstance(state, dict)
                else False,

            "negotiation_ended":
                state.get(
                    "negotiation_ended",
                    False,
                )
                if isinstance(state, dict)
                else False,

            "state": state,

        }


    except Exception as error:

        print(
            "PRACTICE TURN ERROR:",
            str(error),
        )

        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


# =========================================================
# RESET NEGOTIATION
# =========================================================

@app.post("/api/negotiation/reset")
def reset_negotiation(body: StartRequest):

    try:

        session_id = orchestrator.create_session(
            scenario=body.scenario,
            agents_config=body.agents,
            config=body.config or {},
        )

        state = orchestrator.get_state(session_id)

        return {

            "success": True,

            "session_id": session_id,

            "message":
                "Negotiation session reset successfully.",

            "round":
                state.get("round", 1)
                if isinstance(state, dict)
                else 1,

            "current_proposal":
                state.get("current_proposal")
                if isinstance(state, dict)
                else None,

            "state": state,

        }

    except Exception as error:

        print(
            "RESET ERROR:",
            str(error),
        )

        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


# =========================================================
# RUN SERVER
# =========================================================

if __name__ == "__main__":

    import uvicorn

    host = os.getenv(
        "BACKEND_HOST",
        "127.0.0.1",
    )

    port = int(
        os.getenv(
            "BACKEND_PORT",
            "8000",
        )
    )

    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=True,
    )