import os
import uuid
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from services.negotiation_orchestrator import NegotiationOrchestrator

load_dotenv()

app = FastAPI()

# Allow only the frontend origins to receive CORS headers. Avoid using '*' when
# credentials are allowed — browsers will ignore Access-Control-Allow-Origin
# if credentials are true and allow_origins is '*'.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

orchestrator = NegotiationOrchestrator()


class HealthResponse(BaseModel):
    status: str


class StartRequest(BaseModel):
    scenario: dict
    agents: list
    config: dict | None = None


class TurnRequest(BaseModel):
    session_id: str


@app.get("/api/health", response_model=HealthResponse)
def health():
    return {"status": "ok"}


@app.post("/api/negotiation/start")
def start_negotiation(body: StartRequest):
    session_id = orchestrator.create_session(body.scenario, body.agents, body.config or {})
    state = orchestrator.get_state(session_id)
    return {"session_id": session_id, "state": state}


@app.post("/api/negotiation/turn")
def negotiation_turn(body: TurnRequest):
    session_id = body.session_id
    if not orchestrator.session_exists(session_id):
        raise HTTPException(status_code=404, detail="Session not found")

    result = orchestrator.step(session_id)
    return result


@app.post("/api/negotiation/reset")
def reset_negotiation(body: StartRequest):
    # Reset creates a new session similar to start
    session_id = orchestrator.create_session(body.scenario, body.agents, body.config or {})
    state = orchestrator.get_state(session_id)
    return {"session_id": session_id, "state": state}


if __name__ == "__main__":
    import uvicorn
    host = os.getenv("BACKEND_HOST", "127.0.0.1")
    port = int(os.getenv("BACKEND_PORT", 8000))
    uvicorn.run("main:app", host=host, port=port, reload=True)
