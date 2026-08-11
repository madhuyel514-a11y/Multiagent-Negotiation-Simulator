from .base_agent import BaseAgent


class NGOAgent(BaseAgent):
    def __init__(self, id, personality="Collaborative"):
        super().__init__(id=id, name="NGO Agent", role="NGO", primary_goal="Deliver humanitarian aid effectively and transparently", constraints=["funding", "access", "safety"], personality=personality)

    async def act(self, context: dict, gemini_ask) -> dict:
        prompt = self.system_prompt(context.get("scenario", {}))
        prompt += f"\nPersonality: {self.personality}. Prioritize vulnerable populations and speed.\nPrevious: {context.get('history', [])}"
        return await gemini_ask(prompt)
