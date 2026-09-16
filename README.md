# Disaster Relief Resource Negotiation System

A generative-AI multi-agent negotiation simulator for coordinating disaster-relief resources among competing stakeholders — built to explore how autonomous agents and humans can reach consensus under real-world resource constraints.

The system simulates negotiations between a **Government Agent**, an **NGO Agent**, and a **District Administration Agent**, each with distinct objectives, constraints, and negotiation personalities. It supports both fully autonomous AI-vs-AI simulation and human-in-the-loop practice negotiations.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [System Architecture](#system-architecture)
- [Negotiation Lifecycle](#negotiation-lifecycle)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Negotiation End States](#negotiation-end-states)
- [Future Enhancements](#future-enhancements)

---

## Overview

Disaster response requires multiple stakeholders — government bodies, NGOs, and district administrations — to allocate scarce resources (rescue teams, medical aid, shelters, food, transport) under time pressure and competing priorities.

This project models that process using generative AI and multi-agent negotiation, supporting two modes:

| Mode | Description |
|---|---|
| **AI-vs-AI Simulation** | Three autonomous agents negotiate a resource allocation to consensus, deadlock, or round limit. |
| **Human-vs-AI Practice** | A human participant negotiates directly against the three AI agents in real time. |

Three pre-built disaster scenarios are included:

- **Earthquake Emergency Response** — rescue teams, medical aid, shelters, debris clearance
- **Flood Relief Resource Allocation** — rescue boats, food, medicine, shelters, emergency supplies
- **Cyclone Relief Coordination** — evacuation transport, food, shelters, emergency communication

---

## Features

- **Configurable scenarios** — resources, agent personalities, objectives, constraints, affected districts, and max negotiation rounds are all set through the frontend and passed to the negotiation engine.
- **Structured proposals** — nested district/resource allocations, validated against available resource quantities.
- **Consensus detection** — requires an exact proposal match and explicit acceptance from every required participant (AI agents, plus the human in Practice Mode).
- **Deadlock detection** — separate strategies for AI-vs-AI (stagnation/negligible movement) and Practice Mode (unchanged allocations across all four participants for two consecutive rounds).
- **Maximum-round protection** — negotiations always terminate, preserving any consensus already reached.
- **Multi-provider LLM layer** — Groq (`openai/gpt-oss-120b`) as primary provider with automatic fallback to Google Gemini, including multi-key rotation.
- **Concession analysis** — flattens nested allocations to compare consecutive proposals and quantify increases, decreases, and total concessions.
- **Outcome & reporting** — final allocation, per-agent objective satisfaction, concession timeline, and downloadable transcript/summary reports.
- **Real-time streaming** — Practice Mode responses are streamed via Server-Sent Events (SSE) as each agent completes its turn.
- **Persistence & history** — negotiation sessions are stored in MongoDB Atlas, with support for listing, replaying, and deleting historical sessions.

---

## System Architecture

The platform is organized around a React frontend, a FastAPI backend, and a central negotiation orchestrator that coordinates AI agents, an LLM provider layer with fallback, evaluation, and persistence.

<img width="497" height="1192" alt="Negotiation Scenario-2026-09-16-121134" src="https://github.com/user-attachments/assets/4ac3f7b3-aca4-4835-8d95-81ea752de77e" />

**Key flows:**

- The frontend routes into **AI-vs-AI** or **Human-vs-AI** mode, both served by the same FastAPI backend over REST and SSE.
- The **Negotiation Orchestrator** owns turn/round management and negotiation state, and is the single source of truth consulted by every other service.
- Agent turns pass through a **Prompt Builder**, then the **LLM Provider Layer**, which tries **Groq** first and falls back to **Google Gemini** on failure or unavailability.
- Each round's proposal is checked by the **Evaluation Engine** for consensus, deadlock, and round-limit conditions before looping back or producing a final **Outcome**.
- All session state, proposals, and outcomes are persisted to **MongoDB Atlas**, powering the reports and history/replay features.

---

## Negotiation Lifecycle

The diagram below shows the per-negotiation state machine shared by both modes — from initialization through to agreement, breakdown, or deadlock.

<img width="490" height="1192" alt="Untitled diagram-2026-09-16-124531" src="https://github.com/user-attachments/assets/d1640021-b989-4961-a379-d12d15c52327" />

1. The scenario, agents, and constraints are initialized, and an opening proposal is made.
2. Each participant (AI agent, or human in Practice Mode) takes a turn generating an **Offer**, **Counter**, **Accept**, or **Reject**, which updates the shared negotiation state.
3. Once all participants have acted in a round, the system evaluates consensus, deadlock, and round-limit conditions.
4. The negotiation either advances to the next round, or terminates with **Agreement** or **Deadlock/Breakdown**, producing a final outcome with allocation, concessions, and performance data.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React, Vite, JavaScript, CSS |
| Backend | Python, FastAPI, Uvicorn, Pydantic |
| AI / LLM | Groq (primary), Google Gemini (fallback) |
| Communication | REST APIs, Server-Sent Events (SSE) |
| Persistence | MongoDB Atlas (Motor / PyMongo) |
| Testing | Pytest, regression scripts, `npm run build` |

---

## Project Structure

```
Multiagent-Negotiation-Simulator/
│
├── backend/
│   ├── main.py                          # FastAPI app: negotiation + practice endpoints, SSE streaming, CORS, lifecycle hooks
│   ├── requirements.txt                 # fastapi, uvicorn, pydantic, google-genai, groq, motor, pymongo, python-dotenv
│   ├── .env.example                     # Template for API keys and MongoDB URI
│   │
│   ├── agents/                          # Stakeholder agent definitions
│   │   ├── base_agent.py                # Shared agent behaviour and interface
│   │   ├── government_agent.py          # Public safety, rescue, infrastructure priorities
│   │   ├── ngo_agent.py                 # Vulnerable communities, medical aid, shelter
│   │   └── district_agent.py            # Local operations, debris clearance, district distribution
│   │
│   ├── services/
│   │   ├── negotiation_orchestrator.py  # Core engine: turns, rounds, state, consensus, deadlock, final outcome
│   │   ├── evaluation_engine.py         # Satisfaction scoring, concession analysis, outcome reporting
│   │   ├── gemini_service.py            # Multi-provider LLM layer: Groq primary → Gemini fallback, usage metrics
│   │   ├── gemini_client.py             # Gemini SDK client, API-key rotation, response generation
│   │   ├── reasoning_engine.py          # Agent personas and LLM reasoning helpers
│   │   └── database.py                  # MongoDB Atlas connection and `sessions` collection access
│   │
│   ├── prompts/
│   │   └── prompt_builder.py            # Builds stakeholder prompts from scenario, resources, history, personality
│   │
│   ├── routes/
│   │   ├── negotiation.py               # APIRouter for /api/negotiation
│   │   └── history.py                   # /api/history — list, fetch, delete stored sessions
│   │
│   └── tests/                           # Focused regression tests (see Testing)
│       ├── test_deadlock.py
│       ├── test_practice_deadlock.py
│       ├── test_evaluation_concessions.py
│       ├── test_practice_roundtable.py
│       ├── test_orchestrator_run.py
│       ├── test_negotiation.py
│       ├── test_context.py
│       ├── test_suggestion.py
│       └── test_mongo_connection.py
│
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   │
│   └── src/
│       ├── main.jsx                     # React entry point
│       ├── App.jsx                      # Routes and app shell
│       ├── index.css                    # Global styles
│       │
│       ├── pages/
│       │   ├── Home.jsx
│       │   ├── ScenarioSelection.jsx    # Choose earthquake / flood / cyclone
│       │   ├── AgentConfiguration.jsx   # Agents, personalities, resources, max rounds
│       │   ├── NegotiationArena.jsx     # AI-vs-AI transcript, reasoning, metrics
│       │   ├── PracticeMode.jsx         # Human-vs-AI negotiation with SSE streaming
│       │   ├── Outcome.jsx              # Final allocation, concessions, downloads
│       │   └── History.jsx              # Stored sessions, replay, historical reports
│       │
│       ├── components/
│       │   ├── Layout.jsx
│       │   ├── Navbar.jsx
│       │   ├── ScenarioCard.jsx
│       │   ├── AgentCard.jsx
│       │   ├── OutcomeCharts.jsx        # Concession and performance visualizations
│       │   └── ErrorBoundary.jsx
│       │
│       └── data/
│           └── scenarios.js             # Scenario definitions, resources, districts
│
├── .gitignore
├── LICENSE
└── README.md
```

> **Note:** the test files currently live directly under `backend/`; the `tests/` grouping above reflects the recommended layout.

---

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+ and npm
- A Groq API key
- One or more Google Gemini API keys
- A MongoDB Atlas connection string

### Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Create `backend/.env` (see `.env.example`):

```env
# Groq — primary LLM provider
GROQ_API_KEY_1=your_groq_api_key
GROQ_MODEL=openai/gpt-oss-120b

# Google Gemini — fallback provider (comma-separated for key rotation)
GEMINI_API_KEYS=your_gemini_api_key_1,your_gemini_api_key_2

# MongoDB Atlas
MONGODB_URI=your_mongodb_atlas_connection_string
MONGODB_DB_NAME=negotiation_simulator

# Server
BACKEND_HOST=127.0.0.1
BACKEND_PORT=8000
```

> Never commit API keys or `.env` files to version control.

Run the backend:

```bash
uvicorn main:app --reload --port 8000
# → http://127.0.0.1:8000
# → Interactive docs at http://127.0.0.1:8000/docs
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

---

## API Reference

### Health

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Service health check |

### AI-vs-AI Negotiation

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/negotiation/start` | Create a new negotiation session |
| `POST` | `/api/negotiation/turn` | Execute the next AI turn |
| `GET` | `/api/negotiation/session/{session_id}` | Fetch current session state |
| `POST` | `/api/negotiation/reset` | Reset the active negotiation |

### Human-vs-AI Practice Mode

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/practice/start` | Start a Practice Mode session |
| `POST` | `/api/practice/turn` | Submit a human action and run the AI turns |
| `POST` | `/api/practice/stream-turn` | Same as above, streamed via SSE |
| `POST` | `/api/practice/decision` | Submit the human's final accept/reject decision |
| `POST` | `/api/practice/suggest` | Request an AI-suggested proposal for the human |

### History

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/history` | List stored negotiation sessions |
| `GET` | `/api/history/{session_id}` | Retrieve a single historical session |
| `DELETE` | `/api/history/{session_id}` | Delete a historical session |
| `DELETE` | `/api/history` | Clear all stored history |

---

## Testing

```bash
# Concession evaluation
python -m pytest -q backend/test_evaluation_concessions.py

# Practice Mode deadlock detection
python -m pytest -q backend/test_practice_deadlock.py

# AI-vs-AI deadlock regression
python backend/test_deadlock.py

# MongoDB Atlas connectivity
python backend/test_mongo_connection.py

# Frontend production build
cd frontend && npm run build
```

> The full pytest suite may require running from the `backend/` working directory with an async pytest plugin installed. A successful focused regression run should not be read as proof that the entire suite passes; broader end-to-end testing across every personality and provider combination is recommended before claiming full integration coverage.

---

## Negotiation End States

| State | Meaning |
|---|---|
| `agreement_reached` | All required participants accepted the same proposal. |
| `negotiation_breakdown` | The negotiation stalled and ended without consensus. |
| `deadlock_no_consensus` | Maximum rounds reached without unanimous agreement. |
| Final Decision | Practice Mode only — the human chooses to accept or reject the final negotiated proposal. |

---

## Future Enhancements

- User accounts and authentication
- Additional disaster scenarios and stakeholder agents
- Advanced negotiation analytics and long-term agent performance tracking
- Saved and user-defined negotiation scenarios
- Cloud deployment

---

## License

See [LICENSE](./LICENSE).
