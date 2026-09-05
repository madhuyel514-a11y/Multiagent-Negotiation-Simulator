from .base_agent import BaseAgent


class NGOAgent(BaseAgent):
    def __init__(self, id, personality="Collaborative"):
        super().__init__(
            id=id,
            name="NGO Agent",
            role="NGO",
            primary_goal="Deliver humanitarian aid effectively — prioritize Medical Aid and Shelters for the most vulnerable",
            constraints=["funding", "access", "safety"],
            personality=personality
        )

    async def act(self, context: dict, gemini_ask) -> dict:
        prompt = self.system_prompt(context.get("scenario", {}))
        prompt += f"\nPersonality: {self.personality}. Protect the highest-priority objectives in your persona."
        prompt += f"\nScenario: {context.get('scenario', {})}"
        prompt += f"\nPriorities: {context.get('agent', {}).get('priorities', [])}"
        prompt += "\nNegotiation style: reason from the stated priorities, protect essential objectives, and make proportionate concessions."
        prompt += f"\nCurrent round: {context.get('current_round', 1)}"
        prompt += f"\nLatest incoming proposal being evaluated: {context.get('current_proposal', {}) or 'No proposal yet; make the opening offer.'}"

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
            current_proposal=context.get("current_proposal", {}),
            agent_names=[item.get("name") for item in context.get("agents", [])],
            max_rounds=context.get("max_rounds", 5),
            scenario=context.get("scenario", {}),
            stubborn_until=context.get("stubborn_until"),
            practice_mode=context.get("practice_mode", False),
        )
