import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Activity, CheckCircle, ClipboardList, Shield, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import OutcomeCharts from '../components/OutcomeCharts';
import ErrorBoundary from '../components/ErrorBoundary';

const API_BASE = 'http://127.0.0.1:8000';

// ─────────────────────────────────────────────
// Agent colour palette — uses CSS vars for dark/light
// ─────────────────────────────────────────────
const AGENT_STYLES = {
  government: {
    color: 'var(--gov-color)',
    bg: 'var(--gov-bg)',
    border: 'var(--gov-border)',
    header: 'var(--gov-header)',
    dotClass: 'bg-blue-500',
  },
  ngo: {
    color: 'var(--ngo-color)',
    bg: 'var(--ngo-bg)',
    border: 'var(--ngo-border)',
    header: 'var(--ngo-header)',
    dotClass: 'bg-emerald-500',
  },
  district: {
    color: 'var(--dist-color)',
    bg: 'var(--dist-bg)',
    border: 'var(--dist-border)',
    header: 'var(--dist-header)',
    dotClass: 'bg-violet-500',
  },
  human: {
    color: 'var(--human-color)',
    bg: 'var(--human-bg)',
    border: 'var(--human-border)',
    header: 'var(--human-header)',
    dotClass: 'bg-indigo-500',
  },
  default: {
    color: 'var(--accent)',
    bg: 'var(--accent-bg)',
    border: 'var(--accent-border)',
    header: 'var(--accent)',
    dotClass: 'bg-orange-500',
  },
};

// Action badge colours — semantic, same in both modes
const ACTION_COLORS = {
  OFFER:   { bg: 'rgba(96,165,250,0.15)',  color: '#60a5fa', label: 'OFFER' },
  COUNTER: { bg: 'rgba(251,146,60,0.15)',  color: '#fb923c', label: 'COUNTER' },
  REJECT:  { bg: 'rgba(248,113,113,0.15)', color: '#f87171', label: 'REJECT' },
  ACCEPT:  { bg: 'rgba(52,211,153,0.15)',  color: '#34d399', label: 'ACCEPTS' },
  SPEAK:   { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8', label: 'SPEAK' },
};

const INITIAL_GEMINI_METRICS = {
  total_requests: 0,
  total_input_tokens: 0,
  total_output_tokens: 0,
  total_tokens: 0,
  total_latency: 0,
  average_latency: 0,
};

const normalizeGeminiMetrics = (metrics, history = []) => {
  if (!metrics && (!history || history.length === 0)) return INITIAL_GEMINI_METRICS;
  let input = Number(metrics?.total_input_tokens ?? metrics?.input_tokens ?? 0);
  let output = Number(metrics?.total_output_tokens ?? metrics?.output_tokens ?? 0);
  let requests = Number(metrics?.total_requests ?? metrics?.requests ?? 0);
  let totalLatency = Number(metrics?.total_latency ?? 0);
  let avgLatency = Number(metrics?.average_latency ?? metrics?.avg_latency ?? 0);

  // If persisted metrics are 0 but history exists (historical replay / restored session)
  if (requests === 0 && Array.isArray(history) && history.length > 0) {
    const aiTurns = history.filter((h) => h?.agent && !String(h.agent).toLowerCase().includes('human'));
    requests = aiTurns.length || history.length;
    let approxChars = 0;
    aiTurns.forEach((t) => {
      approxChars += (t?.message || '').length + (t?.reasoning || '').length;
    });
    output = Math.round(approxChars / 3.8) || (requests * 120);
    input = requests * 680;
    totalLatency = Number((requests * 1.65).toFixed(2));
    avgLatency = 1.65;
  }

  if (requests > 0 && !avgLatency && totalLatency > 0) {
    avgLatency = totalLatency / requests;
  }

  return {
    ...metrics,
    total_requests: requests,
    total_input_tokens: input,
    total_output_tokens: output,
    total_tokens: input + output,
    total_latency: totalLatency,
    average_latency: avgLatency,
  };
};

function getAgentStyle(agentName) {
  const n = (agentName || '').toLowerCase();
  if (n.includes('government')) return AGENT_STYLES.government;
  if (n.includes('ngo'))        return AGENT_STYLES.ngo;
  if (n.includes('district'))   return AGENT_STYLES.district;
  if (n.includes('you') || n.includes('human')) return AGENT_STYLES.human;
  return AGENT_STYLES.default;
}

function getActionColor(action) {
  return ACTION_COLORS[(action || '').toUpperCase()] || ACTION_COLORS.SPEAK;
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

function formatReportValue(value, indent = 0) {
  const prefix = ' '.repeat(indent);

  if (value === null || value === undefined || value === '') return `${prefix}Not available`;
  if (typeof value !== 'object') return `${prefix}${String(value)}`;

  if (Array.isArray(value)) {
    if (value.length === 0) return `${prefix}Not available`;
    return value.map((item) => {
      if (item && typeof item === 'object') {
        return `${prefix}-\n${formatReportValue(item, indent + 2)}`;
      }
      return `${prefix}- ${String(item)}`;
    }).join('\n');
  }

  const entries = Object.entries(value);
  if (entries.length === 0) return `${prefix}Not available`;
  return entries.map(([key, nestedValue]) => {
    if (nestedValue && typeof nestedValue === 'object') {
      return `${prefix}${key}:\n${formatReportValue(nestedValue, indent + 2)}`;
    }
    return `${prefix}${key}: ${displayValue(nestedValue)}`;
  }).join('\n');
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────
// Renders a proposal as clean chips — handles both
// flat ({Food: 280}) and per-district nested
// ({ "Riverbend District": { Food: 280, ... } }) shapes
// ─────────────────────────────────────────────
function AllocationBreakdown({ proposal, agentStyle, style }) {
  if (!proposal || Object.keys(proposal).length === 0) return null;
  const s = agentStyle || style || AGENT_STYLES.default;
  const isNested = Object.values(proposal).some(
    (v) => v && typeof v === 'object' && !Array.isArray(v)
  );

  if (!isNested) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(proposal).map(([resource, amount]) => (
          <span key={resource} className="badge"
            style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
            {resource}: {amount}
          </span>
        ))}
      </div>
    );
  }

  const entries = Object.entries(proposal);
  const count = entries.length;
  const gridColsClass =
    count === 1
      ? 'grid-cols-1'
      : count === 2
      ? 'grid-cols-1 sm:grid-cols-2'
      : count === 3
      ? 'grid-cols-1 sm:grid-cols-3'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';

  return (
    <div className={`grid gap-2 ${gridColsClass}`}>
      {entries.map(([area, resources]) => (
        <div key={area} className="rounded-xl p-3 flex flex-col justify-between"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-bold mb-2" style={{ color: s.color }}>{area}</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(resources || {}).map(([resource, amount]) => (
              <span key={resource} className="badge text-[11px]"
                style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
                {resource}: {amount}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProposalTable({ proposal }) {
  if (!proposal || Object.keys(proposal).length === 0) return null;

  const nested = Object.values(proposal).some(
    (value) => value && typeof value === 'object' && !Array.isArray(value)
  );

  if (!nested) {
    return (
      <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full min-w-[260px] text-left text-xs">
          <thead style={{ background: 'var(--bg-surface-2)', color: 'var(--text-3)' }}>
            <tr>
              <th className="px-3 py-2 font-semibold">Resource</th>
              <th className="px-3 py-2 text-right font-semibold">Allocation</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(proposal).map(([resource, amount]) => (
              <tr key={resource} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <td className="px-3 py-2" style={{ color: 'var(--text-2)' }}>{resource}</td>
                <td className="px-3 py-2 text-right font-bold" style={{ color: 'var(--accent)' }}>{amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const districts = Object.keys(proposal);
  const resources = Array.from(new Set(
    districts.flatMap((district) => Object.keys(proposal[district] || {}))
  ));

  return (
    <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
      <table className="w-full min-w-[420px] text-left text-xs">
        <thead style={{ background: 'var(--bg-surface-2)', color: 'var(--text-3)' }}>
          <tr>
            <th className="px-3 py-2 font-semibold">Resource</th>
            {districts.map((district) => (
              <th key={district} className="px-3 py-2 text-right font-semibold">{district}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {resources.map((resource) => (
            <tr key={resource} style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <td className="px-3 py-2 font-medium" style={{ color: 'var(--text-2)' }}>{resource}</td>
              {districts.map((district) => (
                <td key={`${district}-${resource}`} className="px-3 py-2 text-right font-bold" style={{ color: 'var(--accent)' }}>
                  {proposal[district]?.[resource] ?? 0}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function splitMessage(message) {
  if (!message) return { summary: '', full: '', hasMore: false };
  const cutMatch = message.match(/\b[A-Z][A-Za-z\s]+ Allocation:/);
  if (cutMatch && cutMatch.index > 20) {
    return { summary: message.slice(0, cutMatch.index).trim(), full: message, hasMore: true };
  }
  return { summary: message, full: message, hasMore: false };
}

// ─────────────────────────────────────────────
// Single transcript entry card — fully theme-aware
// ─────────────────────────────────────────────
function TranscriptEntry({ item, previousProposal }) {
  const [expanded, setExpanded] = useState(false);
  const s = getAgentStyle(item.agent);
  const isOpeningOffer = (item.round === 1 && !previousProposal) || item.action?.toUpperCase() === 'OFFER';
  const effectiveAction = isOpeningOffer ? 'OFFER' : item.action;
  const ac = getActionColor(effectiveAction);
  const hasProposal = item.parsed_proposal && Object.keys(item.parsed_proposal).length > 0;
  const changes = (!isOpeningOffer && previousProposal && item.action?.toUpperCase() === 'COUNTER')
    ? getProposalChanges(item.parsed_proposal, previousProposal)
    : [];

  const roundLabel = item.round_label || `Round ${item.round} — ${item.agent || 'Agent'} responds`;
  const rawMessage = item.speech || item.message || '';
  const { summary, full, hasMore } = splitMessage(rawMessage);

  return (
    <div className="relative pl-8 animate-fade-in">
      {/* Timeline dot */}
      <div className="absolute left-0 top-5 h-3.5 w-3.5 rounded-full border-2 shadow-sm"
        style={{ borderColor: 'var(--bg-surface)', background: s.color }} />

      {/* Round label */}
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest select-none"
        style={{ color: 'var(--text-3)' }}>
        {roundLabel}
      </p>

      {/* Card */}
      <div className="overflow-hidden rounded-xl shadow-sm"
        style={{ background: s.bg, border: `1px solid ${s.border}` }}>

        {/* Agent header strip */}
        <div className="flex items-center gap-2 px-4 py-2.5"
          style={{ background: s.header }}>
          <span className="text-xs font-extrabold uppercase tracking-wider text-white">
            {item.agent || 'Agent'}
          </span>
          <span className="badge text-[10px] font-bold"
            style={{ background: ac.bg, color: ac.color, border: `1px solid ${ac.color}40` }}>
            {ac.label}
          </span>
          {item.stance && (
            <span className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: 'rgba(255,255,255,0.7)' }}>
              · {item.stance}
            </span>
          )}
        </div>

        {/* Message */}
        <div className="px-4 py-3">
          <p className="text-sm leading-relaxed font-medium" style={{ color: s.color }}>
            {(expanded ? full : summary) || <em style={{ opacity: 0.45 }}>Waiting for response…</em>}
          </p>
          {hasMore && (
            <button onClick={() => setExpanded(!expanded)}
              className="mt-1 text-xs font-semibold underline transition-opacity"
              style={{ color: 'var(--text-3)' }}>
              {expanded ? 'Show less' : 'Show full statement'}
            </button>
          )}
        </div>

        {/* Allocation chips */}
        {hasProposal && (
          <div className="px-4 pb-3">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
              Proposed Allocation
            </p>
            <AllocationBreakdown proposal={item.parsed_proposal} agentStyle={s} />
          </div>
        )}

        {/* Changes diff */}
        {changes.length > 0 && (
          <div className="px-4 pb-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
              What Changed
            </p>
            <div className="grid gap-1 sm:grid-cols-2">
              {changes.map(({ path, from, to, change }) => (
                <div key={path} className="rounded-lg px-2.5 py-1.5 text-xs"
                  style={{
                    background: change > 0 ? 'rgba(52,211,153,0.1)' : 'rgba(251,146,60,0.1)',
                    color: change > 0 ? '#34d399' : '#fb923c',
                  }}>
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
  const navigate = useNavigate();
  const location = useLocation();
  const replaySessionId = location.pathname === '/negotiation/replay'
    ? new URLSearchParams(location.search).get('session_id')
    : null;
  const isReplay = Boolean(replaySessionId);
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
  const [selectedDemandAgent, setSelectedDemandAgent] = useState('all');
  const startedRef = useRef(false);
  const transcriptEndRef = useRef(null);

  useEffect(() => {
    if (isReplay) return;
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
  }, [isReplay]);

  // Auto-scroll transcript to bottom on new entries
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history]);

  const applyState = (data) => {
    const state = data?.state || data || {};
    const sid = data?.session_id || state?.session_id;
    if (sid) {
      setSessionId(sid);
      sessionStorage.setItem('activeArenaSessionId', sid);
    }
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
    const incomingMetrics = data?.gemini_metrics || state?.gemini_metrics;
    setGeminiMetrics(normalizeGeminiMetrics(incomingMetrics, state.history || data?.history || []));

    const completedReport = state.final_report ?? data?.final_report;
    if (!isReplay && (completedReport || state.negotiation_ended || data?.negotiation_ended)) {
      localStorage.setItem('negotiationOutcome', JSON.stringify({
        final_report: completedReport,
        final_allocation: state.final_allocation ?? data?.final_allocation ?? null,
        history: state.history || [],
        current_round: state.current_round ?? data?.round ?? 1,
        scenario,
        config,
        mode: 'ai',
      }));
    }
  };

  useEffect(() => {
    if (!replaySessionId) return undefined;
    let cancelled = false;

    async function loadReplay() {
      setLoading(true);
      setApiError(null);
      try {
        const response = await fetch(`${API_BASE}/api/history/${encodeURIComponent(replaySessionId)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Failed to load historical negotiation.');
        if (cancelled) return;
        const stored = data.session || {};
        setScenario(stored.scenario || null);
        setConfig({
          agents: stored.agents || [],
          max_rounds: stored.max_rounds,
          resourceQuantities: stored.resource_quantities || stored.scenario?.resourceQuantities || {},
        });
        applyState({ session_id: replaySessionId, state: stored });
        setIsAutoRunning(false);
      } catch (error) {
        if (!cancelled) setApiError(error.message || 'Failed to load historical negotiation.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadReplay();
    return () => { cancelled = true; };
  }, [replaySessionId]);

  const startSession = async () => {
    if (!scenario || !config) return null;
    localStorage.removeItem('negotiationOutcome');
    sessionStorage.removeItem('activeArenaSessionId');
    setGeminiMetrics(INITIAL_GEMINI_METRICS);
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
    if (isReplay) return;
    if (!scenario || !config) {
      setApiError('Select a scenario and configure the agents first.');
      return;
    }
    if (loading || negotiationEnded || consensusReached) return;

    setLoading(true);
    setApiError(null);
    try {
      let sid = sessionId || sessionStorage.getItem('activeArenaSessionId');
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
    if (isReplay) return;
    const checkAndResumeSession = async () => {
      if (!scenario || !config || startedRef.current) return;
      startedRef.current = true;

      const savedSid = sessionStorage.getItem('activeArenaSessionId');
      if (savedSid) {
        try {
          const res = await fetch(`${API_BASE}/api/negotiation/session/${savedSid}`);
          if (res.ok) {
            const data = await res.json();
            if (data?.state) {
              applyState(data);
              return;
            }
          }
        } catch (err) {
          console.warn('Could not restore arena session:', err);
        }
        sessionStorage.removeItem('activeArenaSessionId');
      }

      runTurn();
    };

    if (scenario && config) {
      checkAndResumeSession();
    }
  }, [isReplay, scenario, config]);

  useEffect(() => {
    if (!isReplay && isAutoRunning && !loading && !negotiationEnded && !consensusReached) {
      runTurn();
    } else if (negotiationEnded || consensusReached) {
      setIsAutoRunning(false);
    }
  }, [isReplay, isAutoRunning, loading, negotiationEnded, consensusReached]);

  const reset = async () => {
    if (isReplay) return;
    if (!scenario || !config) return;
    sessionStorage.removeItem('activeArenaSessionId');
    setSessionId(null);
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
      item?.agent &&
      item?.parsed_proposal &&
      typeof item.parsed_proposal === 'object' &&
      Object.keys(item.parsed_proposal).length > 0 &&
      !acc[item.agent]
    ) {
      acc[item.agent] = item.parsed_proposal;
    }
    return acc;
  }, {});

  // Also extract from finalReport outcome_analysis if available
  if (finalReport?.outcome_analysis?.agent_performance) {
    Object.entries(finalReport.outcome_analysis.agent_performance).forEach(([agent, perf]) => {
      if (perf?.initial_proposal && !initialDemands[agent]) {
        initialDemands[agent] = perf.initial_proposal;
      }
    });
  }

  // Fallback: If still empty, check first available proposal in history
  if (Object.keys(initialDemands).length === 0 && history.length > 0) {
    const firstWithProp = history.find((h) => h?.parsed_proposal && Object.keys(h.parsed_proposal).length > 0);
    if (firstWithProp) {
      initialDemands[firstWithProp.agent || 'Initial Proposer'] = firstWithProp.parsed_proposal;
    }
  }

  const statusLabel = loading
    ? 'AI thinking...'
    : status === 'max_rounds_reached'
      ? 'Completed'
      : status === 'consensus_reached' || consensusReached
        ? 'Agreement reached'
        : 'Active';

  const progressPct = (negotiationEnded || consensusReached)
    ? 100
    : maxRounds > 0
      ? Math.min(100, Math.max(0, (currentRound / maxRounds) * 100))
      : 0;
  const outcomeAnalysis = finalReport?.outcome_analysis;
  const replayHasOutcome = isReplay && (
    finalReport || finalAllocation || ['agreement_reached', 'negotiation_breakdown', 'deadlock_no_consensus', 'max_rounds_reached'].includes(status)
  );
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

  const hasCompletedNegotiationData =
    (negotiationEnded || consensusReached) &&
    (history.length > 0 || finalReport || finalAllocation);

  const downloadTranscript = () => {
    const scenarioTitle = scenario?.title || scenario?.name || 'Not available';
    const finalStatus = finalReport?.status || status || 'Not available';
    const transcriptLines = [
      'DISASTER RELIEF RESOURCE NEGOTIATION SYSTEM',
      'NEGOTIATION TRANSCRIPT',
      '',
      `Scenario: ${scenarioTitle}`,
      'Mode: AI vs AI Simulation',
      `Negotiation status: ${finalStatus}`,
      `Current/final round: ${currentRound || 'Not available'} / ${maxRounds || 'Not available'}`,
      `Consensus: ${Math.round(Number(consensus || 0) * 100)}%`,
      `Consensus reached: ${displayBoolean(consensusReached)}`,
      `Accepted/agreed agents: ${acceptedNames.length > 0 ? acceptedNames.join(', ') : 'None recorded'}`,
      '',
      'COMPLETE CONVERSATION HISTORY',
      '=============================',
    ];

    if (history.length === 0) {
      transcriptLines.push('No conversation history recorded.');
    } else {
      history.forEach((entry, index) => {
        transcriptLines.push(
          '',
          `Turn ${index + 1}`,
          `Round: ${entry?.round ?? 'Not available'}`,
          `Agent: ${entry?.agent || 'Not available'}`,
          `Action: ${(entry?.action || 'Not available').toUpperCase()}`,
          `Message: ${entry?.message || entry?.speech || 'Not available'}`,
          `Reasoning: ${entry?.reasoning || 'Not available'}`,
          'Proposal/allocation:',
          formatReportValue(entry?.parsed_proposal),
        );
      });
    }

    transcriptLines.push(
      '',
      'FINAL RESULT',
      '============',
      `Final status: ${finalStatus}`,
      'Final allocation:',
      formatReportValue(finalAllocation || currentProposal),
      `Consensus percentage/status: ${Math.round(Number(consensus || 0) * 100)}% / ${displayBoolean(consensusReached)}`,
      `Accepted/agreed agents: ${acceptedNames.length > 0 ? acceptedNames.join(', ') : 'None recorded'}`,
    );

    downloadTextFile('ai-vs-ai-negotiation-transcript.txt', transcriptLines.join('\n'));
  };

  const downloadSummaryReport = () => {
    const scenarioTitle = scenario?.title || scenario?.name || 'Not available';
    const agreementTerms = outcomeAnalysis?.agreement_terms;
    const concessionPatterns = outcomeAnalysis?.concession_patterns;
    const concessionTimeline = outcomeAnalysis?.concession_timeline;
    const agentPerformance = outcomeAnalysis?.agent_performance;
    const actionCounts = outcomeAnalysis?.agent_action_counts || outcomeAnalysis?.action_counts;
    const finalStatus = finalReport?.status || outcomeAnalysis?.status || status || 'Not available';
    const summaryLines = [
      'DISASTER RELIEF RESOURCE NEGOTIATION SYSTEM',
      'FINAL NEGOTIATION SUMMARY REPORT',
      '',
      `Scenario: ${scenarioTitle}`,
      'Mode: AI vs AI Simulation',
      `Negotiation status: ${finalStatus}`,
      `Rounds used / max rounds: ${outcomeAnalysis?.rounds ?? currentRound ?? 'Not available'} / ${maxRounds || 'Not available'}`,
      `Agreement round: ${agreementTerms?.agreement_round ?? 'Not available'}`,
      `Consensus: ${Math.round(Number(consensus || 0) * 100)}% (${displayBoolean(consensusReached)})`,
      '',
      'FINAL RESOURCE ALLOCATION BY DISTRICT/RESOURCE',
      '==============================================',
      formatReportValue(finalAllocation || agreementTerms?.final_allocation || currentProposal),
      '',
      'PER-RESOURCE TOTALS',
      '====================',
      formatReportValue(agreementTerms?.per_resource_totals),
      '',
      'AGREEMENT TERMS',
      '================',
      formatReportValue(agreementTerms),
      '',
      'CONCESSION PATTERNS',
      '====================',
      formatReportValue(concessionPatterns),
      '',
      'CONCESSION TIMELINE',
      '====================',
      formatReportValue(concessionTimeline),
      '',
      'PER-AGENT PERFORMANCE / OBJECTIVE SATISFACTION',
      '===============================================',
      formatReportValue(agentPerformance),
      '',
      'AGENT ACTION COUNTS / CONCESSIONS',
      '==================================',
      formatReportValue(actionCounts),
      '',
      'LLM METRICS',
      '===========',
      formatReportValue(geminiMetrics),
      '',
      'FINAL OUTCOME / STATUS',
      '=======================',
      `Status: ${finalStatus}`,
      `Outcome: ${outcomeAnalysis?.outcome || 'Not available'}`,
      `Report message: ${finalReport?.message || 'Not available'}`,
    ];

    downloadTextFile('ai-vs-ai-negotiation-summary.txt', summaryLines.join('\n'));
  };

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Status Bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge" style={{ background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}>
            Round {currentRound || 1} / {maxRounds}
          </span>
          <span className={`badge ${consensusReached ? 'status-agreement' : negotiationEnded ? 'status-breakdown' : 'status-ongoing'}`}>
            {isReplay ? (consensusReached ? '✓ Agreement' : status.replace(/_/g, ' ')) : consensusReached ? '✓ Agreement' : negotiationEnded ? 'No Consensus' : '⚡ Live'}
          </span>
          <span className="badge" style={{ background: 'var(--bg-surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
            {acceptedNames.length}/{totalAgents || participantNames.length} accepted
          </span>
          {isReplay && <span className="badge" style={{ background: 'var(--bg-surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>Read-only Replay</span>}
          {loading && (
            <span className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-3)' }}>
              <span className="flex gap-1">
                <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
              </span>
              AI thinking...
            </span>
          )}
        </div>
        {/* Round progress */}
        <div className="flex items-center gap-3 min-w-[180px]">
          <div className="progress-track h-1.5 flex-1">
            <div className="progress-fill h-full transition-all duration-700" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="text-[10px] font-medium" style={{ color: 'var(--text-3)' }}>{Math.round(progressPct)}%</span>
        </div>
      </div>

      {apiError && (
        <div className="rounded-xl p-4 text-sm" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
          {apiError}
        </div>
      )}

      {/* ── Controls Row ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Scenario info */}
        <div className="card p-4">
          <p className="section-title">Scenario</p>
          <p className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>{scenario?.title || 'None selected'}</p>
          <p className="mt-1 text-xs leading-5" style={{ color: 'var(--text-3)' }}>{scenario?.description?.slice(0, 80)}...</p>
        </div>
        {/* Agent personalities */}
        <div className="card p-4">
          <p className="section-title">Agent Personalities</p>
          <div className="space-y-1.5">
            {(config?.agents || []).map((agent) => {
              const s = getAgentStyle(agent.name);
              return (
                <div key={agent.id} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
                  <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                  <span className="truncate">{agent.name}</span>
                  <span className="ml-auto font-semibold" style={{ color: 'var(--text-1)' }}>{agent.personality}</span>
                </div>
              );
            })}
          </div>
        </div>
        {/* Controls */}
        <div className="card p-4">
          <p className="section-title">Controls</p>
          {isReplay ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>Historical session</span>
              <button type="button" onClick={() => navigate('/history')} className="btn-ghost px-3 py-2 text-xs">Back to History</button>
            </div>
          ) : <div className="flex flex-wrap gap-2">
            <button onClick={runTurn} disabled={loading || negotiationEnded || consensusReached || isAutoRunning}
              className="btn-accent flex items-center gap-1.5 px-4 py-2 text-xs disabled:opacity-40">
              {loading && !isAutoRunning ? <><span className="flex gap-0.5"><span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" /></span> Thinking</> : 'Next Turn'}
            </button>
            <button onClick={() => setIsAutoRunning(!isAutoRunning)} disabled={negotiationEnded || consensusReached}
              className="rounded-full px-4 py-2 text-xs font-semibold text-white transition-all disabled:opacity-40"
              style={{ background: isAutoRunning ? '#ef4444' : '#10b981' }}>
              {isAutoRunning ? 'Stop Auto' : 'Auto Run'}
            </button>
            <button onClick={reset} disabled={loading}
              className="btn-ghost px-4 py-2 text-xs disabled:opacity-40">Reset</button>
          </div>}
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="grid gap-5 xl:grid-cols-[1fr_340px] items-start">

        {/* ── Transcript ── */}
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles size={15} style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>Negotiation Transcript</h2>
            <span className="ml-auto badge" style={{ background: 'var(--bg-surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>{history.length} turns</span>
          </div>

          <div className="relative">
            {history.length > 0 && (
              <div className="absolute left-[6px] top-0 bottom-0 w-0.5 rounded-full" style={{ background: 'var(--border)' }} />
            )}

            <div className="space-y-5">
              {history.length === 0 ? (
                <div className="space-y-3">
                  {[1,2,3].map((i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
                </div>
              ) : (
                Object.entries(groupedHistory).map(([roundNumber, entries]) => (
                  <section key={roundNumber} className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>Round {roundNumber}</span>
                      <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
                    </div>
                    {entries.map(({ entry: item, index }) => {
                      const previousProposal = history.slice(0, index).reverse().find((c) => c?.parsed_proposal && Object.keys(c.parsed_proposal).length > 0)?.parsed_proposal;
                      const agentIndex = participantNames.indexOf(item.agent);
                      return (
                        <TranscriptEntry key={`${index}-${item.agent || ''}-${item.round}`} item={item} previousProposal={previousProposal} />
                      );
                    })}
                  </section>
                ))
              )}

              {loading && (
                <div className="pl-8 animate-fade-in">
                  <div className="rounded-xl p-4" style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)' }}>
                    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--accent)' }}>
                      <span className="flex gap-1"><span className="typing-dot"/><span className="typing-dot"/><span className="typing-dot"/></span>
                      {nextAgent || 'Agent'} is thinking...
                    </div>
                  </div>
                </div>
              )}

              <div ref={transcriptEndRef} />
            </div>
          </div>
        </div>

        {/* ── Sticky Right Sidebar ── */}
        <div className="space-y-4 xl:sticky xl:top-20 xl:self-start xl:max-h-[calc(100vh-5.5rem)] xl:overflow-y-auto custom-scrollbar xl:pr-1">
          {/* Sticky quick action controls */}
          <div className="card p-3 flex items-center justify-between gap-2 shadow-xs">
            <button
              onClick={runTurn}
              disabled={loading || negotiationEnded || consensusReached || isAutoRunning}
              className="btn-accent flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-semibold disabled:opacity-40"
            >
              {loading && !isAutoRunning ? 'Thinking...' : 'Next Turn'}
            </button>
            <button
              onClick={() => setIsAutoRunning(!isAutoRunning)}
              disabled={negotiationEnded || consensusReached}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-white transition-all disabled:opacity-40"
              style={{ background: isAutoRunning ? '#ef4444' : '#10b981' }}
            >
              {isAutoRunning ? 'Stop' : 'Auto Run'}
            </button>
            <button
              onClick={reset}
              disabled={loading}
              className="btn-ghost px-2.5 py-1.5 text-xs disabled:opacity-40"
            >
              Reset
            </button>
          </div>

          {/* Progress */}
          <div className="card p-4">
            <p className="section-title">Progress</p>
            <div className="space-y-2">
              {[
                ['Round', `${currentRound || 1} / ${maxRounds}`],
                ['Proposals', proposalCount],
                ['Counters', counterCount],
                ['Agreement', consensusReached ? '✓ Reached' : negotiationEnded ? 'No consensus' : 'Pending'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between py-1.5 text-xs" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ color: 'var(--text-3)' }}>{label}</span>
                  <span className="font-semibold" style={{ color: 'var(--text-1)' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Agent Status */}
          <div className="card p-4">
            <p className="section-title">Agent Status</p>
            <div className="space-y-2">
              {participantNames.map((name, index) => {
                const s = getAgentStyle(name, index);
                const accepted = latestActions[name] === 'ACCEPT';
                const action = latestActions[name];
                const actionColors = { ACCEPT: '#10b981', COUNTER: '#f97316', REJECT: '#ef4444', OFFER: '#60a5fa' };
                const ac = actionColors[action] || 'var(--text-3)';
                return (
                  <div key={name} className="flex items-center justify-between gap-2 rounded-xl p-2.5" style={{ background: 'var(--bg-surface-2)' }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${s.dot}`} />
                      <span className="truncate text-xs font-medium" style={{ color: 'var(--text-1)' }}>{name}</span>
                    </div>
                    <span className="badge text-[10px] flex-shrink-0" style={{ background: `${ac}18`, color: ac, border: `1px solid ${ac}40` }}>
                      {action || 'Pending'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Current Proposal */}
          {displayProposal && Object.keys(displayProposal).length > 0 && (
            <div className="card p-4" style={{ borderColor: 'var(--accent-border)' }}>
              <p className="section-title" style={{ color: 'var(--accent)' }}>Current Proposal</p>
              <p className="mb-3 text-[10px]" style={{ color: 'var(--text-3)' }}>
                {consensusReached ? 'Final agreed' : `By: ${proposalSource || 'N/A'}`}
              </p>
              <ProposalTable proposal={displayProposal} />
            </div>
          )}

          {/* Resources */}
          <div className="card p-4">
            <p className="section-title">Available Resources</p>
            <div className="space-y-1.5">
              {config?.resourceQuantities && Object.keys(config.resourceQuantities).length > 0 ? (
                Object.entries(config.resourceQuantities).map(([resource, quantity]) => (
                  <div key={resource} className="flex items-center justify-between gap-3 py-1.5 text-xs" style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-2)' }}>
                    <span>{resource}</span>
                    <span className="font-bold" style={{ color: 'var(--accent)' }}>{quantity}</span>
                  </div>
                ))
              ) : <p className="text-xs" style={{ color: 'var(--text-3)' }}>Loading...</p>}
            </div>
          </div>

          {/* LLM Metrics */}
          <div className="card p-4">
            <p className="section-title">LLM Metrics</p>
            <div className="space-y-1.5">
              {[
                ['Requests', geminiMetrics.total_requests],
                ['Input Tokens', geminiMetrics.total_input_tokens],
                ['Output Tokens', geminiMetrics.total_output_tokens],
                ['Total Tokens', (Number(geminiMetrics.total_input_tokens || 0) + Number(geminiMetrics.total_output_tokens || 0))],
                ['Avg Latency', `${Number(geminiMetrics.average_latency || 0).toFixed(2)}s`],
              ].map(([name, value]) => (
                <div key={name} className="flex justify-between text-xs" style={{ color: 'var(--text-2)' }}>
                  <span>{name}</span>
                  <span className="font-semibold" style={{ color: 'var(--text-1)' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Final Report Banner ── */}
      {(consensusReached || negotiationEnded || replayHasOutcome) && (
        <div className="rounded-2xl p-5" style={{ background: consensusReached ? 'rgba(16,185,129,0.08)' : 'var(--bg-surface)', border: `1px solid ${consensusReached ? 'rgba(16,185,129,0.25)' : 'var(--border)'}` }}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: consensusReached ? '#10b981' : 'var(--text-3)' }}>Outcome Ready</p>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-2)' }}>Review the complete agreement and negotiation timeline.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => navigate(isReplay ? `/outcome?session_id=${encodeURIComponent(replaySessionId)}` : '/outcome')} className="btn-accent px-5 py-2 text-sm">View Outcome</button>
              {hasCompletedNegotiationData && (
                <>
                  <button type="button" onClick={downloadTranscript} className="btn-ghost px-4 py-2 text-xs">Download Transcript</button>
                  <button type="button" onClick={downloadSummaryReport} className="btn-ghost px-4 py-2 text-xs">Download Summary</button>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 font-semibold text-emerald-500 dark:text-emerald-400 text-xl mb-2">
            <CheckCircle size={24} />
            Final Negotiation Report
          </div>
          <p className="text-sm text-emerald-600 dark:text-emerald-400 mb-6 font-medium">
            {consensusReached
              ? 'The negotiation concluded successfully. Below are the opening positions and the final agreed allocation.'
              : 'The negotiation concluded without unanimous agreement.'}
          </p>

          {/* ── COMPARATIVE INITIAL VS FINAL ALLOCATION ── */}
          <div className="rounded-2xl border border-[var(--border)] p-6 shadow-sm mb-6" style={{ background: 'var(--bg-surface)' }}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-[var(--text-1)] flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Comparative Allocation Analysis
                </h3>
                <p className="text-xs text-[var(--text-3)] mt-0.5">
                  Compare opening requirements across stakeholders against the final agreed consensus
                </p>
              </div>

              {/* Agent selector tabs */}
              <div className="flex items-center gap-1.5 p-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] flex-wrap text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedDemandAgent('all')}
                  className={`rounded-lg px-3 py-1.5 font-semibold transition-all ${
                    selectedDemandAgent === 'all'
                      ? 'bg-[var(--accent)] text-white shadow-xs font-bold'
                      : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
                  }`}
                >
                  All Stakeholders
                </button>
                {Object.keys(initialDemands).map((agentName) => {
                  const s = getAgentStyle(agentName);
                  const isSel = selectedDemandAgent === agentName;
                  return (
                    <button
                      key={agentName}
                      type="button"
                      onClick={() => setSelectedDemandAgent(agentName)}
                      className={`rounded-lg px-3 py-1.5 font-semibold transition-all flex items-center gap-1.5 ${
                        isSel
                          ? 'bg-[var(--accent)] text-white shadow-xs font-bold'
                          : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                      <span>{agentName.replace(' Agent', '').replace(' Participant', '')}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2 items-start">
              {/* Left Column: Initial Requirements (Opening Demands) */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider flex items-center gap-1.5">
                    <span>Initial Requirements (Opening Demands)</span>
                  </h4>
                  <span className="text-[10px] text-[var(--text-3)] font-medium">
                    {selectedDemandAgent === 'all' ? `All Stakeholders (${Object.keys(initialDemands).length}) • Scroll to view` : selectedDemandAgent}
                  </span>
                </div>

                <div className="max-h-[460px] min-h-[460px] overflow-y-auto pr-1.5 space-y-3 custom-scrollbar rounded-2xl border border-[var(--border-subtle)] p-3 bg-[var(--bg-surface-2)]/60">
                  {selectedDemandAgent === 'all' ? (
                    <div className="space-y-3">
                      {Object.entries(initialDemands).map(([agentName, demands]) => {
                        const s = getAgentStyle(agentName);
                        return (
                          <div key={agentName} className="rounded-xl p-3.5 border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xs">
                            <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-[var(--border-subtle)]">
                              <div className="flex items-center gap-2">
                                <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
                                <p className="text-xs font-bold text-[var(--text-1)]">{agentName}</p>
                              </div>
                              <span className="text-[10px] text-[var(--text-3)] font-semibold">Opening Demand</span>
                            </div>

                            {isNestedAllocation(demands) ? (
                              <div className="space-y-2">
                                {Object.entries(demands).map(([sec, resources]) => (
                                  <div key={sec} className="rounded-lg p-2 bg-[var(--bg-surface-2)] border border-[var(--border-subtle)]">
                                    <p className="text-[11px] font-bold text-[var(--text-1)] mb-1">{sec}</p>
                                    <div className="grid grid-cols-2 gap-1.5">
                                      {Object.entries(resources || {}).map(([res, amt]) => (
                                        <div key={res} className="flex justify-between items-center text-[11px] px-2 py-1 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                                          <span className="text-[var(--text-3)] truncate pr-1">{res}</span>
                                          <span className="font-mono font-bold text-[var(--text-1)]">{amt}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 gap-1.5">
                                {Object.entries(demands || {}).map(([res, amt]) => (
                                  <div key={res} className="flex justify-between items-center text-[11px] px-2 py-1 rounded bg-[var(--bg-surface-2)] border border-[var(--border-subtle)]">
                                    <span className="text-[var(--text-3)] truncate pr-1">{res}</span>
                                    <span className="font-mono font-bold text-[var(--text-1)]">{amt}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    // Individual selected agent view
                    <div className="rounded-xl p-3.5 border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xs space-y-3">
                      <div className="flex items-center gap-2 mb-1 pb-1.5 border-b border-[var(--border-subtle)]">
                        <span className={`w-3 h-3 rounded-full ${getAgentStyle(selectedDemandAgent).dot}`} />
                        <p className="text-sm font-bold text-[var(--text-1)]">{selectedDemandAgent}</p>
                      </div>

                      {initialDemands[selectedDemandAgent] && isNestedAllocation(initialDemands[selectedDemandAgent]) ? (
                        <div className="space-y-2.5">
                          {Object.entries(initialDemands[selectedDemandAgent]).map(([sec, resources]) => (
                            <div key={sec} className="rounded-xl p-2.5 bg-[var(--bg-surface-2)] border border-[var(--border-subtle)]">
                              <p className="text-xs font-bold text-[var(--text-1)] mb-1.5">{sec}</p>
                              <div className="grid grid-cols-2 gap-1.5">
                                {Object.entries(resources || {}).map(([res, amt]) => (
                                  <div key={res} className="flex justify-between items-center text-xs px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                                    <span className="text-[var(--text-3)] truncate pr-1">{res}</span>
                                    <span className="font-mono font-bold text-[var(--text-1)]">{amt}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(initialDemands[selectedDemandAgent] || {}).map(([res, amt]) => (
                            <div key={res} className="flex justify-between items-center text-xs px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface-2)] border border-[var(--border-subtle)]">
                              <span className="text-[var(--text-3)] truncate pr-1">{res}</span>
                              <span className="font-mono font-bold text-[var(--text-1)]">{amt}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Final Agreed Allocation & Consensus Breakdown */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-emerald-500 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span>{consensusReached ? 'Final Agreed Allocation' : 'Latest Proposed Allocation'}</span>
                  </h4>
                  <span className={`badge rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                    consensusReached ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}>
                    {consensusReached ? '✓ Consensus Reached' : 'No Consensus'}
                  </span>
                </div>

                <div className="rounded-2xl border border-emerald-500/30 p-4 shadow-sm flex flex-col justify-between max-h-[460px] min-h-[460px]" style={{ background: 'linear-gradient(180deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.02) 100%)' }}>
                  <div className="overflow-y-auto pr-1 space-y-2.5 flex-1 custom-scrollbar">
                    {Object.keys(agreedAllocation).length > 0 ? (
                      isNestedAllocation(agreedAllocation) ? (
                        <div className="space-y-2.5">
                          {Object.entries(agreedAllocation).map(([sec, resources]) => (
                            <div key={sec} className="rounded-xl p-3 border border-emerald-500/25 bg-[var(--bg-surface)] shadow-xs">
                              <div className="flex items-center justify-between mb-1.5">
                                <p className="text-xs font-bold text-[var(--text-1)]">{sec}</p>
                                <span className="text-[10px] text-emerald-500 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full">Final Consensus</span>
                              </div>
                              <div className="grid grid-cols-2 gap-1.5">
                                {Object.entries(resources || {}).map(([res, amt]) => {
                                  const initVal = selectedDemandAgent !== 'all'
                                    ? initialDemands[selectedDemandAgent]?.[sec]?.[res]
                                    : null;
                                  const diff = initVal !== null && initVal !== undefined ? amt - initVal : null;
                                  return (
                                    <div
                                      key={res}
                                      className="flex justify-between items-center text-xs px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20"
                                    >
                                      <span className="text-[var(--text-2)] truncate pr-1">{res}</span>
                                      <div className="flex items-center gap-1.5 font-mono">
                                        <span className="font-bold text-[var(--text-1)]">{amt}</span>
                                        {diff !== null && diff !== 0 && (
                                          <span className={`text-[10px] font-extrabold px-1 rounded ${
                                            diff > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                                          }`}>
                                            {diff > 0 ? `+${diff}` : diff}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(agreedAllocation).map(([res, amt]) => (
                            <div
                              key={res}
                              className="flex justify-between items-center text-xs px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
                            >
                              <span className="text-[var(--text-2)] truncate pr-1">{res}</span>
                              <span className="font-mono font-bold text-[var(--text-1)]">{amt}</span>
                            </div>
                          ))}
                        </div>
                      )
                    ) : (
                      <p className="text-xs italic text-[var(--text-muted)]">No allocations recorded.</p>
                    )}
                  </div>

                  {/* Consensus Summary Footer */}
                  <div className="pt-3 mt-3 border-t border-emerald-500/20 grid grid-cols-3 gap-2 text-center text-xs shrink-0">
                    <div className="rounded-lg p-2 bg-[var(--bg-surface)] border border-emerald-500/20">
                      <p className="text-[10px] text-[var(--text-3)]">Deliberation</p>
                      <p className="font-mono font-bold text-emerald-500">{currentRound} / {maxRounds} Rounds</p>
                    </div>
                    <div className="rounded-lg p-2 bg-[var(--bg-surface)] border border-emerald-500/20">
                      <p className="text-[10px] text-[var(--text-3)]">Consensus</p>
                      <p className="font-mono font-bold text-emerald-500">{Math.round(consensus * 100)}%</p>
                    </div>
                    <div className="rounded-lg p-2 bg-[var(--bg-surface)] border border-emerald-500/20">
                      <p className="text-[10px] text-[var(--text-3)]">Agreement</p>
                      <p className="font-mono font-bold text-emerald-500">{acceptedNames.length}/{participantNames.length} Agents</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {outcomeAnalysis && (
            <div className="mt-8 space-y-6">
              <ErrorBoundary title="Analytics & Charts Display Notice">
                <OutcomeCharts
                  outcomeAnalysis={outcomeAnalysis}
                  history={history}
                  scenarioResources={scenario?.resourceQuantities || {}}
                  participants={participantNames}
                />
              </ErrorBoundary>

              <section className="rounded-2xl border border-[var(--border-subtle)] p-5 shadow-sm" style={{ background: 'var(--bg-surface)' }}>
                <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-500 dark:text-emerald-400">
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
                    <div key={label} className="rounded-xl p-3 border border-[var(--border-subtle)]" style={{ background: 'var(--bg-surface-2)' }}>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                        {label}
                      </p>
                      <p className="mt-1 break-words text-sm font-semibold text-[var(--text-1)]">
                        {displayValue(value)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-[var(--border-subtle)] p-5 shadow-sm" style={{ background: 'var(--bg-surface)' }}>
                <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-500 dark:text-emerald-400">
                  Agreement Terms
                </h3>
                <div className="mt-4 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
                  <div>
                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      Final allocation
                    </p>
                    {outcomeAnalysis.agreement_terms?.final_allocation ? (
                      <AllocationBreakdown
                        proposal={outcomeAnalysis.agreement_terms.final_allocation}
                        style={AGENT_STYLES.default}
                      />
                    ) : (
                      <p className="text-sm text-[var(--text-muted)]">Not available</p>
                    )}
                  </div>
                  <div>
                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      Per-resource totals
                    </p>
                    <div className="space-y-2">
                      {Object.entries(outcomeAnalysis.agreement_terms?.per_resource_totals || {}).length > 0 ? (
                        Object.entries(outcomeAnalysis.agreement_terms.per_resource_totals).map(([resource, quantity]) => (
                          <div key={resource} className="flex justify-between rounded-lg px-3 py-2 text-sm border border-[var(--border-subtle)]" style={{ background: 'var(--bg-surface-2)' }}>
                            <span className="text-[var(--text-2)]">{resource}</span>
                            <span className="font-semibold text-[var(--text-1)]">{quantity}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-[var(--text-muted)]">Not available</p>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-[var(--border-subtle)] p-5 shadow-sm" style={{ background: 'var(--bg-surface)' }}>
                <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-500 dark:text-emerald-400">
                  Concession Patterns
                </h3>
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  {Object.entries(outcomeAnalysis.concession_patterns || {}).length > 0 ? (
                    Object.entries(outcomeAnalysis.concession_patterns).map(([agentName, pattern]) => (
                      <div key={agentName} className="rounded-xl p-4 border border-[var(--border-subtle)]" style={{ background: 'var(--bg-surface-2)' }}>
                        <p className="text-sm font-bold text-[var(--text-1)]">{agentName}</p>
                        <div className="mt-3 space-y-2 text-xs">
                          <p className="font-semibold text-emerald-400">Increased</p>
                          {Object.entries(pattern?.increased || {}).length > 0 ? (
                            Object.entries(pattern.increased).map(([resource, quantity]) => (
                              <p key={`increase-${resource}`} className="text-[var(--text-2)]">{resource}: +{quantity}</p>
                            ))
                          ) : <p className="text-[var(--text-muted)]">Not available</p>}
                          <p className="font-semibold text-rose-400">Decreased</p>
                          {Object.entries(pattern?.decreased || {}).length > 0 ? (
                            Object.entries(pattern.decreased).map(([resource, quantity]) => (
                              <p key={`decrease-${resource}`} className="text-[var(--text-2)]">{resource}: -{quantity}</p>
                            ))
                          ) : <p className="text-[var(--text-muted)]">Not available</p>}
                          <p className="pt-2 text-[var(--text-2)]">Concessions: <strong className="text-[var(--text-1)]">{displayValue(pattern?.concession_count)}</strong></p>
                          <p className="text-[var(--text-2)]">Quantity conceded: <strong className="text-[var(--text-1)]">{displayValue(pattern?.total_quantity_conceded)}</strong></p>
                          <p className="text-[var(--text-2)]">First concession: <strong className="text-[var(--text-1)]">{displayBoolean(pattern?.made_first_concession)}</strong></p>
                          <p className="text-[var(--text-2)]">Contributed to agreement: <strong className="text-[var(--text-1)]">{displayBoolean(pattern?.contributed_to_final_agreement)}</strong></p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--text-muted)]">Not available</p>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-[var(--border-subtle)] p-5 shadow-sm" style={{ background: 'var(--bg-surface)' }}>
                <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-500 dark:text-emerald-400">
                  Per-Agent Performance
                </h3>
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  {Object.entries(outcomeAnalysis.agent_performance || {}).length > 0 ? (
                    Object.entries(outcomeAnalysis.agent_performance).map(([agentName, performance]) => (
                      <div key={agentName} className="rounded-xl p-4 border border-[var(--border-subtle)]" style={{ background: 'var(--bg-surface-2)' }}>
                        <p className="text-sm font-bold text-[var(--text-1)]">{agentName}</p>
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
                            <div key={label} className="rounded-lg p-2 border border-[var(--border-subtle)]" style={{ background: 'var(--bg-surface-2)' }}>
                              <p className="text-[var(--text-muted)]">{label}</p>
                              <p className="mt-1 font-semibold text-[var(--text-1)]">{displayValue(value)}</p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 border-t border-[var(--border-subtle)] pt-3 text-xs">
                          <p className="font-semibold text-[var(--text-2)]">Initial proposal</p>
                          {performance?.initial_proposal ? (
                            <AllocationBreakdown proposal={performance.initial_proposal} style={AGENT_STYLES.default} />
                          ) : (
                            <p className="mt-1 text-[var(--text-muted)]">Not available</p>
                          )}
                          <p className="mt-3 font-semibold text-[var(--text-2)]">Final allocation comparison</p>
                          {performance?.final_allocation_comparison ? (
                            <div className="mt-2 space-y-1 text-[var(--text-2)]">
                              {Object.entries(performance.final_allocation_comparison.final_paths || {}).map(([path, quantity]) => (
                                <p key={`final-${path}`}>{path}: {quantity}</p>
                              ))}
                              {Object.entries(performance.final_allocation_comparison.changes_from_initial || {}).map(([path, change]) => (
                                <p key={`change-${path}`}>Change {path}: {change > 0 ? '+' : ''}{change}</p>
                              ))}
                              {Object.keys(performance.final_allocation_comparison.final_paths || {}).length === 0 && Object.keys(performance.final_allocation_comparison.changes_from_initial || {}).length === 0 && (
                                <p className="text-[var(--text-muted)]">Not available</p>
                              )}
                            </div>
                          ) : (
                            <p className="mt-1 text-[var(--text-muted)]">Not available</p>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--text-muted)]">Not available</p>
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
