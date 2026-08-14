from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Dict

from negotiation_engine import run_negotiation

from personas.government import government_persona
from personas.ngo import ngo_persona
from personas.district import district_persona


# ============================================================
# FASTAPI APPLICATION
# ============================================================

app = FastAPI(
    title="Disaster Relief Resource Negotiation System",
    version="1.0.0"
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


# ============================================================
# REQUEST MODEL
# ============================================================

class NegotiationRequest(BaseModel):

    scenario: str = Field(
        ...,
        description="Scenario ID: 1, 2 or 3"
    )

    personalities: Dict[str, str] = Field(
        default={
            "government": "collaborative",
            "ngo": "collaborative",
            "district": "collaborative"
        },
        description="Personality of each agent"
    )

    resources: Dict[str, int]

    history: str = ""

    max_rounds: int = Field(
        default=3,
        ge=1,
        le=10
    )


# ============================================================
# SCENARIOS
# ============================================================

SCENARIOS = {

    "1": """
Flood in Karnataka.

50000 people affected.

Severe flooding has affected residential areas.

People urgently need food, medicine and clean drinking water.

The Government Agent wants fair distribution.
The NGO Agent prioritizes vulnerable people.
The District Administration wants additional
resources for the worst-hit areas.

The agents must negotiate a practical agreement.
""",

    "2": """
Earthquake in Nepal.

Hospitals damaged.

25000 people affected.

Emergency medical supplies, food and water
are urgently required.

The Government Agent wants fair distribution.
The NGO Agent prioritizes vulnerable people.
The District Administration wants additional
resources for the worst-hit areas.

The agents must negotiate a practical agreement.
""",

    "3": """
Cyclone in Odisha.

Roads blocked.

70000 people affected.

Large numbers of people need food,
medicine and clean drinking water.

The Government Agent wants fair distribution.
The NGO Agent prioritizes vulnerable people.
The District Administration wants additional
resources for the worst-hit areas.

The agents must negotiate a practical agreement.
"""
}


# ============================================================
# PERSONAS
# ============================================================

PERSONAS = {
    "government": government_persona,
    "ngo": ngo_persona,
    "district": district_persona
}


# ============================================================
# ALLOWED VALUES
# ============================================================

ALLOWED_AGENTS = {
    "government",
    "ngo",
    "district"
}

ALLOWED_PERSONALITIES = {
    "aggressive",
    "collaborative",
    "risk-averse"
}


# ============================================================
# HOME
# ============================================================

@app.get("/")
def home():

    return {
        "success": True,
        "system": "Disaster Relief Resource Negotiation System",
        "status": "running"
    }


# ============================================================
# SCENARIOS
# ============================================================

@app.get("/api/scenarios")
def get_scenarios():

    return {
        "success": True,
        "scenarios": SCENARIOS
    }


# ============================================================
# PERSONAS
# ============================================================

@app.get("/api/personas")
def get_personas():

    return {
        "success": True,

        "personas": {
            "government": government_persona["name"],
            "ngo": ngo_persona["name"],
            "district": district_persona["name"]
        }
    }


# ============================================================
# NEGOTIATION API
# ============================================================

@app.post("/api/negotiate")
def negotiate(request: NegotiationRequest):

    try:

        # ====================================================
        # SCENARIO VALIDATION
        # ====================================================

        scenario_id = request.scenario.strip()

        if scenario_id not in SCENARIOS:

            return {
                "success": False,
                "error": (
                    "Invalid scenario. "
                    "Please use 1, 2 or 3."
                ),
                "valid_scenarios": [
                    "1",
                    "2",
                    "3"
                ]
            }


        # ====================================================
        # PERSONALITY VALIDATION
        # ====================================================

        personalities = {}

        for agent_name in ALLOWED_AGENTS:

            personality = request.personalities.get(
                agent_name,
                "collaborative"
            )

            personality = personality.lower().strip()

            if personality not in ALLOWED_PERSONALITIES:

                return {
                    "success": False,
                    "error": (
                        f"Invalid personality for {agent_name}."
                    ),
                    "valid_personalities": [
                        "aggressive",
                        "collaborative",
                        "risk-averse"
                    ]
                }

            personalities[agent_name] = personality


        # ====================================================
        # RESOURCE VALIDATION
        # ====================================================

        food = request.resources.get(
            "food",
            0
        )

        medicine = request.resources.get(
            "medicine",
            0
        )

        water = request.resources.get(
            "water",
            0
        )


        # Make sure resources are integers

        if not isinstance(food, int):

            return {
                "success": False,
                "error": "Food must be an integer."
            }


        if not isinstance(medicine, int):

            return {
                "success": False,
                "error": "Medicine must be an integer."
            }


        if not isinstance(water, int):

            return {
                "success": False,
                "error": "Water must be an integer."
            }


        # Make sure resources are not negative

        if food < 0:

            return {
                "success": False,
                "error": "Food cannot be negative."
            }


        if medicine < 0:

            return {
                "success": False,
                "error": "Medicine cannot be negative."
            }


        if water < 0:

            return {
                "success": False,
                "error": "Water cannot be negative."
            }


        resources = {
            "food": food,
            "medicine": medicine,
            "water": water
        }


        # ====================================================
        # ROUND VALIDATION
        # ====================================================

        if request.max_rounds < 1:

            return {
                "success": False,
                "error": "max_rounds must be at least 1."
            }


        if request.max_rounds > 10:

            return {
                "success": False,
                "error": "max_rounds cannot exceed 10."
            }


        # ====================================================
        # SCENARIO
        # ====================================================

        scenario = SCENARIOS[scenario_id]


        # ====================================================
        # INITIAL HISTORY
        # ====================================================

        if request.history.strip():

            scenario += """

Initial Negotiation History:

""" + request.history


        # ====================================================
        # DEBUG INFORMATION
        # ====================================================

        print()
        print("=" * 70)
        print("NEGOTIATION API REQUEST")
        print("=" * 70)

        print(
            "Scenario:",
            scenario_id
        )

        print(
            "Personalities:",
            personalities
        )

        print(
            "Resources:",
            resources
        )

        print(
            "Max Rounds:",
            request.max_rounds
        )

        print("=" * 70)


        # ====================================================
        # RUN NEGOTIATION
        # ====================================================

        result = run_negotiation(
            personas=PERSONAS,
            scenario=scenario,
            resources=resources,
            personalities=personalities,
            max_rounds=request.max_rounds
        )


        # ====================================================
        # RETURN RESULT
        # ====================================================

        return {

            "success": True,

            "scenario": scenario_id,

            "personalities": personalities,

            "resources": resources,

            "negotiation": result
        }


    # ========================================================
    # ERROR HANDLING
    # ========================================================

    except Exception as e:

        print()
        print("=" * 70)
        print("NEGOTIATION API ERROR")
        print("=" * 70)

        print(
            str(e)
        )

        print("=" * 70)


        return {

            "success": False,

            "error": str(e)
        }


# ============================================================
# START SERVER
# ============================================================

if __name__ == "__main__":

    import uvicorn

    uvicorn.run(
        "app:app",
        host="127.0.0.1",
        port=8000,
        reload=True
    )