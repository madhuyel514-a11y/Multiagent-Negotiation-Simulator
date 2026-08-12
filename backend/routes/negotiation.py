from fastapi import APIRouter
from pydantic import BaseModel

from services.negotiation_orchestrator import NegotiationOrchestrator


router = APIRouter(
    prefix="/api/negotiation",
    tags=["Negotiation"]
)


orchestrator = NegotiationOrchestrator()


class StartNegotiationRequest(BaseModel):
    scenario: dict
    agents: list
    config: dict = {}


@router.post("/start")
def start_negotiation(
    request: StartNegotiationRequest
):
    session_id = orchestrator.create_session(
        scenario=request.scenario,
        agents_config=request.agents,
        config=request.config
    )

    return {
        "success": True,
        "session_id": session_id,
        "message": "Negotiation session started successfully."
    }