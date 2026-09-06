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

import json
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
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
    Initializes Practice Mode where Human makes the initial proposal in Round 1,
    setting the stage for the AI agency heads (Government, NGO, District) to respond.
    """
    try:
        session_id = orchestrator.create_session(
            scenario=body.scenario,
            agents_config=body.agents,
            config=body.config or {},
        )
        orchestrator.sessions[session_id]["is_practice"] = True
        orchestrator.sessions[session_id]["state"]["practice_mode"] = True
        orchestrator.sessions[session_id]["state"]["awaiting_final_decision"] = False

        current_state = orchestrator.get_state(session_id)

        return {
            "success": True,
            "session_id": session_id,
            "ai_responses": [],
            "state": current_state,
            "round": 1,
            "consensus": 0.0,
            "status": "Your turn",
            "awaiting_final_decision": False,
        }

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


# =========================================================
# PRACTICE MODE: TURN (HUMAN SUBMITS PROPOSAL/COUNTER -> AI AGENTS RESPOND)
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

        # 1. Add human's proposal / counter / accept / reject for current round
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

        state = orchestrator.get_state(session_id)

        # 2. If human acceptance closed unanimous agreement early
        if state.get("negotiation_ended"):
            ai_responses = []
        else:
            # 3. Government -> NGO -> District deliberate and respond to human's proposal
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
            "awaiting_final_decision": current_state.get("awaiting_final_decision", False),
            "status": current_state.get("status", "Your turn"),
            "final_allocation": current_state.get("final_allocation"),
            "final_report": current_state.get("final_report"),
        }

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


# =========================================================
# PRACTICE MODE: STREAMING TURN (PROGRESSIVE AGENT-BY-AGENT RESPONSE)
# =========================================================

@app.post("/api/practice/stream-turn")
async def practice_stream_turn(body: PracticeTurnRequest):
    session_id = body.session_id

    if not orchestrator.session_exists(session_id):
        raise HTTPException(
            status_code=404,
            detail="Session not found",
        )

    try:
        orchestrator.sessions[session_id]["is_practice"] = True
        orchestrator.sessions[session_id]["state"]["practice_mode"] = True

        # 1. Add human's proposal / counter / accept / reject for current round
        human_result = orchestrator.add_human_message(
            session_id=session_id,
            message=body.message,
            resource=body.resource,
            amount=body.amount,
            action=body.action,
            proposal=body.proposal,
        )

        if not human_result.get("success"):
            async def error_generator():
                yield f"data: {json.dumps({'type': 'error', 'detail': human_result})}\n\n"
            return StreamingResponse(error_generator(), media_type="text/event-stream")

        initial_state = orchestrator.get_state(session_id)

        async def event_generator():
            # 1. Yield human move confirmation
            yield f"data: {json.dumps({'type': 'human_move_recorded', 'human_move': human_result, 'state': initial_state})}\n\n"

            # 2. If human acceptance closed unanimous agreement early
            if initial_state.get("negotiation_ended"):
                yield f"data: {json.dumps({'type': 'round_complete', 'state': initial_state})}\n\n"
                return

            # 3. Deliberate AI agents one by one and stream each response
            async for event in orchestrator.stream_practice_round(session_id):
                yield f"data: {json.dumps(event)}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


class PracticeDecisionRequest(BaseModel):
    session_id: str
    decision: str  # "accept" | "reject" | "reset"


@app.post("/api/practice/decision")
def practice_decision(body: PracticeDecisionRequest):
    session_id = body.session_id

    if not orchestrator.session_exists(session_id):
        raise HTTPException(
            status_code=404,
            detail="Session not found",
        )

    try:
        updated_state = orchestrator.handle_final_decision(
            session_id=session_id,
            decision=body.decision
        )
        return {
            "success": True,
            "session_id": session_id,
            "state": updated_state,
            "decision": body.decision,
            "status": updated_state.get("status"),
            "consensus": updated_state.get("consensus", 0.0),
            "negotiation_ended": updated_state.get("negotiation_ended", False),
            "final_allocation": updated_state.get("final_allocation"),
            "final_report": updated_state.get("final_report"),
            "awaiting_final_decision": False,
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