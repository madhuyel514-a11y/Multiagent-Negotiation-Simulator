import { Building2, Droplets, Shield, ClipboardList, List, AlertTriangle, Activity } from 'lucide-react';

function ScenarioCard({ title, description, onSelect, scenario }) {
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
  const badge = badgeMap[title] || (scenario?.category ?? 'Disaster Response');

  return (
    <div className="group relative flex w-full flex-col justify-between self-start rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm transform-gpu transition-transform transition-shadow duration-300 ease-in-out md:group-hover:-translate-y-2 md:group-hover:shadow-2xl md:group-hover:z-10">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <Icon size={20} />
        </div>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
          {badge}
        </span>
      </div>

      <div className="mt-5">
        <h2 className="text-xl font-semibold text-slate-800">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50 px-3 py-2 text-sm font-medium text-slate-600">3 AI Agents</div>

      {/* Expanded content - in-flow so card can naturally grow. Visible by default on small screens, collapsed on md+ until hover. */}
      <div className="mt-4 overflow-visible">
        <div className="overflow-hidden max-h-[1000px] transition-[max-height] duration-300 ease-in-out md:max-h-0 md:group-hover:max-h-[1000px]">
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-md opacity-100 md:opacity-0 md:translate-y-2 md:group-hover:opacity-100 md:group-hover:translate-y-0 transition-opacity transition-transform duration-300 ease-in-out">
            <div className="flex items-start gap-3">
              <ClipboardList size={16} className="text-slate-600" />
              <div>
                <div className="text-xs font-semibold text-slate-500">Primary Objective</div>
                <div className="mt-1 text-sm text-slate-700">{scenario?.objective}</div>
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div>
                <div className="text-xs font-semibold text-slate-500">Resources</div>
                <div className="mt-1 text-sm text-slate-700">{(scenario?.resources || []).join(' · ')}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Negotiation Focus</div>
                <div className="mt-1 text-sm text-slate-700">{scenario?.negotiationFocus}</div>
              </div>
            </div>

            <div className="mt-3">
              <div className="text-xs font-semibold text-slate-500">Key Challenges</div>
              <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                {(scenario?.challenges || []).map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 z-10 flex w-full justify-end">
        <button
          type="button"
          onClick={onSelect}
          className="inline-flex items-center justify-center rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition duration-300 hover:scale-105 hover:bg-blue-700"
        >
          Select Scenario
        </button>
      </div>
    </div>
  );
}

export default ScenarioCard;
