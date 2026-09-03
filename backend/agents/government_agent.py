from .base_agent import BaseAgent


class GovernmentAgent(BaseAgent):

    def __init__(self, id, personality="Collaborative"):

        super().__init__(
            id=id,
            name="Government Agent",
            role="Government",
            primary_goal=(
                "Ensure public safety and equitable resource distribution"
            ),
            constraints=[
                "budget",
                "logistics",
                "public_policy"
            ],
            personality=personality
        )

    async def act(self, context: dict, gemini_ask) -> dict:

        prompt = self.system_prompt(context.get("scenario", {}))

        prompt += (
            f"\nPersonality: {self.personality}."
            "\nProtect public safety, emergency response capacity, "
            "and equitable distribution."
        )

        prompt += f"\nScenario: {context.get('scenario', {})}"

        prompt += (
            f"\nPriorities: "
            f"{context.get('agent', {}).get('priorities', [])}"
        )

        prompt += (
            "\nNegotiation style: Protect high-priority public safety "
            "objectives while making reasonable concessions."
        )

        prompt += (
            f"\nCurrent round: "
            f"{context.get('current_round', 1)}"
        )

        prompt += (
            "\nLatest incoming proposal being evaluated: "
            f"{context.get('current_proposal', {}) or 'No proposal yet'}"
        )

        resource_quantities = context.get("resource_quantities", {})

        if resource_quantities:

            prompt += "\n\nAvailable Resources:"

            for resource_name, quantity in resource_quantities.items():

                prompt += f"\n- {resource_name}: {quantity} units"

        prompt += (
            f"\n\nPrevious negotiation history: "
            f"{context.get('history', [])}"
        )

        return await gemini_ask(
            prompt,
            agent_name=self.name,
            total_budget=context.get("total_budget"),
            last_proposals=context.get("last_proposals", {}),
            current_round=context.get("current_round", 1),
            resource_quantities=resource_quantities,
            current_proposal=context.get("current_proposal", {}),
            agent_names=[
                item.get("name")
                for item in context.get("agents", [])
            ],
        )