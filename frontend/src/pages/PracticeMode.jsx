import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Send,
  Check,
  X,
  ArrowLeftRight,
  RotateCcw,
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
    dot: 'bg-blue-600',
    text: 'text-blue-800',
    border: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-800',
  },
  ngo: {
    dot: 'bg-emerald-600',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
    badge: 'bg-emerald-100 text-emerald-800',
  },
  district: {
    dot: 'bg-purple-600',
    text: 'text-purple-800',
    border: 'border-purple-200',
    badge: 'bg-purple-100 text-purple-800',
  },
};

function getPracticeAgentStyle(agentName) {
  const value = String(agentName || '').toLowerCase();
  if (value.includes('government')) return PRACTICE_AGENT_STYLES.government;
  if (value.includes('ngo')) return PRACTICE_AGENT_STYLES.ngo;
  if (value.includes('district')) return PRACTICE_AGENT_STYLES.district;
  return {
    dot: 'bg-slate-500',
    text: 'text-slate-700',
    border: 'border-slate-200',
    badge: 'bg-slate-100 text-slate-700',
  };
}

function getPracticeActionStyle(action) {
  const value = String(action || '').toUpperCase();
  if (value === 'ACCEPT') return 'bg-emerald-100 text-emerald-800';
  if (value === 'COUNTER') return 'bg-amber-100 text-amber-800';
  if (value === 'REJECT') return 'bg-rose-100 text-rose-800';
  return 'bg-blue-100 text-blue-800';
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

  const getInitialAiMessage = (scenario) => {
    const scenarioName = scenario?.title || scenario?.name || 'this scenario';
    const objective = scenario?.objective;

    return objective
      ? `We need to coordinate ${scenarioName.toLowerCase()}: ${objective}`
      : `We need to coordinate resources for ${scenarioName}.`;
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

  const [currentProposal, setCurrentProposal] = useState({});

  const [messages, setMessages] = useState([
    {
      sender: 'AI Agent',
      text: getInitialAiMessage(initialScenario),
    },
  ]);

  const [round, setRound] = useState(1);

  const [status, setStatus] = useState('Your turn');

  const [sessionStatus, setSessionStatus] =
    useState('Active');

  const [sessionId, setSessionId] =
    useState(null);

  const [loading, setLoading] = useState(false);

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
      setStatus('Starting practice...');
      setSessionStatus('Active');

      const configuredAgents =
        (savedConfig && Array.isArray(savedConfig.agents) && savedConfig.agents.length > 0)
          ? savedConfig.agents
          : configuredScenario?.agents || [];

      const configuredResourceQuantities =
        (savedConfig && savedConfig.resourceQuantities) ||
        configuredScenario?.resourceQuantities || {};

      const configuredMaxRounds = getConfiguredMaxRounds(savedConfig);

      const response = await fetch(
        `${API_URL}/api/negotiation/start`,
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
      setCurrentProposal(data?.state?.current_proposal || {});
      setLlmMetrics(
        data?.state?.gemini_metrics || INITIAL_LLM_METRICS
      );

      setRound(1);

      setStatus('Your turn');

      setSessionStatus('Active');

      setMessages([
        {
          sender: 'AI Agent',
          text: getInitialAiMessage(configuredScenario),
        },
      ]);
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

    setMessages([
      {
        sender: 'AI Agent',
        text: getInitialAiMessage(scenario),
      },
    ]);

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

    try {
      setLoading(true);
      setStatus('AI Agent is responding...');

      const response = await fetch(
        `${API_URL}/api/practice/turn`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            session_id: sessionId,
            message: humanMessage,
            resource: resource,
            amount: amount ? Number(amount) : 0,
            action: selectedAction,
            ...(selectedAction === 'Counter Offer'
              ? { proposal: currentProposal }
              : {}),
          }),
        }
      );

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(
          `Practice turn failed: ${response.status} ${responseText}`
        );
      }

      const data = JSON.parse(responseText);
      const aiResponse = data?.ai_response || data?.ai || data;
      const latestAiTurn = aiResponse?.history?.length
        ? aiResponse.history[aiResponse.history.length - 1]
        : null;

      if (aiResponse?.current_proposal) {
        setCurrentProposal(aiResponse.current_proposal);
      }

      if (aiResponse?.gemini_metrics) {
        setLlmMetrics(aiResponse.gemini_metrics);
      }

      console.log(
        'PRACTICE TURN RESPONSE:',
        data
      );

      if (aiResponse?.message) {
        setMessages((previous) => [
          ...previous,
          {
            sender: aiResponse.agent || 'AI Agent',
            text: aiResponse.message,
            action: latestAiTurn?.action,
            stance: latestAiTurn?.stance || aiResponse.stance,
            round: latestAiTurn?.round ?? aiResponse.round,
            proposal: latestAiTurn?.parsed_proposal,
          },
        ]);
      }

      // Update round.
      if (aiResponse?.round !== undefined && aiResponse?.round !== null) {
        setRound(
          Math.min(
            Number(aiResponse.round),
            totalRounds
          )
        );
      }

      // Update negotiation status.
      if (aiResponse?.consensus_reached === true) {
        setSessionStatus('Agreement reached');
        setStatus('Negotiation complete');
      } else if (aiResponse?.max_rounds_reached === true) {
        setSessionStatus('Deadlock');
        setStatus('Negotiation ended');
      } else if (aiResponse?.negotiation_ended === true) {
        setSessionStatus('Negotiation ended');
        setStatus('Negotiation complete');
      } else {
        setSessionStatus('Active');
        setStatus('Your turn');
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
    }
  };

  // SEND BUTTON
  // --------------------------------------------------

  const handleSend = async () => {
    if (
      loading ||
      status !== 'Your turn'
    ) {
      return;
    }

    let finalMessage =
      message.trim();

    // User DOES NOT need to type anything.
    // Resource + amount is enough.

    if (!finalMessage) {
      if (
        amount &&
        Number(amount) > 0
      ) {
        finalMessage =
          `${action} ${amount} units of ${resource}.`;
      } else {
        finalMessage =
          `${action} ${resource}.`;
      }
    }

    // Show human message immediately

    setMessages((previous) => [
      ...previous,
      {
        sender: 'You',
        text: finalMessage,
        round,
      },
    ]);

    await sendToBackend(
      finalMessage,
      action
    );

    setMessage('');

    setAmount('');
  };

  // --------------------------------------------------
  // ACCEPT / REJECT / COUNTER
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

    setMessages((previous) => [
      ...previous,
      {
        sender: 'You',
        text: decision,
        round,
      },
    ]);

    await sendToBackend(
      decision,
      decision
    );
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
    setMessages([
      {
        sender: 'AI Agent',
        text: getInitialAiMessage(selectedScenario),
      },
    ]);

    setRound(1);

    setSessionId(null);

    setSessionStatus('Active');

    setStatus('Starting practice...');

    setMessage('');

    setAmount('');

    setAction('Offer');
    setCurrentProposal({});

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
    setCurrentProposal((previous) => ({
      ...previous,
      [district]: {
        ...previous[district],
        [resourceName]: value === '' ? '' : Number(value),
      },
    }));
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
              Communicate your offer and respond to the AI agent.
            </p>
            {currentSpeaker && (
              <p className="mt-2 text-sm font-semibold text-slate-700">
                Current AI agent: <span className={getPracticeAgentStyle(currentSpeaker).text}>{currentSpeaker}</span>
              </p>
            )}
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


        {/* CHAT */}

        <div className="max-h-[450px] min-h-[300px] space-y-4 overflow-y-auto p-6">

          {messages.map((msg, index) => {
            const agentStyle = getPracticeAgentStyle(msg.sender);
            const previousMessage = messages[index - 1];
            const previousProposal = previousMessage?.proposal;
            const changes = msg.action?.toUpperCase() === 'COUNTER'
              ? getProposalChanges(msg.proposal, previousProposal)
              : [];
            const isNewRound = index === 0 || msg.round !== previousMessage?.round;

            return (
              <div key={index} className="space-y-3">
                {isNewRound && (
                  <div className="flex items-center gap-3 pt-1">
                    <span className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Round {msg.round || round}</span>
                    <div className="h-px flex-1 bg-slate-200" />
                  </div>
                )}
                <div className={`flex ${msg.sender === 'You' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] rounded-2xl border px-5 py-3 ${msg.sender === 'You' ? 'border-blue-600 bg-blue-600 text-white' : msg.sender === 'System' ? 'border-red-200 bg-red-50 text-red-700' : `${agentStyle.border} bg-white text-slate-800`}`}>
                    <div className="flex items-center gap-2">
                      {msg.sender !== 'You' && msg.sender !== 'System' && <span className={`h-2.5 w-2.5 rounded-full ${agentStyle.dot}`} />}
                      <p className={`text-xs font-semibold ${msg.sender === 'You' ? 'text-blue-100' : agentStyle.text}`}>{msg.sender}</p>
                    </div>
                    {msg.action && <div className="mt-2 flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${getPracticeActionStyle(msg.action)}`}>{msg.action}</span>{msg.stance && <span className={`text-[10px] font-semibold uppercase tracking-wider ${msg.sender === 'You' ? 'text-blue-100' : 'text-slate-500'}`}>{msg.stance}</span>}</div>}
                    <p className="mt-2 text-sm leading-6">{msg.text}</p>
                    {changes.length > 0 && (
                      <div className="mt-3 border-t border-slate-200 pt-3">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">What Changed</p>
                        <div className="grid gap-1 sm:grid-cols-2">
                          {changes.map(({ path, from, to, change }) => (
                            <p key={path} className={`rounded-lg px-2 py-1 text-xs ${change > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'}`}>
                              {path}: {from} → {to} {change > 0 ? `↑ +${change}` : `↓ ${change}`}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {loading && (

            <div className="flex justify-start">

              <div className="rounded-2xl bg-slate-100 px-5 py-3">

                <p className="text-xs font-semibold text-slate-600">
                  AI Agent
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  Thinking...
                </p>

              </div>

            </div>

          )}

        </div>


        {/* INPUT AREA */}

        <div className="border-t border-slate-200 p-6">

          {Object.keys(currentProposal).length > 0 && (
            <div className="mb-6 space-y-4">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-900">
                  {sessionStatus === 'Agreement reached' ? 'Final Agreed Proposal' : 'Current Proposal'}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Proposed by:{' '}
                  <span className={`font-semibold ${getPracticeAgentStyle(proposalAuthor).text}`}>
                    {proposalAuthor}
                  </span>
                </p>
                <p className={`mt-1 text-xs ${sessionStatus === 'Agreement reached' ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {sessionStatus === 'Agreement reached'
                    ? '✓ All participants accepted this allocation.'
                    : 'Edit the allocation below to prepare your counter proposal.'}
                </p>
              </div>

              {Object.entries(currentProposal).map(
                ([district, resources]) => (
                  <div
                    key={district}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <p className="text-sm font-semibold text-slate-800">
                      {district}
                    </p>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {Object.entries(resources || {}).map(
                        ([resourceName, quantity]) => (
                          <label
                            key={`${district}-${resourceName}`}
                            className="text-xs font-medium text-slate-600"
                          >
                            {resourceName}
                            <input
                              type="number"
                              min="0"
                              value={quantity}
                              onChange={(event) =>
                                updateProposalQuantity(
                                  district,
                                  resourceName,
                                  event.target.value
                                )
                              }
                              disabled={
                                loading ||
                                status !== 'Your turn'
                              }
                              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 disabled:bg-slate-100"
                            />
                          </label>
                        )
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {/* RESOURCE / AMOUNT / ACTION */}

          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
            Your Response
          </p>

          <div className="mb-4 grid gap-3 sm:grid-cols-3">

            <select
              value={resource}
              onChange={(event) =>
                setResource(
                  event.target.value
                )
              }
              disabled={
                loading ||
                status !== 'Your turn'
              }
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100"
            >

              {resourceNames
                .slice(0, 5)
                .map((item) => (
                  <option
                    key={item}
                    value={item}
                  >
                    {item}
                  </option>
                ))}

            </select>


            <input
              type="number"
              min="1"
              value={amount}
              onChange={(event) =>
                setAmount(
                  event.target.value
                )
              }
              disabled={
                loading ||
                !sessionId ||
                sessionStatus === 'Agreement reached' ||
                sessionStatus === 'Deadlock' ||
                sessionStatus === 'Negotiation ended'
              }
              placeholder="Amount"
              className="rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100"
            />


            <select
              value={action}
              onChange={(event) =>
                setAction(
                  event.target.value
                )
              }
              disabled={
                loading ||
                status !== 'Your turn'
              }
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100"
            >

              <option value="Offer">
                Offer
              </option>

              <option value="Request">
                Request
              </option>

            </select>

          </div>


          {/* MESSAGE */}

          <div className="flex gap-3">

            <input
              type="text"
              value={message}
              onChange={(event) =>
                setMessage(
                  event.target.value
                )
              }
              onKeyDown={
                handleKeyDown
              }
              disabled={
                loading ||
                status !== 'Your turn'
              }
              placeholder="Type your offer or response..."
              className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-500 disabled:bg-slate-100"
            />


            <button
              type="button"
              onClick={handleSend}
              disabled={
                loading ||
                status !== 'Your turn'
              }
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >

              <Send size={16} />

              Send

            </button>

          </div>


          <p className="mt-2 text-xs text-slate-400">
            You can send a resource proposal without typing a message.
          </p>


          {/* DECISION BUTTONS */}

          <div className="mt-4 flex flex-wrap gap-3">

            <button
              type="button"
              onClick={() =>
                handleDecision(
                  'Accept Offer'
                )
              }
              disabled={
                loading ||
                status !== 'Your turn'
              }
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >

              <Check size={16} />

              Accept Offer

            </button>


            <button
              type="button"
              onClick={() =>
                handleDecision(
                  'Reject Offer'
                )
              }
              disabled={
                loading ||
                status !== 'Your turn'
              }
              className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
            >

              <X size={16} />

              Reject Offer

            </button>


            <button
              type="button"
              onClick={() =>
                handleDecision(
                  'Counter Offer'
                )
              }
              disabled={
                loading ||
                status !== 'Your turn'
              }
              className="inline-flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
            >

              <ArrowLeftRight
                size={16}
              />

              Counter Offer

            </button>

          </div>


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

    </div>
  );
}

export default PracticeMode;