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
        return f"You are {self.name}, role: {self.role}. Goal: {self.primary_goal}. Constraints: {', '.join(self.constraints)}."

    async def act(self, context: dict, gemini_ask) -> dict:
        """Produce a proposal/response. gemini_ask is an async callable that accepts a prompt."""
        # Default simple behavior: construct prompt and call gemini_ask
        prompt = self.system_prompt(context.get("scenario", {})) + "\n"
        prompt += f"Personality: {self.personality}. Previous messages: {context.get('history', [])}\n"
        # Use gemini_ask to generate message; fallback to deterministic stub
        result = await gemini_ask(prompt)
        return result
