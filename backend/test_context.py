from services.negotiation_orchestrator import NegotiationOrchestrator

orchestrator = NegotiationOrchestrator()

scenario = {
    "name": "Flood Relief Resource Allocation",
    "description": "Allocate emergency resources among affected districts.",
    "agents": [
        {
            "id": "agent-1",
            "name": "Government Agent",
            "role": "Government",
        },
        {
            "id": "agent-2",
            "name": "NGO Agent",
            "role": "NGO",
        },
        {
            "id": "agent-3",
            "name": "District Administration Agent",
            "role": "District Administration",
        },
    ],
}

agents_config = [
    {
        "id": "agent-1",
        "name": "Government Agent",
        "role": "Government",
        "personality": "Aggressive",
    },
    {
        "id": "agent-2",
        "name": "NGO Agent",
        "role": "NGO",
        "personality": "Collaborative",
    },
    {
        "id": "agent-3",
        "name": "District Administration Agent",
        "role": "District Administration",
        "personality": "Risk-Averse",
    },
]

config = {
    "max_rounds": 3
}


# Create negotiation session
session_id = orchestrator.create_session(
    scenario,
    agents_config,
    config
)

print("SESSION ID:")
print(session_id)

print("\n--- INITIAL NGO CONTEXT ---")

context = orchestrator.get_agent_context(
    session_id,
    "agent-2"
)

print(context)

# Run two turns
orchestrator.step(session_id)
orchestrator.step(session_id)

print("\n--- NGO CONTEXT AFTER 2 TURNS ---")

context = orchestrator.get_agent_context(
    session_id,
    "agent-2"
)

print("Current round:", context["current_round"])
print("History length:", len(context["history"]))

print("\nHistory:")
for item in context["history"]:
    print(
        f"Round {item['round']} | "
        f"{item['agent']} | "
        f"{item['message']}"
    )