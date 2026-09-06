# Disaster Relief Resource Negotiation System

## Overview

The new version transforms the system from a primarily AI-driven simulation into an interactive Human + Multi-Agent negotiation platform. It establishes a structured round-based deliberation process, role-specific agent reasoning, robust deadlock and consensus handling, progressive streaming responses, and an intuitive user interface for disaster relief resource allocation.

---

## Changes in the New Version

### 1. Human vs AI Practice Mode
- Introduced a dedicated Human vs AI negotiation mode.
- The human participant acts as an active negotiator and initiates the process by submitting the opening proposal.
- Three specialized AI stakeholders deliberate and respond:
  - Government Agent
  - NGO Agent
  - District Administration Agent
- The human evaluates the AI outcome at each stage and makes the final determination to Accept or Reject the negotiated distribution.

### 2. Negotiation Flow
The negotiation follows a structured, round-based sequential process:

Human -> Government AI -> NGO AI -> District AI -> Human Decision

- AI agents respond sequentially in a continuous roundtable format.
- Each agent receives the full context of prior turns, incoming offers, and resource priorities.
- Agents can Accept, Reject, or Counter incoming proposals.
- Deliberation proceeds dynamically until unanimous consensus is reached or a negotiation breakdown occurs.

### 3. Orchestration Architecture
- Upgraded the Negotiation Orchestrator to support interactive Human Practice Mode alongside standard simulation.
- Implemented real-time state tracking for:
  - Current round and maximum round thresholds
  - Active human proposals and numerical allocation matrices
  - Individual agent responses, reasoning, and stances
  - Quantitative consensus metrics
  - Session status and termination states
  - Final agreed resource allocations
- Built dedicated handlers for human executive decisions following the completion of AI deliberation rounds.
- Introduced asynchronous Server-Sent Events (SSE) streaming to progressively display each agent's response in real time as soon as it is generated.

### 4. AI Reasoning and Dynamic Prompting
- Refined stakeholder persona prompts to reflect real-world operational constraints and institutional priorities:
  - Government: Focuses on public order, infrastructure, and balanced regional distribution.
  - NGO: Focuses on vulnerable communities, medical aid, and basic shelter needs.
  - District Administration: Prioritizes local operational efficiency and acute regional emergencies.
- Enhanced compromise logic: agents evaluate trade-offs against their core priorities and offer proportional concessions.
- Integrated an automated Tactical Advisor that provides AI-generated suggestions to assist the human in formulating balanced counter-proposals.

### 5. Deadlock and Breakdown Handling

The system uses different deadlock rules for **AI-vs-AI** and **Human-vs-AI Practice Mode** because the two negotiation flows work differently.

#### AI-vs-AI Mode

In AI-vs-AI negotiations, a deadlock is detected when the negotiation stops making meaningful progress. The system checks for situations such as:

* Agents repeatedly sending the same messages.
* Agents repeatedly making counter-proposals without changing their allocations.
* Resource allocations changing by only a negligible amount over multiple rounds.

When a deadlock is detected, the existing mediation and resolution process is used. The negotiation can continue through the configured resolution process or end according to the existing maximum-round rules.

#### Human-vs-AI Practice Mode

Practice Mode uses a separate and simpler deadlock rule.

After each complete round of negotiation, the system records the allocation proposed or evaluated by each participant:

* Human Participant
* Government Agent
* NGO Agent
* District Administration Agent

The system then compares the current round with the previous completed round.

A **deadlock is declared only when all four participants have exactly the same allocation in both rounds**.

For example:

```text
Previous Round
Human:       same allocation
Government:  same allocation
NGO:         same allocation
District:    same allocation

Current Round
Human:       same allocation
Government:  same allocation
NGO:         same allocation
District:    same allocation

→ Deadlock detected
```

If **even one participant changes their allocation**, the negotiation is considered to have made progress and the deadlock condition is not triggered.

The Human Participant's allocation is taken from their submitted proposal when they make an offer or counter-proposal. If they accept or reject an AI proposal, the allocation being evaluated is used for the comparison.

Practice Mode deadlock does not use the AI-vs-AI deadlock detector or its mediation process. When this condition is reached, the negotiation is marked as stalled without consensus.

The normal maximum-round and final-decision flow remains unchanged. If the negotiation reaches the configured maximum number of rounds, Practice Mode follows its existing final-decision process.

#### Consensus and Other End Conditions

A negotiation can also end when:

* All participants reach the required agreement and a consensus is reached.
* The human rejects the final proposal.
* The maximum number of rounds is reached.
* A proposed allocation violates the available resource constraints.

This keeps the deadlock logic predictable: **AI-vs-AI detects a lack of meaningful progress, while Practice Mode detects whether the complete four-party allocation has remained unchanged between consecutive rounds.**

### 6. User Interface Redesign
- Redesigned the Practice Mode interface to accommodate a 4-party roundtable (Human + 3 AI agents).
- Added visual indicators for individual agent statuses, active turns, and real-time deliberation progress.
- Implemented structured proposal cards and allocation matrices displaying regional resource breakdowns.
- Provided explicit action controls: Offer, Counter, Accept, and Reject.
- Integrated live meters for round progression, consensus percentage, and overall session status.
- Added visual diff tracking to highlight resource changes between consecutive counter-proposals.

### 7. LLM and API Performance Metrics
- Integrated live telemetry tracking for model operations across both Groq and Gemini providers:
  - Total API calls
  - Input tokens consumed
  - Output tokens generated
  - Combined token volume
  - Latency and response time (seconds)
- Implemented multi-provider failover: primary fast inference on Groq with automated fallback to Google Gemini when rate limits or token quotas are reached.

---

## Getting Started

### Prerequisites
- Python 3.10 or higher
- Node.js 18 or higher with npm

### 1. Backend Setup

Navigate to the backend directory:
```bash
cd backend
```

Create and activate a virtual environment (optional but recommended):
```bash
# Windows
python -m venv .venv
.venv\Scripts\activate

# Linux / macOS
python -m venv .venv
source .venv/bin/activate
```

Install dependencies:
```bash
pip install -r requirements.txt
```

Configure your environment variables by creating a `.env` file in the `backend/` directory:
```env
GROQ_API_KEY_1=your_groq_api_key
GROQ_MODEL=openai/gpt-oss-120b

GEMINI_API_KEYS=your_gemini_api_key_1,your_gemini_api_key_2
BACKEND_HOST=127.0.0.1
BACKEND_PORT=8000
```

Start the backend server:
```bash
uvicorn main:app --reload
```
The backend will be running at `http://127.0.0.1:8000`.

### 2. Frontend Setup

In a new terminal, navigate to the frontend directory:
```bash
cd frontend
```

Install dependencies:
```bash
npm install
```

Start the Vite development server:
```bash
npm run dev
```
The frontend will be available at `http://localhost:5173`.
