import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Ensure the backend package directories are resolved before similarly named
# project-level folders when this file is started as `python backend\main.py`.
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR in sys.path:
    sys.path.remove(BACKEND_DIR)
sys.path.insert(0, BACKEND_DIR)

# Load configuration before importing modules that initialize Gemini clients.
load_dotenv(Path(__file__).resolve().parent / ".env")

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from services.negotiation_orchestrator import NegotiationOrchestrator


# =========================================================
# CREATE FASTAPI APP
# =========================================================

app = FastAPI(
    title="Multi-Agent Negotiation Simulator",
    version="1.0.0",
)


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# ORCHESTRATOR
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
    proposal: dict | None = None


# =========================================================
# ROOT
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
    response_model=HealthResponse
)
def health():
    return {
        "status": "ok"
    }


# =========================================================
# START NEGOTIATION
# =========================================================

@app.post("/api/negotiation/start")
def start_negotiation(body: StartRequest):

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
            "state": state,
            "message": "Negotiation session started successfully.",
        }

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


# =========================================================
# NEGOTIATION TURN
# =========================================================

@app.post("/api/negotiation/turn")
def negotiation_turn(body: TurnRequest):

    session_id = body.session_id

    if not orchestrator.session_exists(session_id):
        raise HTTPException(
            status_code=404,
            detail="Session not found",
        )

    try:
        result = orchestrator.step(session_id)

        return result

    except Exception as error:
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
            "state": state,
            "message": "Negotiation session reset successfully.",
        }

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error),
        )



# =========================================================
# PRACTICE MODE: START (3 AI AGENTS DELIBERATE FIRST)
# =========================================================

@app.post("/api/practice/start")
def practice_start(body: StartRequest):
    """
    Initializes Practice Mode where all 3 AI agents (Government, NGO, District)
    negotiate first in Round 1, setting the stage for the human participant.
    """
    try:
        session_id = orchestrator.create_session(
            scenario=body.scenario,
            agents_config=body.agents,
            config=body.config or {},
        )
        orchestrator.sessions[session_id]["is_practice"] = True
        orchestrator.sessions[session_id]["state"]["practice_mode"] = True

        # Round 1: All 3 AI agents deliberate first!
        ai_responses = orchestrator.step_practice_round(session_id)
        current_state = orchestrator.get_state(session_id)

        return {
            "success": True,
            "session_id": session_id,
            "ai_responses": ai_responses,
            "state": current_state,
            "round": current_state.get("current_round", 1),
            "consensus": current_state.get("consensus", 0.0),
            "status": "Your turn",
        }

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


# =========================================================
# PRACTICE MODE: TURN (HUMAN SUBMITS OPINION -> AI AGENTS RESPOND)
# =========================================================

@app.post("/api/practice/turn")
def practice_turn(body: PracticeTurnRequest):
    session_id = body.session_id

    if not orchestrator.session_exists(session_id):
        raise HTTPException(
            status_code=404,
            detail="Session not found",
        )

    try:
        # Ensure practice mode flag is set
        orchestrator.sessions[session_id]["is_practice"] = True
        orchestrator.sessions[session_id]["state"]["practice_mode"] = True

        # 1. Add the human participant's message (completes current round)
        human_result = orchestrator.add_human_message(
            session_id=session_id,
            message=body.message,
            resource=body.resource,
            amount=body.amount,
            action=body.action,
            proposal=body.proposal,
        )

        if not human_result.get("success"):
            return human_result

        state_after_human = orchestrator.get_state(session_id)

        # 2. If human acceptance closed agreement or max rounds reached, finish
        if state_after_human.get("negotiation_ended"):
            ai_responses = []
        else:
            # 3. Next round: All 3 AI agents deliberate in response to human's move
            ai_responses = orchestrator.step_practice_round(session_id)

        current_state = orchestrator.get_state(session_id)

        return {
            "success": True,
            "session_id": session_id,
            "human_message": body.message,
            "human_move": human_result,
            "ai_responses": ai_responses,
            "ai_response": ai_responses[-1] if ai_responses else None,
            "state": current_state,
            "round": current_state.get("current_round", 1),
            "consensus": current_state.get("consensus", 0.0),
            "negotiation_ended": current_state.get("negotiation_ended", False),
            "status": "Negotiation complete" if current_state.get("negotiation_ended") else "Your turn",
        }

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


class SuggestionRequest(BaseModel):
    session_id: str


@app.post("/api/practice/suggest")
def practice_suggest(body: SuggestionRequest):
    session_id = body.session_id

    if not orchestrator.session_exists(session_id):
        raise HTTPException(
            status_code=404,
            detail="Session not found",
        )

    try:
        suggestion = orchestrator.get_human_suggestion(session_id)
        return {
            "success": True,
            "session_id": session_id,
            "suggestion": suggestion,
        }
    except Exception as error:
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