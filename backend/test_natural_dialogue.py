import os
import time
import json
from groq import Groq
from dotenv import load_dotenv

load_dotenv('d:/Infosys Springboard/milestone 4 - Updated ui and report/backend/.env')
c = Groq(api_key=os.getenv('GROQ_API_KEY'))

instruction = """DISASTER RELIEF RESOURCE NEGOTIATION
Agent: GOVERNMENT AGENT | Round: 1/3
AFFECTED DISTRICTS:
- Riverbend District: Population 15,000, Severity: Severe (Needs: Rescue Boats, Temporary Shelters, Food)
- Lakeside District: Population 8,000, Severity: Moderate (Needs: Medicine, Emergency Supplies)
- Hillside District: Population 4,000, Severity: Low (Needs: Food, Emergency Supplies)

TOTAL AVAILABLE BUDGET:
- Food: 500 units, Medicine: 200 units, Rescue Boats: 25 units, Temporary Shelters: 150 units, Emergency Supplies: 300 units

TASK & CRITICAL RULES:
1. Propose a complete, balanced allocation covering EVERY recipient and EVERY resource: ['Food', 'Medicine', 'Rescue Boats', 'Temporary Shelters', 'Emergency Supplies'].
2. TOTAL quantity allocated for each resource across all recipients MUST equal available budget exactly.
3. CONVERSATIONAL REALISM:
   - NEVER use formulaic filler greetings like "Colleagues,", "Esteemed colleagues,", "Listen to me carefully,", or "I understand your concern...".
   - Jump STRAIGHT into the operational realities, urgent priorities, and tactical trade-offs like a real crisis commander under intense pressure.
   - Speak naturally in first person with urgency and conviction.
4. Stance MUST be one of: "firm", "moderate", "conceding", "strategic", "accept". In Round 1 do NOT accept.
5. Output RAW JSON ONLY.

JSON Schema:
{
  "message": "Direct, realistic, high-stakes speech with ZERO boilerplate greetings.",
  "allocations": {
    "Riverbend District": { "Food": int, "Medicine": int, "Rescue Boats": int, "Temporary Shelters": int, "Emergency Supplies": int },
    "Lakeside District": { "Food": int, "Medicine": int, "Rescue Boats": int, "Temporary Shelters": int, "Emergency Supplies": int },
    "Hillside District": { "Food": int, "Medicine": int, "Rescue Boats": int, "Temporary Shelters": int, "Emergency Supplies": int }
  },
  "reasoning": "Internal strategic thinking.",
  "stance": "firm|moderate|conceding|strategic|accept"
}
"""

t0 = time.perf_counter()
resp = c.chat.completions.create(
    model="qwen/qwen3.8-27b",
    messages=[
        {"role": "system", "content": "You are an AI disaster relief negotiation agent. Return ONLY raw valid JSON adhering strictly to schema. Speak with authentic, realistic emergency negotiation dialogue without any robotic filler or repetitive greetings."},
        {"role": "user", "content": instruction}
    ],
    response_format={"type": "json_object"},
    max_tokens=550,
    temperature=0.3,
    timeout=5.0
)
dt = time.perf_counter() - t0
parsed = json.loads(resp.choices[0].message.content)
print(f"--- QWEN 27B NATURAL NEGOTIATION (Took {dt:.2f}s) ---")
print("Speech:", parsed.get("message"))
print("Allocations:", json.dumps(parsed.get("allocations"), indent=2))
