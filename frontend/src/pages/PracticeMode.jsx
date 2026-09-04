import { useEffect, useRef, useState } from 'react';
import {
  Send,
  Check,
  X,
  ArrowLeftRight,
  RotateCcw,
  Activity,
  Database,
  BrainCircuit,
  Cpu,
  MessageSquareText,
  Clock,
  Zap,
  ChevronDown,
} from 'lucide-react';

const API_URL = 'http://127.0.0.1:8000';

function PracticeMode() {
  // =======================================================
  // LOAD NEGOTIATION CONFIGURATION
  // =======================================================

  const getNegotiationConfig = () => {
    try {
      const storedConfig = localStorage.getItem('negotiationConfig');

      if (storedConfig) {
        const parsed = JSON.parse(storedConfig);

        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }
    } catch (error) {
      console.error(
        'Error loading negotiation configuration:',
        error
      );
    }

    return null;
  };

  const initialConfig = getNegotiationConfig();

  const initialScenario =
    initialConfig?.scenario || null;

  const initialAgents =
    Array.isArray(initialConfig?.agents)
      ? initialConfig.agents
      : [];

  const initialMaxRounds =
    Number(initialConfig?.max_rounds) > 0
      ? Number(initialConfig.max_rounds)
      : 5;

  const initialResourceQuantities =
    initialConfig?.resourceQuantities || {
      Food: 500,
      Medicine: 200,
      'Rescue Boats': 25,
      'Temporary Shelters': 150,
      'Emergency Supplies': 300,
    };

  // =======================================================
  // RESOURCE HELPER
  // =======================================================

  const getResourceNames = (resources) => {
    const names = Object.keys(resources || {});

    if (names.length > 0) {
      return names;
    }

    return [
      'Food',
      'Medicine',
      'Rescue Boats',
      'Temporary Shelters',
      'Emergency Supplies',
    ];
  };

  const initialResources =
    getResourceNames(initialResourceQuantities);

  // =======================================================
  // STATE
  // =======================================================

  const [selectedScenario] =
    useState(initialScenario);

  const [agents] =
    useState(initialAgents);

  const [maxRounds] =
    useState(initialMaxRounds);

  const [
    resourceQuantities,
    setResourceQuantities,
  ] = useState(initialResourceQuantities);

  const [resource, setResource] =
    useState(initialResources[0] || 'Food');

  const [amount, setAmount] =
    useState('');

  const [action, setAction] =
    useState('Offer');

  const [message, setMessage] =
    useState('');

  const [transcript, setTranscript] =
    useState([]);

  const [round, setRound] =
    useState(1);

  const [status, setStatus] =
    useState('Starting negotiation...');

  const [sessionStatus, setSessionStatus] =
    useState('Active');

  const [sessionId, setSessionId] =
    useState(null);

  const [loading, setLoading] =
    useState(false);

  const [currentProposal, setCurrentProposal] =
    useState(null);

  const [apiRequests, setApiRequests] =
    useState(0);

  const [inputTokens, setInputTokens] =
    useState(0);

  const [outputTokens, setOutputTokens] =
    useState(0);

  const [totalLatency, setTotalLatency] =
    useState(0);

  const [backendConnected, setBackendConnected] =
    useState(false);

  const autoStartRef =
    useRef(false);

  const transcriptEndRef =
    useRef(null);

  // =======================================================
  // AUTO SCROLL
  // =======================================================

  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({
        behavior: 'smooth',
      });
    }
  }, [transcript, loading]);

  // =======================================================
  // FORMAT ACTION
  // =======================================================

  const normalizeAction = (
    value = 'PROPOSE'
  ) => {
    const upper =
      String(value).toUpperCase();

    if (upper.includes('COUNTER')) {
      return 'COUNTER';
    }

    if (upper.includes('ACCEPT')) {
      return 'ACCEPT';
    }

    if (upper.includes('REJECT')) {
      return 'REJECT';
    }

    if (upper.includes('REQUEST')) {
      return 'REQUEST';
    }

    if (upper.includes('OFFER')) {
      return 'PROPOSE';
    }

    if (upper.includes('PROPOSE')) {
      return 'PROPOSE';
    }

    return upper || 'PROPOSE';
  };

  // =======================================================
  // AGENT DISPLAY NAME
  // =======================================================

  const getAgentName = (name) => {
    if (!name) {
      return 'AI AGENT';
    }

    return String(name)
      .replace(/_/g, ' ')
      .toUpperCase();
  };

  // =======================================================
  // AGENT THEME
  // =======================================================

  const getAgentTheme = (agentName) => {
    const name =
      String(agentName || '').toLowerCase();

    if (name.includes('government')) {
      return {
        header:
          'bg-gradient-to-r from-blue-700 to-blue-600',
        border:
          'border-blue-200',
        dot:
          'bg-blue-600',
      };
    }

    if (name.includes('ngo')) {
      return {
        header:
          'bg-gradient-to-r from-emerald-700 to-emerald-600',
        border:
          'border-emerald-200',
        dot:
          'bg-emerald-600',
      };
    }

    if (name.includes('district')) {
      return {
        header:
          'bg-gradient-to-r from-amber-600 to-orange-500',
        border:
          'border-amber-200',
        dot:
          'bg-amber-500',
      };
    }

    if (name === 'you') {
      return {
        header:
          'bg-gradient-to-r from-violet-700 to-purple-600',
        border:
          'border-violet-200',
        dot:
          'bg-violet-600',
      };
    }

    return {
      header:
        'bg-gradient-to-r from-slate-700 to-slate-600',
      border:
        'border-slate-200',
      dot:
        'bg-slate-500',
    };
  };

  // =======================================================
  // EXTRACT PROPOSAL
  // =======================================================

  const extractProposal = (data) => {
    if (!data) return null;

    return (
      data?.current_proposal ||
      data?.proposal ||
      data?.full_allocation ||
      data?.ai_response?.current_proposal ||
      data?.ai_response?.proposal ||
      data?.ai_response?.full_allocation ||
      null
    );
  };

  // =======================================================
  // ADD TRANSCRIPT ITEM
  // =======================================================

  const addTranscriptItem = ({
    sender,
    actionType,
    text,
    proposal = null,
    roundNumber,
  }) => {
    setTranscript((previous) => [
      ...previous,
      {
        id: `${Date.now()}-${Math.random()}`,
        sender: sender || 'AI Agent',
        action: normalizeAction(actionType),
        text:
          text ||
          'No response message available.',
        proposal,
        round: roundNumber || round,
      },
    ]);
  };

  // =======================================================
  // START SESSION
  // =======================================================

  const startSession = async () => {
    if (!selectedScenario) {
      setTranscript([
        {
          id: `config-error-${Date.now()}`,
          sender: 'System',
          action: 'SYSTEM',
          text:
            'No negotiation configuration found. Please configure the scenario first.',
          proposal: null,
          round: 1,
        },
      ]);

      setStatus('Configuration missing');
      setSessionStatus('Inactive');

      return;
    }

    try {
      setLoading(true);
      setStatus('Starting negotiation...');
      setSessionStatus('Active');

      const response = await fetch(
        `${API_URL}/api/negotiation/start`,
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({
            scenario: selectedScenario,
            agents: agents,
            config: {
              max_rounds: maxRounds,
              resourceQuantities:
                resourceQuantities,
            },
          }),
        }
      );

      const responseText =
        await response.text();

      if (!response.ok) {
        throw new Error(
          `Start session failed: ${response.status} ${responseText}`
        );
      }

      const data =
        JSON.parse(responseText);

      console.log(
        'SESSION START RESPONSE:',
        data
      );

      if (!data?.session_id) {
        throw new Error(
          'Backend did not return session_id.'
        );
      }

      setSessionId(data.session_id);

      const backendRound =
        Number(data?.round) ||
        1;

      setRound(backendRound);

      const proposal =
        extractProposal(data);

      if (proposal) {
        setCurrentProposal(proposal);
      }

      if (data?.resourceQuantities) {
        setResourceQuantities(
          data.resourceQuantities
        );
      }

      setBackendConnected(true);

      // IMPORTANT:
      // Enable buttons after session starts
      setStatus('Your turn');

      setSessionStatus('Active');

      setTranscript([
        {
          id: `session-${Date.now()}`,
          sender: 'System',
          action: 'SYSTEM',
          text:
            data?.message ||
            'Negotiation session started successfully. You can now make your proposal.',
          proposal: null,
          round: backendRound,
        },
      ]);
    } catch (error) {
      console.error(
        'Start session error:',
        error
      );

      setSessionId(null);

      setBackendConnected(false);

      setStatus('Backend unavailable');

      setSessionStatus('Inactive');

      setTranscript([
        {
          id: `error-${Date.now()}`,
          sender: 'System',
          action: 'ERROR',
          text:
            `Could not start negotiation: ${error.message}`,
          proposal: null,
          round: 1,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // =======================================================
  // AUTO START
  // =======================================================

  useEffect(() => {
    if (autoStartRef.current) {
      return;
    }

    autoStartRef.current = true;

    startSession();
  }, []);

  // =======================================================
  // SEND TO BACKEND
  // =======================================================

  const sendToBackend = async (
    humanMessage,
    selectedAction,
    selectedResource = resource,
    selectedAmount = amount
  ) => {
    if (!sessionId) {
      addTranscriptItem({
        sender: 'System',
        actionType: 'ERROR',
        text:
          'No active negotiation session. Please start a new negotiation.',
      });

      return;
    }

    try {
      setLoading(true);

      setStatus(
        'AI Agent is responding...'
      );

      const startTime =
        performance.now();

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
            resource: selectedResource,
            amount:
              selectedAmount &&
              Number(selectedAmount) > 0
                ? Number(selectedAmount)
                : 0,
            action: selectedAction,
          }),
        }
      );

      const endTime =
        performance.now();

      const latency =
        (endTime - startTime) / 1000;

      setTotalLatency(
        (previous) =>
          previous + latency
      );

      setApiRequests(
        (previous) =>
          previous + 1
      );

      const responseText =
        await response.text();

      if (!response.ok) {
        if (response.status === 404) {
          setSessionId(null);
          setSessionStatus('Inactive');
          setStatus('Session expired');
        }

        throw new Error(
          `Practice turn failed: ${response.status} ${responseText}`
        );
      }

      const data =
        JSON.parse(responseText);

      console.log(
        'PRACTICE TURN RESPONSE:',
        data
      );

      setBackendConnected(true);

      const aiResponse =
        data?.ai_response ||
        data?.response ||
        data;

      // ===================================================
      // ROUND HANDLING
      // ===================================================

      let backendRound =
        Number(
          data?.round ??
          aiResponse?.round
        );

      if (
        !backendRound ||
        backendRound < 1
      ) {
        backendRound = round;
      }

      if (
        backendRound > maxRounds
      ) {
        backendRound = maxRounds;
      }

      setRound(backendRound);

      // ===================================================
      // PROPOSAL
      // ===================================================

      const proposal =
        extractProposal(data);

      if (proposal) {
        setCurrentProposal(proposal);
      }

      // ===================================================
      // RESOURCES
      // ===================================================

      const updatedResources =
        data?.resourceQuantities ||
        data?.resources ||
        aiResponse?.resourceQuantities ||
        aiResponse?.resources;

      if (updatedResources) {
        setResourceQuantities(
          updatedResources
        );
      }

      // ===================================================
      // TOKENS
      // ===================================================

      const newInputTokens =
        data?.input_tokens ??
        aiResponse?.input_tokens ??
        0;

      const newOutputTokens =
        data?.output_tokens ??
        aiResponse?.output_tokens ??
        0;

      if (Number(newInputTokens) > 0) {
        setInputTokens(
          (previous) =>
            previous +
            Number(newInputTokens)
        );
      }

      if (Number(newOutputTokens) > 0) {
        setOutputTokens(
          (previous) =>
            previous +
            Number(newOutputTokens)
        );
      }

      // ===================================================
      // AI RESPONSE MESSAGE
      // ===================================================

      const aiMessage =
        aiResponse?.message ||
        aiResponse?.text ||
        data?.message;

      if (aiMessage) {
        addTranscriptItem({
          sender:
            aiResponse?.agent ||
            aiResponse?.sender ||
            data?.agent ||
            data?.sender ||
            'AI Agent',

          actionType:
            aiResponse?.action ||
            data?.action ||
            'PROPOSE',

          text: aiMessage,

          proposal,

          roundNumber:
            backendRound,
        });
      }

      // ===================================================
      // NEGOTIATION STATUS
      // ===================================================

      const consensusReached =
        data?.consensus_reached === true ||
        aiResponse?.consensus_reached === true;

      const maxRoundsReached =
        data?.max_rounds_reached === true ||
        aiResponse?.max_rounds_reached === true;

      const negotiationEnded =
        data?.negotiation_ended === true ||
        aiResponse?.negotiation_ended === true;

      if (consensusReached) {
        setSessionStatus(
          'Agreement reached'
        );

        setStatus(
          'Negotiation complete'
        );
      } else if (
        maxRoundsReached
      ) {
        setSessionStatus(
          'Deadlock'
        );

        setStatus(
          'Negotiation ended'
        );
      } else if (
        negotiationEnded
      ) {
        setSessionStatus(
          'Negotiation ended'
        );

        setStatus(
          'Negotiation complete'
        );
      } else if (
        backendRound >= maxRounds
      ) {
        setSessionStatus(
          'Deadlock'
        );

        setStatus(
          'Negotiation ended'
        );
      } else {
        // IMPORTANT:
        // THIS ENABLES THE BUTTONS AGAIN
        setSessionStatus('Active');

        setStatus('Your turn');
      }
    } catch (error) {
      console.error(
        'Negotiation turn error:',
        error
      );

      addTranscriptItem({
        sender: 'System',
        actionType: 'ERROR',
        text:
          `Negotiation error: ${error.message}`,
      });

      setBackendConnected(false);

      // Allow user to try again
      if (sessionId) {
        setStatus('Your turn');
      } else {
        setStatus('Connection error');
      }
    } finally {
      setLoading(false);
    }
  };

  // =======================================================
  // SEND OFFER / REQUEST
  // =======================================================

  const handleSend = async () => {
    if (
      loading ||
      status !== 'Your turn'
    ) {
      return;
    }

    let finalMessage =
      message.trim();

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

    addTranscriptItem({
      sender: 'You',
      actionType: action,
      text: finalMessage,
      proposal: null,
      roundNumber: round,
    });

    await sendToBackend(
      finalMessage,
      action,
      resource,
      amount
    );

    setMessage('');
    setAmount('');
  };

  // =======================================================
  // ACCEPT / REJECT / COUNTER
  // =======================================================

  const handleDecision = async (
    decision
  ) => {
    if (
      loading ||
      status !== 'Your turn'
    ) {
      return;
    }

    let backendAction =
      decision;

    let decisionMessage =
      decision;

    if (decision === 'Accept Offer') {
      backendAction = 'ACCEPT';

      decisionMessage =
        'I accept the current proposal.';
    }

    if (decision === 'Reject Offer') {
      backendAction = 'REJECT';

      decisionMessage =
        'I reject the current proposal.';
    }

    if (decision === 'Counter Offer') {
      backendAction = 'COUNTER';

      decisionMessage =
        'I would like to make a counter proposal.';
    }

    addTranscriptItem({
      sender: 'You',
      actionType: backendAction,
      text: decisionMessage,
      proposal: null,
      roundNumber: round,
    });

    await sendToBackend(
      decisionMessage,
      backendAction,
      resource,
      amount
    );
  };

  // =======================================================
  // ENTER KEY
  // =======================================================

  const handleKeyDown = (
    event
  ) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey
    ) {
      event.preventDefault();

      handleSend();
    }
  };

  // =======================================================
  // NEW NEGOTIATION
  // =======================================================

  const handleNewNegotiation =
    async () => {
      setTranscript([]);

      setRound(1);

      setSessionId(null);

      setSessionStatus('Active');

      setStatus(
        'Starting negotiation...'
      );

      setMessage('');

      setAmount('');

      setAction('Offer');

      setCurrentProposal(null);

      setApiRequests(0);

      setInputTokens(0);

      setOutputTokens(0);

      setTotalLatency(0);

      await startSession();
    };

  // =======================================================
  // RESOURCE LIST
  // =======================================================

  const resourceNames =
    getResourceNames(
      resourceQuantities
    );

  // =======================================================
  // METRICS
  // =======================================================

  const totalTokens =
    inputTokens + outputTokens;

  const averageLatency =
    apiRequests > 0
      ? (
          totalLatency /
          apiRequests
        ).toFixed(2)
      : '0.00';

  // =======================================================
  // PROPOSAL DISPLAY
  // =======================================================

  const ProposalDisplay = ({
    proposal,
  }) => {
    if (!proposal) {
      return null;
    }

    const entries =
      Object.entries(proposal);

    const hasNestedObjects =
      entries.some(
        ([, value]) =>
          value &&
          typeof value === 'object' &&
          !Array.isArray(value)
      );

    if (hasNestedObjects) {
      return (
        <div className="mt-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            Proposed Allocation
          </p>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {entries.map(
              ([agentName, resources]) => (
                <div
                  key={agentName}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <h4 className="mb-3 text-sm font-bold text-slate-800">
                    {agentName}
                  </h4>

                  <div className="flex flex-wrap gap-2">
                    {Object.entries(
                      resources || {}
                    ).map(
                      ([
                        resourceName,
                        value,
                      ]) => (
                        <span
                          key={resourceName}
                          className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"
                        >
                          {resourceName}: {value}
                        </span>
                      )
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="mt-5">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
          Proposed Allocation
        </p>

        <div className="flex flex-wrap gap-2">
          {entries.map(
            ([resourceName, value]) => (
              <span
                key={resourceName}
                className="rounded-full bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"
              >
                {resourceName}: {value}
              </span>
            )
          )}
        </div>
      </div>
    );
  };

  // =======================================================
  // TRANSCRIPT CARD
  // =======================================================

  const TranscriptCard = ({
    item,
  }) => {
    const theme =
      getAgentTheme(item.sender);

    const isSystem =
      item.sender === 'System';

    if (isSystem) {
      return (
        <div className="relative ml-7 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <div className="absolute -left-[34px] top-6 h-4 w-4 rounded-full border-4 border-white bg-slate-400 shadow" />

          <p className="text-sm font-semibold text-slate-700">
            SYSTEM
          </p>

          <p className="mt-2 text-sm leading-7 text-slate-600">
            {item.text}
          </p>
        </div>
      );
    }

    return (
      <div className="relative ml-7">
        <div
          className={`absolute -left-[34px] top-5 h-4 w-4 rounded-full border-4 border-white shadow ${theme.dot}`}
        />

        <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
          Round {item.round} —{' '}
          {getAgentName(item.sender)}
        </p>

        <div
          className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${theme.border}`}
        >
          <div
            className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-white ${theme.header}`}
          >
            <div className="flex items-center gap-3">
              <MessageSquareText size={18} />

              <h3 className="text-sm font-bold uppercase tracking-wide">
                {getAgentName(item.sender)}
              </h3>
            </div>

            <span className="rounded-md bg-white/90 px-3 py-1 text-xs font-bold text-slate-700">
              {item.action}
            </span>
          </div>

          <div className="p-5">
            <p className="whitespace-pre-line text-sm leading-7 text-slate-700">
              {item.text}
            </p>

            <ProposalDisplay
              proposal={item.proposal}
            />
          </div>
        </div>
      </div>
    );
  };

  // =======================================================
  // MAIN UI
  // =======================================================

  return (
    <div className="min-h-screen bg-slate-50">

      {/* PAGE HEADER */}

      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1500px] px-6 py-6 lg:px-8">

          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">

            <div>
              <div className="flex items-center gap-3">

                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg">
                  <BrainCircuit size={23} />
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
                    Human Participant
                  </p>

                  <h1 className="text-2xl font-bold text-slate-900">
                    Disaster Relief Negotiation
                  </h1>
                </div>
              </div>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
                Practice resource allocation negotiation with
                multiple AI agents and track proposals in
                real time.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">
                  Round
                </p>

                <p className="font-bold text-slate-900">
                  {round}/{maxRounds}
                </p>
              </div>

              <div className="rounded-xl bg-blue-50 px-4 py-3">
                <p className="text-xs text-slate-500">
                  Session Status
                </p>

                <p className="font-bold text-blue-700">
                  {sessionStatus}
                </p>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* SCENARIO */}

      <div className="mx-auto max-w-[1500px] px-6 pt-6 lg:px-8">

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            Active Scenario
          </p>

          <h2 className="mt-2 text-xl font-bold text-slate-900">
            {selectedScenario?.title ||
              selectedScenario?.name ||
              'Flood Relief Resource Allocation'}
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            {selectedScenario?.objective ||
              'Fairly allocate limited emergency resources while prioritizing life-saving operations.'}
          </p>

          {agents.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-3">

              {agents.map((agent) => (
                <div
                  key={agent.id || agent.name}
                  className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2"
                >
                  <span className="h-2 w-2 rounded-full bg-amber-400" />

                  <span className="text-sm font-semibold text-slate-700">
                    {agent.name}
                  </span>

                  <span className="text-sm text-slate-400">
                    —
                  </span>

                  <span className="text-sm text-slate-500">
                    {agent.personality}
                  </span>
                </div>
              ))}

            </div>
          )}

        </div>
      </div>

      {/* MAIN DASHBOARD */}

      <div className="mx-auto grid max-w-[1500px] gap-6 px-6 py-6 xl:grid-cols-[minmax(0,1fr)_380px] lg:px-8">

        {/* LEFT */}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">

            <div className="flex items-center gap-3">

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Activity size={20} />
              </div>

              <div>
                <h2 className="font-bold text-slate-900">
                  Negotiation Transcript
                </h2>

                <p className="text-sm text-slate-500">
                  Live negotiation history
                </p>
              </div>

            </div>

            <span className="text-sm font-semibold text-slate-500">
              {transcript.length} turns
            </span>

          </div>

          <div className="max-h-[850px] overflow-y-auto p-6">

            <div className="relative border-l-2 border-slate-200 pl-1">

              <div className="space-y-8">

                {transcript.length === 0 && (
                  <div className="ml-7 rounded-xl bg-slate-50 p-8 text-center">

                    <MessageSquareText
                      className="mx-auto text-slate-400"
                      size={32}
                    />

                    <p className="mt-3 font-semibold text-slate-600">
                      Waiting for negotiation...
                    </p>

                  </div>
                )}

                {transcript.map((item) => (
                  <TranscriptCard
                    key={item.id}
                    item={item}
                  />
                ))}

                {loading && (
                  <div className="relative ml-7">

                    <div className="absolute -left-[34px] top-4 h-4 w-4 animate-pulse rounded-full border-4 border-white bg-blue-500 shadow" />

                    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">

                      <div className="flex items-center gap-3">

                        <div className="h-3 w-3 animate-pulse rounded-full bg-blue-600" />

                        <div>
                          <p className="font-semibold text-blue-800">
                            AI Agents are negotiating...
                          </p>

                          <p className="mt-1 text-sm text-blue-600">
                            Processing the next response.
                          </p>
                        </div>

                      </div>

                    </div>
                  </div>
                )}

                <div ref={transcriptEndRef} />

              </div>
            </div>
          </div>

          {/* INPUT */}

          <div className="border-t border-slate-200 bg-slate-50 p-6">

            <div className="mb-4 flex items-center justify-between">

              <div>
                <h3 className="font-bold text-slate-800">
                  Your Response
                </h3>

                <p className="text-sm text-slate-500">
                  Make an offer or respond to the current proposal.
                </p>
              </div>

              <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm">
                {status}
              </span>

            </div>

            <div className="grid gap-3 md:grid-cols-3">

              <div className="relative">

                <select
                  value={resource}
                  onChange={(event) =>
                    setResource(event.target.value)
                  }
                  disabled={
                    loading ||
                    status !== 'Your turn'
                  }
                  className="w-full appearance-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-blue-500 disabled:bg-slate-100"
                >
                  {resourceNames.map((item) => (
                    <option
                      key={item}
                      value={item}
                    >
                      {item}
                    </option>
                  ))}
                </select>

                <ChevronDown
                  size={16}
                  className="pointer-events-none absolute right-4 top-3.5 text-slate-400"
                />

              </div>

              <input
                type="number"
                min="1"
                value={amount}
                onChange={(event) =>
                  setAmount(event.target.value)
                }
                disabled={
                  loading ||
                  status !== 'Your turn'
                }
                placeholder="Amount"
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100"
              />

              <select
                value={action}
                onChange={(event) =>
                  setAction(event.target.value)
                }
                disabled={
                  loading ||
                  status !== 'Your turn'
                }
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-blue-500 disabled:bg-slate-100"
              >
                <option value="Offer">
                  Offer
                </option>

                <option value="Request">
                  Request
                </option>
              </select>

            </div>

            <div className="mt-3 flex gap-3">

              <input
                type="text"
                value={message}
                onChange={(event) =>
                  setMessage(event.target.value)
                }
                onKeyDown={handleKeyDown}
                disabled={
                  loading ||
                  status !== 'Your turn'
                }
                placeholder="Explain your proposal or response..."
                className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 disabled:bg-slate-100"
              />

              <button
                type="button"
                onClick={handleSend}
                disabled={
                  loading ||
                  status !== 'Your turn'
                }
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send size={17} />
                Send
              </button>

            </div>

            <div className="mt-4 flex flex-wrap gap-3">

              <button
                type="button"
                onClick={() =>
                  handleDecision('Accept Offer')
                }
                disabled={
                  loading ||
                  status !== 'Your turn'
                }
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
              >
                <Check size={17} />
                Accept Offer
              </button>

              <button
                type="button"
                onClick={() =>
                  handleDecision('Reject Offer')
                }
                disabled={
                  loading ||
                  status !== 'Your turn'
                }
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
              >
                <X size={17} />
                Reject Offer
              </button>

              <button
                type="button"
                onClick={() =>
                  handleDecision('Counter Offer')
                }
                disabled={
                  loading ||
                  status !== 'Your turn'
                }
                className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
              >
                <ArrowLeftRight size={17} />
                Counter Offer
              </button>

            </div>

            {(sessionStatus === 'Agreement reached' ||
              sessionStatus === 'Deadlock' ||
              sessionStatus === 'Negotiation ended' ||
              sessionStatus === 'Inactive') && (

              <div className="mt-5 border-t border-slate-200 pt-5">

                <button
                  type="button"
                  onClick={handleNewNegotiation}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  <RotateCcw size={17} />
                  Start New Negotiation
                </button>

              </div>
            )}

          </div>

        </section>

        {/* RIGHT DASHBOARD */}

        <aside className="space-y-6">

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

            <div className="flex items-center gap-3">

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Database size={20} />
              </div>

              <h2 className="font-bold text-slate-900">
                Resources Available
              </h2>

            </div>

            <div className="mt-5 space-y-3">

              {resourceNames.map((item) => (
                <div
                  key={item}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3"
                >
                  <span className="text-sm font-semibold text-slate-600">
                    {item}
                  </span>

                  <span className="text-sm font-bold text-blue-700">
                    {resourceQuantities[item] ?? 0} units
                  </span>

                </div>
              ))}

            </div>

          </section>

          {currentProposal && (

            <section className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">

              <div className="flex items-center gap-3">

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <MessageSquareText size={20} />
                </div>

                <h2 className="font-bold text-slate-900">
                  Current Proposal
                </h2>

              </div>

              <div className="mt-5">

                <ProposalDisplay
                  proposal={currentProposal}
                />

              </div>

            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

            <div className="flex items-center gap-3">

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Cpu size={20} />
              </div>

              <h2 className="font-bold text-slate-900">
                System Status
              </h2>

            </div>

            <div className="mt-5 space-y-3">

              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">

                <span className="text-sm font-medium text-slate-600">
                  FastAPI Backend
                </span>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    backendConnected
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  {backendConnected
                    ? 'Connected'
                    : 'Offline'}
                </span>

              </div>

              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">

                <span className="text-sm font-medium text-slate-600">
                  Negotiation Orchestrator
                </span>

                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                  Active
                </span>

              </div>

              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">

                <span className="text-sm font-medium text-slate-600">
                  Gemini AI
                </span>

                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                  Enabled
                </span>

              </div>

            </div>

          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

            <div className="flex items-center gap-3">

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-600">
                <Zap size={20} />
              </div>

              <h2 className="font-bold text-slate-900">
                LLM Metrics
              </h2>

            </div>

            <div className="mt-5 space-y-3">

              <Metric
                label="API Requests"
                value={apiRequests}
              />

              <Metric
                label="Input Tokens"
                value={inputTokens}
              />

              <Metric
                label="Output Tokens"
                value={outputTokens}
              />

              <Metric
                label="Total Tokens"
                value={totalTokens}
              />

              <Metric
                label="Average Latency"
                value={`${averageLatency}s`}
                icon={<Clock size={14} />}
              />

              <Metric
                label="Total API Latency"
                value={`${totalLatency.toFixed(2)}s`}
              />

            </div>

          </section>

        </aside>

      </div>

    </div>
  );
}

function Metric({
  label,
  value,
  icon,
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">

      <span className="flex items-center gap-2 text-sm text-slate-600">
        {icon}
        {label}
      </span>

      <span className="font-bold text-slate-900">
        {value}
      </span>

    </div>
  );
}

export default PracticeMode;