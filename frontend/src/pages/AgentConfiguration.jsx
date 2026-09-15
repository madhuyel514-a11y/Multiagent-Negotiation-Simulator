import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, HeartHandshake, Building2, ChevronDown, Package, MapPin, Plus, Trash2, PlayCircle } from 'lucide-react';

const SEVERITY_OPTIONS = ['Low', 'Medium', 'High', 'Severe', 'Critical'];
const SEVERITY_COLORS = {
  Low: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.25)' },
  Medium: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)' },
  High: { color: '#f97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.25)' },
  Severe: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)' },
  Critical: { color: '#dc2626', bg: 'rgba(220,38,38,0.15)', border: 'rgba(220,38,38,0.35)' },
};

const AGENT_META = {
  'Government Agent':              { icon: Shield,       color: 'var(--gov-color)',  bg: 'var(--gov-bg)',  border: 'var(--gov-border)',  header: 'var(--gov-header)' },
  'NGO Agent':                     { icon: HeartHandshake, color: 'var(--ngo-color)', bg: 'var(--ngo-bg)', border: 'var(--ngo-border)', header: 'var(--ngo-header)' },
  'District Administration Agent': { icon: Building2,    color: 'var(--dist-color)', bg: 'var(--dist-bg)', border: 'var(--dist-border)', header: 'var(--dist-header)' },
};

const PERSONALITY_CONFIG = [
  { value: 'Aggressive',    label: 'Aggressive',    desc: 'Bold, fast decisions',        accent: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)' },
  { value: 'Collaborative', label: 'Collaborative', desc: 'Balanced, cooperative',       accent: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.25)' },
  { value: 'Risk-Averse',   label: 'Risk-Averse',   desc: 'Cautious, safety-first',      accent: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.25)' },
];

function AgentCard({ agent, personality, onPersonalityChange }) {
  const meta = AGENT_META[agent.name] || { icon: Shield, color: 'var(--accent)', bg: 'var(--accent-bg)', border: 'var(--accent-border)', header: '#ea580c' };
  const Icon = meta.icon;

  return (
    <div className="card flex flex-col overflow-hidden">
      {/* Agent header */}
      <div className="flex items-center gap-3 p-4" style={{ background: meta.bg, borderBottom: `1px solid ${meta.border}` }}>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: meta.color + '22', border: `1px solid ${meta.border}` }}
        >
          <Icon size={18} style={{ color: meta.color }} strokeWidth={2} />
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{agent.name}</p>
          <p className="text-xs" style={{ color: meta.color }}>{agent.role}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4">
        {/* Goal */}
        <div>
          <p className="section-title">Goal</p>
          <p className="text-xs leading-5" style={{ color: 'var(--text-2)' }}>{agent.goal}</p>
        </div>

        {/* Constraints */}
        <div>
          <p className="section-title">Constraints</p>
          <div className="space-y-1.5">
            {agent.constraints.map((c) => (
              <div key={c} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: meta.color }} />
                {c}
              </div>
            ))}
          </div>
        </div>

        {/* Personality Selector */}
        <div>
          <p className="section-title">Personality</p>
          <div className="grid gap-2">
            {PERSONALITY_CONFIG.map((opt) => {
              const selected = personality === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => onPersonalityChange(opt.value)}
                  className="flex items-center gap-3 rounded-xl p-3 text-left transition-all duration-200"
                  style={{
                    background: selected ? opt.bg : 'var(--bg-surface-2)',
                    border: `1px solid ${selected ? opt.border : 'var(--border)'}`,
                  }}
                >
                  <div
                    className="h-3 w-3 rounded-full flex-shrink-0 transition-all duration-200"
                    style={{ background: selected ? opt.accent : 'var(--border)', boxShadow: selected ? `0 0 6px ${opt.accent}88` : 'none' }}
                  />
                  <div>
                    <p className="text-xs font-semibold" style={{ color: selected ? opt.accent : 'var(--text-1)' }}>{opt.label}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>{opt.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AgentConfiguration() {
  const navigate = useNavigate();
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [personalities, setPersonalities] = useState({});
  const [maxRounds, setMaxRounds] = useState(5);
  const [resourceQuantities, setResourceQuantities] = useState({});
  const [affectedAreas, setAffectedAreas] = useState([]);

  useEffect(() => {
    const storedScenario = localStorage.getItem('selectedScenario');
    if (storedScenario) {
      const parsed = JSON.parse(storedScenario);
      setSelectedScenario(parsed);
      const p = {};
      parsed.agents.forEach((a) => { p[a.id] = a.defaultPersonality; });
      setPersonalities(p);
      setResourceQuantities(parsed.resourceQuantities ? { ...parsed.resourceQuantities } : {});
      if (Array.isArray(parsed.recipients) && parsed.recipients.length > 0) {
        setAffectedAreas(parsed.recipients.map((r, i) => ({
          id: `area_${i}`, name: r.name || '', population: r.population ?? '', severity: r.severity || 'Medium', impact: r.impact || '', needs: Array.isArray(r.needs) ? r.needs : [],
        })));
      }
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('negotiationConfig');
    if (stored) { try { const p = JSON.parse(stored); if (p.max_rounds) setMaxRounds(p.max_rounds); } catch {} }
  }, []);

  const addArea = () => setAffectedAreas((prev) => [...prev, { id: `area_${Date.now()}`, name: '', population: '', severity: 'Medium', impact: '', needs: [] }]);
  const removeArea = (id) => setAffectedAreas((prev) => prev.filter((a) => a.id !== id));
  const updateArea = (id, field, value) => setAffectedAreas((prev) => prev.map((a) => (a.id === id ? { ...a, [field]: value } : a)));
  const toggleNeed = (id, res) => setAffectedAreas((prev) => prev.map((a) => {
    if (a.id !== id) return a;
    const has = a.needs.includes(res);
    return { ...a, needs: has ? a.needs.filter((n) => n !== res) : [...a.needs, res] };
  }));

  const handleStart = () => {
    sessionStorage.removeItem('activeArenaSessionId');
    sessionStorage.removeItem('activePracticeSessionId');
    const cleanAreas = affectedAreas.filter((a) => a.name.trim()).map((a) => ({
      name: a.name.trim(), population: a.population === '' ? undefined : Number(a.population),
      severity: a.severity, impact: a.impact, needs: a.needs,
    }));
    const config = {
      scenario: { ...selectedScenario, recipients: cleanAreas },
      agents: selectedScenario.agents.map((a) => ({
        id: a.id, name: a.name, role: a.role, goal: a.goal, constraints: a.constraints, personality: personalities[a.id],
      })),
      max_rounds: maxRounds,
      resourceQuantities,
    };
    localStorage.setItem('negotiationConfig', JSON.stringify(config));
    const mode = localStorage.getItem('selectedMode') || 'ai';
    navigate(mode === 'practice' ? '/practice' : '/negotiation');
  };

  if (!selectedScenario) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>No scenario selected. Go back to Scenarios.</p>
      </div>
    );
  }

  const resourceNames = Object.keys(resourceQuantities);

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>Configure Agents</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-3)' }}>Set personalities, resources, and affected areas for the negotiation.</p>
          </div>
          <span className="badge self-start sm:self-auto px-3 py-1.5" style={{ background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}>
            {selectedScenario.title}
          </span>
        </div>
      </div>

      {/* Agent Cards */}
      <div>
        <p className="section-title mb-4">Agent Personalities</p>
        <div className="grid gap-4 lg:grid-cols-3 stagger">
          {selectedScenario.agents.map((agent) => (
            <div key={agent.id} className="animate-fade-up">
              <AgentCard
                agent={agent}
                personality={personalities[agent.id]}
                onPersonalityChange={(p) => setPersonalities((prev) => ({ ...prev, [agent.id]: p }))}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Resources */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="mb-4 flex items-center gap-2">
          <Package size={16} style={{ color: 'var(--accent)' }} />
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>Available Resources</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(resourceQuantities).map(([name, qty]) => (
            <div key={name}>
              <label className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--text-2)' }}>{name}</label>
              <input
                type="number" min="0" value={qty}
                onChange={(e) => setResourceQuantities((prev) => ({ ...prev, [name]: Math.max(0, parseInt(e.target.value) || 0) }))}
                className="input-field"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Affected Areas */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin size={16} style={{ color: 'var(--ngo-color)' }} />
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>Affected Areas</h2>
          </div>
          <button
            onClick={addArea}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200"
            style={{ background: 'var(--ngo-bg)', color: 'var(--ngo-color)', border: '1px solid var(--ngo-border)' }}
          >
            <Plus size={12} />
            Add Area
          </button>
        </div>

        {affectedAreas.length === 0 && (
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>No affected areas yet — agents will negotiate amongst themselves.</p>
        )}

        <div className="space-y-3">
          {affectedAreas.map((area, idx) => (
            <div key={area.id} className="rounded-xl p-4" style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Area {idx + 1}</span>
                <button onClick={() => removeArea(area.id)} className="rounded-lg p-1 transition-colors" style={{ color: 'var(--text-3)' }}>
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] font-medium" style={{ color: 'var(--text-3)' }}>Name</label>
                  <input className="input-field text-xs" value={area.name} onChange={(e) => updateArea(area.id, 'name', e.target.value)} placeholder="e.g. Riverbend District" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium" style={{ color: 'var(--text-3)' }}>Population</label>
                  <input className="input-field text-xs" type="number" min="0" value={area.population} onChange={(e) => updateArea(area.id, 'population', e.target.value)} placeholder="e.g. 15000" />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium" style={{ color: 'var(--text-3)' }}>Severity</label>
                  <select
                    className="input-field text-xs"
                    value={area.severity}
                    onChange={(e) => updateArea(area.id, 'severity', e.target.value)}
                    style={{ background: 'var(--bg-surface)' }}
                  >
                    {SEVERITY_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium" style={{ color: 'var(--text-3)' }}>Impact / Situation</label>
                  <input className="input-field text-xs" value={area.impact} onChange={(e) => updateArea(area.id, 'impact', e.target.value)} placeholder="e.g. Blocked roads" />
                </div>
              </div>
              {/* Resource needs */}
              <div className="mt-3">
                <label className="mb-2 block text-[10px] font-medium" style={{ color: 'var(--text-3)' }}>Resource Needs</label>
                <div className="flex flex-wrap gap-2">
                  {resourceNames.map((r) => {
                    const checked = area.needs.includes(r);
                    return (
                      <button
                        key={r}
                        onClick={() => toggleNeed(area.id, r)}
                        className="badge transition-all duration-150"
                        style={{
                          background: checked ? 'var(--accent-bg)' : 'var(--bg-surface)',
                          color: checked ? 'var(--accent)' : 'var(--text-3)',
                          border: `1px solid ${checked ? 'var(--accent-border)' : 'var(--border)'}`,
                        }}
                      >
                        {checked && '✓ '}{r}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Max Rounds + Start */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl p-5"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div>
          <label className="mb-2 block text-xs font-semibold" style={{ color: 'var(--text-2)' }}>Maximum Negotiation Rounds</label>
          <select
            value={maxRounds}
            onChange={(e) => setMaxRounds(Number(e.target.value))}
            className="input-field text-sm"
            style={{ width: 'auto', minWidth: 160, background: 'var(--bg-surface)' }}
          >
            {[3, 5, 10, 15, 20].map((v) => <option key={v} value={v}>{v} rounds</option>)}
          </select>
        </div>
        <button onClick={handleStart} className="btn-accent flex items-center gap-2 px-8 py-3 text-sm">
          <PlayCircle size={16} />
          Start Negotiation
        </button>
      </div>

    </div>
  );
}