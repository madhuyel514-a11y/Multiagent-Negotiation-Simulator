from .base_agent import BaseAgent


class DistrictAdministrationAgent(BaseAgent):
    def __init__(self, id, personality="Collaborative"):
        super().__init__(id=id, name="District Administration Agent", role="District Administration", primary_goal="Coordinate local distribution and logistics", constraints=["infrastructure", "local_rules", "communication"], personality=personality)

    async def act(self, context: dict, gemini_ask) -> dict:
        prompt = self.system_prompt(context.get("scenario", {}))
        prompt += f"\nPersonality: {self.personality}. Emphasize local constraints and feasibility.\nPrevious: {context.get('history', [])}"
        return await gemini_ask(prompt)
