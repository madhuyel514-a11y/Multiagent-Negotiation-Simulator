import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, CheckCircle, ClipboardList, Shield, Sparkles } from 'lucide-react';

function NegotiationArena() {
  const [scenario, setScenario] = useState(null);
  const [config, setConfig] = useState(null);

  useEffect(() => {
    const storedConfig = localStorage.getItem('negotiationConfig');
    const storedScenario = localStorage.getItem('selectedScenario');

    if (storedConfig) {
      setConfig(JSON.parse(storedConfig));
    }

    if (storedScenario) {
      setScenario(JSON.parse(storedScenario));
    }
  }, []);

  const placeholders = [
    { agent: 'Government Agent', message: 'Waiting for negotiation...', role: 'left' },
    { agent: 'NGO Agent', message: 'Waiting for negotiation...', role: 'right' },
    { agent: 'District Administration Agent', message: 'Waiting for negotiation...', role: 'left' }
  ];

  const systemStatus = [
    { name: 'FastAPI Backend', status: 'Pending' },
    { name: 'Negotiation Orchestrator', status: 'Pending' },
    { name: 'Gemini AI', status: 'Pending' },
    { name: 'Evaluation Engine', status: 'Pending' }
  ];

  const resources = ['Food', 'Medicine', 'Shelter', 'Rescue Teams'];

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-semibold text-slate-800 sm:text-4xl">Negotiation Arena</h1>
        <p className="mx-auto mt-3 max-w-2xl text-base text-slate-600 sm:text-lg">
          Review the selected plan and prepare for the next stage of the simulation.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
          <div className="flex items-center gap-2 text-slate-800">
            <ClipboardList size={18} className="text-blue-600" />
            <h2 className="text-lg font-semibold">Scenario Information</h2>
          </div>
          <p className="mt-3 text-sm font-medium text-blue-600">{scenario?.title || 'No scenario selected'}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {scenario?.description || 'Choose a scenario to begin the negotiation flow.'}
          </p>
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
          <div className="flex items-center gap-2 text-slate-800">
            <Shield size={18} className="text-emerald-600" />
            <h2 className="text-lg font-semibold">Selected Personalities</h2>
          </div>
          <div className="mt-3 space-y-2">
            {config?.agents?.map((agent) => (
              <div key={agent.id} className="rounded-2xl bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                Agent {agent.id}: <span className="font-semibold text-blue-700">{agent.personality}</span>
              </div>
            )) || <p className="text-sm text-slate-600">No agent personalities configured yet.</p>}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
          <div className="flex items-center gap-2 text-slate-800">
            <Activity size={18} className="text-amber-500" />
            <h2 className="text-lg font-semibold">Status</h2>
          </div>
          <div className="mt-3 inline-flex rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
            Ready to Start Negotiation
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            LLM-powered multi-agent negotiation will be integrated in Milestone 2.
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-blue-600" />
            <h2 className="text-xl font-semibold text-slate-800">Negotiation Transcript</h2>
          </div>
          <div className="mt-6 space-y-4">
            {placeholders.map((item) => (
              <div key={item.agent} className={`flex ${item.role === 'right' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${item.role === 'right' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700'}`}>
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{item.agent}</p>
                  <p className="mt-1 text-sm">{item.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-800">Scenario Summary</h3>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div>
                <p className="font-semibold text-slate-800">Scenario Name</p>
                <p>{scenario?.title || 'No scenario selected'}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-800">Scenario Description</p>
                <p>{scenario?.description || 'No details available.'}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-800">Stakeholders</p>
                <p>Government · NGO · District Administration</p>
              </div>
              <div>
                <p className="font-semibold text-slate-800">Resources involved</p>
                <p>{resources.join(' · ')}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-800">System Status</h3>
            <div className="mt-4 space-y-3">
              {systemStatus.map((item) => (
                <div key={item.name} className="flex items-center justify-between rounded-2xl bg-white px-3 py-2 text-sm shadow-sm">
                  <span className="text-slate-700">{item.name}</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-xl font-semibold text-slate-800">Upcoming AI Features</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[
            'Multi-Agent Negotiation',
            'Gemini AI Integration',
            'Consensus Detection',
            'Deadlock Resolution',
            'Negotiation Summary',
            'Runtime History'
          ].map((feature) => (
            <div key={feature} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <CheckCircle size={16} className="text-emerald-600" />
              {feature}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default NegotiationArena;
