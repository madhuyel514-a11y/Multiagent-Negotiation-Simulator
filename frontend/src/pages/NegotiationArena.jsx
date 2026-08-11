import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, CheckCircle, ClipboardList, Shield, Sparkles } from 'lucide-react';

function NegotiationArena() {
  const [scenario, setScenario] = useState(null);
  const [config, setConfig] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [history, setHistory] = useState([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [maxRounds, setMaxRounds] = useState(null);
  const [consensus, setConsensus] = useState(0);
  const [consensusReached, setConsensusReached] = useState(false);
  const [negotiationEnded, setNegotiationEnded] = useState(false);
  const [negotiationStatusState, setNegotiationStatusState] = useState('idle');
  const [loadingApi, setLoadingApi] = useState(false);
  const [apiError, setApiError] = useState(null);
  const API_BASE = 'http://127.0.0.1:8000';

  useEffect(() => {
    const storedConfig = localStorage.getItem('negotiationConfig');
    const storedScenario = localStorage.getItem('selectedScenario');

    if (storedConfig) {
      const parsed = JSON.parse(storedConfig);
      setConfig(parsed);
      if (parsed.max_rounds) setMaxRounds(parsed.max_rounds);
    }

    if (storedScenario) {
      setScenario(JSON.parse(storedScenario));
    }
  }, []);

  useEffect(() => {
    // fetch backend health
    fetch(`${API_BASE}/api/health`).then(async (r) => {
      if (!r.ok) return setApiError(`Health check failed: ${r.status}`);
      const data = await r.json();
      setApiError(null);
    }).catch((err) => setApiError(String(err)));
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
          {sessionId && (
            <div className="mt-3 inline-flex items-center justify-center gap-3">
              <div className="rounded-full bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-700">Round {currentRound} / {maxRounds || '—'}</div>
              {negotiationStatusState === 'consensus_reached' && (
                <div className="rounded-md bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">Consensus reached in Round {currentRound}.</div>
              )}
              {negotiationStatusState === 'max_rounds_reached' && (
                <div className="rounded-md bg-rose-50 px-3 py-1 text-sm font-semibold text-rose-700">Maximum negotiation rounds reached.</div>
              )}
            </div>
          )}
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
          {apiError && (
            <div className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">Backend error: {apiError}</div>
          )}
          <p className="mt-3 text-sm leading-6 text-slate-600">
            LLM-powered multi-agent negotiation is available via backend.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <button
              className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              onClick={async () => {
                // Run next turn; ensure session exists
                if (!scenario || !config) return alert('Select scenario and configure agents first.');
                setLoadingApi(true);
                setApiError(null);
                try {
                  let sid = sessionId;
                  if (!sid) {
                    const startResp = await fetch(`${API_BASE}/api/negotiation/start`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ scenario, agents: config.agents || [], config: { max_rounds: config.max_rounds || 5 } }),
                    });
                    if (!startResp.ok) {
                      const txt = await startResp.text();
                      setApiError(`Start failed: ${startResp.status} ${txt}`);
                      return;
                    }
                    const startData = await startResp.json();
                    sid = startData.session_id;
                    setSessionId(sid);
                    setHistory(startData.state.history || []);
                    setCurrentRound(startData.state.current_round || 0);
                    setConsensus(startData.state.consensus || 0);
                    setConsensusReached(!!startData.state.consensus_reached);
                    setNegotiationEnded(!!startData.state.negotiation_ended);
                    setNegotiationStatusState(startData.state.status || 'initialized');
                    if (startData.state?.max_rounds) setMaxRounds(startData.state.max_rounds);
                  }

                  const turnResp = await fetch(`${API_BASE}/api/negotiation/turn`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session_id: sid }),
                  });
                  if (!turnResp.ok) {
                    const txt = await turnResp.text();
                    setApiError(`Turn failed: ${turnResp.status} ${txt}`);
                    return;
                  }
                  const turnData = await turnResp.json();
                  setHistory(turnData.history || []);
                  setCurrentRound(turnData.round || 0);
                  setConsensus(turnData.consensus || 0);
                  setConsensusReached(!!turnData.consensus_reached);
                  setNegotiationEnded(!!turnData.negotiation_ended);
                  setNegotiationStatusState(turnData.negotiation_status || 'ongoing');
                  if (turnData.max_rounds) setMaxRounds(turnData.max_rounds);
                } catch (err) {
                  console.error(err);
                  setApiError(String(err));
                } finally {
                  setLoadingApi(false);
                }
              }}
            disabled={negotiationEnded || consensusReached || loadingApi}
          >
            Run Next Turn
          </button>

            <button
              className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
              onClick={async () => {
                if (!scenario || !config) return alert('Select scenario and configure agents first.');
                setLoadingApi(true);
                setApiError(null);
                try {
                  const resetResp = await fetch(`${API_BASE}/api/negotiation/reset`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ scenario, agents: config.agents || [], config: { max_rounds: config.max_rounds || 5 } }),
                  });
                  if (!resetResp.ok) {
                    const txt = await resetResp.text();
                    setApiError(`Reset failed: ${resetResp.status} ${txt}`);
                    return;
                  }
                  const resetData = await resetResp.json();
                  setSessionId(resetData.session_id);
                  setHistory(resetData.state.history || []);
                  setCurrentRound(resetData.state.current_round || 0);
                  setConsensus(resetData.state.consensus || 0);
                  setConsensusReached(!!resetData.state.consensus_reached);
                  setNegotiationEnded(!!resetData.state.negotiation_ended);
                  setNegotiationStatusState(resetData.state.status || 'initialized');
                  if (resetData.state?.max_rounds) setMaxRounds(resetData.state.max_rounds);
                } catch (err) {
                  console.error(err);
                  setApiError(String(err));
                } finally {
                  setLoadingApi(false);
                }
              }}
            >
              Reset
            </button>
            {loadingApi && <div className="text-sm text-slate-600">Calling backend...</div>}
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-blue-600" />
            <h2 className="text-xl font-semibold text-slate-800">Negotiation Transcript</h2>
          </div>
          <div className="mt-6 space-y-4">
            {(history.length ? history : placeholders).map((item, i) => (
              <div key={i + (item.agent || '')} className={`flex ${item.agent && item.agent.includes('NGO') ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${item.agent && item.agent.includes('NGO') ? 'bg-blue-600 text-white' : 'bg-white text-slate-700'}`}>
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{item.agent || 'Agent'}</p>
                  <p className="mt-1 text-sm">{item.message}</p>
                  {item.reasoning && <p className="mt-2 text-xs italic opacity-80">Reasoning: {item.reasoning}</p>}
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
