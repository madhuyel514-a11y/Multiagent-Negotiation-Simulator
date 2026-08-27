import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AgentCard from '../components/AgentCard';

const SEVERITY_OPTIONS = ['Low', 'Medium', 'High', 'Severe', 'Critical'];

function AgentConfiguration() {
  const navigate = useNavigate();
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [personalities, setPersonalities] = useState({});
  const [maxRounds, setMaxRounds] = useState(5);
  const [resourceQuantities, setResourceQuantities] = useState({});
  const [affectedAreas, setAffectedAreas] = useState([]);

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

      const initialQuantities = parsedScenario.resourceQuantities
        ? { ...parsedScenario.resourceQuantities }
        : {};
      setResourceQuantities(initialQuantities);

      // Pre-fill Affected Areas from the scenario's built-in recipients, if any
      if (Array.isArray(parsedScenario.recipients) && parsedScenario.recipients.length > 0) {
        setAffectedAreas(
          parsedScenario.recipients.map((r, idx) => ({
            id: `area_${idx}`,
            name: r.name || '',
            population: r.population ?? '',
            severity: r.severity || 'Medium',
            impact: r.impact || '',
            needs: Array.isArray(r.needs) ? r.needs : [],
          }))
        );
      } else {
        setAffectedAreas([]);
      }
    }
  }, []);

  useEffect(() => {
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

  const handleResourceQuantityChange = (resourceName, quantity) => {
    setResourceQuantities((prev) => ({
      ...prev,
      [resourceName]: Math.max(0, parseInt(quantity) || 0),
    }));
  };

  // ── Affected Areas handlers ──
  const addAffectedArea = () => {
    setAffectedAreas((prev) => [
      ...prev,
      {
        id: `area_${Date.now()}`,
        name: '',
        population: '',
        severity: 'Medium',
        impact: '',
        needs: [],
      },
    ]);
  };

  const removeAffectedArea = (id) => {
    setAffectedAreas((prev) => prev.filter((a) => a.id !== id));
  };

  const updateAffectedArea = (id, field, value) => {
    setAffectedAreas((prev) =>
      prev.map((a) => (a.id === id ? { ...a, [field]: value } : a))
    );
  };

  const toggleAreaNeed = (id, resourceName) => {
    setAffectedAreas((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        const has = a.needs.includes(resourceName);
        return {
          ...a,
          needs: has ? a.needs.filter((n) => n !== resourceName) : [...a.needs, resourceName],
        };
      })
    );
  };

  const buildScenarioWithAreas = () => {
    const cleanedAreas = affectedAreas
      .filter((a) => a.name.trim())
      .map((a) => ({
        name: a.name.trim(),
        population: a.population === '' ? undefined : Number(a.population),
        severity: a.severity,
        impact: a.impact,
        needs: a.needs,
      }));

    return {
      ...selectedScenario,
      recipients: cleanedAreas,
    };
  };

  const handleStartWithMaxRounds = () => {
    const negotiationConfig = {
      scenario: buildScenarioWithAreas(),
      agents: selectedScenario.agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        personality: personalities[agent.id],
      })),
      max_rounds: maxRounds,
      resourceQuantities: resourceQuantities,
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

  const resourceNames = Object.keys(resourceQuantities);

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

      <div className="mt-8 rounded-lg border border-blue-200 bg-blue-50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Available Resources &amp; Quantities</h2>
        <p className="mb-4 text-sm text-slate-600">Modify the available quantities for each resource before starting negotiation:</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(resourceQuantities).map(([resourceName, quantity]) => (
            <div key={resourceName}>
              <label className="block text-sm font-medium text-slate-700">{resourceName}</label>
              <input
                type="number"
                min="0"
                value={quantity}
                onChange={(e) => handleResourceQuantityChange(resourceName, e.target.value)}
                className="mt-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm w-full"
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Affected Areas ── */}
      <div className="mt-8 rounded-lg border border-emerald-200 bg-emerald-50 p-6">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Affected Areas</h2>
            <p className="mt-1 text-sm text-slate-600">
              Configure the communities that will receive the negotiated resources.
            </p>
          </div>
          <button
            type="button"
            onClick={addAffectedArea}
            className="self-start sm:self-auto rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
          >
            + Add Affected Area
          </button>
        </div>

        {affectedAreas.length === 0 && (
          <p className="text-sm italic text-slate-500">
            No affected areas configured yet — agents will negotiate resources amongst themselves only.
          </p>
        )}

        <div className="space-y-4">
          {affectedAreas.map((area, idx) => (
            <div key={area.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Affected Area {idx + 1}</p>
                <button
                  type="button"
                  onClick={() => removeAffectedArea(area.id)}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                >
                  Remove
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-500">Name</label>
                  <input
                    type="text"
                    value={area.name}
                    onChange={(e) => updateAffectedArea(area.id, 'name', e.target.value)}
                    placeholder="e.g. Riverbend District"
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Population</label>
                  <input
                    type="number"
                    min="0"
                    value={area.population}
                    onChange={(e) => updateAffectedArea(area.id, 'population', e.target.value)}
                    placeholder="e.g. 15000"
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Severity</label>
                  <select
                    value={area.severity}
                    onChange={(e) => updateAffectedArea(area.id, 'severity', e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm bg-white"
                  >
                    {SEVERITY_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Impact / Situation</label>
                  <input
                    type="text"
                    value={area.impact}
                    onChange={(e) => updateAffectedArea(area.id, 'impact', e.target.value)}
                    placeholder="e.g. Blocked roads, displaced families"
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="mt-3">
                <label className="block text-xs font-medium text-slate-500 mb-2">Resource Needs</label>
                <div className="flex flex-wrap gap-4">
                  {resourceNames.map((resourceName) => (
                    <label key={resourceName} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={area.needs.includes(resourceName)}
                        onChange={() => toggleAreaNeed(area.id, resourceName)}
                        className="rounded border-slate-300"
                      />
                      {resourceName}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">Maximum Negotiation Rounds</label>
          <select
            value={maxRounds}
            onChange={(e) => setMaxRounds(Number(e.target.value))}
            className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            {[3, 5, 10, 15, 20].map((v) => (
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