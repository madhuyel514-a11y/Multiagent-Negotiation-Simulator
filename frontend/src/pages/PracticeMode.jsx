import { useEffect, useRef, useState } from 'react';
import {
  Send,
  Check,
  X,
  ArrowLeftRight,
  RotateCcw,
} from 'lucide-react';

import { scenarios } from '../data/scenarios';

const API_URL = 'http://127.0.0.1:8000';
const MAX_ROUNDS = 5;

function PracticeMode() {
  // --------------------------------------------------
  // GET INITIAL SCENARIO
  // --------------------------------------------------

  const getInitialScenario = () => {
    try {
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
      }
    } catch (error) {
      console.error(
        'Error loading selected scenario:',
        error
      );
    }

    return scenarios[0];
  };

  const initialScenario = getInitialScenario();

  // --------------------------------------------------
  // RESOURCE HELPER
  // --------------------------------------------------

  const getResources = (scenario) => {
    if (!scenario?.resources) {
      return [
        'Water',
        'Food',
        'Medical Kits',
        'Tents',
        'Blankets',
      ];
    }

    if (Array.isArray(scenario.resources)) {
      return scenario.resources.slice(0, 5);
    }

    return Object.keys(scenario.resources).slice(0, 5);
  };

  // --------------------------------------------------
  // STATE
  // --------------------------------------------------

  const [selectedScenario, setSelectedScenario] =
    useState(initialScenario);

  const [resource, setResource] = useState(
    getResources(initialScenario)[0] || 'Water'
  );

  const [amount, setAmount] = useState('');

  const [action, setAction] = useState('Offer');

  const [message, setMessage] = useState('');

  const [messages, setMessages] = useState([
    {
      sender: 'AI Agent',
      text: 'We need to prioritize the flood victims.',
    },
  ]);

  const [round, setRound] = useState(1);

  const [status, setStatus] = useState('Your turn');

  const [sessionStatus, setSessionStatus] =
    useState('Active');

  const [sessionId, setSessionId] =
    useState(null);

  const [loading, setLoading] = useState(false);

  const autoStartRef = useRef(false);

  // --------------------------------------------------
  // START SESSION
  // --------------------------------------------------

  const startSession = async (scenario) => {
    try {
      setLoading(true);
      setStatus('Starting practice...');
      setSessionStatus('Active');

      const response = await fetch(
        `${API_URL}/api/negotiation/start`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            scenario: scenario,
            agents: scenario.agents || [],
            config: {
              max_rounds: MAX_ROUNDS,
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

      setRound(1);

      setStatus('Your turn');

      setSessionStatus('Active');

      setMessages([
        {
          sender: 'AI Agent',
          text: 'We need to prioritize the flood victims.',
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

    setSelectedScenario(scenario);

    localStorage.setItem(
      'selectedScenario',
      JSON.stringify(scenario)
    );

    const resources = getResources(scenario);

    setResource(
      resources[0] || 'Water'
    );

    setAmount('');

    setMessage('');

    setAction('Offer');

    setRound(1);

    setSessionId(null);

    setSessionStatus('Active');

    setStatus('Starting practice...');

    setMessages([
      {
        sender: 'AI Agent',
        text: 'We need to prioritize the flood victims.',
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
          },
        ]);
      }

      // Update round.
      if (data?.round !== undefined && data?.round !== null) {
        setRound(
          Math.min(
            Number(data.round),
            MAX_ROUNDS
          )
        );
      }

      // Update negotiation status.
      if (data?.consensus_reached === true) {
        setSessionStatus('Agreement reached');
        setStatus('Negotiation complete');
      } else if (data?.max_rounds_reached === true) {
        setSessionStatus('Deadlock');
        setStatus('Negotiation ended');
      } else if (data?.negotiation_ended === true) {
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
        text: 'We need to prioritize the flood victims.',
      },
    ]);

    setRound(1);

    setSessionId(null);

    setSessionStatus('Active');

    setStatus('Starting practice...');

    setMessage('');

    setAmount('');

    setAction('Offer');

    await startSession(
      selectedScenario
    );
  };

  // --------------------------------------------------
  // RESOURCES
  // --------------------------------------------------

  const resourceNames =
    getResources(selectedScenario);

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

          </div>

          <div className="flex flex-wrap gap-3">

            <span className="rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
              Round {round}/{MAX_ROUNDS}
            </span>

            <span className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
              {sessionStatus}
            </span>

          </div>

        </div>


        {/* CHAT */}

        <div className="max-h-[450px] min-h-[300px] space-y-4 overflow-y-auto p-6">

          {messages.map(
            (msg, index) => (

              <div
                key={index}
                className={`flex ${
                  msg.sender === 'You'
                    ? 'justify-end'
                    : 'justify-start'
                }`}
              >

                <div
                  className={`max-w-[80%] rounded-2xl px-5 py-3 ${
                    msg.sender === 'You'
                      ? 'bg-blue-600 text-white'
                      : msg.sender === 'System'
                      ? 'bg-red-50 text-red-700'
                      : 'bg-slate-100 text-slate-800'
                  }`}
                >

                  <p className="text-xs font-semibold opacity-70">
                    {msg.sender}
                  </p>

                  <p className="mt-1 text-sm leading-6">
                    {msg.text}
                  </p>

                </div>

              </div>

            )
          )}

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

          {/* RESOURCE / AMOUNT / ACTION */}

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
                status !== 'Your turn'
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

    </div>
  );
}

export default PracticeMode;