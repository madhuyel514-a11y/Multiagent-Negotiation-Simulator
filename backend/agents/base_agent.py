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

    @staticmethod
    def format_compact_history(history: list, max_turns: int = 4) -> str:
        """Format negotiation history into a numbers-only stakeholder allocation summary.
        Zero sentences, speeches, or conversational paragraphs are included.
        Only the agent name, stance/action, and numerical sector allocations are shared.
        """
        if not history:
            return "LATEST STAKEHOLDER ALLOCATIONS:\nNo previous allocations on the table — this is Round 1. Make your opening proposal."

        # Keep track of the latest proposal and stance for each distinct agent
        latest_by_agent = {}
        for item in history or []:
            agent = item.get("agent")
            if not agent:
                continue

            action = str(item.get("action", "OFFER")).strip().upper()
            alloc = item.get("parsed_proposal")
            if not alloc or not isinstance(alloc, dict):
                # If agent accepted, check if incoming_proposal holds the accepted allocation
                if action == "ACCEPT" and isinstance(item.get("incoming_proposal"), dict):
                    alloc = item.get("incoming_proposal")

            latest_by_agent[agent] = (action, alloc if isinstance(alloc, dict) and alloc else None)

        if not latest_by_agent:
            return "LATEST STAKEHOLDER ALLOCATIONS:\nNo previous allocations on the table — this is Round 1. Make your opening proposal."

        lines = ["LATEST STAKEHOLDER ALLOCATIONS (NUMBERS ONLY - NO SPEECHES):"]
        for agent, (action, alloc) in latest_by_agent.items():
            lines.append(f"• {agent} [{action}]:")
            if not alloc:
                lines.append("  - Accepted active allocation (No counter-numbers)")
                continue

            for sector, res_map in alloc.items():
                if isinstance(res_map, dict):
                    res_str = ", ".join(f"{r}: {q}" for r, q in res_map.items())
                    lines.append(f"  - {sector}: {res_str}")
                elif isinstance(res_map, (int, float)):
                    lines.append(f"  - {sector}: {res_map}")

        return "\n".join(lines)

    async def act(self, context: dict, gemini_ask) -> dict:
        """Produce a proposal/response. gemini_ask is a callable that accepts a prompt."""
        # Default simple behavior: construct prompt and call gemini_ask
        prompt = self.system_prompt(context.get("scenario", {})) + "\n"
        prompt += f"Personality: {self.personality}.\n{self.format_compact_history(context.get('history', []))}\n"
        
        # Support both async and sync gemini_ask implementations
        import inspect
        if inspect.iscoroutinefunction(gemini_ask):
            result = await gemini_ask(
                prompt,
                max_rounds=context.get("max_rounds", 5),
                scenario=context.get("scenario", {}),
                stubborn_until=context.get("stubborn_until"),
                practice_mode=context.get("practice_mode", False),
                personality=self.personality,
                last_proposer=context.get("last_proposer"),
            )
        else:
            result = gemini_ask(
                prompt,
                max_rounds=context.get("max_rounds", 5),
                scenario=context.get("scenario", {}),
                stubborn_until=context.get("stubborn_until"),
                practice_mode=context.get("practice_mode", False),
                personality=self.personality,
                last_proposer=context.get("last_proposer"),
            )
            if inspect.isawaitable(result):
                result = await result
        return result
