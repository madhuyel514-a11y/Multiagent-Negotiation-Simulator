from .base_agent import BaseAgent


class GovernmentAgent(BaseAgent):
    def __init__(self, id, personality="Collaborative"):
        super().__init__(id=id, name="Government Agent", role="Government", primary_goal="Ensure public safety and equitable resource distribution", constraints=["budget", "logistics", "public_policy"], personality=personality)

    async def act(self, context: dict, gemini_ask) -> dict:
        prompt = self.system_prompt(context.get("scenario", {}))
        prompt += f"\nPersonality: {self.personality}. Focus on allocations and coordination.\nPrevious: {context.get('history', [])}"
        return await gemini_ask(prompt)
