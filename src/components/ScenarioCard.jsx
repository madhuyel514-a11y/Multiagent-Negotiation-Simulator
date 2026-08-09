import { Building2, Droplets, Shield } from 'lucide-react';

function ScenarioCard({ title, description, onSelect }) {
  const iconMap = {
    'Flood Relief Resource Allocation': Droplets,
    'Earthquake Emergency Response': Building2,
    'Cyclone Relief Coordination': Shield
  };

  const badgeMap = {
    'Flood Relief Resource Allocation': 'Flood Response',
    'Earthquake Emergency Response': 'Emergency Ops',
    'Cyclone Relief Coordination': 'Cyclone Relief'
  };

  const Icon = iconMap[title] || Shield;
  const badge = badgeMap[title] || 'Disaster Response';

  return (
    <div className="group flex h-full flex-col rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <Icon size={20} />
        </div>
        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-green-700">
          {badge}
        </span>
      </div>

      <h2 className="mt-5 text-xl font-semibold text-slate-800">{title}</h2>
      <p className="mt-3 flex-1 text-sm leading-6 text-slate-600">{description}</p>

      <div className="mt-4 rounded-2xl bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600">
        3 AI Agents
      </div>

      <button
        type="button"
        onClick={onSelect}
        className="mt-6 inline-flex items-center justify-center rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition duration-300 hover:scale-105 hover:bg-blue-700"
      >
        Select Scenario
      </button>
    </div>
  );
}

export default ScenarioCard;
