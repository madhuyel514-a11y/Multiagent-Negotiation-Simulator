import json

from reasoning_engine import generate_offer
from services.gemini_client import generate_response

from personas.government import government_persona
from personas.ngo import ngo_persona
from personas.district import district_persona


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
The District Administration wants additional resources
for the worst-hit areas.

The agents must negotiate a practical agreement.
""",

    "2": """
Earthquake in Nepal.
Hospitals damaged.
25000 people affected.
Emergency medical supplies, food and water are urgently required.

The Government Agent wants fair distribution.
The NGO Agent prioritizes vulnerable people.
The District Administration wants additional resources
for the worst-hit areas.

The agents must negotiate a practical agreement.
""",

    "3": """
Cyclone in Odisha.
Roads blocked.
70000 people affected.
Large numbers of people need food, medicine and clean drinking water.

The Government Agent wants fair distribution.
The NGO Agent prioritizes vulnerable people.
The District Administration wants additional resources
for the worst-hit areas.

The agents must negotiate a practical agreement.
"""
}


SCENARIO_NAMES = {
    "1": "Flood - Karnataka",
    "2": "Earthquake - Nepal",
    "3": "Cyclone - Odisha"
}


# ============================================================
# AGENTS
# ============================================================

PERSONAS = {
    "government": government_persona,
    "ngo": ngo_persona,
    "district": district_persona
}


AGENT_NAMES = {
    "government": "Government Agent",
    "ngo": "NGO Agent",
    "district": "District Administration Agent"
}


# ============================================================
# PERSONALITIES
# ============================================================

PERSONALITIES = {
    "1": "aggressive",
    "2": "collaborative",
    "3": "risk-averse"
}


PERSONALITY_DISPLAY = {
    "aggressive": "Aggressive",
    "collaborative": "Collaborative",
    "risk-averse": "Risk-Averse"
}


# ============================================================
# RESOURCES
# ============================================================

RESOURCES = {
    "food": 500,
    "medicine": 200,
    "water": 1000
}


# ============================================================
# JSON PARSER
# ============================================================

def parse_json_response(response):

    if isinstance(response, dict):
        return response

    text = str(response).strip()

    if text.startswith("```json"):
        text = text[7:]

    elif text.startswith("```"):
        text = text[3:]

    if text.endswith("```"):
        text = text[:-3]

    text = text.strip()

    try:
        return json.loads(text)

    except json.JSONDecodeError:

        start = text.find("{")
        end = text.rfind("}")

        if start != -1 and end != -1:

            try:
                return json.loads(
                    text[start:end + 1]
                )

            except json.JSONDecodeError:
                return None

        return None


# ============================================================
# DISPLAY OFFER
# ============================================================

def display_offer(result):

    if not result:
        print("\nNo valid response received.")
        return

    print("\nAgent:")
    print(result.get("agent", "Unknown Agent"))

    offer = result.get("offer", {})

    print("\nOffer:")

    print(
        "  Food     :",
        offer.get("food", 0)
    )

    print(
        "  Medicine :",
        offer.get("medicine", 0)
    )

    print(
        "  Water    :",
        offer.get("water", 0)
    )

    print("\nReason:")
    print(
        result.get(
            "reason",
            "No reason provided."
        )
    )

    print(
        "\nAccept:",
        result.get("accept", False)
    )


# ============================================================
# CHOOSE PERSONALITY
# ============================================================

def choose_personality(agent_name):

    print("\n")
    print("-" * 70)

    print(
        f"Select Personality for {agent_name}"
    )

    print("-" * 70)

    print("1. Aggressive")
    print("2. Collaborative")
    print("3. Risk-Averse")

    while True:

        choice = input(
            f"Enter choice for {agent_name}: "
        ).strip()

        if choice in PERSONALITIES:

            return PERSONALITIES[choice]

        print(
            "Invalid choice. Please select 1, 2 or 3."
        )


# ============================================================
# CHOOSE SCENARIO
# ============================================================

def choose_scenario():

    print("\n")
    print("=" * 70)
    print("                    CHOOSE SCENARIO")
    print("=" * 70)

    print("\n1. Flood - Karnataka")
    print("2. Earthquake - Nepal")
    print("3. Cyclone - Odisha")

    while True:

        choice = input(
            "\nEnter scenario choice: "
        ).strip()

        if choice in SCENARIOS:
            return choice

        print(
            "Invalid scenario. Please select 1, 2 or 3."
        )


# ============================================================
# DISPLAY CONFIGURATION
# ============================================================

def display_configuration(
    scenario_choice,
    personalities
):

    print("\n")
    print("=" * 70)
    print("                 NEGOTIATION CONFIGURATION")
    print("=" * 70)

    print(
        "\nScenario:",
        SCENARIO_NAMES[scenario_choice]
    )

    print("\nAgents:")

    print(
        "Government Agent              :",
        PERSONALITY_DISPLAY[
            personalities["government"]
        ]
    )

    print(
        "NGO Agent                     :",
        PERSONALITY_DISPLAY[
            personalities["ngo"]
        ]
    )

    print(
        "District Administration Agent :",
        PERSONALITY_DISPLAY[
            personalities["district"]
        ]
    )

    print("\nResources:")

    print(
        "Food     :",
        RESOURCES["food"]
    )

    print(
        "Medicine :",
        RESOURCES["medicine"]
    )

    print(
        "Water    :",
        RESOURCES["water"]
    )

    print("=" * 70)


# ============================================================
# BUILD INITIAL HISTORY
# ============================================================

def build_initial_history(
    scenario,
    personalities
):

    return f"""
NEGOTIATION START

SCENARIO:
{scenario}

AVAILABLE RESOURCES:
Food: {RESOURCES["food"]}
Medicine: {RESOURCES["medicine"]}
Water: {RESOURCES["water"]}

AGENTS:

Government Agent
Personality: {personalities["government"]}

NGO Agent
Personality: {personalities["ngo"]}

District Administration Agent
Personality: {personalities["district"]}

IMPORTANT:

All three agents must participate in the negotiation.

The Government Agent, NGO Agent and District Administration
Agent must communicate with each other.

Each agent must consider:
- Its own role
- Its own goals
- Its own constraints
- Its selected personality
- Previous negotiation history
- Offers made by the other agents

The negotiation must proceed through multiple rounds.
"""


# ============================================================
# SIMULATION MODE
# ============================================================

def simulation_mode():

    print("\n")
    print("=" * 70)
    print("                    SIMULATION MODE")
    print("=" * 70)

    # --------------------------------------------------------
    # STEP 1: SELECT ONE SCENARIO
    # --------------------------------------------------------

    scenario_choice = choose_scenario()

    scenario = SCENARIOS[
        scenario_choice
    ]

    # --------------------------------------------------------
    # STEP 2: SELECT PERSONALITY FOR ALL THREE AGENTS
    # --------------------------------------------------------

    print("\n")
    print("=" * 70)
    print("             CONFIGURE ALL THREE AGENTS")
    print("=" * 70)

    print(
        "\nYou will now select the personality "
        "for each of the three agents."
    )

    # Government
    government_personality = choose_personality(
        "Government Agent"
    )

    # NGO
    ngo_personality = choose_personality(
        "NGO Agent"
    )

    # District
    district_personality = choose_personality(
        "District Administration Agent"
    )

    personalities = {

        "government":
            government_personality,

        "ngo":
            ngo_personality,

        "district":
            district_personality
    }

    # --------------------------------------------------------
    # STEP 3: SHOW CONFIGURATION
    # --------------------------------------------------------

    display_configuration(
        scenario_choice,
        personalities
    )

    # --------------------------------------------------------
    # STEP 4: START NEGOTIATION AUTOMATICALLY
    # --------------------------------------------------------

    print("\n")
    print("=" * 70)
    print("                 STARTING NEGOTIATION")
    print("=" * 70)

    # --------------------------------------------------------
    # STEP 5: INITIAL HISTORY
    # --------------------------------------------------------

    history = build_initial_history(
        scenario,
        personalities
    )

    # --------------------------------------------------------
    # STEP 6: NEGOTIATION
    #
    # All three agents are used.
    # No individual agent selection happens here.
    # --------------------------------------------------------

    MAX_ROUNDS = 5

    agreement_reached = False

    print("\n")
    print("=" * 70)
    print("                 NEGOTIATION STARTED")
    print("=" * 70)

    print(
        "\nGovernment Agent  <->  NGO Agent  <->  "
        "District Administration Agent"
    )

    print(
        "\nAll three agents will negotiate automatically."
    )

    # --------------------------------------------------------
    # Each round
    # --------------------------------------------------------

    for round_number in range(
        1,
        MAX_ROUNDS + 1
    ):

        print("\n")
        print("=" * 70)
        print(
            f"                    ROUND {round_number}"
        )
        print("=" * 70)

        # ----------------------------------------------------
        # Government
        # ----------------------------------------------------

        print("\n")
        print("-" * 70)
        print("GOVERNMENT AGENT")
        print("-" * 70)

        print(
            "\nPersonality:",
            PERSONALITY_DISPLAY[
                personalities["government"]
            ]
        )

        try:

            government_response = generate_offer(
                PERSONAS["government"],
                personalities["government"],
                scenario,
                str(RESOURCES),
                history
            )

        except Exception as e:

            print(
                "\nGovernment Agent Error:"
            )

            print(e)

            return

        government_result = parse_json_response(
            government_response
        )

        if government_result is None:

            print(
                "\nInvalid Government response:"
            )

            print(
                government_response
            )

            return

        display_offer(
            government_result
        )

        # Add Government response to history
        history += f"""

ROUND {round_number}

Government Agent
Personality:
{personalities["government"]}

Response:
{json.dumps(
    government_result,
    indent=2
)}
"""

        # ----------------------------------------------------
        # NGO
        # ----------------------------------------------------

        print("\n")
        print("-" * 70)
        print("NGO AGENT")
        print("-" * 70)

        print(
            "\nPersonality:",
            PERSONALITY_DISPLAY[
                personalities["ngo"]
            ]
        )

        try:

            ngo_response = generate_offer(
                PERSONAS["ngo"],
                personalities["ngo"],
                scenario,
                str(RESOURCES),
                history
            )

        except Exception as e:

            print(
                "\nNGO Agent Error:"
            )

            print(e)

            return

        ngo_result = parse_json_response(
            ngo_response
        )

        if ngo_result is None:

            print(
                "\nInvalid NGO response:"
            )

            print(
                ngo_response
            )

            return

        display_offer(
            ngo_result
        )

        # Add NGO response to history
        history += f"""

ROUND {round_number}

NGO Agent
Personality:
{personalities["ngo"]}

Response:
{json.dumps(
    ngo_result,
    indent=2
)}
"""

        # ----------------------------------------------------
        # District Administration
        # ----------------------------------------------------

        print("\n")
        print("-" * 70)
        print("DISTRICT ADMINISTRATION AGENT")
        print("-" * 70)

        print(
            "\nPersonality:",
            PERSONALITY_DISPLAY[
                personalities["district"]
            ]
        )

        try:

            district_response = generate_offer(
                PERSONAS["district"],
                personalities["district"],
                scenario,
                str(RESOURCES),
                history
            )

        except Exception as e:

            print(
                "\nDistrict Administration Agent Error:"
            )

            print(e)

            return

        district_result = parse_json_response(
            district_response
        )

        if district_result is None:

            print(
                "\nInvalid District response:"
            )

            print(
                district_response
            )

            return

        display_offer(
            district_result
        )

        # Add District response to history
        history += f"""

ROUND {round_number}

District Administration Agent
Personality:
{personalities["district"]}

Response:
{json.dumps(
    district_result,
    indent=2
)}
"""

        # ----------------------------------------------------
        # CHECK AGREEMENT
        # ----------------------------------------------------

        government_accept = government_result.get(
            "accept",
            False
        )

        ngo_accept = ngo_result.get(
            "accept",
            False
        )

        district_accept = district_result.get(
            "accept",
            False
        )

        if isinstance(
            government_accept,
            str
        ):

            government_accept = (
                government_accept.lower()
                == "true"
            )

        if isinstance(
            ngo_accept,
            str
        ):

            ngo_accept = (
                ngo_accept.lower()
                == "true"
            )

        if isinstance(
            district_accept,
            str
        ):

            district_accept = (
                district_accept.lower()
                == "true"
            )

        if (
            government_accept
            and ngo_accept
            and district_accept
        ):

            agreement_reached = True

            print("\n")
            print("=" * 70)
            print("              AGREEMENT REACHED")
            print("=" * 70)

            print(
                "\nAll three agents accepted."
            )

            break

    # ========================================================
    # FINAL SUMMARY
    # ========================================================

    print("\n")
    print("=" * 70)
    print("                 SIMULATION SUMMARY")
    print("=" * 70)

    print(
        "\nScenario:",
        SCENARIO_NAMES[scenario_choice]
    )

    print(
        "\nGovernment Agent:",
        PERSONALITY_DISPLAY[
            personalities["government"]
        ]
    )

    print(
        "NGO Agent:",
        PERSONALITY_DISPLAY[
            personalities["ngo"]
        ]
    )

    print(
        "District Administration Agent:",
        PERSONALITY_DISPLAY[
            personalities["district"]
        ]
    )

    print(
        "\nRounds completed:",
        round_number
    )

    if agreement_reached:

        print(
            "\nStatus: AGREEMENT REACHED"
        )

    else:

        print(
            "\nStatus: NO AGREEMENT"
        )

    print("\nSimulation Mode finished.")


# ============================================================
# PRACTICE MODE
# ============================================================

def practice_mode():

    print("\n")
    print("=" * 70)
    print("                     PRACTICE MODE")
    print("=" * 70)

    # --------------------------------------------------------
    # Scenario
    # --------------------------------------------------------

    scenario_choice = choose_scenario()

    scenario = SCENARIOS[
        scenario_choice
    ]

    # --------------------------------------------------------
    # Practice Mode still uses ONE AI agent
    # --------------------------------------------------------

    print("\n")
    print("Choose AI Agent")

    print("1. Government")
    print("2. NGO")
    print("3. District Admin")

    while True:

        agent_choice = input(
            "Enter choice: "
        ).strip()

        if agent_choice in {
            "1",
            "2",
            "3"
        }:

            break

        print(
            "Invalid agent."
        )

    agent_map = {

        "1": (
            "government",
            government_persona
        ),

        "2": (
            "ngo",
            ngo_persona
        ),

        "3": (
            "district",
            district_persona
        )
    }

    agent_key, persona = agent_map[
        agent_choice
    ]

    personality = choose_personality(
        AGENT_NAMES[agent_key]
    )

    agent_name = persona.get(
        "name",
        AGENT_NAMES[agent_key]
    )

    print("\n")
    print("=" * 70)
    print("                 PRACTICE CONFIGURATION")
    print("=" * 70)

    print(
        "\nScenario:",
        SCENARIO_NAMES[scenario_choice]
    )

    print(
        "AI Agent:",
        agent_name
    )

    print(
        "Personality:",
        PERSONALITY_DISPLAY[personality]
    )

    print(
        "\nYou are now negotiating with the AI."
    )

    print(
        "Type 'exit' to leave Practice Mode."
    )

    # --------------------------------------------------------
    # Practice History
    # --------------------------------------------------------

    history = f"""
PRACTICE NEGOTIATION

Scenario:
{scenario}

Available Resources:
{RESOURCES}

AI Agent:
{agent_name}

Personality:
{personality}
"""

    MAX_ROUNDS = 10

    for round_number in range(
        1,
        MAX_ROUNDS + 1
    ):

        print("\n")
        print("-" * 70)
        print(
            f"                    ROUND {round_number}"
        )
        print("-" * 70)

        human_offer = input(
            "\nYou: "
        ).strip()

        if human_offer.lower() == "exit":

            print(
                "\nPractice Mode ended."
            )

            return

        if not human_offer:

            print(
                "Please enter an offer."
            )

            continue

        prompt = f"""
You are {agent_name}.

Role:
{persona['role']}

Goal:
{persona['goal']}

Priority:
{", ".join(persona['priority'])}

Constraints:
{", ".join(persona['constraints'])}

Selected Personality:
{personality}

Negotiation Style:
{persona['negotiation_style']}

PERSONALITY RULES:

Aggressive:
- Be firm.
- Make strong demands.
- Make fewer concessions.

Collaborative:
- Seek compromise.
- Consider everyone's needs.
- Be cooperative.

Risk-Averse:
- Protect emergency reserves.
- Avoid risky commitments.
- Prioritize safety.

SCENARIO:
{scenario}

AVAILABLE RESOURCES:
{RESOURCES}

FULL NEGOTIATION HISTORY:
{history}

CURRENT HUMAN OFFER:
{human_offer}

Analyze the human's offer.

Decide whether to accept or reject it.

If rejecting:
make a reasonable counter-offer.

Return ONLY valid JSON:

{{
    "agent": "{agent_name}",
    "offer": {{
        "food": 0,
        "medicine": 0,
        "water": 0
    }},
    "reason": "",
    "accept": false
}}
"""

        print(
            "\nGemini is thinking..."
        )

        try:

            response = generate_response(
                prompt
            )

        except Exception as e:

            print(
                "\nERROR WHILE CALLING GEMINI:"
            )

            print(e)

            return

        result = parse_json_response(
            response
        )

        if result is None:

            print(
                "\nInvalid Gemini response."
            )

            print(response)

            continue

        print("\n")
        print("=" * 70)
        print("                     AI RESPONSE")
        print("=" * 70)

        display_offer(
            result
        )

        history += f"""

ROUND {round_number}

Human Offer:
{human_offer}

AI Response:
{json.dumps(
    result,
    indent=2
)}
"""

        accepted = result.get(
            "accept",
            False
        )

        if isinstance(
            accepted,
            str
        ):

            accepted = (
                accepted.lower()
                == "true"
            )

        if accepted:

            print("\n")
            print("=" * 70)
            print("                NEGOTIATION ACCEPTED")
            print("=" * 70)

            print(
                "\nThe AI accepted your offer."
            )

            return

    print(
        "\nMaximum practice rounds reached."
    )

    print(
        "Practice Mode ended."
    )


# ============================================================
# MAIN MENU
# ============================================================

def main():

    print("\n")
    print("=" * 70)
    print("             DISASTER RELIEF NEGOTIATION SYSTEM")
    print("=" * 70)

    print("\nSelect Mode")
    print("1. Simulation Mode")
    print("2. Practice Mode")
    print("3. Exit")

    while True:

        choice = input(
            "\nEnter your choice: "
        ).strip()

        if choice == "1":

            simulation_mode()
            print("\nProgram finished.")
            break

        elif choice == "2":

            practice_mode()
            print("\nProgram finished.")
            break

        elif choice == "3":

            print("\nThank you for using the system.")
            break

        else:

            print("\nInvalid choice. Please enter 1, 2 or 3.")


# ============================================================
# START
# ============================================================

if __name__ == "__main__":
    main()