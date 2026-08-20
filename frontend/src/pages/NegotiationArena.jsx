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
  const [isAutoRunning, setIsAutoRunning] = useState(false);
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

  useEffect(() => {
    if (isAutoRunning && !loading && !negotiationEnded && !consensusReached) {
      runTurn();
    } else if (negotiationEnded || consensusReached) {
      setIsAutoRunning(false);
    }
  }, [isAutoRunning, loading, negotiationEnded, consensusReached]);

  const reset = async () => {
    if (!scenario || !config) return;
    setIsAutoRunning(false);
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

  const initialDemands = history.reduce((acc, item) => {
    if (item.agent && item.parsed_proposal && Object.keys(item.parsed_proposal).length > 0 && !acc[item.agent]) {
      acc[item.agent] = item.parsed_proposal;
    }
    return acc;
  }, {});

  const agreedAllocation = (() => {
    for (let i = history.length - 1; i >= 0; i--) {
      const item = history[i];
      if (item.parsed_proposal && Object.keys(item.parsed_proposal).length > 0) {
        return item.parsed_proposal;
      }
    }
    return {};
  })();

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
              disabled={loading || negotiationEnded || consensusReached || isAutoRunning}
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading && !isAutoRunning ? 'Thinking...' : 'Run Next Turn'}
            </button>
            <button
              onClick={() => setIsAutoRunning(!isAutoRunning)}
              disabled={negotiationEnded || consensusReached}
              className={`rounded-full px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${isAutoRunning ? 'bg-red-500' : 'bg-emerald-500'}`}
            >
              {isAutoRunning ? 'Stop Auto Run' : 'Auto Run'}
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
                  
                  <div className="flex items-center gap-3 mb-2">
                    <p className="text-xs font-bold uppercase tracking-wide opacity-90">{item.agent || 'Agent'}</p>
                    {(() => {
                      const act = (item.action || item.evaluation?.action || (item.evaluation?.is_accepted ? 'ACCEPT' : (item.round === 1 ? 'OFFER' : 'COUNTER'))).toUpperCase();
                      const isNgo = item.agent?.includes('NGO');
                      if (act === 'REJECT') {
                        return <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wider shadow-sm ${isNgo ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-800'}`}>REJECT</span>;
                      }
                      if (act === 'COUNTER') {
                        return <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wider shadow-sm ${isNgo ? 'bg-amber-300 text-slate-900' : 'bg-amber-100 text-amber-800'}`}>COUNTER</span>;
                      }
                      if (act === 'ACCEPT') {
                        return <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wider shadow-sm ${isNgo ? 'bg-emerald-300 text-slate-900' : 'bg-emerald-100 text-emerald-800'}`}>ACCEPT</span>;
                      }
                      return <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold tracking-wider shadow-sm ${isNgo ? 'bg-sky-300 text-slate-900' : 'bg-sky-100 text-sky-800'}`}>OFFER</span>;
                    })()}
                    {item.evaluation && (
                      <span className="text-[11px] font-semibold opacity-80">Evaluation: {item.evaluation.satisfaction}%</span>
                    )}
                  </div>

                  <p className="mt-1 text-sm leading-relaxed">{item.message}</p>
                  
                  {item.evaluation && (
                    <div className="mt-4 mb-2 rounded-xl bg-slate-900/5 p-4">
                      {item.parsed_proposal && Object.keys(item.parsed_proposal).length > 0 && (
                        <div className="mb-4">
                          <p className="text-[10px] font-bold uppercase tracking-wider mb-2 opacity-70">Proposed Allocation</p>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(item.parsed_proposal).map(([res, val]) => (
                              <span key={res} className={`rounded-full px-3 py-1 text-xs font-semibold shadow-sm ${item.agent?.includes('NGO') ? 'bg-blue-500 text-white' : 'bg-white text-slate-800'}`}>
                                {res}: {val}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <div className="text-xs space-y-2 opacity-90">
                        <p>
                          <span className="font-semibold">Evaluation:</span> Satisfaction {item.evaluation.satisfaction}% is {item.evaluation.is_accepted ? 'above' : 'below'} the acceptance threshold ({item.evaluation.threshold}%) for round {item.round}/{maxRounds}.
                          {item.evaluation.action === 'REJECT' && ` The agent rejects excessive allocations and counters: ${item.evaluation.trade_str}.`}
                          {item.evaluation.action === 'COUNTER' && ` The agent negotiates concessions: ${item.evaluation.trade_str}.`}
                          {item.evaluation.action === 'OFFER' && ` Opening baseline position established.`}
                          {item.evaluation.action === 'ACCEPT' && ` Full consensus reached across all partners.`}
                        </p>
                        
                        {!item.evaluation.is_accepted && item.evaluation.adjustments && Object.keys(item.evaluation.adjustments).length > 0 && (
                          <p><span className="font-semibold">Requested adjustment:</span> {
                            Object.entries(item.evaluation.adjustments).map(([res, adj]) => `${res} ${adj > 0 ? '+'+adj : adj}`).join(' · ')
                          }</p>
                        )}
                      </div>
                    </div>
                  )}

                  {item.reasoning && <p className="mt-3 text-xs italic opacity-80 border-t border-slate-900/10 pt-2">Reasoning: {item.reasoning}</p>}
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
        <div className="mt-8 rounded-[1.75rem] bg-emerald-50/80 p-6 sm:p-8">
          <div className="flex items-center gap-2 font-semibold text-emerald-800 text-xl">
            <CheckCircle size={24} /> Final Negotiation Report
          </div>
          <p className="mt-2 text-sm text-emerald-700/80 mb-6 font-medium">
            The negotiation has concluded. Below is the summary of the opening positions and the final agreed allocation.
          </p>
          
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-4">INITIAL REQUIREMENTS (OPENING DEMANDS)</h3>
              <div className="space-y-4">
                {Object.entries(initialDemands).map(([agentName, demands]) => (
                  <div key={agentName} className="bg-white rounded-xl p-4 shadow-sm">
                    <p className="text-sm font-bold text-slate-800 mb-3">{agentName}</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(demands).map(([res, val]) => (
                        <span key={res} className="border border-slate-200 text-slate-600 rounded-md px-3 py-1.5 text-xs font-medium">
                          {res}: {val}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-4">FINAL AGREED ALLOCATION</h3>
              <div className="bg-[#009A65] text-white rounded-2xl p-6 shadow-md min-h-[160px] flex flex-col justify-start">
                <p className="text-sm font-medium text-emerald-50 mb-5">
                  This allocation was reached at the end of the negotiation:
                </p>
                {Object.keys(agreedAllocation).length > 0 ? (
                  <div className="flex flex-wrap gap-2.5">
                    {Object.entries(agreedAllocation).map(([res, val]) => (
                      <span key={res} className="bg-[#00B47A] text-white rounded-xl px-4 py-2 text-xs font-bold shadow-sm">
                        {res}: {val}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm italic text-emerald-100">No valid allocations were recorded.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default NegotiationArena;
