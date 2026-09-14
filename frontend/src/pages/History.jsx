import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, CheckCircle2, Clock3, Trash2, Users, X, XCircle } from 'lucide-react';

const API_BASE = 'http://127.0.0.1:8000';

function statusBadge(status) {
  const map = {
    agreement_reached: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    negotiation_breakdown: 'bg-rose-50 text-rose-700 border-rose-200',
    deadlock_no_consensus: 'bg-amber-50 text-amber-700 border-amber-200',
    ongoing: 'bg-blue-50 text-blue-700 border-blue-200',
  };
  const label = (status || 'unknown').replaceAll('_', ' ');
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${map[status] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {label}
    </span>
  );
}

function formatDate(iso) {
  if (!iso) return 'Unknown date';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function ProposalPill({ resource, amount }) {
  return (
    <span className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
      {resource}: {amount}
    </span>
  );
}

function isNestedAllocation(proposal) {
  return proposal && typeof proposal === 'object' && Object.values(proposal).some(
    (value) => value && typeof value === 'object' && !Array.isArray(value)
  );
}

function flattenProposal(proposal, prefix = '') {
  if (!proposal || typeof proposal !== 'object') return {};
  return Object.entries(proposal).reduce((paths, [key, value]) => {
    const path = prefix ? `${prefix}/${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return { ...paths, ...flattenProposal(value, path) };
    }
    paths[path] = value;
    return paths;
  }, {});
}

function proposalDelta(previous, current) {
  const before = flattenProposal(previous);
  const after = flattenProposal(current);
  const increased = {};
  const decreased = {};

  Object.keys({ ...before, ...after }).forEach((path) => {
    const change = Number(after[path] ?? 0) - Number(before[path] ?? 0);
    if (change > 0) increased[path] = change;
    if (change < 0) decreased[path] = Math.abs(change);
  });

  return { increased, decreased };
}

function AllocationView({ proposal }) {
  if (!proposal || typeof proposal !== 'object' || Object.keys(proposal).length === 0) {
    return <p className="text-sm text-slate-400">No allocation recorded.</p>;
  }

  if (!isNestedAllocation(proposal)) {
    return (
      <div className="flex flex-wrap gap-2">
        {Object.entries(proposal).map(([resource, amount]) => (
          <ProposalPill key={resource} resource={resource} amount={amount} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Object.entries(proposal).map(([area, resources]) => (
        <div key={area} className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{area}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(resources || {}).map(([resource, amount]) => (
              <ProposalPill key={`${area}-${resource}`} resource={resource} amount={amount} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChangeList({ title, changes, positive }) {
  const entries = Object.entries(changes || {});
  return (
    <div>
      <p className={`text-[10px] font-bold uppercase tracking-wider ${positive ? 'text-emerald-700' : 'text-rose-700'}`}>
        {title}
      </p>
      {entries.length > 0 ? (
        <div className="mt-2 space-y-1">
          {entries.map(([path, amount]) => (
            <p key={path} className="flex items-center gap-1.5 text-xs text-slate-600">
              {positive ? <ArrowUp size={13} className="text-emerald-600" /> : <ArrowDown size={13} className="text-rose-600" />}
              {path}: {amount}
            </p>
          ))}
        </div>
      ) : <p className="mt-2 text-xs text-slate-400">None</p>}
    </div>
  );
}

function HistoryTurn({ turn, previousProposal }) {
  const proposal = turn.parsed_proposal || turn.incoming_proposal;
  const action = String(turn.action || 'N/A').toUpperCase();
  const changes = action === 'OFFER' || action === 'COUNTER'
    ? proposalDelta(previousProposal, turn.parsed_proposal)
    : { increased: {}, decreased: {} };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-blue-600 px-2.5 py-1 text-xs font-bold text-white">
            Round {turn.round ?? '?'}
          </span>
          <span className="text-sm font-semibold text-slate-800">{turn.agent || 'Unknown'}</span>
        </div>
        <span className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-slate-500">
          {action}
        </span>
      </div>

      {turn.message && (
        <p className="mt-2 text-sm text-slate-600">{turn.message}</p>
      )}

      {turn.reasoning && (
        <p className="mt-2 border-l-2 border-slate-300 pl-3 text-xs italic text-slate-500">
          {turn.reasoning}
        </p>
      )}

      {proposal && Object.keys(proposal).length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Proposal / allocation</p>
          <AllocationView proposal={proposal} />
        </div>
      )}

      {(Object.keys(changes.increased).length > 0 || Object.keys(changes.decreased).length > 0) && (
        <div className="mt-4 grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-2">
          <ChangeList title="Increases" changes={changes.increased} positive />
          <ChangeList title="Decreases / concessions" changes={changes.decreased} positive={false} />
        </div>
      )}
    </div>
  );
}

function DetailStat({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-800">{value ?? 'Not available'}</p>
    </div>
  );
}

function displayStatus(status) {
  return String(status || 'unknown').replaceAll('_', ' ');
}

function DetailModal({ sessionId, onClose }) {
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('conversation');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`${API_BASE}/api/history/${sessionId}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'Failed to load session.');
        if (!cancelled) setSession(data.session);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load session.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [sessionId]);

  const history = session?.history || [];
  const analysis = session?.final_report?.outcome_analysis || session?.final_report || {};
  const terms = analysis.agreement_terms || {};
  const finalAllocation = session?.final_allocation || analysis.final_allocation || terms.final_allocation;
  const participants = session?.agents || [];
  const previousProposalFor = (index) => history
    .slice(0, index)
    .reverse()
    .find((entry) => entry?.parsed_proposal && Object.keys(entry.parsed_proposal).length > 0)
    ?.parsed_proposal;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 p-3 sm:p-6">
      <div className="mx-auto min-h-[calc(100vh-1.5rem)] w-full max-w-6xl rounded-[2rem] bg-slate-50 shadow-2xl sm:min-h-[calc(100vh-3rem)]">
        <div className="sticky top-0 z-10 rounded-t-[2rem] border-b border-slate-200 bg-white/95 p-5 backdrop-blur sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">Negotiation details / replay</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900 sm:text-3xl">
                {session?.scenario?.title || 'Negotiation Detail'}
              </h2>
              {session && <p className="mt-2 text-sm text-slate-500">{formatDate(session.updated_at || session.created_at)}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              <X size={16} />
              Back to History
            </button>
          </div>

          {session && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <DetailStat label="Mode" value={session.practice_mode ? 'Practice Mode' : 'AI-vs-AI Simulation'} />
              <DetailStat label="Rounds" value={`${session.current_round ?? 'N/A'} / ${session.max_rounds ?? 'N/A'}`} />
              <DetailStat label="Consensus" value={`${Math.round(Number(session.consensus || 0) * 100)}%`} />
              <DetailStat label="Status" value={displayStatus(session.status)} />
              <DetailStat label="Turns" value={history.length} />
            </div>
          )}
        </div>

        <div className="p-5 sm:p-7">
          {loading && <p className="text-sm text-slate-500">Loading negotiation replay...</p>}
          {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">{error}</p>}

          {session && (
            <>
              <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
                {[
                  ['conversation', 'Conversation'],
                  ['proposals', 'Proposals'],
                  ['outcome', 'Outcome'],
                  ['agents', 'Agents'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setActiveTab(value)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${activeTab === value ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {activeTab === 'conversation' && (
                <div className="space-y-7">
                  {history.length === 0 && <p className="text-sm text-slate-500">No turns were recorded for this session.</p>}
                  {Object.entries(history.reduce((groups, turn, index) => {
                    const round = turn?.round ?? '?';
                    groups[round] = groups[round] || [];
                    groups[round].push({ turn, index });
                    return groups;
                  }, {})).map(([round, entries]) => (
                    <section key={round}>
                      <div className="mb-3 flex items-center gap-3">
                        <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">Round {round}</span>
                        <div className="h-px flex-1 bg-slate-200" />
                      </div>
                      <div className="space-y-3">
                        {entries.map(({ turn, index }) => (
                          <HistoryTurn key={`${index}-${turn.agent}`} turn={turn} previousProposal={previousProposalFor(index)} />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}

              {activeTab === 'proposals' && (
                <div className="space-y-4">
                  {history.filter((turn) => turn?.parsed_proposal && Object.keys(turn.parsed_proposal).length > 0).length === 0 && (
                    <p className="text-sm text-slate-500">No structured proposals were recorded.</p>
                  )}
                  {history.map((turn, index) => {
                    if (!turn?.parsed_proposal || Object.keys(turn.parsed_proposal).length === 0) return null;
                    const changes = proposalDelta(previousProposalFor(index), turn.parsed_proposal);
                    return (
                      <div key={`${index}-${turn.agent}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{turn.agent || 'Participant'}</p>
                            <p className="text-xs text-slate-500">Round {turn.round ?? 'N/A'} · {String(turn.action || 'N/A').toUpperCase()}</p>
                          </div>
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase text-blue-700">Proposal recorded</span>
                        </div>
                        <div className="mt-3"><AllocationView proposal={turn.parsed_proposal} /></div>
                        <div className="mt-4 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
                          <ChangeList title="Increases" changes={changes.increased} positive />
                          <ChangeList title="Decreases / concessions" changes={changes.decreased} positive={false} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {activeTab === 'outcome' && (
                <div className="space-y-5">
                  <div className={`rounded-2xl p-5 ${session.consensus_reached ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-white'}`}>
                    <div className="flex items-start gap-3">
                      {session.consensus_reached ? <CheckCircle2 size={24} /> : <XCircle size={24} />}
                      <div>
                        <h3 className="text-xl font-semibold">{session.consensus_reached ? 'Agreement Reached' : 'No Agreement Reached'}</h3>
                        <p className="mt-1 text-sm text-white/75">Stored status: {displayStatus(session.status)}</p>
                      </div>
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <DetailStat label="Agreement round" value={terms.agreement_round ?? 'Not available'} />
                      <DetailStat label="Unanimous agreement" value={session.consensus_reached ? 'Yes' : 'No'} />
                      <DetailStat label="Max rounds reached" value={session.max_rounds_reached ? 'Yes' : 'No'} />
                      <DetailStat label="Deadlock detected" value={session.deadlock_detected ? 'Yes' : 'No'} />
                    </div>
                  </div>

                  <section className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h3 className="text-lg font-semibold text-slate-900">Final allocation</h3>
                    <p className="mt-1 text-sm text-slate-500">{session.consensus_reached ? 'This allocation was accepted by the required participants.' : 'Latest stored allocation; it was not unanimously accepted.'}</p>
                    <div className="mt-4"><AllocationView proposal={finalAllocation} /></div>
                  </section>

                  <section className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h3 className="text-lg font-semibold text-slate-900">Resource totals</h3>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {Object.entries(terms.per_resource_totals || {}).map(([resource, amount]) => <DetailStat key={resource} label={resource} value={amount} />)}
                      {Object.keys(terms.per_resource_totals || {}).length === 0 && <p className="text-sm text-slate-500">No resource totals recorded.</p>}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h3 className="text-lg font-semibold text-slate-900">Outcome analysis</h3>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <DetailStat label="Outcome" value={analysis.outcome} />
                      <DetailStat label="Rounds used" value={analysis.rounds} />
                      <DetailStat label="Accepted participants" value={(terms.accepted_participants || []).join(', ') || 'None'} />
                      <DetailStat label="Total participants" value={terms.total_participants} />
                    </div>
                    {session.final_report?.message && <p className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{session.final_report.message}</p>}
                  </section>
                </div>
              )}

              {activeTab === 'agents' && (
                <div className="grid gap-4 md:grid-cols-2">
                  {participants.map((agent) => (
                    <article key={agent.id || agent.name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-blue-700">{(agent.name || 'A').slice(0, 1)}</span>
                        <div>
                          <h3 className="font-semibold text-slate-900">{agent.name || 'Unnamed agent'}</h3>
                          <p className="text-sm text-slate-500">{agent.role || 'Role not stored'}</p>
                        </div>
                      </div>
                      <div className="mt-4 space-y-3 text-sm">
                        <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Personality</p><p className="mt-1 text-slate-700">{agent.personality || 'Not stored'}</p></div>
                        <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Goal</p><p className="mt-1 text-slate-700">{agent.goal || 'Not stored'}</p></div>
                        <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Priorities</p><p className="mt-1 text-slate-700">{Array.isArray(agent.priorities) && agent.priorities.length > 0 ? agent.priorities.join(', ') : 'Not stored'}</p></div>
                        <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Constraints</p><p className="mt-1 text-slate-700">{Array.isArray(agent.constraints) && agent.constraints.length > 0 ? agent.constraints.join(', ') : 'Not stored'}</p></div>
                      </div>
                    </article>
                  ))}
                  {session.practice_mode && (
                    <article className="rounded-2xl border border-purple-200 bg-purple-50 p-5 shadow-sm">
                      <h3 className="font-semibold text-purple-900">Human Participant</h3>
                      <p className="mt-2 text-sm text-purple-800">Human proposals and final decisions are included in the Conversation and Proposals tabs.</p>
                    </article>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function History() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  async function loadHistory() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/history`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Failed to load history.');
      setSessions(data.sessions || []);
    } catch (err) {
      setError(err.message || 'Failed to load history.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHistory();
  }, []);

  async function handleDelete(sessionId) {
    try {
      const response = await fetch(`${API_BASE}/api/history/${sessionId}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Failed to delete session.');
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
    } catch (err) {
      setError(err.message || 'Failed to delete session.');
    }
  }

  async function handleClearAll() {
    try {
      const response = await fetch(`${API_BASE}/api/history`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Failed to clear history.');
      setSessions([]);
      setConfirmClearAll(false);
    } catch (err) {
      setError(err.message || 'Failed to clear history.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Negotiation History</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every past negotiation, saved automatically to your database.
          </p>
        </div>

        {sessions.length > 0 && (
          <button
            onClick={() => setConfirmClearAll(true)}
            className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
          >
            Clear All History
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading && <p className="text-sm text-slate-500">Loading history...</p>}

      {!loading && sessions.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          No past negotiations yet. Run a negotiation and it will show up here.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sessions.map((session) => (
          <div
            key={session.session_id}
            className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-slate-900">{session.scenario_title}</h3>
                
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Users size={13} />
                  {session.practice_mode ? 'Practice Mode' : 'AI-vs-AI'}
                </span>
                <span>Round {session.current_round}/{session.max_rounds}</span>
                <span>Consensus {Math.round((session.consensus || 0) * 100)}%</span>
              </div>

              <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                <Clock3 size={12} />
                {formatDate(session.updated_at || session.created_at)}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={() => navigate('/negotiation/replay', { state: { sessionId: session.session_id } })}
                className="flex-1 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                View Details
              </button>
              <button
                onClick={() => handleDelete(session.session_id)}
                className="rounded-full border border-slate-200 p-2.5 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                title="Delete this negotiation"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {confirmClearAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">Clear all history?</h3>
            <p className="mt-2 text-sm text-slate-500">
              This permanently deletes every saved negotiation. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmClearAll(false)}
                className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
              >
                Delete Everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default History;