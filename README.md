# Disaster Relief Resource Negotiation System

A web-based **Multi-Agent Disaster Relief Negotiation Simulator** that models how different disaster-response stakeholders negotiate and allocate limited emergency resources during disasters.

The system allows users to select a disaster scenario, configure AI agents and their personalities, and participate in a multi-round negotiation process. The project integrates a **React frontend**, **FastAPI backend**, **AI-powered agents**, a **Negotiation Orchestrator**, and **Gemini AI** for intelligent negotiation and evaluation.

---

# Project Overview

During disasters, multiple stakeholders must coordinate and negotiate the allocation of limited emergency resources.

This system simulates negotiations between different disaster-response stakeholders, including:

* Government
* NGO
* District Administration
* Human Participant

The system supports disaster scenarios, configurable AI agent personalities, resource allocation, negotiation proposals, counter-offers, agreement detection, and deadlock detection.

The objective is to simulate a realistic multi-agent negotiation environment for disaster relief resource allocation.

---

# Features

## Scenario Selection

Users can select different disaster scenarios, including:

* Flood Relief Resource Allocation
* Earthquake Emergency Response
* Cyclone Relief Coordination

Each scenario contains information about:

* Disaster context
* Available resources
* Participating stakeholders
* Negotiation objectives

---

# Agent Configuration

The system supports configurable AI agents.

The primary AI agents are:

* Government Agent
* NGO Agent
* District Administration Agent

Each agent can have:

* A specific role
* Primary goals
* Operational constraints
* Personality configuration

Supported personality styles include:

* Aggressive
* Collaborative
* Risk-Averse

The selected configuration is stored and passed to the negotiation system.

---

# Practice Mode

Practice Mode allows a human participant to actively participate in the negotiation.

The human participant can:

* Make resource offers
* Request resources
* Accept proposals
* Reject proposals
* Make counter-offers
* Send negotiation messages
* View AI responses
* Track negotiation rounds

The Practice Mode communicates with the FastAPI backend to process negotiation turns.

---

# Multi-Agent Negotiation

The system supports negotiation between multiple stakeholders.

The negotiation process includes:

1. Starting a negotiation session
2. Loading the selected scenario
3. Loading configured AI agents
4. Initializing available resources
5. Allowing the human participant to make a proposal
6. Processing the proposal through the backend
7. Generating AI agent responses
8. Updating the current proposal
9. Evaluating the negotiation state
10. Detecting agreement or deadlock

The Negotiation Orchestrator manages the overall negotiation flow.

---

# Negotiation Actions

The system supports the following negotiation actions:

* PROPOSE
* OFFER
* REQUEST
* ACCEPT
* REJECT
* COUNTER

Each negotiation turn is recorded in the negotiation transcript.

---

# Negotiation Orchestrator

The Negotiation Orchestrator is responsible for managing the negotiation process.

Its responsibilities include:

* Creating negotiation sessions
* Managing negotiation rounds
* Tracking the current proposal
* Processing human participant messages
* Coordinating AI agent responses
* Managing resource allocation
* Detecting negotiation completion
* Detecting deadlocks
* Preventing invalid negotiation states

The orchestrator acts as the central controller between the frontend, AI agents, and evaluation system.

---

# AI Agents

## Government Agent

The Government Agent focuses on:

* Public safety
* Policy decisions
* Large-scale resource allocation
* Emergency response priorities

---

## NGO Agent

The NGO Agent focuses on:

* Humanitarian assistance
* Relief distribution
* Medical support
* Vulnerable populations

---

## District Administration Agent

The District Administration Agent focuses on:

* Local coordination
* Ground-level implementation
* Shelter management
* Emergency operations

---

# Evaluation Engine

The Evaluation Engine analyzes the progress of the negotiation.

Its responsibilities include:

* Consensus detection
* Deadlock detection
* Proposal evaluation
* Negotiation progress analysis
* Resource allocation analysis
* Negotiation scoring

The evaluation system helps determine whether the participants are successfully moving toward an agreement.

---

# Consensus Detection

The system detects when participants reach an agreement on the proposed resource allocation.

When consensus is reached:

* The negotiation is marked as complete
* The session status is updated
* The final proposal can be displayed
* Further negotiation actions can be stopped

---

# Deadlock Detection

The system detects negotiation deadlocks.

A deadlock may occur when:

* Participants repeatedly reject proposals
* Negotiation does not progress
* Agents remain stuck in conflicting positions
* The maximum number of rounds is reached without agreement

When a deadlock occurs, the negotiation session is ended.

---

# Resource Management

The system manages disaster-relief resources such as:

* Food
* Medicine
* Rescue Boats
* Temporary Shelters
* Emergency Supplies

The available resources are tracked throughout the negotiation process.

---

# Current Proposal

The system maintains the current negotiation proposal.

A proposal can contain resource allocations for one or more participants.

The frontend displays:

* Current proposal
* Proposed resource allocation
* AI responses
* Negotiation transcript
* Negotiation round
* Session status

---

# LLM Integration

The project integrates Google Gemini AI to support intelligent negotiation behavior.

Gemini AI can be used for:

* AI agent reasoning
* Dynamic negotiation responses
* Proposal evaluation
* Negotiation analysis
* Consensus detection

---

# LLM Metrics

The Practice Mode dashboard tracks basic LLM and API metrics, including:

* API Requests
* Input Tokens
* Output Tokens
* Total Tokens
* Average Latency
* Total API Latency

These metrics help monitor AI and backend interaction during negotiations.

---

# Technology Stack

## Frontend

* React.js
* Vite
* Tailwind CSS
* React Router
* Lucide React

## Backend

* Python
* FastAPI
* Uvicorn

## AI

* Google Gemini API

## Version Control

* Git
* GitHub

---

# Project Structure

```text
Multiagent-Negotiation-Simulator/
│
├── backend/
│   ├── agents/
│   │   ├── base_agent.py
│   │   ├── government_agent.py
│   │   ├── ngo_agent.py
│   │   └── district_agent.py
│   │
│   ├── prompts/
│   │   └── prompt_builder.py
│   │
│   ├── services/
│   │   ├── evaluation_engine.py
│   │   ├── gemini_service.py
│   │   └── negotiation_orchestrator.py
│   │
│   ├── main.py
│   └── requirements.txt
│
├── frontend/
│   └── src/
│       ├── data/
│       │   └── scenarios.js
│       │
│       ├── pages/
│       │   ├── Home.jsx
│       │   ├── ScenarioSelection.jsx
│       │   ├── AgentConfiguration.jsx
│       │   ├── NegotiationArena.jsx
│       │   └── PracticeMode.jsx
│       │
│       ├── App.jsx
│       └── main.jsx
│
├── README.md
└── .gitignore
```

---

# Installation

## Clone the Repository

```bash
git clone https://github.com/madhuyel514-a11y/Multiagent-Negotiation-Simulator.git
```

Move into the project directory:

```bash
cd Multiagent-Negotiation-Simulator
```

---

# Backend Setup

Navigate to the backend directory:

```bash
cd backend
```

Create a virtual environment:

```bash
python -m venv .venv
```

Activate the virtual environment.

### Windows

```bash
.venv\Scripts\activate
```

### Mac/Linux

```bash
source .venv/bin/activate
```

Install the required dependencies:

```bash
pip install -r requirements.txt
```

---

# Environment Variables

Create a `.env` file inside the `backend` directory.

Add your Gemini API key:

```env
GEMINI_API_KEY=your_actual_api_key_here
```

> Never commit your `.env` file or API keys to GitHub.

---

# Start the Backend

From the backend directory, run:

```bash
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The backend will run at:

```text
http://127.0.0.1:8000
```

---

# Frontend Setup

Open a new terminal and navigate to the frontend directory:

```bash
cd frontend
```

Install the required packages:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

The frontend will normally run at:

```text
http://localhost:5173
```

---

# Application Workflow

```text
Home
  ↓
Scenario Selection
  ↓
Agent Configuration
  ↓
Negotiation Arena
  ↓
Practice Mode
  ↓
Human Proposal / Response
  ↓
FastAPI Backend
  ↓
Negotiation Orchestrator
  ↓
AI Agent Response
  ↓
Evaluation Engine
  ↓
Agreement or Deadlock
```

---

# Current System Status

## Implemented

* React frontend
* Scenario Selection
* Agent Configuration
* Personality Selection
* Negotiation Arena
* Practice Mode
* FastAPI backend integration
* Negotiation Orchestrator
* Government Agent
* NGO Agent
* District Administration Agent
* Resource negotiation
* Multi-round negotiation
* Proposal handling
* Accept and Reject actions
* Counter-offer support
* Evaluation Engine
* Deadlock detection
* Gemini AI integration
* Negotiation transcript
* API and latency metrics

---

# Future Improvements

Possible future improvements include:

* Persistent database storage
* MongoDB integration
* Negotiation history
* Advanced analytics dashboard
* Improved negotiation scoring
* Detailed agent performance analysis
* Visualization of negotiation outcomes
* User authentication
* Exportable negotiation reports
* Advanced deadlock resolution strategies

---

# Contributors

This project is being developed collaboratively as a Multi-Agent AI Negotiation System project.

---

# License

This project is developed for educational and academic purposes.
