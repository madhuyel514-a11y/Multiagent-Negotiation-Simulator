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
    badge: 'bg-purple-700 text-white',
    dot: 'bg-purple-600',
    label: 'text-purple-800',
    chip: 'bg-purple-100 text-purple-800',
    headerBg: 'bg-purple-600',
    headerText: 'text-white',
    tagBg: 'bg-purple-100 text-purple-700',
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
  OFFER: { cls: 'bg-sky-100 text-sky-800', label: 'OFFER' },
  COUNTER: { cls: 'bg-amber-100 text-amber-800', label: 'COUNTER' },
  REJECT: { cls: 'bg-rose-100 text-rose-800', label: 'REJECT' },
  ACCEPT: { cls: 'bg-emerald-100 text-emerald-800', label: 'ACCEPTS' },
};

const INITIAL_GEMINI_METRICS = {
  total_requests: 0,
  total_input_tokens: 0,
  total_output_tokens: 0,
  total_tokens: 0,
  total_latency: 0,
  average_latency: 0,
};

const FALLBACK_AGENT_STYLES = [
  AGENT_STYLES.government,
  AGENT_STYLES.ngo,
  {
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    badge: 'bg-violet-700 text-white',
    dot: 'bg-violet-600',
    label: 'text-violet-800',
    chip: 'bg-violet-100 text-violet-800',
    headerBg: 'bg-violet-600',
    headerText: 'text-white',
    tagBg: 'bg-violet-100 text-violet-700',
  },
];

function getAgentStyle(agentName, agentIndex = 0) {
  const n = (agentName || '').toLowerCase();
  if (n.includes('government')) return AGENT_STYLES.government;
  if (n.includes('ngo')) return AGENT_STYLES.ngo;
  if (n.includes('district')) return AGENT_STYLES.district;
  return FALLBACK_AGENT_STYLES[agentIndex % FALLBACK_AGENT_STYLES.length] || AGENT_STYLES.default;
}

function getActionStyle(action) {
  return ACTION_STYLES[(action || '').toUpperCase()] || { cls: 'bg-slate-100 text-slate-700', label: action || 'SPEAK' };
}

function flattenProposal(proposal, prefix = '') {
  if (!proposal || typeof proposal !== 'object') return {};
  return Object.entries(proposal).reduce((paths, [key, value]) => {
    const path = prefix ? `${prefix}/${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return { ...paths, ...flattenProposal(value, path) };
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      paths[path] = value;
    }
    return paths;
  }, {});
}

function getProposalChanges(currentProposal, previousProposal) {
  const current = flattenProposal(currentProposal);
  const previous = flattenProposal(previousProposal);
  return Object.keys({ ...previous, ...current })
    .sort()
    .map((path) => ({
      path,
      from: previous[path] ?? 0,
      to: current[path] ?? 0,
      change: (current[path] ?? 0) - (previous[path] ?? 0),
    }))
    .filter((item) => item.change !== 0);
}

function getLatestAgentActions(history) {
  return (history || []).reduce((latest, entry) => {
    if (entry?.agent && entry?.action) latest[entry.agent] = entry.action.toUpperCase();
    return latest;
  }, {});
}

function displayValue(value) {
  return value === null || value === undefined || value === ''
    ? 'Not available'
    : String(value);
}

function displayBoolean(value) {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return 'Not available';
}

// ─────────────────────────────────────────────
// Renders a proposal as clean chips — handles both
// flat ({Food: 280}) and per-district nested
// ({ "Riverbend District": { Food: 280, ... } }) shapes
// ─────────────────────────────────────────────
function AllocationBreakdown({ proposal, style }) {
  if (!proposal || Object.keys(proposal).length === 0) return null;

  const isNested = Object.values(proposal).some(
    (v) => v && typeof v === 'object' && !Array.isArray(v)
  );

  if (!isNested) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(proposal).map(([resource, amount]) => (
          <span key={resource} className={`text-xs font-semibold rounded-full px-3 py-1 ${style.chip}`}>
            {resource}: {amount}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {Object.entries(proposal).map(([area, resources]) => (
        <div key={area} className="rounded-xl bg-white border border-slate-200 p-3">
          <p className="text-xs font-bold text-slate-700 mb-2">{area}</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(resources).map(([resource, amount]) => (
              <span key={resource} className={`text-[11px] font-semibold rounded-full px-2.5 py-1 ${style.chip}`}>
                {resource}: {amount}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Cuts the narrative message off right before the raw
// "X District Allocation: Food: N units..." text starts,
// since that part is now shown as structured chips instead.
function splitMessage(message) {
  if (!message) return { summary: '', full: '', hasMore: false };
  const cutMatch = message.match(/\b[A-Z][A-Za-z\s]+ Allocation:/);
  if (cutMatch && cutMatch.index > 20) {
    return {
      summary: message.slice(0, cutMatch.index).trim(),
      full: message,
      hasMore: true,
    };
  }
  return { summary: message, full: message, hasMore: false };
}

// ─────────────────────────────────────────────
// Single transcript entry card
// ─────────────────────────────────────────────
function TranscriptEntry({ item, previousProposal, agentIndex }) {
  const [expanded, setExpanded] = useState(false);
  const style = getAgentStyle(item.agent, agentIndex);
  const actionStyle = getActionStyle(item.action);
  const hasProposal = item.parsed_proposal && Object.keys(item.parsed_proposal).length > 0;
  const changes = item.action?.toUpperCase() === 'COUNTER'
    ? getProposalChanges(item.parsed_proposal, previousProposal)
    : [];

  const roundLabel = item.round_label || `Round ${item.round} — ${item.agent || 'Agent'} responds`;
  const rawMessage = item.speech || item.message || '';
  const { summary, full, hasMore } = splitMessage(rawMessage);

  return (
    <div className="relative pl-8">
      <div className={`absolute left-0 top-5 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm ${style.dot}`} />

      <div className="mb-2">
        <span className="inline-block text-[11px] font-bold uppercase tracking-widest text-slate-400 select-none">
          {roundLabel}
        </span>
      </div>

      <div className={`rounded-2xl border ${style.border} ${style.bg} overflow-hidden shadow-sm`}>
        <div className={`flex items-center gap-3 px-4 py-2.5 ${style.headerBg}`}>
          <span className={`text-xs font-extrabold tracking-wider ${style.headerText} uppercase`}>
            {item.agent || 'Agent'}
          </span>
          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${actionStyle.cls}`}>
            {actionStyle.label}
          </span>
          {item.stance && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/80">
              {item.stance}
            </span>
          )}
        </div>

        {/* Narrative message — trimmed of raw allocation text */}
        <div className="px-4 py-3">
          <p className={`text-sm leading-relaxed ${style.label} font-medium`}>
            {(expanded ? full : summary) || <em className="opacity-50">Waiting for response...</em>}
          </p>
          {hasMore && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-1 text-xs font-semibold text-slate-400 hover:text-slate-600 underline"
            >
              {expanded ? 'Show less' : 'Show full statement'}
            </button>
          )}
        </div>

        {/* Structured allocation — per-district cards or flat chips */}
        {hasProposal && (
          <div className="px-4 pb-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Proposed Allocation
            </p>
            <AllocationBreakdown proposal={item.parsed_proposal} style={style} />
          </div>
        )}

        {changes.length > 0 && (
          <div className="border-t border-slate-200/80 px-4 pb-3 pt-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              What Changed
            </p>
            <div className="grid gap-1 sm:grid-cols-2">
              {changes.map(({ path, from, to, change }) => (
                <div key={path} className={`rounded-lg px-2.5 py-1.5 text-xs ${change > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'}`}>
                  <span className="font-medium">{path}</span>
                  <span className="ml-2 font-semibold">{from} → {to} {change > 0 ? `↑ +${change}` : `↓ ${change}`}</span>
                </div>
              ))}
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
  const [currentProposal, setCurrentProposal] = useState(null);
  const [nextAgent, setNextAgent] = useState(null);
  const [finalReport, setFinalReport] = useState(null);
  const [status, setStatus] = useState('idle');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [geminiMetrics, setGeminiMetrics] = useState(INITIAL_GEMINI_METRICS);
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
    setCurrentProposal(state.current_proposal ?? data?.current_proposal ?? null);
    setNextAgent(state.next_agent ?? data?.next_agent ?? null);
    setFinalReport(state.final_report ?? data?.final_report ?? null);
    setStatus(state.status || data?.negotiation_status || 'ongoing');
    setMaxRounds(Number(state.max_rounds ?? data?.max_rounds ?? 5));
    if (data?.gemini_metrics) setGeminiMetrics(data.gemini_metrics);
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
    setGeminiMetrics(INITIAL_GEMINI_METRICS);
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
  const outcomeAnalysis = finalReport?.outcome_analysis;
  const latestActions = getLatestAgentActions(history);
  const configuredAgents = config?.agents || [];
  const participantNames = configuredAgents.map((agent) => agent.name).filter(Boolean);
  const acceptedNames = participantNames.filter((name) => latestActions[name] === 'ACCEPT');
  const proposalCount = history.filter((entry) => entry?.parsed_proposal && Object.keys(entry.parsed_proposal).length > 0).length;
  const counterCount = history.filter((entry) => entry?.action?.toUpperCase() === 'COUNTER').length;
  const groupedHistory = history.reduce((groups, entry, index) => {
    const key = entry?.round ?? 1;
    groups[key] = groups[key] || [];
    groups[key].push({ entry, index });
    return groups;
  }, {});
  const displayProposal = currentProposal || finalAllocation;
  const proposalSource = history
    .slice()
    .reverse()
    .find((entry) => entry?.parsed_proposal && Object.keys(entry.parsed_proposal).length > 0)
    ?.agent;

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
          <span className={`rounded-full px-4 py-2 text-sm font-semibold ${consensusReached ? 'bg-emerald-100 text-emerald-800' : negotiationEnded ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-700'}`}>
            {consensusReached ? '✓ Agreement reached' : negotiationEnded ? 'No consensus / deadlock' : 'Negotiation in progress'}
          </span>
          <span className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
            Agents accepted {acceptedNames.length} / {totalAgents || participantNames.length}
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
        {nextAgent && !negotiationEnded && (
          <p className="mt-3 text-sm font-medium text-slate-500">
            Current speaker: <span className="font-semibold text-slate-700">{nextAgent}</span>
          </p>
        )}
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
            Agents Agreed: <span className="font-semibold text-slate-700">{agreedAgents} / {totalAgents || participantNames.length}</span>
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
                Object.entries(groupedHistory).map(([roundNumber, entries]) => (
                  <section key={roundNumber} className="space-y-4">
                    <div className="flex items-center gap-3 pt-2">
                      <span className="text-xs font-extrabold uppercase tracking-widest text-slate-500">
                        Round {roundNumber}
                      </span>
                      <div className="h-px flex-1 bg-slate-200" />
                    </div>
                    {entries.map(({ entry: item, index }) => {
                      const previousProposal = history
                        .slice(0, index)
                        .reverse()
                        .find((candidate) => candidate?.parsed_proposal && Object.keys(candidate.parsed_proposal).length > 0)
                        ?.parsed_proposal;
                      const agentIndex = participantNames.indexOf(item.agent);
                      return (
                        <TranscriptEntry
                          key={`${index}-${item.agent || ''}-${item.round}`}
                          item={item}
                          previousProposal={previousProposal}
                          agentIndex={agentIndex < 0 ? 0 : agentIndex}
                        />
                      );
                    })}
                  </section>
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
          {/* Negotiation progress */}
          <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6">
            <h3 className="text-base font-semibold text-slate-800 mb-4">Negotiation Progress</h3>
            <div className="space-y-2 text-sm">
              {[
                ['Round', `${currentRound || 1} / ${maxRounds}`],
                ['Agents Accepted', `${acceptedNames.length} / ${totalAgents || participantNames.length}`],
                ['Proposals', proposalCount],
                ['Counters', counterCount],
                ['Agreement', consensusReached ? '✓ Reached' : negotiationEnded ? 'No consensus' : 'Pending'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 shadow-sm">
                  <span className="text-slate-500">{label}</span>
                  <span className="font-semibold text-slate-800">{value}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-white px-3 py-3 shadow-sm">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Agents accepted</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{acceptedNames.length} / {totalAgents || participantNames.length}</p>
              </div>
              <div className="flex gap-1.5" aria-label={`${acceptedNames.length} agents accepted`}>
                {participantNames.map((name, index) => (
                  <span key={name} className={`h-3 w-3 rounded-full ${latestActions[name] === 'ACCEPT' ? getAgentStyle(name, index).dot : 'bg-slate-200'}`} />
                ))}
              </div>
            </div>
          </div>

          {/* Agent status */}
          <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6">
            <h3 className="text-base font-semibold text-slate-800 mb-4">Agent Status</h3>
            <div className="space-y-2">
              {participantNames.map((name, index) => {
                const agentStyle = getAgentStyle(name, index);
                const accepted = latestActions[name] === 'ACCEPT';
                return (
                  <div key={name} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm shadow-sm">
                    <span className="flex min-w-0 items-center gap-2 text-slate-700">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${agentStyle.dot}`} />
                      <span className="truncate">{name}</span>
                    </span>
                    <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${accepted ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {accepted ? '✓ Accepted' : latestActions[name] ? 'Negotiating' : 'Pending'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Current proposal */}
          {displayProposal && Object.keys(displayProposal).length > 0 && (
            <div className="rounded-[1.75rem] border border-blue-200 bg-blue-50/60 p-6">
              <h3 className="text-base font-semibold uppercase tracking-wider text-blue-900">
                Current Proposal
              </h3>
              <p className="mt-1 text-xs text-blue-700">
                {consensusReached ? 'Final agreed allocation' : `Proposed by: ${proposalSource || 'Not available'}`}
              </p>
              <div className="mt-4">
                <AllocationBreakdown proposal={displayProposal} style={AGENT_STYLES.default} />
              </div>
            </div>
          )}

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
                ['LLM Provider', 'Configured'],
                ['Evaluation Engine', 'Active'],
              ].map(([name, value]) => (
                <div key={name} className="flex items-center justify-between rounded-2xl bg-white px-3 py-2 text-sm shadow-sm">
                  <span className="text-slate-600">{name}</span>
                  <span className="rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-0.5 text-xs font-semibold">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* LLM metrics */}
          <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6">
            <h3 className="text-base font-semibold text-slate-800 mb-4">LLM Metrics</h3>
            <div className="space-y-2">
              {[
                ['API Requests', geminiMetrics.total_requests],
                ['Input Tokens', geminiMetrics.total_input_tokens],
                ['Output Tokens', geminiMetrics.total_output_tokens],
                ['Total Tokens', geminiMetrics.total_tokens],
                ['Average Latency', `${Number(geminiMetrics.average_latency || 0).toFixed(2)}s`],
                ['Total API Latency', `${Number(geminiMetrics.total_latency || 0).toFixed(2)}s`],
              ].map(([name, value]) => (
                <div key={name} className="flex items-center justify-between rounded-2xl bg-white px-3 py-2 text-sm shadow-sm">
                  <span className="text-slate-600">{name}</span>
                  <span className="font-semibold text-slate-800">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Agent legend */}
          <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6">
            <h3 className="text-base font-semibold text-slate-800 mb-4">Agent Legend</h3>
            <div className="space-y-2">
              {participantNames.map((name, index) => {
                const style = getAgentStyle(name, index);
                return (
                  <div key={name} className="flex items-center gap-2 text-sm">
                    <span className={`w-3 h-3 rounded-full ${style.dot}`} />
                    <span className="text-slate-600">{name}</span>
                  </div>
                );
              })}
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

          {outcomeAnalysis && (
            <div className="mt-8 space-y-6">
              <section className="rounded-2xl border border-emerald-200 bg-white p-5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-800">
                  Outcome Summary
                </h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ['Status', outcomeAnalysis.status],
                    ['Outcome', outcomeAnalysis.outcome],
                    ['Rounds used', outcomeAnalysis.rounds],
                    ['Agreement round', outcomeAnalysis.agreement_terms?.agreement_round],
                    ['Unanimous agreement', displayBoolean(outcomeAnalysis.agreement_terms?.unanimous_agreement)],
                    ['Accepted participants', outcomeAnalysis.agreement_terms?.accepted_participants?.join(', ')],
                    ['Total participants', outcomeAnalysis.agreement_terms?.total_participants],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-slate-50 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {label}
                      </p>
                      <p className="mt-1 break-words text-sm font-semibold text-slate-800">
                        {displayValue(value)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-emerald-200 bg-white p-5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-800">
                  Agreement Terms
                </h3>
                <div className="mt-4 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
                  <div>
                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                      Final allocation
                    </p>
                    {outcomeAnalysis.agreement_terms?.final_allocation ? (
                      <AllocationBreakdown
                        proposal={outcomeAnalysis.agreement_terms.final_allocation}
                        style={AGENT_STYLES.default}
                      />
                    ) : (
                      <p className="text-sm text-slate-500">Not available</p>
                    )}
                  </div>
                  <div>
                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                      Per-resource totals
                    </p>
                    <div className="space-y-2">
                      {Object.entries(outcomeAnalysis.agreement_terms?.per_resource_totals || {}).length > 0 ? (
                        Object.entries(outcomeAnalysis.agreement_terms.per_resource_totals).map(([resource, quantity]) => (
                          <div key={resource} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                            <span className="text-slate-600">{resource}</span>
                            <span className="font-semibold text-slate-800">{quantity}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-500">Not available</p>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-emerald-200 bg-white p-5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-800">
                  Concession Patterns
                </h3>
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  {Object.entries(outcomeAnalysis.concession_patterns || {}).length > 0 ? (
                    Object.entries(outcomeAnalysis.concession_patterns).map(([agentName, pattern]) => (
                      <div key={agentName} className="rounded-xl bg-slate-50 p-4">
                        <p className="text-sm font-bold text-slate-800">{agentName}</p>
                        <div className="mt-3 space-y-2 text-xs">
                          <p className="font-semibold text-emerald-700">Increased</p>
                          {Object.entries(pattern?.increased || {}).length > 0 ? (
                            Object.entries(pattern.increased).map(([resource, quantity]) => (
                              <p key={`increase-${resource}`} className="text-slate-600">{resource}: +{quantity}</p>
                            ))
                          ) : <p className="text-slate-400">Not available</p>}
                          <p className="font-semibold text-rose-700">Decreased</p>
                          {Object.entries(pattern?.decreased || {}).length > 0 ? (
                            Object.entries(pattern.decreased).map(([resource, quantity]) => (
                              <p key={`decrease-${resource}`} className="text-slate-600">{resource}: -{quantity}</p>
                            ))
                          ) : <p className="text-slate-400">Not available</p>}
                          <p className="pt-2 text-slate-600">Concessions: <strong>{displayValue(pattern?.concession_count)}</strong></p>
                          <p className="text-slate-600">Quantity conceded: <strong>{displayValue(pattern?.total_quantity_conceded)}</strong></p>
                          <p className="text-slate-600">First concession: <strong>{displayBoolean(pattern?.made_first_concession)}</strong></p>
                          <p className="text-slate-600">Contributed to agreement: <strong>{displayBoolean(pattern?.contributed_to_final_agreement)}</strong></p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">Not available</p>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-emerald-200 bg-white p-5">
                <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-800">
                  Per-Agent Performance
                </h3>
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  {Object.entries(outcomeAnalysis.agent_performance || {}).length > 0 ? (
                    Object.entries(outcomeAnalysis.agent_performance).map(([agentName, performance]) => (
                      <div key={agentName} className="rounded-xl bg-slate-50 p-4">
                        <p className="text-sm font-bold text-slate-800">{agentName}</p>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          {[
                            ['Avg satisfaction', performance?.average_satisfaction],
                            ['Offers', performance?.offers],
                            ['Counters', performance?.counters],
                            ['Accepts', performance?.accepts],
                            ['Rejects', performance?.rejects],
                            ['Acceptance rate', performance?.acceptance_rate],
                            ['Concessions', performance?.concession_count],
                            ['Quantity conceded', performance?.total_quantity_conceded],
                            ['Proposal stability', performance?.proposal_stability],
                            ['Contribution', displayBoolean(performance?.contribution_to_agreement)],
                          ].map(([label, value]) => (
                            <div key={label} className="rounded-lg bg-white p-2">
                              <p className="text-slate-400">{label}</p>
                              <p className="mt-1 font-semibold text-slate-700">{displayValue(value)}</p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 border-t border-slate-200 pt-3 text-xs">
                          <p className="font-semibold text-slate-600">Initial proposal</p>
                          {performance?.initial_proposal ? (
                            <AllocationBreakdown proposal={performance.initial_proposal} style={AGENT_STYLES.default} />
                          ) : (
                            <p className="mt-1 text-slate-400">Not available</p>
                          )}
                          <p className="mt-3 font-semibold text-slate-600">Final allocation comparison</p>
                          {performance?.final_allocation_comparison ? (
                            <div className="mt-2 space-y-1 text-slate-600">
                              {Object.entries(performance.final_allocation_comparison.final_paths || {}).map(([path, quantity]) => (
                                <p key={`final-${path}`}>{path}: {quantity}</p>
                              ))}
                              {Object.entries(performance.final_allocation_comparison.changes_from_initial || {}).map(([path, change]) => (
                                <p key={`change-${path}`}>Change {path}: {change > 0 ? '+' : ''}{change}</p>
                              ))}
                              {Object.keys(performance.final_allocation_comparison.final_paths || {}).length === 0 && Object.keys(performance.final_allocation_comparison.changes_from_initial || {}).length === 0 && (
                                <p className="text-slate-400">Not available</p>
                              )}
                            </div>
                          ) : (
                            <p className="mt-1 text-slate-400">Not available</p>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">Not available</p>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NegotiationArena;
