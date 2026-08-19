from .base_agent import BaseAgent


class GovernmentAgent(BaseAgent):
    def __init__(self, id, personality="Collaborative"):
        super().__init__(
            id=id,
            name="Government Agent",
            role="Government",
            primary_goal="Ensure public safety and equitable resource distribution",
            constraints=["budget", "logistics", "public_policy"],
            personality=personality
        )

    async def act(self, context: dict, gemini_ask) -> dict:
        prompt = self.system_prompt(context.get("scenario", {}))
        prompt += f"\nPersonality: {self.personality}. Focus on Rescue Teams and infrastructure access."

        resource_quantities = context.get("resource_quantities", {})
        if resource_quantities:
            prompt += "\n\nAvailable Resources:"
            for resource_name, quantity in resource_quantities.items():
                prompt += f"\n  - {resource_name}: {quantity} units"

        prompt += f"\n\nPrevious negotiation history: {context.get('history', [])}"

        return await gemini_ask(
            prompt,
            agent_name=self.name,
            total_budget=context.get("total_budget"),
            last_proposals=context.get("last_proposals", {}),
            current_round=context.get("current_round", 1),
            resource_quantities=resource_quantities,
        )
