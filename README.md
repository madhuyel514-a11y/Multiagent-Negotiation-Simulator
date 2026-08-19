# Disaster Relief Resource Negotiation System - Evaluation Module

This branch (`evaluation-module`) focuses on the **Evaluation Engine** and **Gemini API Integration** for the negotiation simulation. It extends the base project by introducing LLM-powered evaluation of negotiation rounds, consensus detection, and AI-driven agent reasoning.

---

## ✨ Changes in this Branch

This branch introduces the following key components:

- **Evaluation Engine** (`backend/services/evaluation_engine.py`): Analyzes negotiation transcripts to detect consensus, evaluate proposals, and calculate scores.
- **Gemini Service Integration** (`backend/services/gemini_service.py`): Connects to the Google Gemini API to power agent reasoning, evaluation, and dynamic responses.
- **Negotiation Orchestrator Updates** (`backend/services/negotiation_orchestrator.py`): Manages the flow of negotiations, passing data between the frontend, the agents, and the evaluation engine.
- **Agent Prompts & Logic**: Updates to `district_agent.py`, `government_agent.py`, `ngo_agent.py`, and `prompt_builder.py` to support LLM context and dynamic prompt generation.
- **Frontend Arena Updates** (`frontend/src/pages/NegotiationArena.jsx`): UI enhancements to display evaluation results and real-time AI reasoning.

---

## 🔐 Environment Variables (.env)

To run the evaluation module, you must provide a valid Google Gemini API key. The backend relies on this key to evaluate negotiations and generate agent responses.

1. Navigate to the `backend/` directory.
2. Create a file named `.env` (it is already ignored by Git).
3. Add your Gemini API key to the file in the following format:

```env
GEMINI_API_KEY=your_actual_api_key_here
```

*Note: Never commit your `.env` file to version control.*

---

## 🚀 Running the Project

You need to run both the backend (FastAPI) and frontend (React/Vite) servers simultaneously.

### 1. Start the Backend

Open a terminal and navigate to the backend directory:

```bash
cd backend
```

Create and activate a virtual environment (recommended):
```bash
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On Mac/Linux:
source .venv/bin/activate
```

Install dependencies:
```bash
pip install -r requirements.txt
```

Start the FastAPI server:
```bash
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```
*The backend will be running at `http://127.0.0.1:8000`*

### 2. Start the Frontend

Open a **new** terminal (keep the backend running) and navigate to the frontend directory:

```bash
cd frontend
```

Install the required Node packages:
```bash
npm install
```

Start the Vite development server:
```bash
npm run dev
```
*The frontend will be running at `http://localhost:5173`*

---

## 🧪 Testing the Evaluation Module

1. Open `http://localhost:5173` in your browser.
2. Select a scenario and configure your agents.
3. Start the negotiation in the **Negotiation Arena**.
4. As agents take turns, the **Evaluation Engine** (powered by Gemini) will analyze the discussion in the background, evaluate the proposals, and determine if consensus has been reached.