import { useNavigate } from 'react-router-dom';
import { scenarios } from '../data/scenarios';
import { Droplets, Building2, Wind, ArrowRight, Package, AlertTriangle, Target } from 'lucide-react';

const SCENARIO_META = {
  'Flood Relief Resource Allocation': {
    icon: Droplets,
    gradient: 'linear-gradient(135deg, #1e3a5f 0%, #0d2137 100%)',
    accent: '#60a5fa',
    accentBg: 'rgba(37,99,235,0.12)',
    accentBorder: 'rgba(37,99,235,0.3)',
    tag: 'Flood Response',
    tagColor: '#60a5fa',
  },
  'Earthquake Emergency Response': {
    icon: Building2,
    gradient: 'linear-gradient(135deg, #2d1a00 0%, #1a0e00 100%)',
    accent: '#f97316',
    accentBg: 'rgba(249,115,22,0.12)',
    accentBorder: 'rgba(249,115,22,0.3)',
    tag: 'Emergency Ops',
    tagColor: '#f97316',
  },
  'Cyclone Relief Coordination': {
    icon: Wind,
    gradient: 'linear-gradient(135deg, #1a0d2e 0%, #0f0819 100%)',
    accent: '#a78bfa',
    accentBg: 'rgba(124,58,237,0.12)',
    accentBorder: 'rgba(124,58,237,0.3)',
    tag: 'Cyclone Relief',
    tagColor: '#a78bfa',
  },
};

// Light mode gradients
const SCENARIO_META_LIGHT = {
  'Flood Relief Resource Allocation': {
    gradient: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
    accent: '#2563eb',
  },
  'Earthquake Emergency Response': {
    gradient: 'linear-gradient(135deg, #ffedd5 0%, #fed7aa 100%)',
    accent: '#ea580c',
  },
  'Cyclone Relief Coordination': {
    gradient: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
    accent: '#7c3aed',
  },
};

function ScenarioCard({ scenario, onSelect }) {
  const meta = SCENARIO_META[scenario.title] || {
    icon: AlertTriangle,
    gradient: 'linear-gradient(135deg, #1f2328 0%, #0d1117 100%)',
    accent: '#f97316',
    accentBg: 'rgba(249,115,22,0.12)',
    accentBorder: 'rgba(249,115,22,0.3)',
    tag: scenario.category,
    tagColor: '#f97316',
  };
  const Icon = meta.icon;

  return (
    <div
      className="group relative overflow-hidden rounded-2xl flex flex-col transition-all duration-300 cursor-pointer card-lift"
      style={{ border: '1px solid var(--border)', background: 'var(--bg-surface)' }}
      onClick={onSelect}
    >
      {/* Coloured header strip */}
      <div
        className="relative p-5 pb-10"
        style={{ background: meta.gradient }}
      >
        {/* Glow */}
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{ background: `radial-gradient(circle at 80% 20%, ${meta.accent}44 0%, transparent 60%)` }}
        />

        <div className="relative flex items-start justify-between">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ background: meta.accentBg, border: `1px solid ${meta.accentBorder}` }}
          >
            <Icon size={20} style={{ color: meta.accent }} strokeWidth={2} />
          </div>
          <span
            className="badge"
            style={{ background: meta.accentBg, color: meta.accent, border: `1px solid ${meta.accentBorder}` }}
          >
            {meta.tag}
          </span>
        </div>
        <h2 className="mt-4 text-base font-bold leading-snug text-white">
          {scenario.title}
        </h2>
      </div>

      {/* Card body */}
      <div className="flex flex-1 flex-col gap-4 p-5 -mt-6">
        {/* Description */}
        <div
          className="rounded-xl p-3"
          style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)' }}
        >
          <p className="text-xs leading-5" style={{ color: 'var(--text-2)' }}>
            {scenario.description}
          </p>
        </div>

        {/* Resources */}
        <div>
          <p className="section-title flex items-center gap-1.5">
            <Package size={10} />
            Resources ({scenario.resources?.length || 0})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(scenario.resources || []).slice(0, 4).map((r) => (
              <span key={r} className="badge" style={{ background: 'var(--bg-surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                {r}
              </span>
            ))}
            {(scenario.resources || []).length > 4 && (
              <span className="badge" style={{ background: 'var(--bg-surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
                +{scenario.resources.length - 4} more
              </span>
            )}
          </div>
        </div>

        {/* Objective */}
        <div>
          <p className="section-title flex items-center gap-1.5">
            <Target size={10} />
            Objective
          </p>
          <p className="text-xs leading-5" style={{ color: 'var(--text-2)' }}>
            {scenario.objective}
          </p>
        </div>

        {/* Select Button */}
        <button
          className="btn-accent mt-auto flex items-center justify-center gap-2 w-full py-2.5 text-sm"
          style={{ background: `linear-gradient(135deg, ${meta.accent}, ${meta.accent}cc)` }}
        >
          Select Scenario
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

export default function ScenarioSelection() {
  const navigate = useNavigate();

  const handleSelect = (scenario) => {
    const mode = localStorage.getItem('selectedMode') || 'ai';
    localStorage.setItem('selectedMode', mode);
    localStorage.setItem('selectedScenario', JSON.stringify(scenario));
    navigate('/configure');
  };

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div
        className="rounded-2xl p-6"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>
              Choose a Scenario
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-3)' }}>
              Select one disaster relief scenario to configure and simulate negotiations.
            </p>
          </div>
          <div
            className="badge self-start sm:self-auto text-xs px-3 py-1.5"
            style={{ background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}
          >
            {scenarios.length} Scenarios Available
          </div>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 stagger">
        {scenarios.map((scenario) => (
          <div key={scenario.id} className="animate-fade-up">
            <ScenarioCard
              scenario={scenario}
              onSelect={() => handleSelect(scenario)}
            />
          </div>
        ))}
      </div>

    </div>
  );
}
