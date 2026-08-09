import { Building2, HeartHandshake, Shield } from 'lucide-react';

function AgentCard({ name, role, goal, constraints, personality, onPersonalityChange }) {
  const iconMap = {
    'Government Agent': Shield,
    'NGO Agent': HeartHandshake,
    'District Administration Agent': Building2
  };

  const options = [
    { value: 'Aggressive', label: 'Aggressive', description: 'Fast decisions', accent: 'border-red-300 bg-red-50 text-red-700' },
    { value: 'Collaborative', label: 'Collaborative', description: 'Balanced negotiation', accent: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
    { value: 'Risk-Averse', label: 'Risk-Averse', description: 'Safety-first decisions', accent: 'border-blue-300 bg-blue-50 text-blue-700' }
  ];

  const Icon = iconMap[name] || Shield;

  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <Icon size={20} />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-800">{name}</h2>
          <p className="mt-1 text-sm font-medium text-blue-600">{role}</p>
        </div>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Primary Goal
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">{goal}</p>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Operational Constraints
        </h3>
        <div className="mt-2 rounded-2xl bg-slate-50 p-3">
          <ul className="list-disc space-y-2 pl-5 text-sm text-slate-600">
            {constraints.map((constraint) => (
              <li key={constraint}>{constraint}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Personality
        </h3>
        <div className="mt-3 grid gap-2">
          {options.map((option) => {
            const selected = personality === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onPersonalityChange(option.value)}
                className={`rounded-2xl border p-3 text-left transition-all duration-300 ${
                  selected
                    ? `${option.accent} shadow-sm scale-[1.01]`
                    : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm'
                }`}
              >
                <div className="font-semibold text-slate-800">{option.label}</div>
                <div className="mt-1 text-sm text-slate-600">{option.description}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default AgentCard;
