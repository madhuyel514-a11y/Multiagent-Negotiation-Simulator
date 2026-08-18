import { useEffect, useRef, useState } from 'react';
import { Activity, CheckCircle, ClipboardList, Shield, Sparkles } from 'lucide-react';

const API_BASE = 'http://127.0.0.1:8000';

function NegotiationArena() {
  const [scenario, setScenario] = useState(null);
  const [config, setConfig] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [history, setHistory] = useState([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [maxRounds, setMaxRounds] = useState(5);
  const [consensus, setConsensus] = useState(0);
  const [consensusReached, setConsensusReached] = useState(false);
  const [negotiationEnded, setNegotiationEnded] = useState(false);
  const [status, setStatus] = useState('idle');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(null);
  const startedRef = useRef(false);

  useEffect(() => {
    try {
      const storedConfig = localStorage.getItem('negotiationConfig');
      const storedScenario = localStorage.getItem('selectedScenario');
      if (storedConfig) {
        const parsed = JSON.parse(storedConfig);
        setConfig(parsed);
        setMaxRounds(Number(parsed.max_rounds) || 5);
      }
      if (storedScenario) setScenario(JSON.parse(storedScenario));
    } catch (error) {
      setApiError(`Local configuration error: ${error.message}`);
    }
  }, []);

  const applyState = (data) => {
    const state = data?.state || data || {};
    if (data?.session_id) setSessionId(data.session_id);
    setHistory(state.history || []);
    setCurrentRound(Number(state.current_round ?? data?.round ?? 1));
    setConsensus(Number(state.consensus ?? data?.consensus ?? 0));
    setConsensusReached(Boolean(state.consensus_reached ?? data?.consensus_reached));
    setNegotiationEnded(Boolean(state.negotiation_ended ?? data?.negotiation_ended));
    setStatus(state.status || data?.negotiation_status || 'ongoing');
    setMaxRounds(Number(state.max_rounds ?? data?.max_rounds ?? 5));
  };

  const startSession = async () => {
    if (!scenario || !config) return null;
    const response = await fetch(`${API_BASE}/api/negotiation/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenario,
        agents: config.agents || scenario.agents || [],
        config: { 
          max_rounds: Number(config.max_rounds) || 5,
          resourceQuantities: config.resourceQuantities || scenario.resourceQuantities || {}
        },
      }),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Start failed: ${response.status} ${text}`);
    const data = JSON.parse(text);
    if (!data.session_id) throw new Error('Backend did not return session_id.');
    applyState(data);
    return data.session_id;
  };

  const runTurn = async () => {
    if (!scenario || !config) {
      setApiError('Select a scenario and configure the agents first.');
      return;
    }
    if (loading || negotiationEnded || consensusReached) return;

    setLoading(true);
    setApiError(null);
    try {
      let sid = sessionId;
      if (!sid) sid = await startSession();

      const response = await fetch(`${API_BASE}/api/negotiation/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sid }),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`Turn failed: ${response.status} ${text}`);
      const data = JSON.parse(text);
      applyState(data);
    } catch (error) {
      console.error(error);
      setApiError(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (scenario && config && !startedRef.current) {
      startedRef.current = true;
      runTurn();
    }
  }, [scenario, config]);

  const reset = async () => {
    if (!scenario || !config) return;
    setLoading(true);
    setApiError(null);
    try {
      const response = await fetch(`${API_BASE}/api/negotiation/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario,
          agents: config.agents || scenario.agents || [],
          config: { max_rounds: Number(config.max_rounds) || 5 },
        }),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`Reset failed: ${response.status} ${text}`);
      applyState(JSON.parse(text));
    } catch (error) {
      setApiError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const placeholders = [
    { agent: 'Government Agent', message: 'Waiting for negotiation...' },
    { agent: 'NGO Agent', message: 'Waiting for negotiation...' },
    { agent: 'District Administration Agent', message: 'Waiting for negotiation...' },
  ];

  const resources = scenario?.resources || ['Food', 'Medicine', 'Shelter', 'Rescue Teams'];

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-semibold text-slate-800 sm:text-4xl">Negotiation Arena</h1>
        <p className="mx-auto mt-3 max-w-2xl text-base text-slate-600 sm:text-lg">
          Observe the AI agents negotiate disaster-relief resources turn by turn.
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <span className="rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
            Round {currentRound || 1} / {maxRounds}
          </span>
          <span className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
            {loading ? 'AI thinking...' : status === 'max_rounds_reached' ? 'Completed' : status === 'consensus_reached' ? 'Agreement reached' : 'Active'}
          </span>
        </div>
      </div>

      {apiError && (
        <div className="mb-6 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Backend error: {apiError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center gap-2 text-slate-800">
            <ClipboardList size={18} className="text-blue-600" />
            <h2 className="text-lg font-semibold">Scenario Information</h2>
          </div>
          <p className="mt-3 text-sm font-medium text-blue-600">{scenario?.title || 'No scenario selected'}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{scenario?.description || 'Choose a scenario first.'}</p>
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center gap-2 text-slate-800">
            <Shield size={18} className="text-emerald-600" />
            <h2 className="text-lg font-semibold">Selected Personalities</h2>
          </div>
          <div className="mt-3 space-y-2">
            {(config?.agents || []).map((agent) => (
              <div key={agent.id} className="rounded-2xl bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                {agent.name || `Agent ${agent.id}`}: <span className="font-semibold text-blue-700">{agent.personality}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center gap-2 text-slate-800">
            <Activity size={18} className="text-amber-500" />
            <h2 className="text-lg font-semibold">Status</h2>
          </div>
          <div className="mt-3 text-sm text-slate-600">
            Consensus: <span className="font-semibold">{(consensus * 100).toFixed(0)}%</span>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={runTurn}
              disabled={loading || negotiationEnded || consensusReached}
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading ? 'Thinking...' : 'Run Next Turn'}
            </button>
            <button
              onClick={reset}
              disabled={loading}
              className="rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-blue-600" />
            <h2 className="text-xl font-semibold text-slate-800">Negotiation Transcript</h2>
          </div>
          <div className="mt-6 space-y-4">
            {(history.length ? history : placeholders).map((item, i) => (
              <div key={`${i}-${item.agent || ''}`} className={`flex ${item.agent?.includes('NGO') ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${item.agent?.includes('NGO') ? 'bg-blue-600 text-white' : 'bg-white text-slate-700'}`}>
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{item.agent || 'Agent'}</p>
                  <p className="mt-1 text-sm">{item.message}</p>
                  {item.reasoning && <p className="mt-2 text-xs italic opacity-80">Reasoning: {item.reasoning}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6">
            <h3 className="text-lg font-semibold text-slate-800">Resources Available</h3>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              {config?.resourceQuantities && Object.keys(config.resourceQuantities).length > 0 ? (
                Object.entries(config.resourceQuantities).map(([resource, quantity]) => (
                  <div key={resource} className="flex justify-between rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
                    <span className="font-medium text-slate-700">{resource}:</span>
                    <span className="font-semibold text-blue-600">{quantity} units</span>
                  </div>
                ))
              ) : (
                <p className="text-slate-600">Loading resources...</p>
              )}
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6">
            <h3 className="text-lg font-semibold text-slate-800">System Status</h3>
            <div className="mt-4 space-y-3">
              {[
                ['FastAPI Backend', 'Connected'],
                ['Negotiation Orchestrator', sessionId ? 'Active' : 'Starting'],
                ['Gemini AI', 'Enabled'],
                ['Evaluation Engine', 'Active'],
              ].map(([name, value]) => (
                <div key={name} className="flex items-center justify-between rounded-2xl bg-white px-3 py-2 text-sm shadow-sm">
                  <span className="text-slate-700">{name}</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {(consensusReached || negotiationEnded) && (
        <div className="mt-8 rounded-2xl bg-emerald-50 p-5 text-emerald-800">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle size={18} /> Negotiation finished
          </div>
          <p className="mt-1 text-sm">The session reached its configured stopping condition. Use Reset to run another negotiation.</p>
        </div>
      )}
    </div>
  );
}

export default NegotiationArena;
