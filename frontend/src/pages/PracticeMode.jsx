import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Send,
  Check,
  X,
  ArrowLeftRight,
  RotateCcw,
  Sparkles,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Users,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

import { scenarios } from '../data/scenarios';

const API_URL = 'http://127.0.0.1:8000';

const INITIAL_LLM_METRICS = {
  total_requests: 0,
  total_input_tokens: 0,
  total_output_tokens: 0,
  total_tokens: 0,
  average_latency: 0,
  total_latency: 0,
};

const PRACTICE_AGENT_STYLES = {
  government: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    badge: 'bg-blue-700 text-white',
    dot: 'bg-blue-600',
    label: 'text-blue-900',
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
    label: 'text-emerald-900',
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
    label: 'text-purple-900',
    chip: 'bg-purple-100 text-purple-800',
    headerBg: 'bg-purple-600',
    headerText: 'text-white',
    tagBg: 'bg-purple-100 text-purple-700',
  },
  human: {
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    badge: 'bg-indigo-700 text-white',
    dot: 'bg-indigo-600',
    label: 'text-indigo-950',
    chip: 'bg-indigo-100 text-indigo-800',
    headerBg: 'bg-indigo-700',
    headerText: 'text-white',
    tagBg: 'bg-indigo-100 text-indigo-700',
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

const PRACTICE_ACTION_STYLES = {
  OFFER: { cls: 'bg-sky-100 text-sky-800', label: 'OFFER' },
  COUNTER: { cls: 'bg-amber-100 text-amber-800', label: 'COUNTER' },
  REJECT: { cls: 'bg-rose-100 text-rose-800', label: 'REJECT' },
  ACCEPT: { cls: 'bg-emerald-100 text-emerald-800', label: 'ACCEPTS' },
};

function getPracticeAgentStyle(agentName) {
  const value = String(agentName || '').toLowerCase();
  if (value.includes('government')) return PRACTICE_AGENT_STYLES.government;
  if (value.includes('ngo')) return PRACTICE_AGENT_STYLES.ngo;
  if (value.includes('district')) return PRACTICE_AGENT_STYLES.district;
  if (value.includes('you') || value.includes('human')) return PRACTICE_AGENT_STYLES.human;
  return PRACTICE_AGENT_STYLES.default;
}

function getPracticeActionStyle(action) {
  return PRACTICE_ACTION_STYLES[String(action || '').toUpperCase()] || { cls: 'bg-slate-100 text-slate-700', label: action || 'SPEAK' };
}

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

function flattenProposal(proposal, prefix = '') {
  if (!proposal || typeof proposal !== 'object') return {};
  return Object.entries(proposal).reduce((result, [key, value]) => {
    const path = prefix ? `${prefix}/${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return { ...result, ...flattenProposal(value, path) };
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      result[path] = value;
    }
    return result;
  }, {});
}

function getProposalChanges(current, previous) {
  const currentPaths = flattenProposal(current);
  const previousPaths = flattenProposal(previous);
  return Object.keys({ ...previousPaths, ...currentPaths })
    .sort()
    .map((path) => ({
      path,
      from: previousPaths[path] ?? 0,
      to: currentPaths[path] ?? 0,
      change: (currentPaths[path] ?? 0) - (previousPaths[path] ?? 0),
    }))
    .filter((item) => item.change !== 0);
}

function isNestedAllocation(allocation) {
  return (
    allocation &&
    typeof allocation === 'object' &&
    Object.values(allocation).some((v) => v && typeof v === 'object' && !Array.isArray(v))
  );
}

function computeAllocationDifference(initialProposal, finalProposal) {
  if (!initialProposal || !finalProposal) return [];
  const changes = [];
  const isNested = isNestedAllocation(initialProposal) || isNestedAllocation(finalProposal);

  if (isNested) {
    const sectors = Array.from(
      new Set([...Object.keys(initialProposal || {}), ...Object.keys(finalProposal || {})])
    );
    for (const sector of sectors) {
      const initSec = (initialProposal && initialProposal[sector]) || {};
      const finalSec = (finalProposal && finalProposal[sector]) || {};
      const resources = Array.from(
        new Set([...Object.keys(initSec), ...Object.keys(finalSec)])
      );
      for (const res of resources) {
        const initVal = Number(initSec[res] ?? 0);
        const finalVal = Number(finalSec[res] ?? 0);
        const diff = finalVal - initVal;
        const pct = initVal > 0
          ? ((diff / initVal) * 100).toFixed(1)
          : (finalVal > 0 ? '+100.0' : '0.0');
        changes.push({
          sector,
          resource: res,
          initial: initVal,
          final: finalVal,
          diff,
          pct: diff > 0 ? `+${pct}%` : `${pct}%`,
        });
      }
    }
  } else {
    const resources = Array.from(
      new Set([...Object.keys(initialProposal || {}), ...Object.keys(finalProposal || {})])
    );
    for (const res of resources) {
      const initVal = Number(initialProposal[res] ?? 0);
      const finalVal = Number(finalProposal[res] ?? 0);
      const diff = finalVal - initVal;
      const pct = initVal > 0
        ? ((diff / initVal) * 100).toFixed(1)
        : (finalVal > 0 ? '+100.0' : '0.0');
      changes.push({
        sector: 'Overall Allocation',
        resource: res,
        initial: initVal,
        final: finalVal,
        diff,
        pct: diff > 0 ? `+${pct}%` : `${pct}%`,
      });
    }
  }
  return changes;
}

function displayValue(value) {
  return value === null || value === undefined || value === ''
    ? 'Not available'
    : String(value);
}

function displayBoolean(value) {
  if (value === null || value === undefined) return 'Not available';
  return value ? 'Yes' : 'No';
}

function PracticeAllocationBreakdown({ proposal, style }) {
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
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {Object.entries(proposal).map(([area, resources]) => (
        <div key={area} className="rounded-xl bg-white border border-slate-200 p-3 shadow-2xs">
          <p className="text-xs font-bold text-slate-800 mb-2 border-b border-slate-100 pb-1">{area}</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(resources || {}).map(([resource, amount]) => (
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

function PracticeTranscriptEntry({ msg, index, previousProposal }) {
  const [expanded, setExpanded] = useState(false);
  const isHuman = msg.sender === 'You' || msg.sender === 'Human Participant';
  const isSystem = msg.sender === 'System';
  const style = getPracticeAgentStyle(msg.sender);
  const actionStyle = getPracticeActionStyle(msg.action);
  const hasProposal = msg.proposal && Object.keys(msg.proposal).length > 0;
  const changes = msg.action?.toUpperCase() === 'COUNTER'
    ? getProposalChanges(msg.proposal, previousProposal)
    : [];

  const roundLabel = isHuman
    ? `Round ${msg.round || 1} — You (Human Participant) submitted`
    : `Round ${msg.round || 1} — ${msg.sender || 'Agent'} responds`;

  const { summary, full, hasMore } = splitMessage(msg.text || '');

  if (isSystem) {
    return (
      <div className="relative pl-8">
        <div className="absolute left-0 top-3 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm bg-red-500" />
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
          {msg.text}
        </div>
      </div>
    );
  }

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
            {isHuman ? 'You (Human Participant)' : (msg.sender || 'Agent')}
          </span>
          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${actionStyle.cls}`}>
            {actionStyle.label}
          </span>
          {msg.stance && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/80">
              {msg.stance}
            </span>
          )}
        </div>

        {/* Narrative text */}
        <div className="px-4 py-3">
          <p className={`text-sm leading-relaxed ${style.label} font-medium`}>
            {(expanded ? full : summary) || <em className="opacity-50">Waiting for response...</em>}
          </p>
          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-1 text-xs font-semibold text-slate-400 hover:text-slate-600 underline"
            >
              {expanded ? 'Show less' : 'Show full statement'}
            </button>
          )}
        </div>

        {/* Structured Allocation Breakdown */}
        {hasProposal && (
          <div className="px-4 pb-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              {isHuman ? 'Your Allocation Proposal' : `${msg.sender}'s Allocation`}
            </p>
            <PracticeAllocationBreakdown proposal={msg.proposal} style={style} />
          </div>
        )}

        {/* Deltas: What Changed */}
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

function PracticeMode() {
  const navigate = useNavigate();

  useEffect(() => {
    const storedMode = localStorage.getItem('selectedMode');
    const storedScenario = localStorage.getItem('selectedScenario');
    const storedConfig = localStorage.getItem('negotiationConfig');

    if (storedMode !== 'practice' || !storedScenario || !storedConfig) {
      localStorage.setItem('selectedMode', 'practice');
      navigate('/scenarios');
      return;
    }
  }, [navigate]);

  // --------------------------------------------------
  // GET INITIAL SCENARIO
  // --------------------------------------------------

  const getSavedNegotiationConfig = () => {
    try {
      const savedConfig = localStorage.getItem('negotiationConfig');
      if (!savedConfig) return null;

      const parsedConfig = JSON.parse(savedConfig);
      if (!parsedConfig || typeof parsedConfig !== 'object') {
        return null;
      }

      return parsedConfig;
    } catch (error) {
      console.error(
        'Error loading negotiation config:',
        error
      );
      return null;
    }
  };

  const getConfiguredMaxRounds = (config) => {
    const rawMaxRounds = config && config.max_rounds;

    if (rawMaxRounds !== undefined && rawMaxRounds !== null && rawMaxRounds !== '') {
      const parsed = Number(rawMaxRounds);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return 5;
  };

  const getInitialScenario = () => {
    try {
      const savedConfig = getSavedNegotiationConfig();
      if (savedConfig?.scenario) {
        const scenario = savedConfig.scenario;
        if (scenario && typeof scenario === 'object') {
          return scenario;
        }
      }

      const savedScenario =
        localStorage.getItem('selectedScenario');

      if (savedScenario) {
        const parsedScenario =
          JSON.parse(savedScenario);

        const matchingScenario = scenarios.find(
          (scenario) =>
            String(scenario.id) ===
            String(parsedScenario.id)
        );

        if (matchingScenario) {
          return matchingScenario;
        }

        if (parsedScenario && typeof parsedScenario === 'object') {
          return parsedScenario;
        }
      }
    } catch (error) {
      console.error(
        'Error loading selected scenario:',
        error
      );
    }

    return null;
  };

  const initialScenario = getInitialScenario();

  const getStoredConfig = () => {
    const savedConfig = getSavedNegotiationConfig();
    const scenario = initialScenario || getInitialScenario();
    const configuredMaxRounds = getConfiguredMaxRounds(savedConfig);

    if (savedConfig?.scenario && typeof savedConfig.scenario === 'object') {
      return {
        scenario: savedConfig.scenario,
        agents: Array.isArray(savedConfig.agents)
          ? savedConfig.agents
          : savedConfig.scenario.agents || [],
        max_rounds: configuredMaxRounds,
        resourceQuantities:
          savedConfig.resourceQuantities || savedConfig.scenario.resourceQuantities || {},
      };
    }

    if (scenario) {
      return {
        scenario,
        agents: Array.isArray(scenario.agents) ? scenario.agents : [],
        max_rounds: configuredMaxRounds,
        resourceQuantities: scenario.resourceQuantities || {},
      };
    }

    return null;
  };

  // --------------------------------------------------
  // RESOURCE HELPER
  // --------------------------------------------------

  const getResources = (scenario) => {
    if (!scenario || typeof scenario !== 'object') {
      return [];
    }

    if (Array.isArray(scenario.resources)) {
      return scenario.resources.slice(0, 5);
    }

    if (scenario.resourceQuantities && typeof scenario.resourceQuantities === 'object') {
      return Object.keys(scenario.resourceQuantities).slice(0, 5);
    }

    return [];
  };

  const buildDefaultProposal = (scenario) => {
    if (!scenario || typeof scenario !== 'object') return {};
    const recipients = scenario.recipients || [];
    const resources = getResources(scenario);
    const proposal = {};
    for (const item of recipients) {
      const rName = typeof item === 'object' ? (item.name || item.id || 'Region') : String(item);
      proposal[rName] = {};
      for (const res of resources) {
        proposal[rName][res] = 0;
      }
    }
    return proposal;
  };

  // --------------------------------------------------
  // STATE
  // --------------------------------------------------

  const [selectedScenario, setSelectedScenario] =
    useState(initialScenario);

  const [savedConfig, setSavedConfig] = useState(
    getStoredConfig()
  );

  const totalRounds = getConfiguredMaxRounds(savedConfig);

  const [resource, setResource] = useState(
    getResources(initialScenario)[0] || ''
  );

  const [amount, setAmount] = useState('');

  const [action, setAction] = useState('Offer');

  const [message, setMessage] = useState('');

  const [currentProposal, setCurrentProposal] = useState(() => buildDefaultProposal(initialScenario));

  const [messages, setMessages] = useState([]);
  const [finalAllocation, setFinalAllocation] = useState(null);
  const [finalReport, setFinalReport] = useState(null);
  const [selectedDiffSource, setSelectedDiffSource] = useState('opening');
  const [showAdvancedOutcome, setShowAdvancedOutcome] = useState(false);

  const [round, setRound] = useState(1);

  const [status, setStatus] = useState('Your turn');

  const [sessionStatus, setSessionStatus] =
    useState('Active');

  const [consensus, setConsensus] = useState(0.0);
  const [awaitingFinalDecision, setAwaitingFinalDecision] = useState(false);

  const [sessionId, setSessionId] =
    useState(null);

  const [loading, setLoading] = useState(false);
  const [deliberatingAgent, setDeliberatingAgent] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionReasoning, setSuggestionReasoning] = useState(null);

  const [llmMetrics, setLlmMetrics] = useState(
    INITIAL_LLM_METRICS
  );

  const autoStartRef = useRef(false);

  // --------------------------------------------------
  // START SESSION
  // --------------------------------------------------

  const startSession = async (scenario) => {
    try {
      const configuredScenario =
        (savedConfig && savedConfig.scenario) || scenario || selectedScenario;

      if (!configuredScenario || typeof configuredScenario !== 'object') {
        setStatus('No scenario configured');
        setSessionStatus('Inactive');
        setMessages([
          {
            sender: 'System',
            text: 'No valid scenario is configured. Please select a scenario in the configuration step before starting practice mode.',
          },
        ]);
        return;
      }

      setLoading(true);
      setStatus('Starting practice session...');
      setSessionStatus('Active');
      setAwaitingFinalDecision(false);

      const configuredAgents =
        (savedConfig && Array.isArray(savedConfig.agents) && savedConfig.agents.length > 0)
          ? savedConfig.agents
          : configuredScenario?.agents || [];

      const configuredResourceQuantities =
        (savedConfig && savedConfig.resourceQuantities) ||
        configuredScenario?.resourceQuantities || {};

      const configuredMaxRounds = getConfiguredMaxRounds(savedConfig);

      const response = await fetch(
        `${API_URL}/api/practice/start`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            scenario: configuredScenario,
            agents: configuredAgents,
            config: {
              max_rounds: configuredMaxRounds,
              resourceQuantities: configuredResourceQuantities,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText =
          await response.text();

        throw new Error(
          `Start session failed: ${response.status} ${errorText}`
        );
      }

      const data = await response.json();

      if (!data.session_id) {
        throw new Error(
          'Backend did not return session_id.'
        );
      }

      setSessionId(data.session_id);
      const startProp = (data?.state?.current_proposal && Object.keys(data.state.current_proposal).length > 0)
        ? data.state.current_proposal
        : buildDefaultProposal(configuredScenario);
      setCurrentProposal(startProp);
      setLlmMetrics(
        data?.state?.gemini_metrics || INITIAL_LLM_METRICS
      );

      setRound(1);
      setStatus('Your turn');
      setSessionStatus('Active');
      setAwaitingFinalDecision(false);
      setAction('Offer');
      setFinalAllocation(null);
      setFinalReport(null);

      setMessages([]);
    } catch (error) {
      console.error(
        'Start session error:',
        error
      );

      setSessionId(null);

      setStatus('Backend unavailable');

      setSessionStatus('Inactive');

      setMessages([
        {
          sender: 'System',
          text:
            `Could not start negotiation: ${error.message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------
  // AUTOMATIC SESSION START
  // --------------------------------------------------

  useEffect(() => {
    if (autoStartRef.current) {
      return;
    }

    autoStartRef.current = true;

    if (!initialScenario) {
      setStatus('No scenario configured');
      setSessionStatus('Inactive');
      setMessages([
        {
          sender: 'System',
          text: 'No valid negotiation scenario is configured. Please complete the scenario setup first.',
        },
      ]);
      return;
    }

    startSession(initialScenario);
  }, []);

  // --------------------------------------------------
  // SCENARIO CHANGE
  // --------------------------------------------------

  const handleScenarioChange = async (event) => {
    const scenario = scenarios.find(
      (item) =>
        String(item.id) ===
        String(event.target.value)
    );

    if (!scenario) {
      return;
    }

    const nextMaxRounds = getConfiguredMaxRounds(savedConfig);

    setSelectedScenario(scenario);
    setSavedConfig({
      scenario,
      agents: scenario.agents || [],
      max_rounds: nextMaxRounds,
      resourceQuantities: scenario.resourceQuantities || {},
    });

    localStorage.setItem(
      'selectedScenario',
      JSON.stringify(scenario)
    );
    localStorage.setItem(
      'negotiationConfig',
      JSON.stringify({
        scenario,
        agents: scenario.agents || [],
        max_rounds: nextMaxRounds,
        resourceQuantities: scenario.resourceQuantities || {},
      })
    );

    const resources = getResources(scenario);

    setResource(resources[0] || '');

    setAmount('');

    setMessage('');
    setCurrentProposal({});

    setAction('Offer');

    setRound(1);

    setSessionId(null);

    setSessionStatus('Active');

    setStatus('Starting practice...');

    setMessages([]);

    await startSession(scenario);
  };

  // --------------------------------------------------
  // SEND HUMAN MESSAGE TO BACKEND
  // --------------------------------------------------

  const sendToBackend = async (
    humanMessage,
    selectedAction
  ) => {
    if (!sessionId) {
      setMessages((previous) => [
        ...previous,
        {
          sender: 'System',
          text:
            'No negotiation session is active. Please start a new negotiation.',
        },
      ]);
      return;
    }

    const currentTurnRound = round;

    try {
      setLoading(true);
      setDeliberatingAgent(null);
      setStatus('AI agency heads (Government, NGO, District) are deliberating...');

      const payload = {
        session_id: sessionId,
        message: humanMessage,
        resource: resource,
        amount: amount ? Number(amount) : 0,
        action: selectedAction,
        ...(currentProposal && Object.keys(currentProposal).length > 0
          ? { proposal: currentProposal }
          : {}),
      };

      let streamSucceeded = false;

      // 1. Try progressive streaming endpoint for live agent-by-agent updates
      try {
        const streamResponse = await fetch(
          `${API_URL}/api/practice/stream-turn`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          }
        );

        if (streamResponse.ok && streamResponse.body) {
          const reader = streamResponse.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let buffer = '';

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n\n');
            buffer = parts.pop();

            for (const part of parts) {
              const trimmed = part.trim();
              if (!trimmed.startsWith('data:')) continue;
              const jsonStr = trimmed.replace(/^data:\s*/, '').trim();
              if (!jsonStr) continue;

              try {
                const event = JSON.parse(jsonStr);

                if (event.type === 'agent_start') {
                  setDeliberatingAgent(event.agent);
                  setStatus(`${event.agent} is deliberating their response...`);
                } else if (event.type === 'agent_response') {
                  const aiResp = event.ai_response;
                  const agentName = event.agent || aiResp?.agent;
                  setDeliberatingAgent(null);

                  if (aiResp?.current_proposal && Object.keys(aiResp.current_proposal).length > 0) {
                    setCurrentProposal(aiResp.current_proposal);
                  }
                  if (aiResp?.gemini_metrics) {
                    setLlmMetrics(aiResp.gemini_metrics);
                  }
                  if (event.consensus !== undefined && event.consensus !== null) {
                    setConsensus(Number(event.consensus));
                  }

                  const history = aiResp?.history || [];
                  const matchingTurn = history.length
                    ? [...history].reverse().find((h) => h.agent === agentName) || history[history.length - 1]
                    : null;

                  if (aiResp?.message) {
                    setMessages((previous) => [
                      ...previous,
                      {
                        sender: agentName || 'AI Agent',
                        text: aiResp.message,
                        action: matchingTurn?.action || aiResp?.action || 'COUNTER',
                        stance: matchingTurn?.stance || aiResp?.stance || 'firm',
                        round: currentTurnRound,
                        proposal: matchingTurn?.parsed_proposal || aiResp?.parsed_proposal,
                        reasoning: aiResp?.reasoning || matchingTurn?.reasoning,
                      },
                    ]);
                  }
                } else if (event.type === 'round_complete') {
                  setDeliberatingAgent(null);
                  const stateObj = event.state;

                  const consensusVal = event.consensus ?? stateObj?.consensus;
                  if (consensusVal !== undefined && consensusVal !== null) {
                    setConsensus(Number(consensusVal));
                  }

                  const isConsensus = event.consensus_reached || stateObj?.consensus_reached;
                  const isEnded = event.negotiation_ended || stateObj?.negotiation_ended;
                  const isAwaitingFinal = event.awaiting_final_decision || stateObj?.awaiting_final_decision;

                  if (event.final_report || stateObj?.final_report) {
                    setFinalReport(event.final_report || stateObj?.final_report);
                  }
                  if (event.final_allocation || stateObj?.final_allocation) {
                    setFinalAllocation(event.final_allocation || stateObj?.final_allocation);
                  }

                  if (isConsensus) {
                    setSessionStatus('Agreement reached');
                    setStatus('Negotiation complete');
                    setAwaitingFinalDecision(false);
                  } else if (isEnded) {
                    setSessionStatus('Negotiation ended');
                    setStatus('Negotiation complete');
                    setAwaitingFinalDecision(false);
                  } else if (isAwaitingFinal) {
                    setAwaitingFinalDecision(true);
                    setStatus('Final Decision');
                    setSessionStatus('Deliberation Complete');
                  } else {
                    setAwaitingFinalDecision(false);
                    const nextRound = event.round ?? stateObj?.current_round;
                    if (nextRound !== undefined && nextRound !== null) {
                      setRound(Math.min(Number(nextRound), totalRounds));
                    }
                    setSessionStatus('Active');
                    setStatus('Your turn');
                    setAction('Counter');
                  }
                }
              } catch (e) {
                console.warn('Failed to parse SSE event chunk:', e, jsonStr);
              }
            }
          }
          streamSucceeded = true;
        }
      } catch (streamErr) {
        console.warn('Streaming error, falling back to batch turn:', streamErr);
      }

      // 2. Fallback to standard batch turn if stream did not complete
      if (!streamSucceeded) {
        const response = await fetch(
          `${API_URL}/api/practice/turn`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          }
        );

        const responseText = await response.text();

        if (!response.ok) {
          throw new Error(
            `Practice turn failed: ${response.status} ${responseText}`
          );
        }

        const data = JSON.parse(responseText);
        const aiResponses = Array.isArray(data?.ai_responses) && data.ai_responses.length > 0
          ? data.ai_responses
          : [data?.ai_response || data?.ai || data].filter(Boolean);

        const newMessages = [];
        let latestProposal = currentProposal;
        let lastMetrics = llmMetrics;

        for (const aiResp of aiResponses) {
          if (aiResp?.current_proposal && Object.keys(aiResp.current_proposal).length > 0) {
            latestProposal = aiResp.current_proposal;
          }

          if (aiResp?.gemini_metrics) {
            lastMetrics = aiResp.gemini_metrics;
          }

          const history = aiResp?.history || [];
          const agentName = aiResp?.agent;
          const matchingTurn = history.length
            ? [...history].reverse().find((h) => h.agent === agentName) || history[history.length - 1]
            : null;

          if (aiResp?.message) {
            newMessages.push({
              sender: agentName || 'AI Agent',
              text: aiResp.message,
              action: matchingTurn?.action || aiResp?.action || 'COUNTER',
              stance: matchingTurn?.stance || aiResp?.stance || 'firm',
              round: currentTurnRound,
              proposal: matchingTurn?.parsed_proposal || aiResp?.parsed_proposal,
              reasoning: aiResp?.reasoning || matchingTurn?.reasoning,
            });
          }
        }

        if (latestProposal && Object.keys(latestProposal).length > 0) {
          setCurrentProposal(latestProposal);
        }

        if (lastMetrics) {
          setLlmMetrics(lastMetrics);
        }

        if (newMessages.length > 0) {
          setMessages((previous) => [...previous, ...newMessages]);
        }

        const stateObj = data?.state;

        const consensusVal = data?.consensus ?? stateObj?.consensus;
        if (consensusVal !== undefined && consensusVal !== null) {
          setConsensus(Number(consensusVal));
        }

        const isConsensus = data?.consensus_reached || stateObj?.consensus_reached;
        const isEnded = data?.negotiation_ended || stateObj?.negotiation_ended;
        const isAwaitingFinal = data?.awaiting_final_decision || stateObj?.awaiting_final_decision;

        if (data?.final_report || stateObj?.final_report) {
          setFinalReport(data?.final_report || stateObj?.final_report);
        }
        if (data?.final_allocation || stateObj?.final_allocation) {
          setFinalAllocation(data?.final_allocation || stateObj?.final_allocation);
        }

        if (isConsensus) {
          setSessionStatus('Agreement reached');
          setStatus('Negotiation complete');
          setAwaitingFinalDecision(false);
        } else if (isEnded) {
          setSessionStatus('Negotiation ended');
          setStatus('Negotiation complete');
          setAwaitingFinalDecision(false);
        } else if (isAwaitingFinal) {
          setAwaitingFinalDecision(true);
          setStatus('Final Decision');
          setSessionStatus('Deliberation Complete');
        } else {
          setAwaitingFinalDecision(false);
          const nextRound = data?.round ?? stateObj?.current_round;
          if (nextRound !== undefined && nextRound !== null) {
            setRound(Math.min(Number(nextRound), totalRounds));
          }
          setSessionStatus('Active');
          setStatus('Your turn');
          setAction('Counter');
        }
      }
    } catch (error) {
      console.error(
        'Negotiation turn error:',
        error
      );

      setMessages((previous) => [
        ...previous,
        {
          sender: 'System',
          text:
            `Negotiation error: ${error.message}`,
        },
      ]);

      setStatus('Connection error');
    } finally {
      setLoading(false);
      setDeliberatingAgent(null);
    }
  };

  // --------------------------------------------------
  // FINAL EXECUTIVE DECISION ACTION
  // --------------------------------------------------

  const handleFinalDecisionAction = async (decisionType) => {
    if (decisionType === 'reset') {
      await handleNewNegotiation();
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/practice/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          decision: decisionType,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to record final decision');
      }

      const data = await response.json();
      setAwaitingFinalDecision(false);

      if (data?.final_report || data?.state?.final_report) {
        setFinalReport(data?.final_report || data?.state?.final_report);
      }
      if (data?.final_allocation || data?.state?.final_allocation) {
        setFinalAllocation(data?.final_allocation || data?.state?.final_allocation);
      }

      if (decisionType === 'accept') {
        setSessionStatus('Agreement reached');
        setStatus('Negotiation complete');
        setConsensus(1.0);
        setMessages((prev) => [
          ...prev,
          {
            sender: 'You',
            text: 'I accept this consensus agreement and officially authorize final resource deployment.',
            action: 'ACCEPT',
            stance: 'accept',
            round: totalRounds,
            proposal: data?.final_allocation || currentProposal,
          },
        ]);
      } else {
        setSessionStatus('Deadlock');
        setStatus('Negotiation ended');
        setMessages((prev) => [
          ...prev,
          {
            sender: 'You',
            text: 'I reject the proposed terms. The roundtable has concluded without reaching an agreement.',
            action: 'REJECT',
            stance: 'reject',
            round: totalRounds,
            proposal: currentProposal,
          },
        ]);
      }
    } catch (err) {
      console.error('Final decision error:', err);
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------
  // SEND BUTTON
  // --------------------------------------------------

  const handleSend = async () => {
    if (
      loading ||
      (status !== 'Your turn' && !awaitingFinalDecision)
    ) {
      return;
    }

    let finalMessage =
      message.trim();

    if (!finalMessage) {
      if (action === 'Accept Offer' || action === 'Accept') {
        finalMessage = 'I accept the proposed resource allocation across all sectors.';
      } else if (currentProposal && Object.keys(currentProposal).length > 0) {
        finalMessage = round === 1
          ? 'I submit this initial master allocation proposal across all sectors.'
          : `I submit this ${action.toLowerCase()} resource distribution across all sectors.`;
      } else if (amount && Number(amount) > 0) {
        finalMessage = `${action} ${amount} units of ${resource}.`;
      } else {
        finalMessage = `${action} ${resource}.`;
      }
    }

    // Show human message immediately with proposal table for this round
    setMessages((previous) => [
      ...previous,
      {
        sender: 'You',
        text: finalMessage,
        round,
        action,
        stance: 'collaborative',
        proposal: currentProposal && Object.keys(currentProposal).length > 0 ? JSON.parse(JSON.stringify(currentProposal)) : undefined,
      },
    ]);

    await sendToBackend(
      finalMessage,
      action
    );

    setMessage('');
    setAmount('');
    setSuggestionReasoning(null);
  };

  // --------------------------------------------------
  // ACCEPT / REJECT / COUNTER QUICK ACTIONS
  // --------------------------------------------------

  const handleDecision = async (
    decision
  ) => {
    if (
      loading ||
      status !== 'Your turn'
    ) {
      return;
    }

    setAction(decision);
    setSuggestionReasoning(null);

    const decisionText = decision === 'Accept Offer' || decision === 'Accept'
      ? 'I agree with the current resource allocation and support finalizing the agreement.'
      : decision === 'Reject Offer' || decision === 'Reject'
        ? 'I cannot accept this allocation without further adjustments to affected region priorities.'
        : 'I counter with the updated resource allocation numbers.';

    setMessages((previous) => [
      ...previous,
      {
        sender: 'You',
        text: decisionText,
        round,
        action: decision,
        stance: decision === 'Accept Offer' || decision === 'Accept' ? 'accept' : decision === 'Reject Offer' || decision === 'Reject' ? 'reject' : 'collaborative',
        proposal: currentProposal && Object.keys(currentProposal).length > 0 ? JSON.parse(JSON.stringify(currentProposal)) : undefined,
      },
    ]);

    await sendToBackend(
      decisionText,
      decision
    );

    setMessage('');
    setAmount('');
  };

  // --------------------------------------------------
  // AI SUGGESTION / AUTOFILL
  // --------------------------------------------------

  const handleGetSuggestion = async () => {
    if (
      loading ||
      suggesting ||
      status !== 'Your turn' ||
      !sessionId
    ) {
      return;
    }

    try {
      setSuggesting(true);
      const response = await fetch(`${API_URL}/api/practice/suggest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch suggestion: ${response.statusText}`);
      }

      const data = await response.json();
      if (data?.success && data?.suggestion) {
        const suggestion = data.suggestion;

        if (suggestion.action) {
          const act = String(suggestion.action).toLowerCase().includes('request')
            ? 'Request'
            : 'Offer';
          setAction(act);
        }

        if (suggestion.resource) {
          const availableResources = getResources(selectedScenario);
          const matchedResource = availableResources.find(
            (r) => r.toLowerCase() === String(suggestion.resource).toLowerCase()
          ) || suggestion.resource;
          setResource(matchedResource);
        }

        if (
          suggestion.amount !== undefined &&
          suggestion.amount !== null &&
          suggestion.amount !== ''
        ) {
          setAmount(String(suggestion.amount));
        }

        if (suggestion.message) {
          setMessage(suggestion.message);
        }

        if (suggestion.reasoning) {
          setSuggestionReasoning(suggestion.reasoning);
        }

        if (
          suggestion.proposal &&
          typeof suggestion.proposal === 'object' &&
          Object.keys(suggestion.proposal).length > 0
        ) {
          setCurrentProposal(suggestion.proposal);
        }
      }
    } catch (error) {
      console.error('Error fetching suggestion:', error);
    } finally {
      setSuggesting(false);
    }
  };

  // --------------------------------------------------
  // ENTER KEY
  // --------------------------------------------------

  const handleKeyDown = (event) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey
    ) {
      event.preventDefault();

      handleSend();
    }
  };

  // --------------------------------------------------
  // NEW NEGOTIATION
  // --------------------------------------------------

  const handleNewNegotiation = async () => {
    setMessages([]);
    setFinalAllocation(null);
    setFinalReport(null);
    setSelectedDiffSource('opening');

    setRound(1);

    setSessionId(null);

    setSessionStatus('Active');

    setStatus('Starting practice...');

    setMessage('');

    setAmount('');

    setAction('Offer');
    setCurrentProposal(buildDefaultProposal(selectedScenario));
    setSuggestionReasoning(null);

    await startSession(
      selectedScenario
    );
  };

  // --------------------------------------------------
  // RESOURCES
  // --------------------------------------------------

  const resourceNames =
    getResources(selectedScenario);

  const updateProposalQuantity = (
    district,
    resourceName,
    value
  ) => {
    setCurrentProposal((previous) => {
      const base = (previous && Object.keys(previous).length > 0)
        ? previous
        : buildDefaultProposal(selectedScenario);
      return {
        ...base,
        [district]: {
          ...(base[district] || {}),
          [resourceName]: value === '' ? '' : Number(value),
        },
      };
    });
  };

  const scenarioResourceQuantities =
    savedConfig?.resourceQuantities ||
    selectedScenario?.resourceQuantities ||
    {};

  const scenarioRecipients =
    selectedScenario?.recipients ||
    initialScenario?.recipients ||
    [];

  const getLatestAiProposals = () => {
    const map = {};
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.sender && msg.sender !== 'You' && msg.sender !== 'System' && msg.proposal && Object.keys(msg.proposal).length > 0) {
        if (!map[msg.sender]) {
          map[msg.sender] = {
            sender: msg.sender,
            proposal: msg.proposal,
            action: msg.action,
            text: msg.text,
          };
        }
      }
    }
    return Object.values(map);
  };

  const getProposalColumnTotals = (prop) => {
    const totals = {};
    if (!prop || typeof prop !== 'object') return totals;
    for (const res of resourceNames) {
      totals[res] = Object.values(prop).reduce((acc, dAlloc) => {
        return acc + Number(dAlloc?.[res] || 0);
      }, 0);
    }
    return totals;
  };

  const proposalAuthor =
    messages
      .slice()
      .reverse()
      .find((item) => item.action && item.action !== 'ACCEPT')
      ?.sender || 'AI Agent';

  const aiAgents = (savedConfig?.agents || selectedScenario?.agents || [])
    .map((agent) => agent.name)
    .filter(Boolean);
  const latestAiActions = messages.reduce((result, item) => {
    if (item.sender && item.sender !== 'You' && item.sender !== 'System' && item.action) {
      result[item.sender] = String(item.action).toUpperCase();
    }
    return result;
  }, {});
  const acceptedAiCount = aiAgents.filter(
    (agentName) => latestAiActions[agentName] === 'ACCEPT'
  ).length;
  const proposalMessages = messages.filter(
    (item) => item.proposal && Object.keys(item.proposal).length > 0
  );
  const currentSpeaker = status === 'Negotiation complete' || sessionStatus === 'Agreement reached' || sessionStatus === 'Deadlock'
    ? null
    : proposalMessages.length > 0
      ? proposalMessages[proposalMessages.length - 1].sender
      : null;

  const groupedMessages = messages.reduce((groups, item, index) => {
    const roundNumber = item?.round || 1;
    if (!groups[roundNumber]) {
      groups[roundNumber] = [];
    }
    groups[roundNumber].push({ msg: item, index });
    return groups;
  }, {});

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <div className="space-y-6">

      {/* HEADER */}

      <section className="rounded-[2rem] border border-slate-200 bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 p-8 text-white shadow-xl">

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

          <div>

            <p className="text-sm font-medium text-blue-100">
              HUMAN PARTICIPANT
            </p>

            <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
              Practice Mode
            </h1>

            <p className="mt-2 text-blue-50">
              Practice disaster relief negotiation with AI agents.
            </p>

          </div>

          <div className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold">
            PRACTICE MODE
          </div>

        </div>

      </section>


      {/* SCENARIO + RESOURCES */}

      <section className="grid gap-6 lg:grid-cols-3">

        {/* SCENARIO */}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">

          <h2 className="text-lg font-semibold text-slate-900">
            Scenario
          </h2>

          <select
            value={selectedScenario.id}
            onChange={handleScenarioChange}
            disabled={loading}
            className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-blue-500 disabled:bg-slate-100"
          >

            {scenarios.map(
              (scenario) => (
                <option
                  key={scenario.id}
                  value={scenario.id}
                >
                  {scenario.title ||
                    scenario.name}
                </option>
              )
            )}

          </select>


          {/* ROLE */}

          <div className="mt-5 rounded-xl bg-blue-50 p-4">

            <p className="text-sm text-slate-500">
              Your Role
            </p>

            <p className="mt-1 font-semibold text-slate-900">
              Human Participant
            </p>

            <p className="mt-3 text-sm text-slate-600">
              Scenario Role:{' '}
              {selectedScenario
                .agents?.[2]?.role ||
                selectedScenario.role ||
                'Relief Coordinator'}
            </p>

          </div>


          {/* OBJECTIVE */}

          <div className="mt-4">

            <p className="text-sm font-medium text-slate-500">
              Objective
            </p>

            <p className="mt-1 text-sm leading-6 text-slate-700">
              {selectedScenario.objective ||
                'Coordinate disaster relief resources fairly and efficiently.'}
            </p>

          </div>

        </div>


        {/* RESOURCES */}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

          <h2 className="text-lg font-semibold text-slate-900">
            Resources
          </h2>

          <div className="mt-4 space-y-3">

            {resourceNames
              .slice(0, 5)
              .map((item) => {

                const value =
                  Array.isArray(
                    selectedScenario.resources
                  )
                    ? null
                    : selectedScenario
                      .resources?.[
                    item
                    ];

                return (
                  <div
                    key={item}
                    className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"
                  >

                    <span className="text-sm font-medium text-slate-700">
                      {item}
                    </span>

                    {value !== undefined &&
                      value !== null && (
                        <span className="font-semibold text-slate-900">
                          {value}
                        </span>
                      )}

                  </div>
                );
              })}

          </div>

        </div>

      </section>

      {/* NEGOTIATION */}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.65fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">

          {/* NEGOTIATION HEADER */}

          <div className="flex flex-col gap-3 border-b border-slate-200 p-6 sm:flex-row sm:items-center sm:justify-between">

            <div>

              <h2 className="text-xl font-semibold text-slate-900">
                Negotiation
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Submit your master proposal to the roundtable of AI agency heads.
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-700">
                Roundtable Stakeholders: <span className="text-blue-700 font-bold">Government</span>, <span className="text-emerald-700 font-bold">NGO</span>, and <span className="text-purple-700 font-bold">District Administration</span>
              </p>
              {(status === 'Negotiation complete' || sessionStatus === 'Agreement reached' || sessionStatus === 'Deadlock') && (
                <p className="mt-2 text-sm font-semibold text-emerald-700">
                  ✓ Negotiation complete
                </p>
              )}

            </div>

            <div className="flex flex-wrap gap-3">

              <span className="rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
                Round {round} / {totalRounds}
              </span>

              <span className="rounded-full bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700">
                Consensus: {Math.round(consensus * 100)}%
              </span>

              <span className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
                <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-500" />
                {sessionStatus}
              </span>

              {(sessionStatus === 'Agreement reached' || sessionStatus === 'Deadlock' || sessionStatus === 'Negotiation ended') && (
                <span className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600">
                  Rounds used: {round}
                </span>
              )}

            </div>

          </div>


          {/* TIMELINE TRANSCRIPT */}

          <div className="p-6">
            <div className="relative">
              {/* Vertical timeline line */}
              {messages.length > 0 && (
                <div className="absolute left-[6px] top-0 bottom-0 w-0.5 bg-slate-200 rounded-full" />
              )}

              <div className="space-y-6">
                {messages.length === 0 && !loading && (
                  <div className="py-8 text-center text-sm text-slate-400">
                    Submit your opening offer below to begin Round 1 negotiation.
                  </div>
                )}

                {Object.entries(groupedMessages).map(([roundNum, roundItems]) => (
                  <section key={roundNum} className="space-y-4">
                    <div className="flex items-center gap-3 pt-2">
                      <span className="text-xs font-extrabold uppercase tracking-widest text-slate-500">
                        Round {roundNum}
                      </span>
                      <div className="h-px flex-1 bg-slate-200" />
                    </div>

                    {roundItems.map(({ msg, index }) => (
                      <PracticeTranscriptEntry
                        key={`${index}-${msg.sender}-${msg.round || roundNum}`}
                        msg={msg}
                        index={index}
                        previousProposal={messages[index - 1]?.proposal}
                      />
                    ))}
                  </section>
                ))}

                {loading && (
                  <div className="relative pl-8">
                    <div className="absolute left-0 top-5 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm bg-blue-600 animate-ping" />
                    <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50/90 via-indigo-50/80 to-blue-50/90 p-4 shadow-xs animate-pulse">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-blue-600 animate-ping" />
                        <p className="text-xs font-extrabold uppercase tracking-wider text-blue-950">
                          {deliberatingAgent
                            ? `${deliberatingAgent} is evaluating & deliberating...`
                            : 'AI agency heads are reviewing your proposal...'}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-slate-600 italic">
                        Evaluating trade-offs, calculating regional needs, and formulating live counter-proposals...
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>


          {/* INPUT AREA */}

          <div className="border-t border-slate-200 p-6 space-y-6">

            {/* YOUR TURN BANNER */}
            {status === 'Your turn' && !awaitingFinalDecision && (
              <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50/95 via-blue-50/90 to-purple-50/95 p-5 shadow-xs">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-3 w-3 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-600"></span>
                    </span>
                    <span className="text-sm font-extrabold uppercase tracking-wider text-blue-950">
                      {round === 1 ? 'ROUND 1 — INITIAL MASTER PROPOSAL' : `YOUR TURN — ROUND ${round} DECISION`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-blue-100/90 border border-blue-200/80 px-3 py-1 text-xs font-bold text-blue-800 uppercase tracking-wide">
                      🟣 4th Negotiator (Human)
                    </span>
                    <span className="rounded-full bg-purple-100/90 border border-purple-200/80 px-3 py-1 text-xs font-semibold text-purple-800">
                      Round {round} of {totalRounds}
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-700">
                  {round === 1 ? (
                    <>You make the <strong>initial proposal</strong> for the negotiation. Allocate all resources across regions in the matrix below and submit. Government, NGO, and District Administration will each evaluate and respond in order.</>
                  ) : (
                    <>All 3 AI agency heads (<strong>🔵 Government</strong>, <strong>🟢 NGO</strong>, and <strong>🟠 District Administration</strong>) have responded to your previous proposal. Review their debate above, adjust allocations, and choose to <strong>Counter</strong>, <strong>Accept</strong>, or <strong>Reject</strong>.</>
                  )}
                </p>

                <div className="mt-3.5 pt-3.5 border-t border-indigo-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="text-xs text-slate-600">
                    <span className="font-bold text-indigo-900">💡 AI Assistant:</span> Unsure how to distribute? Click to auto-generate a balanced strategic allocation tailored to regional crisis severities.
                  </div>
                  <button
                    type="button"
                    onClick={handleGetSuggestion}
                    disabled={loading || suggesting || status !== 'Your turn' || !sessionId}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 px-4 py-2 text-xs font-bold text-white shadow-md transition hover:from-indigo-700 hover:to-purple-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Sparkles size={15} className={suggesting ? 'animate-spin' : ''} />
                    {suggesting ? 'Drafting Proposal...' : '✨ Autofill AI Suggestion'}
                  </button>
                </div>
              </div>
            )}

            {/* FINAL EXECUTIVE DECISION PANEL */}
            {awaitingFinalDecision && (
              <div className="rounded-2xl border-2 border-indigo-400 bg-gradient-to-br from-indigo-50/95 via-white to-blue-50/90 p-6 shadow-lg space-y-5 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-indigo-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-3.5 w-3.5 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-indigo-600"></span>
                      </span>
                      <h3 className="text-base font-extrabold uppercase tracking-wide text-indigo-950">
                        Final Executive Decision Required (Round {totalRounds} of {totalRounds} Completed)
                      </h3>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      All {totalRounds} rounds of negotiation have concluded. Government, NGO, and District Administration have presented their final evaluations. As lead coordinator, select the final outcome:
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-indigo-100 border border-indigo-200 px-3 py-1 text-xs font-bold text-indigo-800 uppercase tracking-wider">
                    Executive Decision
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* ACCEPT */}
                  <button
                    type="button"
                    onClick={() => handleFinalDecisionAction('accept')}
                    disabled={loading}
                    className="flex flex-col items-start p-4 rounded-xl border-2 border-emerald-300 bg-emerald-50/80 hover:bg-emerald-100 hover:border-emerald-500 transition shadow-xs text-left group disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2 mb-1.5 text-emerald-800 font-extrabold text-sm group-hover:text-emerald-900">
                      <span className="p-1 rounded-md bg-emerald-200 text-emerald-900"><Check size={16} /></span>
                      Accept Agreement
                    </div>
                    <p className="text-xs text-emerald-700 leading-relaxed">
                      Ratify the resource allocation and conclude the negotiation with official multi-agency agreement.
                    </p>
                  </button>

                  {/* REJECT */}
                  <button
                    type="button"
                    onClick={() => handleFinalDecisionAction('reject')}
                    disabled={loading}
                    className="flex flex-col items-start p-4 rounded-xl border-2 border-rose-300 bg-rose-50/80 hover:bg-rose-100 hover:border-rose-500 transition shadow-xs text-left group disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2 mb-1.5 text-rose-800 font-extrabold text-sm group-hover:text-rose-900">
                      <span className="p-1 rounded-md bg-rose-200 text-rose-900"><X size={16} /></span>
                      Reject & Walk Away
                    </div>
                    <p className="text-xs text-rose-700 leading-relaxed">
                      Reject the final allocation and record a negotiation breakdown / deadlock.
                    </p>
                  </button>

                  {/* RESET */}
                  <button
                    type="button"
                    onClick={() => handleFinalDecisionAction('reset')}
                    disabled={loading}
                    className="flex flex-col items-start p-4 rounded-xl border-2 border-slate-300 bg-slate-50/90 hover:bg-slate-100 hover:border-slate-500 transition shadow-xs text-left group disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2 mb-1.5 text-slate-800 font-extrabold text-sm group-hover:text-slate-900">
                      <span className="p-1 rounded-md bg-slate-200 text-slate-900"><RotateCcw size={16} /></span>
                      Reset Negotiation
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Reset round counter and start a fresh practice negotiation from Round 1.
                    </p>
                  </button>
                </div>
              </div>
            )}

            {/* CURRENT AI PROPOSALS (ROUND X) */}
            {getLatestAiProposals().length > 0 && status === 'Your turn' && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-indigo-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Current AI Proposals (Positions to Evaluate)
                    </h4>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Click &ldquo;Copy to My Allocation&rdquo; to start from any agent&rsquo;s proposal
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  {getLatestAiProposals().map((aiProp) => {
                    const style = getPracticeAgentStyle(aiProp.sender);
                    return (
                      <div
                        key={aiProp.sender}
                        className="flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs hover:border-slate-300 transition"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-1.5">
                              <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
                              <span className={`text-xs font-bold ${style.text}`}>
                                {aiProp.sender}
                              </span>
                            </div>
                            {aiProp.action && (
                              <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${getPracticeActionStyle(aiProp.action)}`}>
                                {aiProp.action}
                              </span>
                            )}
                          </div>

                          <div className="space-y-1.5 my-2">
                            {Object.entries(aiProp.proposal || {}).map(([dist, alloc]) => (
                              <div key={dist} className="rounded-lg bg-slate-50 px-2 py-1 text-[11px] text-slate-600 flex items-center justify-between">
                                <span className="font-medium text-slate-700 truncate max-w-[90px]">{dist}:</span>
                                <span className="font-mono text-[10px] text-slate-500">
                                  {resourceNames.map((r) => `${alloc?.[r] ?? 0} ${r.split(' ')[0]}`).join(' / ')}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setCurrentProposal(JSON.parse(JSON.stringify(aiProp.proposal)));
                            setAction('Counter Offer');
                          }}
                          className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition text-center"
                        >
                          📋 Copy to My Allocation
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* INTERACTIVE ALLOCATION MATRIX (THE CORE USER PROPOSAL TABLE) */}
            {status === 'Your turn' && !awaitingFinalDecision && (() => {
              const activeProposal = (currentProposal && Object.keys(currentProposal).length > 0)
                ? currentProposal
                : buildDefaultProposal(selectedScenario);
              const columnTotals = getProposalColumnTotals(activeProposal);

              return (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="flex h-2.5 w-2.5 rounded-full bg-blue-600" />
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                          Your Proposed Allocation
                        </h3>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Enter the exact resource distribution you propose across all affected regions.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleGetSuggestion}
                        disabled={loading || suggesting || status !== 'Your turn' || !sessionId}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-gradient-to-r from-indigo-50 to-blue-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-xs transition hover:border-indigo-300 hover:from-indigo-100 hover:to-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Get AI suggested next move and proposal based on regional priorities"
                      >
                        <Sparkles size={14} className={suggesting ? 'animate-spin text-indigo-600' : 'text-indigo-600'} />
                        {suggesting ? 'Drafting...' : '✨ Autofill AI Suggestion'}
                      </button>
                    </div>
                  </div>

                  {suggestionReasoning && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50/80 p-3.5 text-xs text-indigo-950 shadow-2xs animate-fadeIn">
                      <Sparkles size={16} className="mt-0.5 shrink-0 text-indigo-600" />
                      <div className="flex-1">
                        <span className="font-bold text-indigo-900">AI Strategic Advisor: </span>
                        <span className="text-indigo-800">{suggestionReasoning}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSuggestionReasoning(null)}
                        className="text-indigo-400 transition hover:text-indigo-700 font-semibold"
                        title="Dismiss"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {/* RESOURCE ALLOCATION MATRIX TABLE */}
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                          <th className="px-4 py-3 min-w-[140px]">Affected Region</th>
                          {resourceNames.map((res) => {
                            const maxAvail = scenarioResourceQuantities[res] ?? 0;
                            return (
                              <th key={res} className="px-3 py-3 text-center min-w-[120px]">
                                <div>{res}</div>
                                <span className="text-[10px] font-normal text-slate-400 font-mono">
                                  Budget: {maxAvail}
                                </span>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {Object.entries(activeProposal).map(([district, resources]) => {
                          const regionMeta = scenarioRecipients.find(
                            (r) => (r.name || r) === district
                          );
                          const severity = regionMeta?.severity || 'Standard';
                          const pop = regionMeta?.population;

                          return (
                            <tr key={district} className="hover:bg-slate-50/40">
                              <td className="px-4 py-3">
                                <div className="font-semibold text-slate-900">{district}</div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded ${severity === 'Critical' ? 'bg-red-100 text-red-700' :
                                      severity === 'High' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                                    }`}>
                                    {severity}
                                  </span>
                                  {pop && <span className="text-[10px] text-slate-400 font-mono">{pop.toLocaleString()} pop</span>}
                                </div>
                              </td>

                              {resourceNames.map((res) => (
                                <td key={res} className="px-3 py-2 text-center">
                                  <input
                                    type="number"
                                    min="0"
                                    value={resources?.[res] ?? ''}
                                    onChange={(event) =>
                                      updateProposalQuantity(
                                        district,
                                        res,
                                        event.target.value
                                      )
                                    }
                                    disabled={loading || status !== 'Your turn'}
                                    className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center font-mono text-xs font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100"
                                  />
                                </td>
                              ))}
                            </tr>
                          );
                        })}

                        {/* TOTAL VALIDATION ROW */}
                        <tr className="bg-slate-50/90 font-bold border-t-2 border-slate-200">
                          <td className="px-4 py-3 font-bold text-slate-900">
                            TOTAL ALLOCATION
                          </td>

                          {resourceNames.map((res) => {
                            const totalVal = columnTotals[res] ?? 0;
                            const maxVal = scenarioResourceQuantities[res] ?? 0;
                            const isBalanced = totalVal === maxVal;
                            const isOver = totalVal > maxVal;
                            const diff = Math.abs(maxVal - totalVal);

                            return (
                              <td key={res} className="px-3 py-3 text-center">
                                <div className="font-mono text-xs font-bold text-slate-900">
                                  {totalVal} / {maxVal}
                                </div>
                                <div className="mt-0.5">
                                  {isBalanced ? (
                                    <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-800">
                                      ✓ Balanced
                                    </span>
                                  ) : isOver ? (
                                    <span className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-bold text-red-800">
                                      ⛔ +{diff} Exceeds
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-800">
                                      ⚠ -{diff} Under
                                    </span>
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* RATIONALE & MESSAGE INPUT */}
            {status === 'Your turn' && (
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                {acceptedAiCount >= 2 && (
                  <div className="rounded-xl border border-emerald-300 bg-emerald-50/90 p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs text-emerald-900 shadow-2xs animate-fadeIn">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🤝</span>
                      <div>
                        <span className="font-bold text-emerald-950">
                          {acceptedAiCount >= 3 ? "Unanimous AI Agreement Reached!" : "Broad AI Agreement in Progress:"}
                        </span>{" "}
                        <span>
                          {acceptedAiCount >= 3
                            ? "Government, NGO, and District have all accepted this allocation! Click 'Accept & Finalize' to conclude consensus."
                            : `${acceptedAiCount} agencies have already accepted this allocation.`}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAction("Accept Offer");
                        handleDecision("Accept Offer");
                      }}
                      className="shrink-0 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-xs transition"
                    >
                      ✓ Accept & Finalize
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      Negotiation Action:
                    </label>
                    <select
                      value={action}
                      onChange={(event) => setAction(event.target.value)}
                      disabled={loading || status !== 'Your turn'}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-100"
                    >
                      {round === 1 ? (
                        <option value="Offer">Initial Proposal (Offer)</option>
                      ) : (
                        <>
                          <option value="Counter Offer">Counter Offer</option>
                          <option value="Accept Offer">Accept Offer</option>
                          <option value="Reject Offer">Reject Offer</option>
                        </>
                      )}
                    </select>
                  </div>

                  <p className="text-[11px] text-slate-500">
                    {round === 1
                      ? 'You are submitting the initial master allocation for AI agencies to review.'
                      : action === 'Accept Offer'
                      ? 'You accept the current allocation and recommend finalizing.'
                      : 'You are submitting a proposed distribution with your rationale.'}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
                    <span>Why do you prefer this allocation? (Your statement to the AI agents)</span>
                    <span className="text-[11px] font-normal text-slate-400">Communicates your rationale to the 3 agents</span>
                  </label>
                  <textarea
                    rows={3}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    disabled={loading || status !== 'Your turn'}
                    placeholder={round === 1 ? "e.g., North Sector is critical so I prioritized rescue teams and medical aid there. Central needs debris equipment and shelters, while South retains sufficient medical aid for its population..." : "e.g., Addressing Government's concern about rescue teams, while balancing NGO's medical priorities..."}
                    className="w-full rounded-xl border border-slate-300 p-3.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 leading-relaxed"
                  />
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2">
                    {round > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleDecision('Accept Offer')}
                          disabled={loading || status !== 'Your turn'}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-50"
                        >
                          <Check size={14} />
                          Accept Current Proposal
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDecision('Reject Offer')}
                          disabled={loading || status !== 'Your turn'}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-bold text-red-700 hover:bg-red-100 transition disabled:opacity-50"
                        >
                          <X size={14} />
                          Reject
                        </button>
                      </>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={loading || status !== 'Your turn'}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 px-6 py-3 text-sm font-bold text-white shadow-md transition hover:from-blue-700 hover:to-indigo-800 focus:ring-2 focus:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Send size={16} />
                    Submit {round === 1 ? 'Initial Proposal' : 'Allocation'} (Round {round})
                  </button>
                </div>
              </div>
            )}

            {/* ROUND 3 / FINAL REVIEW STATUS */}
            {(round >= totalRounds || sessionStatus === 'Agreement reached' || sessionStatus === 'Deadlock') && (
              <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/50 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">🤝</span>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        {sessionStatus === 'Agreement reached' ? 'Final Resource Allocation Agreement' : `Round ${round} Final Review`}
                      </h3>
                      <p className="text-xs text-slate-500">
                        Multi-agent consensus status across all 4 participants
                      </p>
                    </div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase ${sessionStatus === 'Agreement reached' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                    }`}>
                    {sessionStatus}
                  </span>
                </div>

                {/* Consensus checklist */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
                  <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-center">
                    <p className="text-xs font-bold text-blue-900">Government</p>
                    <p className="text-sm font-extrabold text-blue-700 mt-1">✓ Agreed</p>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-center">
                    <p className="text-xs font-bold text-emerald-900">NGO</p>
                    <p className="text-sm font-extrabold text-emerald-700 mt-1">✓ Agreed</p>
                  </div>
                  <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-3 text-center">
                    <p className="text-xs font-bold text-orange-900">District Admin</p>
                    <p className="text-sm font-extrabold text-orange-700 mt-1">✓ Agreed</p>
                  </div>
                  <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-3 text-center">
                    <p className="text-xs font-bold text-purple-900">Human (You)</p>
                    <p className="text-sm font-extrabold text-purple-700 mt-1">
                      {sessionStatus === 'Agreement reached' ? '✓ Finalized' : 'Reviewing'}
                    </p>
                  </div>
                </div>
              </div>
            )}


            {/* NEW NEGOTIATION */}

            {(sessionStatus ===
              'Agreement reached' ||
              sessionStatus ===
              'Deadlock') && (

                <div className="mt-6 border-t border-slate-200 pt-5">

                  <button
                    type="button"
                    onClick={
                      handleNewNegotiation
                    }
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >

                    <RotateCcw
                      size={16}
                    />

                    Start New Negotiation

                  </button>

                </div>

              )}

          </div>

        </section>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="text-base font-semibold text-slate-800">Negotiation Progress</h3>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between rounded-xl bg-white px-3 py-2 shadow-sm">
                <span className="text-slate-500">Round</span>
                <span className="font-semibold text-slate-800">{round} / {totalRounds}</span>
              </div>
              <div className="rounded-xl bg-white px-3 py-3 shadow-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">AI agents accepted</span>
                  <span className="font-semibold text-slate-800">{acceptedAiCount} / {aiAgents.length}</span>
                </div>
                <div className="mt-2 flex gap-1.5">
                  {aiAgents.map((agentName) => (
                    <span
                      key={agentName}
                      className={`h-3 w-3 rounded-full ${latestAiActions[agentName] === 'ACCEPT' ? getPracticeAgentStyle(agentName).dot : 'bg-slate-200'}`}
                    />
                  ))}
                </div>
              </div>
              <div className="flex justify-between rounded-xl bg-white px-3 py-2 shadow-sm">
                <span className="text-slate-500">Total participants</span>
                <span className="font-semibold text-slate-800">{aiAgents.length + 1}</span>
              </div>
              <div className="flex justify-between rounded-xl bg-white px-3 py-2 shadow-sm">
                <span className="text-slate-500">Agreement</span>
                <span className={`font-semibold ${sessionStatus === 'Agreement reached' ? 'text-emerald-700' : 'text-slate-700'}`}>
                  {sessionStatus === 'Agreement reached' ? '✓ Reached' : sessionStatus === 'Deadlock' ? 'No consensus' : 'Active'}
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="text-base font-semibold text-slate-800">Agent Status</h3>
            <div className="mt-4 space-y-2">
              {aiAgents.map((agentName) => {
                const agentStyle = getPracticeAgentStyle(agentName);
                const actionValue = latestAiActions[agentName];
                return (
                  <div key={agentName} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 shadow-sm">
                    <span className="flex min-w-0 items-center gap-2 text-sm text-slate-700">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${agentStyle.dot}`} />
                      <span className="truncate">{agentName}</span>
                    </span>
                    <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${actionValue === 'ACCEPT' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {actionValue === 'ACCEPT' ? '✓ Accepted' : actionValue ? 'Negotiating' : 'Pending'}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="text-base font-semibold text-slate-800">LLM Metrics</h3>
            <div className="mt-4 space-y-2">
              {[
                ['API Requests', llmMetrics.total_requests],
                ['Input Tokens', llmMetrics.total_input_tokens],
                ['Output Tokens', llmMetrics.total_output_tokens],
                ['Total Tokens', llmMetrics.total_tokens],
                ['Average Latency', `${Number(llmMetrics.average_latency || 0).toFixed(2)}s`],
                ['Total API Latency', `${Number(llmMetrics.total_latency || 0).toFixed(2)}s`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm shadow-sm">
                  <span className="text-slate-500">{label}</span>
                  <span className="font-semibold text-slate-800">{value}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>

      </div>

      {/* ── FINAL NEGOTIATION REPORT (AI VS HUMAN) ── */}
      {(sessionStatus === 'Agreement reached' ||
        sessionStatus === 'Deadlock' ||
        sessionStatus === 'Negotiation ended' ||
        status === 'Negotiation complete' ||
        consensus >= 1.0) && (() => {
        const consensusReached = sessionStatus === 'Agreement reached' || consensus >= 1.0;
        
        // 1. Compute Initial Demands for each participant
        const initialDemands = messages.reduce((acc, item) => {
          const rawSender = item.sender === 'You' ? 'You (Human Participant)' : item.sender;
          if (
            rawSender &&
            rawSender !== 'System' &&
            item.proposal &&
            typeof item.proposal === 'object' &&
            Object.keys(item.proposal).length > 0 &&
            !acc[rawSender]
          ) {
            acc[rawSender] = item.proposal;
          }
          return acc;
        }, {});

        // Include initial proposals from outcome analysis if present
        if (finalReport?.outcome_analysis?.agent_performance) {
          Object.entries(finalReport.outcome_analysis.agent_performance).forEach(([agent, perf]) => {
            const displayAgent = agent === 'Human Participant' ? 'You (Human Participant)' : agent;
            if (perf.initial_proposal && !initialDemands[displayAgent]) {
              initialDemands[displayAgent] = perf.initial_proposal;
            }
          });
        }

        // Ensure human opening demand is recorded if they submitted
        if (!initialDemands['You (Human Participant)']) {
          const firstHuman = messages.find(
            (m) => (m.sender === 'You' || m.sender === 'Human Participant') && m.proposal
          );
          if (firstHuman?.proposal) {
            initialDemands['You (Human Participant)'] = firstHuman.proposal;
          }
        }

        // Fallback if empty
        if (Object.keys(initialDemands).length === 0 && currentProposal) {
          initialDemands['You (Human Participant)'] = currentProposal;
        }

        // 2. Agreed or final allocation
        const agreedAllocation =
          finalAllocation ||
          (consensusReached ? currentProposal : null) ||
          currentProposal ||
          {};

        // 3. Baseline opening proposal to compare against
        const baselineOpeningProposal =
          (selectedDiffSource !== 'opening' && initialDemands[selectedDiffSource])
            ? initialDemands[selectedDiffSource]
            : (initialDemands['You (Human Participant)'] ||
               initialDemands['Government Agent'] ||
               Object.values(initialDemands)[0] ||
               currentProposal ||
               {});

        // 4. Calculate differences
        const differences = computeAllocationDifference(baselineOpeningProposal, agreedAllocation);
        const diffMap = {};
        differences.forEach((item) => {
          diffMap[`${item.sector}::${item.resource}`] = item;
        });

        const totalReallocated = differences
          .filter((d) => d.diff > 0)
          .reduce((sum, d) => sum + d.diff, 0);
        const totalConceded = differences
          .filter((d) => d.diff < 0)
          .reduce((sum, d) => sum + Math.abs(d.diff), 0);
        const increasedCount = differences.filter((d) => d.diff > 0).length;
        const concededCount = differences.filter((d) => d.diff < 0).length;
        const unchangedCount = differences.filter((d) => d.diff === 0).length;
        const outcomeAnalysis = finalReport?.outcome_analysis;

        return (
          <div className="mt-8 rounded-[1.75rem] border border-emerald-200 bg-emerald-50/80 p-6 sm:p-8 shadow-sm">
            {/* Header */}
            <div className="flex items-center gap-2.5 font-bold text-emerald-800 text-xl sm:text-2xl mb-2">
              <CheckCircle size={26} className="text-emerald-700" />
              Final Negotiation Report
            </div>
            <p className="text-sm text-emerald-700/90 mb-6 font-medium">
              {consensusReached
                ? 'The negotiation concluded successfully. Below are the opening positions and the final agreed allocation.'
                : 'The negotiation concluded without unanimous agreement. Below are the opening positions and the final proposal.'}
            </p>

            {/* Two-Column Grid: Opening Demands vs Final Agreed Allocation */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Opening demands */}
              <div>
                <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-4">
                  Initial Requirements (Opening Demands)
                </h3>
                <div className="space-y-4">
                  {Object.entries(initialDemands).map(([agentName, demands]) => {
                    const s = getPracticeAgentStyle(agentName);
                    return (
                      <div key={agentName} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
                        <div className="flex items-center gap-2 mb-3">
                          <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
                          <p className="text-sm font-bold text-slate-800">{agentName}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {demands && typeof demands === 'object' && !Array.isArray(demands) ? (
                            isNestedAllocation(demands) ? (
                              Object.entries(demands).map(([sec, val]) => (
                                <div key={sec} className="w-full">
                                  <p className="text-xs font-bold text-slate-700 mb-1">{sec}</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {Object.entries(val || {}).map(([resource, amount]) => (
                                      <span
                                        key={`${sec}-${resource}`}
                                        className={`text-xs font-medium rounded-md px-2.5 py-1 ${s.chip}`}
                                      >
                                        {resource}: {amount}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))
                            ) : (
                              Object.entries(demands).map(([res, val]) => (
                                <span
                                  key={res}
                                  className={`text-xs font-medium rounded-md px-2.5 py-1 ${s.chip}`}
                                >
                                  {res}: {val}
                                </span>
                              ))
                            )
                          ) : (
                            <span className="text-xs text-slate-500">{String(demands)}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Final Agreed Allocation */}
              <div>
                <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-4">
                  {consensusReached ? 'Final Agreed Allocation' : 'Latest Proposal (No Agreement Reached)'}
                </h3>
                <div className="bg-[#009A65] text-white rounded-2xl p-6 shadow-md min-h-[160px]">
                  <p className="text-sm font-medium text-emerald-50 mb-5">
                    {consensusReached
                      ? 'This allocation was unanimously agreed upon:'
                      : 'No unanimous allocation was reached. Latest allocation on table:'}
                  </p>
                  {Object.keys(agreedAllocation).length > 0 ? (
                    isNestedAllocation(agreedAllocation) ? (
                      <div className="space-y-4">
                        {Object.entries(agreedAllocation).map(([sectorName, allocation]) => (
                          <div key={sectorName}>
                            <p className="text-sm font-bold mb-2">{sectorName}</p>
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(allocation || {}).map(([resource, amount]) => {
                                const diffInfo = diffMap[`${sectorName}::${resource}`];
                                const d = diffInfo ? diffInfo.diff : 0;
                                return (
                                  <span
                                    key={`${sectorName}-${resource}`}
                                    className="bg-[#00B47A] text-white rounded-xl px-4 py-2 text-xs font-bold shadow-sm inline-flex items-center gap-2"
                                  >
                                    <span>{resource}: {amount}</span>
                                    {diffInfo && (
                                      <span
                                        className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${
                                          d > 0
                                            ? 'bg-emerald-950/40 text-emerald-200 border border-emerald-400/30'
                                            : d < 0
                                            ? 'bg-amber-950/40 text-amber-200 border border-amber-400/30'
                                            : 'bg-emerald-800/40 text-emerald-100/70'
                                        }`}
                                        title={`Initial opening: ${diffInfo.initial} → Final agreed: ${amount} (Difference: ${d > 0 ? `+${d}` : d})`}
                                      >
                                        {d > 0 ? `+${d}` : d < 0 ? `${d}` : '±0'}
                                      </span>
                                    )}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2.5">
                        {Object.entries(agreedAllocation).map(([resource, amount]) => {
                          const diffInfo =
                            diffMap[`Overall Allocation::${resource}`] ||
                            diffMap[`General Pool::${resource}`];
                          const d = diffInfo ? diffInfo.diff : 0;
                          return (
                            <span
                              key={resource}
                              className="bg-[#00B47A] text-white rounded-xl px-4 py-2 text-xs font-bold shadow-sm inline-flex items-center gap-2"
                            >
                              <span>{resource}: {amount}</span>
                              {diffInfo && (
                                <span
                                  className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${
                                    d > 0
                                      ? 'bg-emerald-950/40 text-emerald-200 border border-emerald-400/30'
                                      : d < 0
                                      ? 'bg-amber-950/40 text-amber-200 border border-amber-400/30'
                                      : 'bg-emerald-800/40 text-emerald-100/70'
                                  }`}
                                >
                                  {d > 0 ? `+${d}` : d < 0 ? `${d}` : '±0'}
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    )
                  ) : (
                    <p className="text-sm italic text-emerald-100">No valid allocations were recorded.</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── RESOURCE VARIANCE & DIFFERENCE ANALYSIS (DIFFERENCE OCCURRED) ── */}
            <div className="mt-8 pt-6 border-t border-emerald-200/80">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div>
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-emerald-900 flex items-center gap-2">
                    <BarChart3 size={18} className="text-emerald-700" />
                    Resource Variance & Difference Analysis
                  </h3>
                  <p className="text-xs text-emerald-700/80 mt-0.5">
                    Shows how much difference occurred between initial demands and final agreed allocation across all sectors.
                  </p>
                </div>

                {/* Comparison Source Filter Tabs */}
                {Object.keys(initialDemands).length > 1 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-emerald-800">Compared against:</span>
                    <button
                      type="button"
                      onClick={() => setSelectedDiffSource('opening')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                        selectedDiffSource === 'opening'
                          ? 'bg-emerald-700 text-white shadow-sm'
                          : 'bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-100/60'
                      }`}
                    >
                      Baseline Opening Demands
                    </button>
                    {Object.keys(initialDemands).map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setSelectedDiffSource(name)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                          selectedDiffSource === name
                            ? 'bg-emerald-700 text-white shadow-sm'
                            : 'bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-100/60'
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Variance Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <div className="rounded-xl border border-emerald-200 bg-white p-3.5 shadow-2xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Reallocated</p>
                  <p className="mt-1 text-lg font-extrabold text-emerald-800">
                    {totalReallocated} <span className="text-xs font-normal text-slate-500">units</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Resources shifted to meet needs</p>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-white p-3.5 shadow-2xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Increased Allocations</p>
                  <p className="mt-1 text-lg font-extrabold text-emerald-700">
                    {increasedCount} <span className="text-xs font-normal text-slate-500">resources</span>
                  </p>
                  <p className="text-[11px] text-emerald-600 mt-0.5">Secured higher shares</p>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-white p-3.5 shadow-2xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Concessions Made</p>
                  <p className="mt-1 text-lg font-extrabold text-amber-700">
                    {concededCount} <span className="text-xs font-normal text-slate-500">resources</span>
                  </p>
                  <p className="text-[11px] text-amber-600 mt-0.5">{totalConceded} units relinquished</p>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-white p-3.5 shadow-2xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Maintained Unchanged</p>
                  <p className="mt-1 text-lg font-extrabold text-slate-800">
                    {unchangedCount} <span className="text-xs font-normal text-slate-500">resources</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Preserved from opening demand</p>
                </div>
              </div>

              {/* Difference Breakdown Table */}
              <div className="overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-emerald-50/70 text-[11px] font-extrabold uppercase tracking-wider text-emerald-900 border-b border-emerald-200">
                      <tr>
                        <th className="px-4 py-3">Sector / District</th>
                        <th className="px-4 py-3">Resource Item</th>
                        <th className="px-4 py-3 text-center">Opening Demand</th>
                        <th className="px-4 py-3 text-center">Final Agreed</th>
                        <th className="px-4 py-3 text-center">Difference Occurred</th>
                        <th className="px-4 py-3 text-right">Variance Trend</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {differences.length > 0 ? (
                        differences.map((item, idx) => {
                          const isPos = item.diff > 0;
                          const isNeg = item.diff < 0;
                          return (
                            <tr
                              key={`${item.sector}-${item.resource}-${idx}`}
                              className={`transition hover:bg-slate-50/70 ${
                                isPos ? 'bg-emerald-50/30' : isNeg ? 'bg-amber-50/20' : ''
                              }`}
                            >
                              <td className="px-4 py-3 font-bold text-slate-800">
                                {item.sector}
                              </td>
                              <td className="px-4 py-3 font-semibold text-slate-700">
                                {item.resource}
                              </td>
                              <td className="px-4 py-3 text-center font-semibold text-slate-600">
                                {item.initial}
                              </td>
                              <td className="px-4 py-3 text-center font-bold text-slate-900">
                                {item.final}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-extrabold ${
                                    isPos
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : isNeg
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {isPos && <TrendingUp size={12} />}
                                  {isNeg && <TrendingDown size={12} />}
                                  {!isPos && !isNeg && <Minus size={12} />}
                                  {isPos ? `+${item.diff}` : item.diff} ({item.pct})
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span
                                  className={`font-semibold ${
                                    isPos
                                      ? 'text-emerald-700'
                                      : isNeg
                                      ? 'text-amber-700'
                                      : 'text-slate-500'
                                  }`}
                                >
                                  {isPos ? 'Increased Allocation' : isNeg ? 'Concession / Shifted' : 'Maintained'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-4 py-6 text-center text-slate-400 italic">
                            No differences recorded.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Optional Expandable Detailed Outcome Summary */}
              {outcomeAnalysis && (
                <div className="mt-6 pt-4 border-t border-emerald-200/60">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedOutcome(!showAdvancedOutcome)}
                    className="flex items-center gap-2 text-xs font-bold text-emerald-800 hover:text-emerald-900"
                  >
                    {showAdvancedOutcome ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {showAdvancedOutcome ? 'Hide Advanced Metrics & Concession Breakdown' : 'Show Advanced Metrics & Concession Breakdown'}
                  </button>

                  {showAdvancedOutcome && (
                    <div className="mt-4 space-y-4">
                      <div className="rounded-xl border border-emerald-200 bg-white p-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800 mb-3">
                          Consensus Outcome Summary
                        </h4>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                          {[
                            ['Status', outcomeAnalysis.status],
                            ['Outcome', outcomeAnalysis.outcome],
                            ['Rounds Used', outcomeAnalysis.rounds],
                            ['Agreement Round', outcomeAnalysis.agreement_terms?.agreement_round],
                            ['Unanimous Agreement', displayBoolean(outcomeAnalysis.agreement_terms?.unanimous_agreement)],
                            ['Accepted Participants', outcomeAnalysis.agreement_terms?.accepted_participants?.join(', ')],
                            ['Total Participants', outcomeAnalysis.agreement_terms?.total_participants],
                          ].map(([label, value]) => (
                            <div key={label} className="rounded-lg bg-slate-50 p-2.5">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
                              <p className="mt-0.5 font-semibold text-slate-800">{displayValue(value)}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Per-Agent Concession Patterns */}
                      {Object.entries(outcomeAnalysis.concession_patterns || {}).length > 0 && (
                        <div className="rounded-xl border border-emerald-200 bg-white p-4">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800 mb-3">
                            Participant Concession Patterns
                          </h4>
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                            {Object.entries(outcomeAnalysis.concession_patterns).map(([agentName, pattern]) => (
                              <div key={agentName} className="rounded-lg bg-slate-50 p-3">
                                <p className="font-bold text-slate-800 mb-1">{agentName}</p>
                                <p className="text-slate-600">Concessions made: <strong>{displayValue(pattern?.concession_count)}</strong></p>
                                <p className="text-slate-600">Quantity conceded: <strong>{displayValue(pattern?.total_quantity_conceded)}</strong></p>
                                <p className="text-slate-600">Contributed to agreement: <strong>{displayBoolean(pattern?.contributed_to_final_agreement)}</strong></p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

    </div>
  );
}

export default PracticeMode;