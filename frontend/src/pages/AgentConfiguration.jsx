import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AgentCard from '../components/AgentCard';

function AgentConfiguration() {
  const navigate = useNavigate();
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [personalities, setPersonalities] = useState({});
  const [maxRounds, setMaxRounds] = useState(5);

  useEffect(() => {
    const storedScenario = localStorage.getItem('selectedScenario');
    if (storedScenario) {
      const parsedScenario = JSON.parse(storedScenario);
      setSelectedScenario(parsedScenario);

      const initialPersonalities = {};
      parsedScenario.agents.forEach((agent) => {
        initialPersonalities[agent.id] = agent.defaultPersonality;
      });
      setPersonalities(initialPersonalities);
    }
  }, []);

  useEffect(() => {
    // load existing negotiationConfig maxRounds if present
    const stored = localStorage.getItem('negotiationConfig');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.max_rounds) setMaxRounds(parsed.max_rounds);
      } catch (e) {}
    }
  }, []);

  const handlePersonalityChange = (agentId, personality) => {
    setPersonalities((prev) => ({ ...prev, [agentId]: personality }));
  };

  const handleStartNegotiation = () => {
    const negotiationConfig = {
      scenario: selectedScenario,
      agents: selectedScenario.agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        personality: personalities[agent.id]
      }))
    };

    localStorage.setItem('negotiationConfig', JSON.stringify(negotiationConfig));
    navigate('/negotiation');
  };

  const handleStartWithMaxRounds = () => {
    const negotiationConfig = {
      scenario: selectedScenario,
      agents: selectedScenario.agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        personality: personalities[agent.id]
      })),
      max_rounds: maxRounds,
    };

    localStorage.setItem('negotiationConfig', JSON.stringify(negotiationConfig));
    navigate('/negotiation');
  };

  if (!selectedScenario) {
    return (
      <div className="flex min-h-screen items-center justify-center rounded-[2rem] border border-slate-200 bg-white px-4 shadow-sm">
        <p className="text-lg text-slate-600">No scenario selected yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-semibold text-slate-800 sm:text-4xl">
          Configure Agent Personalities
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-base text-slate-600 sm:text-lg">
          Review the selected scenario and set the behavior of each agent before starting the negotiation.
        </p>
        <div className="mt-6 inline-flex rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
          {selectedScenario.title}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {selectedScenario.agents.map((agent) => (
          <AgentCard
            key={agent.id}
            name={agent.name}
            role={agent.role}
            goal={agent.goal}
            constraints={agent.constraints}
            personality={personalities[agent.id]}
            onPersonalityChange={(personality) => handlePersonalityChange(agent.id, personality)}
          />
        ))}
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">Maximum Negotiation Rounds</label>
          <select
            value={maxRounds}
            onChange={(e) => setMaxRounds(Number(e.target.value))}
            className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            {[3,5,10,15,20].map((v) => (
              <option key={v} value={v}>{v} rounds</option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={handleStartWithMaxRounds}
            className="rounded-full bg-blue-600 px-8 py-3 text-lg font-semibold text-white shadow-md transition duration-300 hover:scale-105 hover:bg-blue-700"
          >
            Start Negotiation
          </button>
        </div>
      </div>
    </div>
  );
}

export default AgentConfiguration;
