import { useEffect, useState } from 'react';
import { Clock3, Trash2, Users, X } from 'lucide-react';

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

function HistoryTurn({ turn }) {
  const proposal = turn.parsed_proposal || turn.incoming_proposal;
  const hasNestedAllocation = proposal && Object.values(proposal).some(
    (value) => value && typeof value === 'object' && !Array.isArray(value)
  );

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
          {turn.action || 'N/A'}
        </span>
      </div>

      {turn.message && (
        <p className="mt-2 text-sm text-slate-600">{turn.message}</p>
      )}

      {proposal && Object.keys(proposal).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {hasNestedAllocation
            ? Object.entries(proposal).map(([who, values]) =>
                Object.entries(values || {}).map(([resource, amount]) => (
                  <ProposalPill key={`${who}-${resource}`} resource={`${who} · ${resource}`} amount={amount} />
                ))
              )
            : Object.entries(proposal).map(([resource, amount]) => (
                <ProposalPill key={resource} resource={resource} amount={amount} />
              ))}
        </div>
      )}
    </div>
  );
}

function DetailModal({ sessionId, onClose }) {
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {session?.scenario?.title || 'Negotiation Detail'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        {loading && <p className="text-sm text-slate-500">Loading...</p>}
        {error && <p className="text-sm text-rose-600">{error}</p>}

        {session && (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              {statusBadge(session.status)}
              <span className="text-xs text-slate-500">
                {session.practice_mode ? 'Practice Mode' : 'AI-vs-AI Simulation'}
              </span>
              <span className="text-xs text-slate-500">
                Round {session.current_round}/{session.max_rounds}
              </span>
              <span className="text-xs text-slate-500">
                Consensus: {Math.round((session.consensus || 0) * 100)}%
              </span>
            </div>

            <div className="space-y-3">
              {(session.history || []).length === 0 && (
                <p className="text-sm text-slate-500">No turns were recorded for this session.</p>
              )}
              {(session.history || []).map((turn, index) => (
                <HistoryTurn key={index} turn={turn} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function History() {
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
                onClick={() => setSelectedId(session.session_id)}
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

      {selectedId && (
        <DetailModal sessionId={selectedId} onClose={() => setSelectedId(null)} />
      )}

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