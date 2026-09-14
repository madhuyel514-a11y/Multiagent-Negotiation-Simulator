import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, CheckCircle, ClipboardList, Shield, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

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
function AllocationBreakdown({ proposal, agentStyle }) {
  if (!proposal || Object.keys(proposal).length === 0) return null;
  const s = agentStyle || AGENT_STYLES.default;
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

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {Object.entries(proposal).map(([area, resources]) => (
        <div key={area} className="rounded-xl p-3"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-bold mb-2" style={{ color: s.color }}>{area}</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(resources).map(([resource, amount]) => (
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
  const ac = getActionColor(item.action);
  const hasProposal = item.parsed_proposal && Object.keys(item.parsed_proposal).length > 0;
  const changes = item.action?.toUpperCase() === 'COUNTER'
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

    const completedReport = state.final_report ?? data?.final_report;
    if (completedReport || state.negotiation_ended || data?.negotiation_ended) {
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

  const startSession = async () => {
    if (!scenario || !config) return null;
    localStorage.removeItem('negotiationOutcome');
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
            {consensusReached ? '✓ Agreement' : negotiationEnded ? 'No Consensus' : '⚡ Live'}
          </span>
          <span className="badge" style={{ background: 'var(--bg-surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
            {acceptedNames.length}/{totalAgents || participantNames.length} accepted
          </span>
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
          <div className="flex flex-wrap gap-2">
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
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">

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

        {/* ── Sidebar ── */}
        <div className="space-y-4">
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
              <AllocationBreakdown proposal={displayProposal} style={AGENT_STYLES.default} />
            </div>
          )}

          {/* Resources */}
          <div className="card p-4">
            <p className="section-title">Available Resources</p>
            <div className="space-y-1.5">
              {config?.resourceQuantities && Object.keys(config.resourceQuantities).length > 0 ? (
                Object.entries(config.resourceQuantities).map(([resource, quantity]) => (
                  <div key={resource} className="flex justify-between text-xs py-1" style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-2)' }}>
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
      {(consensusReached || negotiationEnded) && (
        <div className="rounded-2xl p-5" style={{ background: consensusReached ? 'rgba(16,185,129,0.08)' : 'var(--bg-surface)', border: `1px solid ${consensusReached ? 'rgba(16,185,129,0.25)' : 'var(--border)'}` }}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: consensusReached ? '#10b981' : 'var(--text-3)' }}>Outcome Ready</p>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-2)' }}>Review the complete agreement and negotiation timeline.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => navigate('/outcome')} className="btn-accent px-5 py-2 text-sm">View Outcome</button>
              {hasCompletedNegotiationData && (
                <>
                  <button type="button" onClick={downloadTranscript} className="btn-ghost px-4 py-2 text-xs">Download Transcript</button>
                  <button type="button" onClick={downloadSummaryReport} className="btn-ghost px-4 py-2 text-xs">Download Summary</button>
                </>
              )}
            </div>
          </div>
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
