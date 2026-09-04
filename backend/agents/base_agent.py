from dataclasses import dataclass


@dataclass
class BaseAgent:
    id: str
    name: str
    role: str
    primary_goal: str
    constraints: list
    personality: str

    def system_prompt(self, scenario: dict) -> str:
        scenario_name = scenario.get("name", "Disaster Relief Scenario")

        return (
            f"You are {self.name}.\n"
            f"Role: {self.role}.\n"
            f"Scenario: {scenario_name}.\n"
            f"Primary Goal: {self.primary_goal}.\n"
            f"Constraints: {', '.join(self.constraints)}."
        )

    async def act(self, context: dict, gemini_ask) -> dict:
        """Produce a proposal or response using the Gemini service."""

        prompt = self.system_prompt(context.get("scenario", {}))

        prompt += f"\nPersonality: {self.personality}"
        prompt += f"\nPrevious messages: {context.get('history', [])}"

        return await gemini_ask(
            prompt,
            agent_name=self.name,
            total_budget=context.get("total_budget"),
            last_proposals=context.get("last_proposals", {}),
            current_round=context.get("current_round", 1),
            resource_quantities=context.get("resource_quantities", {}),
            current_proposal=context.get("current_proposal", {}),
            agent_names=[
                item.get("name")
                for item in context.get("agents", [])
            ],
            max_rounds=context.get("max_rounds", 5),
            scenario=context.get("scenario", {}),
            stubborn_until=context.get("stubborn_until"),
        )