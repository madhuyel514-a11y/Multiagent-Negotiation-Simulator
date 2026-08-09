# Disaster Relief Resource Negotiation System

A web-based Multi-Agent Disaster Relief Negotiation Simulator that models how different disaster response stakeholders negotiate resource allocation during emergencies.

This project enables users to select disaster scenarios, configure AI agent personalities, and prepare a negotiation session through an intuitive web interface.

> **Current Status:** Milestone 1 (Frontend Completed)

---

# Project Overview

The Disaster Relief Resource Negotiation System simulates negotiations between multiple stakeholders involved in disaster management.

The system currently supports:

- Scenario Selection
- Agent Configuration
- Personality Selection
- Negotiation Preparation Dashboard

Future milestones will integrate AI-powered negotiation using LLMs and a FastAPI backend.

---

# Features Implemented (Milestone 1)

## Home Dashboard

- Modern landing page
- Project overview
- Navigation bar
- Progress indicator
- Responsive UI
- Feature overview cards

---

## Scenario Selection

Users can choose from three disaster scenarios:

- Flood Relief Resource Allocation
- Earthquake Emergency Response
- Cyclone Relief Coordination

Each scenario contains:

- Description
- Three participating agents
- Resource allocation context

Selected scenario is stored using Local Storage.

---

## Agent Configuration

Each scenario automatically loads three stakeholders:

- Government Agent
- NGO Agent
- District Administration Agent

Each agent includes:

- Role
- Primary Goal
- Operational Constraints
- Personality Configuration

Users can select one of three personalities:

- Aggressive
- Collaborative
- Risk-Averse

The selected personalities are stored locally before negotiation begins.

---

## Negotiation Arena

Milestone 1 includes a frontend negotiation dashboard displaying:

- Selected Scenario
- Selected Agent Personalities
- Scenario Summary
- System Status
- Negotiation Transcript Placeholder
- Future AI Features Preview

No AI negotiation is executed yet.

---

# Disaster Scenarios

### Flood Relief Resource Allocation

Allocate:

- Food
- Medicine
- Rescue Boats
- Temporary Shelters

---

### Earthquake Emergency Response

Coordinate:

- Rescue Teams
- Medical Aid
- Temporary Shelters

---

### Cyclone Relief Coordination

Coordinate:

- Evacuation
- Food Distribution
- Infrastructure Restoration

---

# AI Agents

## Government Agent

Responsible for:

- Policy decisions
- Resource allocation
- Public safety

---

## NGO Agent

Responsible for:

- Humanitarian assistance
- Medical support
- Relief distribution

---

## District Administration Agent

Responsible for:

- Local coordination
- Shelter management
- Ground-level execution

---

# Technology Stack

## Frontend

- React.js
- Vite
- React Router
- Tailwind CSS

## Backend (Planned)

- Python
- FastAPI
- REST APIs

## AI (Planned)

- Google Gemini API

## Version Control

- Git
- GitHub

---

# Project Structure

```
src
│
├── assets
│
├── components
│   ├── Navbar.jsx
│   ├── Layout.jsx
│   ├── ScenarioCard.jsx
│   └── AgentCard.jsx
│
├── data
│   └── scenarios.js
│
├── pages
│   ├── Home.jsx
│   ├── ScenarioSelection.jsx
│   ├── AgentConfiguration.jsx
│   └── NegotiationArena.jsx
│
├── App.jsx
├── main.jsx
└── index.css
```

---

# Installation

Clone the repository

```bash
git clone https://github.com/madhuyel514-a11y/Multiagent-Negotiation-Simulator.git
```

Move into the project directory

```bash
cd Multiagent-Negotiation-Simulator
```

Install dependencies

```bash
npm install
```

Run the application

```bash
npm run dev
```

Open your browser

```
http://localhost:5173
```

---

# Current Workflow

```
Home
        ↓

Scenario Selection
        ↓

Agent Configuration
        ↓

Negotiation Arena
```

---

# Current Milestone Status

## Completed

- React Project Setup
- Routing using React Router
- Responsive User Interface
- Scenario Selection Module
- Agent Configuration Module
- Personality Selection
- Negotiation Preparation Dashboard
- Local Storage Integration
- Modular Component Architecture

---

## In Progress

- FastAPI Backend
- REST API Integration
- Negotiation Orchestrator
- AI Agent Communication
- Gemini API Integration

---

## Planned

- Live Multi-Agent Negotiation
- Conversation Transcript
- Consensus Detection
- Deadlock Resolution
- Negotiation Evaluation
- Runtime History
- Negotiation Analytics Dashboard

---

# Future Architecture

The complete system will consist of:

- React Frontend
- FastAPI Backend
- Negotiation Orchestrator
- Government Agent
- NGO Agent
- District Administration Agent
- Gemini AI Integration
- Evaluation Engine
- Runtime Storage
- Negotiation Dashboard

---
