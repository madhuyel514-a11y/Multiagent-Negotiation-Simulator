from .base_agent import BaseAgent


class NGOAgent(BaseAgent):
    def __init__(self, id, personality="Collaborative"):
        super().__init__(id=id, name="NGO Agent", role="NGO", primary_goal="Deliver humanitarian aid effectively and transparently", constraints=["funding", "access", "safety"], personality=personality)

    async def act(self, context: dict, gemini_ask) -> dict:
        prompt = self.system_prompt(context.get("scenario", {}))
        prompt += f"\nPersonality: {self.personality}. Focus on humanitarian needs."
        
        # Include resource quantities if available
        resource_quantities = context.get("resource_quantities", {})
        if resource_quantities:
            prompt += "\n\nAvailable Resources:"
            for resource_name, quantity in resource_quantities.items():
                prompt += f"\n  - {resource_name}: {quantity} units"
        
        prompt += f"\n\nPrevious negotiation history: {context.get('history', [])}"
        return await gemini_ask(prompt, agent_name=self.name)
