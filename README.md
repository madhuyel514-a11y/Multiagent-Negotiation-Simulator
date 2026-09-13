# Disaster Relief Resource Negotiation System

A Generative AI-powered Multi-Agent Negotiation Simulator for coordinating disaster-relief resources among multiple autonomous stakeholders.

The system models realistic disaster-response negotiations between a **Government Agent**, **NGO Agent**, and **District Administration Agent**, each with unique objectives, constraints, priorities, and negotiation personalities.

The platform supports:

- **AI-vs-AI Simulation Mode** — autonomous agents negotiate with each other.
- **Human-vs-AI Practice Mode** — a human participates directly against the AI stakeholders.

The system includes negotiation orchestration, real-time reasoning, structured proposals, consensus detection, deadlock handling, LLM fallback, evaluation, concession analysis, outcome reporting, and downloadable negotiation reports.

---

## Overview

Disaster-response resource allocation requires multiple stakeholders to balance competing priorities while working with limited resources.

This project uses Generative AI and autonomous multi-agent negotiation to simulate this decision-making process.

The three main stakeholders are:

- **Government Agent**
- **NGO Agent**
- **District Administration Agent**

Each agent has a role, objectives, constraints, resource priorities, and negotiation personality.

The Negotiation Orchestrator coordinates their turns, maintains the negotiation state, manages proposals and consensus, handles deadlocks, and produces the final outcome.

---

# Key Features

## 1. Scenario-Based Negotiation

The system provides three pre-built disaster-relief scenarios.

### Earthquake Emergency Response

Resources:

- Rescue Teams
- Medical Aid
- Temporary Shelters
- Debris Clearance Equipment

The scenario focuses on rescue operations, medical response, emergency shelter, and infrastructure recovery.

### Flood Relief Resource Allocation

Resources:

- Rescue Boats
- Food
- Medicine
- Temporary Shelters
- Emergency Supplies

The scenario focuses on distributing limited resources across flood-affected districts.

### Cyclone Relief Coordination

Resources:

- Evacuation Transport
- Food
- Temporary Shelters
- Emergency Communication

The scenario focuses on evacuation, shelter, food distribution, and emergency communication.

---

## 2. Scenario and Agent Configuration

Users can configure:

- Scenario
- Negotiation mode
- Agents
- Agent personalities
- Goals
- Constraints
- Resource availability
- Affected districts or recipients
- Maximum negotiation rounds

The selected configuration is persisted through the frontend flow and passed to the negotiation engine.

The configured **`max_rounds`** value is used by the orchestrator rather than relying on a hardcoded limit.

---

## 3. AI-vs-AI Simulation Mode

In Simulation Mode, all negotiating participants are autonomous AI agents.

Typical flow:

```
Government Agent
       ↓
NGO Agent
       ↓
District Administration Agent
       ↓
Next Round
       ↓
Consensus / Deadlock / Maximum Rounds
```

Each agent receives the negotiation history, current proposal, resources, objectives, constraints, personality, and round information before making a decision.

Agents can:

- Make an opening offer
- Make a counter-proposal
- Accept an existing proposal
- Reject a proposal when appropriate

The negotiation continues until consensus, breakdown/deadlock, or the configured maximum number of rounds.

---

## 4. Human-vs-AI Practice Mode

Practice Mode adds the human as a fourth negotiation participant.

The round-table flow is:

```
Human Participant
       ↓
Government Agent
       ↓
NGO Agent
       ↓
District Administration Agent
       ↓
Human Decision
       ↓
Next Round
```

The human starts with an opening proposal and reviews all three AI responses.

Available actions include:

- **Offer**
- **Counter**
- **Accept**
- **Reject**
- **Reset**

Structured proposals can specify district/resource quantities.

The human's proposal and decisions are incorporated into the same negotiation state used by the AI agents.

---

## 5. Human-to-AI Negotiation Flow

```
PracticeMode.jsx
      ↓
POST /api/practice/stream-turn
      ↓
FastAPI Practice Endpoint
      ↓
Negotiation Orchestrator
      ↓
Human Message / Proposal Added to State
      ↓
AI Agent Turn
      ↓
Agent Context
      ↓
Stakeholder Prompt Builder
      ↓
Groq / Gemini
      ↓
AI Response
      ↓
Negotiation State Updated
      ↓
SSE Response
      ↓
PracticeMode.jsx
```

This integrates human decisions into the same orchestration and prompt-building pipeline used by AI agents.

---

## 6. Negotiation Arena

The Negotiation Arena is the main AI-vs-AI negotiation interface.

It displays:

- Round-by-round transcript
- Agent messages
- Agent reasoning
- Agent stance
- Agent action
- Proposed allocations
- Proposal changes
- Consensus progress
- Negotiation status
- Resource availability
- LLM metrics

Supported actions:

- **`OFFER`**
- **`COUNTER`**
- **`ACCEPT`**
- **`REJECT`**

The interface also provides access to the completed outcome and downloadable reports.

---

## 7. Practice Mode UI

Practice Mode is designed around the conversation as the primary interaction.

It includes:

- Main negotiation conversation
- Human response controls
- Current AI speaker
- Round progression
- Agent status
- Acceptance progress
- Current and final proposals
- Resource allocation details
- LLM metrics
- Proposal change information

Proposal and configuration information is separated from the main conversation so the human interaction remains focused on negotiation.

---

## 8. Negotiation Orchestrator

The Negotiation Orchestrator coordinates the complete negotiation lifecycle.

It manages:

- Turn sequencing
- Negotiation rounds
- Current proposals
- Previous proposals
- Agent responses
- Human responses
- Accepted proposals
- Consensus state
- Maximum rounds
- Deadlock detection
- Negotiation termination
- Final allocation
- Outcome report generation

---

## 9. Structured Proposal Management

Allocations use nested district/resource structures.

Example:

```
North Sector
    Rescue Teams: 25
    Medical Aid: 120
    Temporary Shelters: 30
    Debris Clearance Equipment: 0

Central Sector
    Rescue Teams: 5
    Medical Aid: 55
    Temporary Shelters: 100
    Debris Clearance Equipment: 30

South Sector
    Rescue Teams: 10
    Medical Aid: 125
    Temporary Shelters: 70
    Debris Clearance Equipment: 5
```

The system tracks:

- Current allocation
- Previous allocation
- Resource totals
- Increases
- Decreases
- Concessions
- Final allocation

Allocations are validated against available resource quantities.

---

## 10. Consensus Detection

Consensus is based on exact proposal agreement.

### AI-vs-AI

All configured AI agents must accept the same current proposal.

### Practice Mode

All four participants are required:

```
Human Participant
Government Agent
NGO Agent
District Administration Agent
```

Consensus requires:

1. A valid current proposal.
2. All required participants to have accepted.
3. Every accepted proposal to exactly match the current proposal.

The proposer is not automatically counted as having accepted.

This prevents partial agreement from being incorrectly reported as consensus.

---

## 11. Deadlock Detection

The system uses separate deadlock strategies for AI-vs-AI and Practice Mode.

### AI-vs-AI Deadlock

The system looks for meaningful negotiation stagnation, including:

- Repeated identical messages
- Repeated counter-proposals with unchanged allocations
- Negligible numerical movement between proposals

When detected, the existing resolution/mediation process can attempt to move the negotiation forward.

If the negotiation remains stalled, it can terminate as a breakdown.

If maximum rounds are reached without consensus, it ends without agreement.

### Practice Mode Deadlock

Practice Mode uses a four-participant unchanged-allocation rule.

After each completed round, the system records the allocation associated with:

- Human Participant
- Government Agent
- NGO Agent
- District Administration Agent

A deadlock is declared only when **all four participants have exactly the same allocation in both consecutive completed rounds**.

```
Previous Round
    Human:       Allocation A
    Government:  Allocation A
    NGO:         Allocation A
    District:    Allocation A

Current Round
    Human:       Allocation A
    Government:  Allocation A
    NGO:         Allocation A
    District:    Allocation A

        ↓

Deadlock Detected
```

If even one participant changes their allocation, the negotiation is considered to have made progress.

Practice Mode does not use the AI-vs-AI mediation detector.

---

## 12. Maximum-Round Handling

The configured maximum round value controls the negotiation limit.

At the configured limit:

- Existing consensus is preserved if already reached.
- Otherwise the negotiation ends without consensus.
- The latest valid proposal can be retained as the final proposed allocation.
- Practice Mode follows its final-decision flow where applicable.

This prevents additional AI turns beyond the configured negotiation limit.

---

## 13. LLM Integration

The project uses a multi-provider LLM architecture.

### Primary Provider

**Groq**

Current model:

```
openai/gpt-oss-120b
```

### Fallback Provider

**Google Gemini**

Provider flow:

```
Agent
  ↓
Groq
  ↓
If unavailable / fails
  ↓
Gemini
```

The main negotiation model flow tries configured Groq clients first and falls back to configured Gemini clients when Groq is unavailable or a request fails. Gemini fallback requires valid Gemini credentials to be configured.

---

## 14. Agent Reasoning and Personas

Each agent receives:

- Scenario
- Full negotiation history
- Current round
- Maximum rounds
- Resource quantities
- Resource constraints
- Current proposal
- Previous proposals
- Agent objectives
- Agent constraints
- Agent personality
- Practice Mode context when applicable

Agents generate:

- Action
- Message
- Reasoning
- Stance
- Proposal when required

### Government Agent

Priorities include:

- Public safety
- Rescue operations
- Infrastructure
- Critical regional requirements
- Maintaining essential emergency-response capacity

### NGO Agent

Priorities include:

- Vulnerable communities
- Medical aid
- Temporary shelter
- Humanitarian urgency
- Protection of affected populations

### District Administration Agent

Priorities include:

- Local operational requirements
- Infrastructure recovery
- Regional emergencies
- Debris clearance
- Practical district-level distribution

Agent personalities affect how stakeholders communicate, evaluate proposals, and negotiate.

---

## 15. LLM Performance Metrics

The system tracks:

- API Requests
- Input Tokens
- Output Tokens
- Total Tokens
- Average Latency
- Total API Latency

Groq reports prompt, completion, and total tokens.

Gemini usage can include prompt, candidate/output, thought, and total token counts.

Metrics are surfaced in the Negotiation Arena and outcome reporting.

---

## 16. Evaluation Engine

The Evaluation Engine produces structured analysis of the negotiation.

It evaluates:

- Agent satisfaction
- Objective alignment
- Resource allocation fit
- Actions
- Proposal changes
- Concession patterns
- Consensus progress
- Contribution to agreement
- Final allocation changes

The system also compares opening proposals with the final allocation.

---

## 17. Concession Analysis

Nested allocation paths are flattened into paths such as:

```
Central Sector/Medical Aid
South Sector/Temporary Shelters
```

Every proposal-bearing **`OFFER`** or **`COUNTER`** is compared with the immediately preceding proposal-bearing negotiation proposal.

The system records:

- Increases
- Decreases
- Concession count
- Total quantity conceded
- First concession
- Contribution to agreement

Only decreases count as concessions.

Example:

```
Central Sector/Medical Aid

80 → 65

Concession: 15
```

Proposal-less **`ACCEPT`** actions do not create artificial concession values.

---

## 18. Outcome Screen

After completion, the system provides:

- Final negotiation status
- Final agreement terms
- Rounds elapsed
- Agreement round
- Participants
- Consensus status
- Final allocation
- Per-resource totals
- Concession timeline
- Concession patterns
- Per-agent objective satisfaction
- Per-agent performance
- Negotiation summary

Example states:

```
Agreement Reached
Negotiation Breakdown
Deadlock / No Consensus
Final Decision
```

---

## 19. Downloadable Negotiation Reports

Both AI-vs-AI and Practice Mode support downloads.

### Download Transcript

Contains:

- Scenario
- Negotiation mode
- Status
- Round information
- Complete conversation history
- Agent
- Action
- Message
- Reasoning
- Proposal/allocation
- Final result
- Consensus information

### Download Summary

Contains:

- Scenario
- Negotiation mode
- Status
- Rounds used
- Agreement round
- Final allocation
- Resource totals
- Agreement terms
- Concession patterns
- Concession timeline
- Per-agent performance
- Objective satisfaction
- LLM metrics
- Final outcome

Reports are generated from the current negotiation state and outcome data.

---

## 20. Real-Time Streaming

Practice Mode supports Server-Sent Events (SSE).

AI responses can be progressively displayed as agents complete their turns:

```
Government response
        ↓
NGO response
        ↓
District Administration response
        ↓
Human decision
```

This provides a more natural interactive negotiation experience.

---

# Backend API

The backend is implemented using FastAPI.

Important endpoints:

```
POST /api/negotiation/start
POST /api/negotiation/turn

POST /api/practice/turn
POST /api/practice/stream-turn
```

### `/api/negotiation/start`

Creates a new negotiation session.

### `/api/negotiation/turn`

Executes the next AI-vs-AI turn.

### `/api/practice/turn`

Processes a human Practice Mode action and executes the corresponding AI turns.

### `/api/practice/stream-turn`

Processes a human Practice Mode action and streams AI responses using SSE.

---

# System Architecture

```
                         React Frontend
                               |
                +--------------+--------------+
                |                             |
          AI-vs-AI Mode                Practice Mode
                |                             |
                +--------------+--------------+
                               |
                             FastAPI
                               |
                     Negotiation API Layer
                               |
                  Negotiation Orchestrator
                               |
             +-----------------+-----------------+
             |                 |                 |
      Government Agent     NGO Agent     District Agent
             |                 |                 |
             +-----------------+-----------------+
                               |
                         Prompt Builder
                               |
                       LLM Provider Layer
                               |
                 +-------------+-------------+
                 |                           |
               Groq                      Gemini
             Primary                   Fallback
                               |
                      Evaluation Engine
                               |
                       Outcome Analysis
```

---

# Technology Stack

## Frontend

- React
- Vite
- JavaScript
- CSS

## Backend

- Python
- FastAPI
- Uvicorn

## AI / LLM

- Groq
- Google Gemini

## Communication

- REST APIs
- Server-Sent Events (SSE)

## Testing

- Pytest
- Python **`py_compile`**
- npm build

## Version Control

- Git
- GitHub

---

# Project Structure

```
Multiagent-Negotiation-Simulator/
│
├── backend/
│   ├── main.py
│   │
│   ├── agents/
│   │   ├── base_agent.py
│   │   ├── government_agent.py
│   │   ├── ngo_agent.py
│   │   └── district_agent.py
│   │
│   ├── services/
│   │   ├── negotiation_orchestrator.py
│   │   ├── evaluation_engine.py
│   │   └── gemini_service.py
│   │
│   ├── test_deadlock.py
│   ├── test_practice_deadlock.py
│   ├── test_evaluation_concessions.py
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.jsx
│   │   │   ├── ScenarioSelection.jsx
│   │   │   ├── AgentConfiguration.jsx
│   │   │   ├── NegotiationArena.jsx
│   │   │   ├── PracticeMode.jsx
│   │   │   └── Outcome.jsx
│   │   │
│   │   └── ...
│   │
│   ├── package.json
│   └── vite.config.js
│
├── README.md
└── ...
```

---

# Getting Started

## Prerequisites

Install:

- Python 3.10 or higher
- Node.js 18 or higher
- npm
- Groq API key
- Google Gemini API key(s)

---

## Clone the Repository

```
git clone <repository-url>
cd Multiagent-Negotiation-Simulator
```

---

# Backend Setup

Navigate to the backend:

```
cd backend
```

Create a virtual environment.

### Windows

```
python -m venv .venv
.venv\Scripts\activate
```

### Linux / macOS

```
python3 -m venv .venv
source .venv/bin/activate
```

Install dependencies:

```
pip install -r requirements.txt
```

---

## Environment Configuration

Create:

```
backend/.env
```

Example:

```
GROQ_API_KEY_1=your_groq_api_key
GROQ_MODEL=openai/gpt-oss-120b

GEMINI_API_KEYS=your_gemini_api_key_1,your_gemini_api_key_2

BACKEND_HOST=127.0.0.1
BACKEND_PORT=8000
```

Never commit API keys or **`.env`** files to GitHub.

---

## Start Backend

From **`backend/`**:

```
uvicorn main:app --reload --port 8000
```

Backend:

```
http://127.0.0.1:8000
```

---

# Frontend Setup

Open a second terminal:

```
cd frontend
```

Install dependencies:

```
npm install
```

Start the development server:

```
npm run dev
```

Frontend:

```
http://localhost:5173
```

---

# Testing

## Concession Evaluation Tests

```
python -m pytest -q backend/test_evaluation_concessions.py
```

These tests cover:

- Nested proposal comparison
- Proposal changes
- Increases
- Decreases
- Concession counting
- Quantity conceded
- First proposal handling
- Proposal-less ACCEPT handling
- Practice-style histories

## Practice Deadlock Tests

```
python -m pytest -q backend/test_practice_deadlock.py
```

These tests cover:

- Unchanged allocations
- Changed allocations
- Missing participants
- Practice deadlock state
- Final-round behavior
- No unintended mediation

## AI-vs-AI Deadlock Regression

```
python backend/test_deadlock.py
```

## Frontend Production Build

```
cd frontend
npm run build
```

## Test Suite Notes

The repository contains focused pytest tests and executable regression scripts. The full pytest suite may require running from the expected backend working directory and an appropriate async pytest plugin for asynchronous tests. Therefore, a successful focused regression run should not be interpreted as proof that every repository test passes.

The current application stores active negotiation sessions in memory. Sessions and negotiation history are therefore lost when the backend process restarts.

---

# Validation

The implementation includes focused regression tests and manual validation for the major negotiation features.

Validated areas include:

- AI-vs-AI Simulation Mode
- Human-vs-AI Practice Mode
- Earthquake
- Flood
- Cyclone
- Consensus handling
- Maximum-round handling
- AI-vs-AI deadlock detection
- Practice Mode deadlock detection
- LLM provider fallback
- Structured proposal handling
- ACCEPT handling
- Concession analysis
- Outcome reporting
- Transcript downloads
- Summary downloads

The focused automated tests cover deadlock detection, concession evaluation, structured proposal handling, and related regression cases. Broader end-to-end testing across every personality combination and provider configuration is recommended before claiming complete integration-test coverage.

## AI-vs-AI Validation

Example:

```
Round 1
Government → OFFER
NGO → COUNTER
District Administration → COUNTER

Round 2
Government → ACCEPT
NGO → COUNTER
District Administration → ACCEPT

Round 3
Government → ACCEPT
NGO → ACCEPT

→ Agreement Reached
```

## Practice Mode Validation

Practice Mode has been manually validated across all three scenarios with:

- Human opening proposals
- AI responses
- AI counter-proposals
- Human decisions
- Structured proposal updates
- Acceptance handling
- Consensus detection
- Final agreement generation
- Maximum-round handling
- Deadlock handling
- Streaming responses
- Outcome analysis

---

# Error Handling and Resilience

The system handles:

- LLM provider failures
- Rate limits
- Token and quota failures
- Invalid model responses
- Invalid or incomplete proposals
- Proposal normalization
- Structured allocation validation
- Maximum negotiation rounds
- Deadlocks
- Negotiation breakdown
- Missing negotiation state
- Practice Mode input validation

The main negotiation model flow tries configured Groq clients first and uses configured Gemini clients as fallback when Groq is unavailable or a request fails.

---

# Negotiation End States

## Agreement Reached

All required participants accept the same proposal.

```
agreement_reached
```

## Negotiation Breakdown

The negotiation becomes stalled or otherwise ends without consensus.

```
negotiation_breakdown
```

## Deadlock / No Consensus

The configured maximum number of rounds is reached without unanimous agreement.

```
deadlock_no_consensus
```

## Final Decision

Practice Mode can reach a final decision stage where the human chooses whether to accept or reject the final negotiated proposal.

---

# Milestone Progress

## Milestone 1 — Foundation

Implemented:

- Disaster-relief scenarios
- Agent configuration
- Stakeholder roles
- Initial negotiation workflow
- Frontend navigation
- Backend foundation

## Milestone 2 — Negotiation System

Implemented:

- Negotiation Arena
- AI agent interaction
- Negotiation state management
- Agent reasoning
- Simulation workflow
- Scenario-based negotiation
- UI improvements

## Milestone 3 — Human Interaction and Deadlock Handling

Implemented:

- Human Participant Interface
- Human-vs-AI Practice Mode
- Human-to-orchestrator integration
- Structured human proposals
- Consensus handling
- Deadlock detection
- Maximum-round handling
- Practice Mode validation
- LLM provider fallback
- Server-Sent Events streaming
- Practice Mode UI improvements
- Scenario-aware Practice Mode responses
- Robust ACCEPT handling
- Structured fallback proposal normalization

## Milestone 4 — Outcome, Downloads and Integration

Implemented features:

- Outcome Screen
- Final agreement terms
- Agreement round
- Rounds elapsed
- Per-agent objective satisfaction
- Concession timeline
- Concession analysis
- Per-agent performance
- Downloadable negotiation transcript
- Downloadable summary report
- AI-vs-AI transcript download
- AI-vs-AI summary download
- Practice Mode transcript download
- Practice Mode summary download
- Conversation-focused Practice Mode UI
- Proposal/configuration side-panel organization
- Human interaction improvements
- Outcome and download integration
- Focused regression testing of completed features

> **Status:** M4 features are implemented. Broader end-to-end integration testing across all personality combinations remains a recommended final validation step.

---

# Future Enhancements

The following are not part of the current implementation and are potential future improvements:

- MongoDB Atlas persistence
- Persistent negotiation sessions
- Historical negotiation analytics
- User accounts
- Saved negotiation scenarios
- Additional disaster scenarios
- Additional stakeholder agents
- Advanced negotiation analytics
- Long-term agent performance tracking
- Cloud deployment
- Authentication and authorization

MongoDB Atlas could be introduced later as a persistence layer without changing the core negotiation logic.

Potential future persistence architecture:

```
React
  ↓
FastAPI
  ↓
Negotiation Orchestrator
  ↓
MongoDB Atlas
  ↓
Sessions / History / Outcomes
```

Potentially persisted information:

- Negotiation sessions
- Scenario configuration
- Agent configuration
- Negotiation turns
- Proposals
- Human decisions
- Consensus state
- Deadlock events
- Final outcomes
- Agent evaluations
- LLM usage metrics

---

# SDG Alignment

## SDG 11 — Sustainable Cities and Communities

The project supports disaster-response coordination and resource allocation to improve community resilience.

## SDG 13 — Climate Action

The project models disaster-response scenarios and supports coordinated resource planning for climate-related emergencies.

## SDG 16 — Peace, Justice and Strong Institutions

The system promotes structured, transparent, and coordinated decision-making between multiple stakeholders.

---

# Project Objective

The primary objective is to demonstrate how Generative AI and autonomous multi-agent systems can support complex stakeholder negotiations under resource constraints.

The project combines:

```
Generative AI
      +
Multi-Agent Systems
      +
Negotiation
      +
Human-in-the-Loop Interaction
      +
Resource Allocation
      +
Consensus Handling
      +
Deadlock Detection
      +
Outcome Evaluation
```

to create an interactive disaster-relief negotiation environment.

---

# Conclusion

The **Disaster Relief Resource Negotiation System** demonstrates a complete multi-agent negotiation workflow in which autonomous AI stakeholders and a human participant can negotiate resource allocations under realistic constraints.

The completed system provides:

- Autonomous AI-vs-AI negotiation
- Human-in-the-loop Practice Mode
- Structured resource allocation
- Agent reasoning and personas
- Consensus detection
- Deadlock handling
- Maximum-round protection
- LLM provider fallback
- Real-time streaming
- Concession analysis
- Agent performance evaluation
- Outcome reporting
- Downloadable negotiation transcripts
- Downloadable summary reports
- LLM performance metrics

The platform provides a foundation for future extensions such as persistent sessions, advanced analytics, additional stakeholders, and real-world decision-support applications.