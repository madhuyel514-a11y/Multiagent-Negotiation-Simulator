import { useEffect, useRef, useState } from 'react';
import { Activity, CheckCircle, ClipboardList, Shield, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

const API_BASE = 'http://127.0.0.1:8000';

// ─────────────────────────────────────────────
// Agent colour palette
// ─────────────────────────────────────────────
const AGENT_STYLES = {
  government: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    badge: 'bg-blue-700 text-white',
    dot: 'bg-blue-600',
    label: 'text-blue-800',
    chip: 'bg-blue-100 text-blue-800',
    headerBg: 'bg-blue-600',
    headerText: 'text-white',
    tagBg: 'bg-blue-100 text-blue-700',
  },
  ngo: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    badge: 'bg-emerald-700 text-white',
    dot: 'bg-emerald-600',
    label: 'text-emerald-800',
    chip: 'bg-emerald-100 text-emerald-800',
    headerBg: 'bg-emerald-600',
    headerText: 'text-white',
    tagBg: 'bg-emerald-100 text-emerald-700',
  },
  district: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    badge: 'bg-amber-600 text-white',
    dot: 'bg-amber-500',
    label: 'text-amber-800',
    chip: 'bg-amber-100 text-amber-800',
    headerBg: 'bg-amber-500',
    headerText: 'text-white',
    tagBg: 'bg-amber-100 text-amber-700',
  },
  default: {
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    badge: 'bg-slate-600 text-white',
    dot: 'bg-slate-500',
    label: 'text-slate-800',
    chip: 'bg-slate-100 text-slate-700',
    headerBg: 'bg-slate-600',
    headerText: 'text-white',
    tagBg: 'bg-slate-100 text-slate-600',
  },
};

const ACTION_STYLES = {
  OFFER: { cls: 'bg-sky-100 text-sky-800', label: 'PROPOSES' },
  COUNTER: { cls: 'bg-amber-100 text-amber-800', label: 'COUNTER' },
  REJECT: { cls: 'bg-rose-100 text-rose-800', label: 'OBJECTS' },
  ACCEPT: { cls: 'bg-emerald-100 text-emerald-800', label: 'ACCEPTS' },
};

function getAgentStyle(agentName) {
  const n = (agentName || '').toLowerCase();
  if (n.includes('government')) return AGENT_STYLES.government;
  if (n.includes('ngo')) return AGENT_STYLES.ngo;
  if (n.includes('district')) return AGENT_STYLES.district;
  return AGENT_STYLES.default;
}

function getActionStyle(action) {
  return ACTION_STYLES[(action || '').toUpperCase()] || { cls: 'bg-slate-100 text-slate-700', label: action || 'SPEAK' };
}

// ─────────────────────────────────────────────
// Single transcript entry card
// ─────────────────────────────────────────────
function TranscriptEntry({ item, maxRounds, isLast, consensusReached }) {
  const [expanded, setExpanded] = useState(false);
  const style = getAgentStyle(item.agent);
  const actionStyle = getActionStyle(item.action);
  const hasProposal = item.parsed_proposal && Object.keys(item.parsed_proposal).length > 0;
  const hasReasoning = item.reasoning && item.reasoning.trim().length > 0;
  const hasEvaluation = item.evaluation;

  // Build the round label: prefer backend-generated, else derive
  const roundLabel = item.round_label || `Round ${item.round} — ${item.agent || 'Agent'} responds`;

  const displayMessage = item.speech || item.message || '';

  return (
    <div className="relative pl-8">
      {/* Timeline dot */}
      <div className={`absolute left-0 top-5 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm ${style.dot}`} />

      {/* Round label separator */}
      <div className="mb-2">
        <span className="inline-block text-[11px] font-bold uppercase tracking-widest text-slate-400 select-none">
          {roundLabel}
        </span>
      </div>

      {/* Agent card */}
      <div className={`rounded-2xl border ${style.border} ${style.bg} overflow-hidden shadow-sm`}>
        {/* Card header */}
        <div className={`flex items-center gap-3 px-4 py-2.5 ${style.headerBg}`}>
          <span className={`text-xs font-extrabold tracking-wider ${style.headerText} uppercase`}>
            {item.agent || 'Agent'}
          </span>
          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${actionStyle.cls}`}>
            {actionStyle.label}
          </span>
        </div>

        {/* Main speech bubble */}
        <div className="px-4 py-3">
          <p className={`text-sm leading-relaxed ${style.label} font-medium`}>
            {displayMessage || <em className="opacity-50">Waiting for response...</em>}
          </p>
        </div>

        {/* Resource allocation chips — only this agent's own proposal */}
        {hasProposal && (
          <div className="px-4 pb-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Resource request
            </p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(item.parsed_proposal).map(([resource, amount]) => {
                // Skip nested (multi-agent) allocations — show flat only
                if (typeof amount === 'object') return null;
                return (
                  <span key={resource} className={`text-xs font-semibold rounded-full px-3 py-1 ${style.chip}`}>
                    {resource}: {amount}
                  </span>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────
function NegotiationArena() {
  const [scenario, setScenario] = useState(null);
  const [config, setConfig] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [history, setHistory] = useState([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [maxRounds, setMaxRounds] = useState(5);
  const [consensus, setConsensus] = useState(0);
  const [consensusReached, setConsensusReached] = useState(false);
  const [agreedAgents, setAgreedAgents] = useState(0);
  const [totalAgents, setTotalAgents] = useState(0);
  const [negotiationEnded, setNegotiationEnded] = useState(false);
  const [finalAllocation, setFinalAllocation] = useState(null);
  const [status, setStatus] = useState('idle');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const startedRef = useRef(false);
  const transcriptEndRef = useRef(null);

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

  // Auto-scroll transcript to bottom on new entries
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history]);

  const applyState = (data) => {
    const state = data?.state || data || {};
    if (data?.session_id) setSessionId(data.session_id);
    setHistory(state.history || []);
    setCurrentRound(Number(state.current_round ?? data?.round ?? 1));
    setConsensus(Number(state.consensus ?? data?.consensus ?? 0));
    setConsensusReached(Boolean(state.consensus_reached ?? data?.consensus_reached));
    setAgreedAgents(Number(state.agreed_agents ?? data?.agreed_agents ?? 0));
    setTotalAgents(Number(state.total_agents ?? data?.total_agents ?? config?.agents?.length ?? 3));
    setNegotiationEnded(Boolean(state.negotiation_ended ?? data?.negotiation_ended));
    setFinalAllocation(state.final_allocation ?? data?.final_allocation ?? null);
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
          resourceQuantities: config.resourceQuantities || scenario.resourceQuantities || {},
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
      setIsAutoRunning(false); // Stop auto-running on error
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

  const agreedAllocation = finalAllocation || {};

  const isNestedAllocation = (allocation) =>
    allocation &&
    typeof allocation === 'object' &&
    Object.values(allocation).some((v) => v && typeof v === 'object' && !Array.isArray(v));

  const initialDemands = history.reduce((acc, item) => {
    if (
      item.agent &&
      item.action?.toUpperCase() === 'OFFER' &&
      item.parsed_proposal &&
      Object.keys(item.parsed_proposal).length > 0 &&
      !acc[item.agent]
    ) {
      acc[item.agent] = item.parsed_proposal;
    }
    return acc;
  }, {});

  const statusLabel = loading
    ? 'AI thinking...'
    : status === 'max_rounds_reached'
      ? 'Completed'
      : status === 'consensus_reached' || consensusReached
        ? 'Agreement reached'
        : 'Active';

  const progressPct = maxRounds > 0 ? Math.min(100, ((currentRound - 1) / maxRounds) * 100) : 0;

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
      {/* ── Header ── */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-semibold text-slate-800 sm:text-4xl">Negotiation Arena</h1>
        <p className="mx-auto mt-3 max-w-2xl text-base text-slate-500 sm:text-lg">
          Observe each AI agent negotiate in their own voice — round by round.
        </p>
        <div className="mt-4 flex justify-center gap-3 flex-wrap">
          <span className="rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
            Round {currentRound || 1} / {maxRounds}
          </span>
          <span
            className={`rounded-full px-4 py-2 text-sm font-semibold ${loading
                ? 'bg-amber-50 text-amber-700'
                : consensusReached
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
          >
            {statusLabel}
          </span>
        </div>
        {/* Round progress bar */}
        <div className="mt-4 mx-auto max-w-sm h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {apiError && (
        <div className="mb-6 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Backend error: {apiError}
        </div>
      )}

      {/* ── Info row ── */}
      <div className="grid gap-6 lg:grid-cols-3 mb-8">
        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center gap-2 text-slate-800">
            <ClipboardList size={18} className="text-blue-600" />
            <h2 className="text-base font-semibold">Scenario</h2>
          </div>
          <p className="mt-2 text-sm font-medium text-blue-600">{scenario?.title || 'No scenario selected'}</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">{scenario?.description || 'Choose a scenario first.'}</p>
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center gap-2 text-slate-800">
            <Shield size={18} className="text-emerald-600" />
            <h2 className="text-base font-semibold">Agent Personalities</h2>
          </div>
          <div className="mt-3 space-y-2">
            {(config?.agents || []).map((agent) => {
              const s = getAgentStyle(agent.name);
              return (
                <div key={agent.id} className="rounded-2xl bg-white px-3 py-2 text-sm text-slate-700 shadow-sm flex items-center gap-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${s.dot}`} />
                  {agent.name || `Agent ${agent.id}`}:
                  <span className="font-semibold text-slate-800">{agent.personality}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center gap-2 text-slate-800">
            <Activity size={18} className="text-amber-500" />
            <h2 className="text-base font-semibold">Controls</h2>
          </div>
          <div className="mt-3 text-sm text-slate-500">
            Agents Agreed: <span className="font-semibold text-slate-700">{agreedAgents} / {totalAgents || 3}</span>
          </div>
          <div className="mt-3 flex gap-2 flex-wrap">
            <button
              onClick={runTurn}
              disabled={loading || negotiationEnded || consensusReached || isAutoRunning}
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-blue-700 transition-colors"
            >
              {loading && !isAutoRunning ? 'Thinking...' : 'Next Turn'}
            </button>
            <button
              onClick={() => setIsAutoRunning(!isAutoRunning)}
              disabled={negotiationEnded || consensusReached}
              className={`rounded-full px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${isAutoRunning ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600'
                }`}
            >
              {isAutoRunning ? 'Stop Auto' : 'Auto Run'}
            </button>
            <button
              onClick={reset}
              disabled={loading}
              className="rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-amber-600 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">

        {/* ── Transcript ── */}
        <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Sparkles size={18} className="text-blue-600" />
            <h2 className="text-xl font-semibold text-slate-800">Negotiation Transcript</h2>
            <span className="ml-auto text-xs font-medium text-slate-400">{history.length} turns</span>
          </div>

          {/* Timeline */}
          <div className="relative">
            {/* Vertical line */}
            {history.length > 0 && (
              <div className="absolute left-[6px] top-0 bottom-0 w-0.5 bg-slate-200 rounded-full" />
            )}

            <div className="space-y-6">
              {history.length === 0 ? (
                /* Placeholder skeleton */
                <div className="pl-8 space-y-4">
                  {['Government Agent', 'NGO Agent', 'District Administration Agent'].map((name) => {
                    const s = getAgentStyle(name);
                    return (
                      <div key={name} className={`rounded-2xl border ${s.border} ${s.bg} p-4 opacity-50`}>
                        <div className={`text-xs font-bold uppercase tracking-wider mb-2 ${s.label}`}>{name}</div>
                        <p className="text-sm text-slate-400 italic">Waiting for negotiation to begin...</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                history.map((item, i) => (
                  <TranscriptEntry
                    key={`${i}-${item.agent || ''}-${item.round}`}
                    item={item}
                    maxRounds={maxRounds}
                    isLast={i === history.length - 1}
                    consensusReached={consensusReached}
                  />
                ))
              )}

              {/* Loading pulse */}
              {loading && (
                <div className="pl-8">
                  <div className="absolute left-0 top-auto w-3.5 h-3.5 rounded-full border-2 border-white bg-blue-400 animate-pulse" />
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 animate-pulse">
                    <div className="h-3 w-24 bg-blue-200 rounded mb-3" />
                    <div className="h-2 w-full bg-blue-100 rounded mb-2" />
                    <div className="h-2 w-3/4 bg-blue-100 rounded" />
                  </div>
                </div>
              )}

              <div ref={transcriptEndRef} />
            </div>
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-6">
          {/* Resources */}
          <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6">
            <h3 className="text-base font-semibold text-slate-800 mb-4">Resources Available</h3>
            <div className="space-y-2">
              {config?.resourceQuantities && Object.keys(config.resourceQuantities).length > 0 ? (
                Object.entries(config.resourceQuantities).map(([resource, quantity]) => (
                  <div key={resource} className="flex justify-between rounded-xl bg-white px-3 py-2 text-sm shadow-sm">
                    <span className="font-medium text-slate-700">{resource}</span>
                    <span className="font-semibold text-blue-600">{quantity} units</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400">Loading resources...</p>
              )}
            </div>
          </div>

          {/* System Status */}
          <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6">
            <h3 className="text-base font-semibold text-slate-800 mb-4">System Status</h3>
            <div className="space-y-2">
              {[
                ['FastAPI Backend', 'Connected'],
                ['Negotiation Orchestrator', sessionId ? 'Active' : 'Starting'],
                ['Gemini AI', 'Enabled'],
                ['Evaluation Engine', 'Active'],
              ].map(([name, value]) => (
                <div key={name} className="flex items-center justify-between rounded-2xl bg-white px-3 py-2 text-sm shadow-sm">
                  <span className="text-slate-600">{name}</span>
                  <span className="rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-0.5 text-xs font-semibold">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Agent legend */}
          <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6">
            <h3 className="text-base font-semibold text-slate-800 mb-4">Agent Legend</h3>
            <div className="space-y-2">
              {[
                { name: 'Government Agent', style: AGENT_STYLES.government },
                { name: 'NGO Agent', style: AGENT_STYLES.ngo },
                { name: 'District Administration', style: AGENT_STYLES.district },
              ].map(({ name, style }) => (
                <div key={name} className="flex items-center gap-2 text-sm">
                  <span className={`w-3 h-3 rounded-full ${style.dot}`} />
                  <span className="text-slate-600">{name}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Action types</p>
              {Object.entries(ACTION_STYLES).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${val.cls}`}>{val.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Final Report ── */}
      {(consensusReached || negotiationEnded) && (
        <div className="mt-8 rounded-[1.75rem] bg-emerald-50/80 p-6 sm:p-8">
          <div className="flex items-center gap-2 font-semibold text-emerald-800 text-xl mb-2">
            <CheckCircle size={24} />
            Final Negotiation Report
          </div>
          <p className="text-sm text-emerald-700/80 mb-6 font-medium">
            {consensusReached
              ? 'The negotiation concluded successfully. Below are the opening positions and the final agreed allocation.'
              : 'The negotiation concluded without unanimous agreement.'}
          </p>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Opening demands */}
            <div>
              <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-4">
                Initial Requirements (Opening Demands)
              </h3>
              <div className="space-y-4">
                {Object.entries(initialDemands).map(([agentName, demands]) => {
                  const s = getAgentStyle(agentName);
                  return (
                    <div key={agentName} className="bg-white rounded-xl p-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
                        <p className="text-sm font-bold text-slate-800">{agentName}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {demands && typeof demands === 'object' && !Array.isArray(demands) ? (
                          isNestedAllocation(demands) ? (
                            Object.entries(demands).map(([res, val]) => (
                              <div key={res} className="w-full">
                                <p className="text-xs font-bold text-slate-700 mb-1">{res}</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {Object.entries(val).map(([resource, amount]) => (
                                    <span key={`${res}-${resource}`} className={`text-xs font-medium rounded-md px-2.5 py-1 ${s.chip}`}>
                                      {resource}: {amount}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))
                          ) : (
                            Object.entries(demands).map(([res, val]) => (
                              <span key={res} className={`text-xs font-medium rounded-md px-2.5 py-1 ${s.chip}`}>
                                {res}: {val}
                              </span>
                            ))
                          )
                        ) : (
                          <span className="text-xs text-slate-500">{demands}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Final allocation */}
            <div>
              <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-4">
                {consensusReached ? 'Final Agreed Allocation' : 'No Agreement Reached'}
              </h3>
              <div className="bg-[#009A65] text-white rounded-2xl p-6 shadow-md min-h-[160px]">
                <p className="text-sm font-medium text-emerald-50 mb-5">
                  {consensusReached
                    ? 'This allocation was unanimously agreed upon:'
                    : 'No valid allocation was reached.'}
                </p>
                {Object.keys(agreedAllocation).length > 0 ? (
                  isNestedAllocation(agreedAllocation) ? (
                    <div className="space-y-4">
                      {Object.entries(agreedAllocation).map(([agentName, allocation]) => (
                        <div key={agentName}>
                          <p className="text-sm font-bold mb-2">{agentName}</p>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(allocation).map(([resource, amount]) => (
                              <span key={`${agentName}-${resource}`} className="bg-[#00B47A] text-white rounded-xl px-4 py-2 text-xs font-bold shadow-sm">
                                {resource}: {amount}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2.5">
                      {Object.entries(agreedAllocation).map(([resource, amount]) => (
                        <span key={resource} className="bg-[#00B47A] text-white rounded-xl px-4 py-2 text-xs font-bold shadow-sm">
                          {resource}: {amount}
                        </span>
                      ))}
                    </div>
                  )
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
