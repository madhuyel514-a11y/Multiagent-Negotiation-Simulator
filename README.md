# Disaster Relief Resource Negotiation System

A multi-agent negotiation simulation platform for disaster-relief resource allocation.

The system models different stakeholders as autonomous agents with distinct roles, objectives, constraints, and negotiation personalities. Agents participate in a structured, multi-round negotiation process to allocate limited emergency resources.

The project is designed to evolve from a deterministic multi-agent simulation into a Generative AI-powered negotiation system using LLM-based reasoning.

---

## 📌 Overview

During a disaster, multiple stakeholders may compete or collaborate over limited resources such as:

- Food
- Medicine
- Rescue teams
- Temporary shelters
- Emergency supplies

The system simulates how different stakeholders negotiate resource allocation while considering their individual priorities, personalities, objectives, and constraints.

The current system provides:

- Scenario selection
- Agent configuration
- Negotiation Arena
- Multi-agent turn rotation
- Multi-round negotiation
- Maximum-round control
- Agent reasoning display
- Negotiation transcript
- Backend API integration

Future stages will introduce real LLM-powered negotiation, contextual responses, evaluation, deadlock handling, and Practice Mode.

---

## 🎯 Project Objectives

1. Develop a multi-agent simulation where autonomous LLM-powered agents negotiate with unique personas, objectives, and negotiation personalities.
2. Support Simulation Mode (AI vs AI) and Practice Mode (Human vs AI) within a clean, chat-style negotiation interface.
3. Provide three pre-built negotiation scenario templates for immediate use without manual configuration.
4. Provide structured outcome analysis including agreement terms, concession patterns, and per-agent performance.

---

## ✨ Current Features

### Scenario Selection

Users can select a predefined disaster-relief negotiation scenario.

Example scenarios include:

- Cyclone Relief Coordination
- Flood Relief Resource Allocation
- Earthquake Emergency Response

Each scenario contains information such as:

- Scenario name
- Description
- Stakeholders
- Resources involved

### Agent Configuration

Agents can be configured with different negotiation personalities, such as:

- Aggressive
- Collaborative
- Risk-Averse
- Practical
- Firm

The configuration is stored locally and passed to the negotiation backend.

### Negotiation Arena

The Negotiation Arena provides a chat-style interface for observing the negotiation.

It currently displays:

- Agent messages
- Agent reasoning
- Agent personality/stance badges
- Negotiation transcript
- Current round
- Maximum rounds
- Negotiation status
- Scenario summary
- System status

### Multi-Round Negotiation

The system supports multiple rounds of negotiation.

For example, with three agents and a maximum of three rounds:

```text
Round 1
  Agent 1
  Agent 2
  Agent 3

Round 2
  Agent 1
  Agent 2
  Agent 3

Round 3
  Agent 1
  Agent 2
  Agent 3
```

The negotiation automatically stops when the configured maximum number of rounds is reached.

### Maximum Round Control

Users can configure the maximum number of negotiation rounds.

The selected value is passed from the frontend to the backend and stored as part of the negotiation session state.

The UI displays the current progress, for example:

```text
Round 2 / 3
```

---

## 🏗️ System Architecture

```text
                    ┌──────────────────────────┐
                    │        React UI          │
                    │      Vite Frontend       │
                    └────────────┬─────────────┘
                                 │
                                 │ REST API
                                 ▼
                    ┌──────────────────────────┐
                    │       FastAPI Backend    │
                    │                          │
                    │  Negotiation API         │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │ Negotiation Orchestrator │
                    │                          │
                    │ • Turn management        │
                    │ • Agent rotation         │
                    │ • Round tracking         │
                    │ • Session state          │
                    │ • Max-round enforcement  │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │     Agent Services       │
                    │                          │
                    │ • Agent personas         │
                    │ • Objectives             │
                    │ • Constraints            │
                    │ • Reasoning              │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │ Future LLM Layer         │
                    │      Gemini / LLM        │
                    │                          │
                    │ Context-aware responses  │
                    └──────────────────────────┘
```

---

## 📂 Project Structure

```text
Disaster-Relief-Resource-Negotiation-System/
│
├── backend/
│   ├── __pycache__/
│   ├── agents/
│   ├── services/
│   ├── .env.example
│   ├── main.py
│   └── requirements.txt
│
├── frontend/
│   ├── node_modules/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── AgentCard.jsx
│   │   │   ├── Layout.jsx
│   │   │   ├── Navbar.jsx
│   │   │   └── ScenarioCard.jsx
│   │   │
│   │   ├── data/
│   │   │   └── scenarios.js
│   │   │
│   │   ├── pages/
│   │   │   ├── AgentConfiguration.jsx
│   │   │   ├── Home.jsx
│   │   │   ├── NegotiationArena.jsx
│   │   │   └── ScenarioSelection.jsx
│   │   │
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   │
│   ├── .eslint.config.js
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   └── vite.config.js
│
├── .gitignore
└── README.md
```

---

## 🛠️ Technology Stack

### Frontend

- React
- Vite
- JavaScript
- CSS

### Backend

- Python
- FastAPI
- Pydantic
- Uvicorn
- REST APIs

### AI / LLM

Planned integration:

- Google Gemini
- LLM-based agent reasoning
- Context-aware negotiation

### Development Tools

- Git
- GitHub
- Visual Studio Code

---

## 🔌 Backend API

The FastAPI backend currently exposes the following endpoints.

### Health Check

```http
GET /api/health
```

Used to verify that the backend is running.

### Start Negotiation

```http
POST /api/negotiation/start
```

Creates a new negotiation session.

The request contains:

```json
{
  "scenario": {},
  "agents": [],
  "config": {
    "max_rounds": 3
  }
}
```

### Run Negotiation Turn

```http
POST /api/negotiation/turn
```

Runs the next agent turn.

Request:

```json
{
  "session_id": "session-id"
}
```

The backend manages:

- Current agent
- Agent rotation
- Round progression
- Negotiation state
- Maximum rounds
- Negotiation status

### Reset Negotiation

```http
POST /api/negotiation/reset
```

Resets the current negotiation session.

---

## 🚀 Running the Project

### 1. Start the Backend

Open a terminal in the project directory:

```bash
cd backend
```

Create a virtual environment if required:

```bash
python -m venv .venv
```

Windows:

```bash
.venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Start FastAPI:

```bash
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The backend will be available at:

```text
http://127.0.0.1:8000
```

FastAPI documentation:

```text
http://127.0.0.1:8000/docs
```

### 2. Start the Frontend

Open another terminal:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Start Vite:

```bash
npm run dev
```

The frontend will normally be available at:

```text
http://localhost:5173
```

---

## 🧪 Testing the System

### Step 1 — Start Backend

Confirm that FastAPI is running:

```text
http://127.0.0.1:8000/api/health
```

Expected response:

```json
{
  "status": "ok"
}
```

### Step 2 — Start Frontend

Open:

```text
http://localhost:5173
```

### Step 3 — Select Scenario

Choose one of the available disaster-relief scenarios.

### Step 4 — Configure Agents

Select agent personalities and configure the maximum number of rounds.

### Step 5 — Open Negotiation Arena

Review:

- Scenario
- Agent personalities
- Round limit
- Negotiation transcript

### Step 6 — Run Next Turn

Click:

```text
Run Next Turn
```

Each click executes the next negotiation turn.

The system rotates through the configured agents.

### Step 7 — Observe Rounds

The interface displays the current round:

```text
Round 1 / 3
Round 2 / 3
Round 3 / 3
```

When the maximum number of rounds is reached, the negotiation ends.

---

## 🔄 Current Negotiation Flow

```text
Scenario Selection
        ↓
Agent Configuration
        ↓
Maximum Round Configuration
        ↓
Negotiation Arena
        ↓
Start Negotiation
        ↓
Agent 1 Turn
        ↓
Agent 2 Turn
        ↓
Agent 3 Turn
        ↓
Next Round
        ↓
Agent 1 Turn
        ↓
Agent 2 Turn
        ↓
Agent 3 Turn
        ↓
Continue Until:
  • Consensus is reached
  OR
  • Maximum rounds are reached
```

---

## 🤖 Current Agent Behaviour

The current implementation provides the negotiation structure and deterministic agent responses.

Agents currently have:

- A role
- A personality
- A scenario
- A negotiation turn
- A reasoning/proposal output

The next major implementation stage is to replace deterministic responses with real LLM-generated responses.

---

## 🧠 Planned LLM-Powered Negotiation

The planned Gemini integration will allow each agent to generate responses based on:

- Agent persona
- Agent objectives
- Agent constraints
- Scenario information
- Previous negotiation messages
- Previous proposals
- Other agents' positions
- Current negotiation round

This will transform the current structured simulation into a context-aware multi-agent negotiation system.

Example:

```text
Government Agent:
"We should prioritize medical supplies for the most severely affected districts."

NGO Agent:
"We agree on medical priority, but food and temporary shelter must receive a
minimum allocation for vulnerable communities."

District Administration Agent:
"Based on current field conditions, we recommend increasing rescue teams
in high-risk zones while maintaining a minimum food reserve."
```

The responses should be generated dynamically rather than being fixed strings.

---

## 🎮 Planned Simulation and Practice Modes

### Simulation Mode

```text
AI Agent 1
     ↕
AI Agent 2
     ↕
AI Agent 3
```

The user observes the negotiation.

### Practice Mode

```text
       Human
         ↕
     AI Agent 1
         ↕
     AI Agent 2
```

The user participates as one negotiating party while AI agents respond dynamically.

---

## 📊 Planned Outcome Analysis

The final system will provide structured negotiation analysis including:

### Agreement Terms

What resources and conditions were finally agreed upon.

### Concession Patterns

How each agent changed its position during the negotiation.

### Agent Performance

Metrics for each participant based on factors such as:

- Goal satisfaction
- Concessions made
- Agreement contribution
- Negotiation effectiveness

### Negotiation Summary

A concise summary of:

- Initial positions
- Major proposals
- Counteroffers
- Concessions
- Final agreement
- Unresolved issues

---

## 📈 Development Status

| Feature | Status |
|---|---|
| Project structure | ✅ Complete |
| Frontend setup | ✅ Complete |
| Backend setup | ✅ Complete |
| Scenario selection | ✅ Complete |
| Pre-built scenarios | ✅ Complete |
| Agent configuration | ✅ Complete |
| Agent personalities | ✅ Complete |
| Negotiation Arena UI | ✅ Complete |
| Backend API integration | ✅ Complete |
| Agent turn rotation | ✅ Complete |
| Multi-round negotiation | ✅ Complete |
| Maximum round control | ✅ Complete |
| Negotiation transcript | ✅ Complete |
| Basic reasoning display | ✅ Complete |
| Real LLM/Gemini integration | 🔴 Pending |
| Context-aware LLM negotiation | 🔴 Pending |
| Dynamic counteroffers | 🔴 Pending |
| Consensus evaluation | 🔴 Pending / refinement |
| Deadlock detection | 🔴 Pending |
| Concession analysis | 🔴 Pending |
| Final outcome evaluation | 🔴 Pending |
| Simulation Mode refinement | 🔴 Pending |
| Practice Mode | 🔴 Pending |
| Final negotiation report | 🔴 Pending |

---

## 👥 Development Sequence

The planned implementation sequence is:

```text
Scenario + Agent Configuration
            ↓
Negotiation Arena
            ↓
Turn Management + Round Control
            ↓
LLM / Gemini Integration
            ↓
Context-Aware Agent Reasoning
            ↓
Counteroffer + Evaluation
            ↓
Deadlock Detection
            ↓
Practice Mode
            ↓
Final Outcome + Performance Report
```

---

## 🔐 Environment Variables

Environment variables should be stored locally and must not be committed to Git.

Use:

```text
.env
```

An example file can be provided as:

```text
.env.example
```

Example:

```env
GEMINI_API_KEY=your_api_key_here
```

Never commit real API keys.

---

## 🔒 Git and Security

The project ignores local and sensitive files such as:

- `.env`
- `.env.*`
- `node_modules/`
- `dist/`
- `.vite/`
- Log files
- IDE configuration
- Operating system files

Only `.env.example` should be committed when environment configuration needs to be documented.

---

## 📝 Future Improvements

Future versions will focus on:

1. Real Gemini-powered agent responses.
2. Context-aware negotiation memory.
3. Dynamic counteroffers.
4. Better consensus detection.
5. Deadlock detection and resolution.
6. Concession tracking.
7. Negotiation scoring.
8. Practice Mode.
9. Final outcome reports.
10. Improved negotiation analytics.
11. Persistent negotiation history.
12. More scenario templates.

---

## 📜 License

This project is developed for educational, research, and demonstration purposes.