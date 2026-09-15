import { useEffect, useState, useMemo } from 'react';
import {
  Clock3,
  Trash2,
  Users,
  X,
  ChevronRight,
  BarChart3,
  MessageSquare,
  Sparkles,
  Layers,
  Activity,
  AlertCircle,
} from 'lucide-react';
import OutcomeCharts from '../components/OutcomeCharts';
import ErrorBoundary from '../components/ErrorBoundary';

const API_BASE = 'http://127.0.0.1:8000';

function fmtDate(iso) {
  if (!iso) return 'Unknown';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function StatusBadge({ status }) {
  const map = {
    agreement_reached:     { label: 'Agreement', cls: 'status-agreement' },
    negotiation_breakdown: { label: 'Breakdown', cls: 'status-breakdown' },
    deadlock_no_consensus: { label: 'Deadlock',  cls: 'status-deadlock' },
    ongoing:               { label: 'Ongoing',   cls: 'status-ongoing' },
  };
  const { label, cls } = map[status] || {
    label: (status || 'Unknown').replace(/_/g, ' '),
    cls: '',
  };
  return <span className={`badge ${cls}`}>{label}</span>;
}

function MiniBar({ value }) {
  const pct = Math.round((value || 0) * 100);
  const color = pct >= 70 ? '#10b981' : pct >= 40 ? '#f97316' : '#ef4444';
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-1" style={{ color: 'var(--text-3)' }}>
        <span>Consensus</span>
        <span style={{ color }}>{pct}%</span>
      </div>
      <div className="progress-track h-1">
        <div
          className="progress-fill h-full"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}88, ${color})`,
          }}
        />
      </div>
    </div>
  );
}

function ProposalPill({ resource, amount }) {
  return (
    <span
      className="badge text-[10px]"
      style={{
        background: 'var(--bg-surface)',
        color: 'var(--text-2)',
        border: '1px solid var(--border)',
      }}
    >
      {resource}: {amount}
    </span>
  );
}

function HistoryTurn({ turn }) {
  const proposal = turn.parsed_proposal || turn.incoming_proposal || turn.proposal;
  const isNested =
    proposal &&
    Object.values(proposal).some(
      (v) => v && typeof v === 'object' && !Array.isArray(v)
    );
  const actionColors = {
    OFFER: '#60a5fa',
    COUNTER: '#f97316',
    ACCEPT: '#10b981',
    REJECT: '#ef4444',
  };
  const ac = actionColors[(turn.action || '').toUpperCase()] || 'var(--text-3)';

  return (
    <div
      className="rounded-xl p-3.5"
      style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="badge"
            style={{
              background: 'var(--accent-bg)',
              color: 'var(--accent)',
              border: '1px solid var(--accent-border)',
            }}
          >
            R{turn.round ?? '?'}
          </span>
          <span className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
            {turn.agent || 'Unknown'}
          </span>
          <span
            className="badge uppercase text-[10px]"
            style={{ background: `${ac}18`, color: ac, border: `1px solid ${ac}40` }}
          >
            {turn.action || 'N/A'}
          </span>
        </div>
      </div>
      {turn.message && (
        <p className="mt-2 text-xs leading-5" style={{ color: 'var(--text-2)' }}>
          {turn.message}
        </p>
      )}
      {proposal && Object.keys(proposal).length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {isNested
            ? Object.entries(proposal).map(([who, vals]) =>
                Object.entries(vals || {}).map(([res, amt]) => (
                  <ProposalPill
                    key={`${who}-${res}`}
                    resource={`${who.replace(' District', '')}·${res}`}
                    amount={amt}
                  />
                ))
              )
            : Object.entries(proposal).map(([res, amt]) => (
                <ProposalPill key={res} resource={res} amount={amt} />
              ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPREHENSIVE DETAIL & VISUALIZATION MODAL
// ─────────────────────────────────────────────────────────────
function DetailModal({ sessionId, initialTab = 'visualize', onClose }) {
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/history/${sessionId}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.detail);
        if (!cancelled) setSession(d.session);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const history = session?.history || [];
  const outcomeAnalysis =
    session?.final_report?.outcome_analysis ||
    session?.outcome_analysis ||
    {};
  const scenarioResources =
    session?.scenario?.resourceQuantities ||
    session?.config?.resourceQuantities ||
    {};

  const participants = useMemo(() => {
    if (!session) return [];
    if (session.config?.agents?.length > 0) {
      return session.config.agents.map((a) => a.name);
    }
    if (session.scenario?.agents?.length > 0) {
      return session.scenario.agents.map((a) => a.name);
    }
    const found = Array.from(new Set(history.map((h) => h.agent).filter(Boolean)));
    return found.length > 0 ? found : ['Government Agent', 'NGO Agent', 'District Administration Agent'];
  }, [session, history]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl shadow-2xl animate-scale-in custom-scrollbar"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        {/* Modal Top Header */}
        <div
          className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 p-5 border-b border-[var(--border)]"
          style={{ background: 'var(--bg-surface)', backdropFilter: 'blur(12px)' }}
        >
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent-bg)] text-[var(--accent)] border border-[var(--accent-border)] font-bold">
                <BarChart3 size={16} />
              </span>
              <h2 className="text-base font-bold" style={{ color: 'var(--text-1)' }}>
                {session?.scenario?.title || 'Historical Negotiation Analytics'}
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-[var(--text-3)]">
              Session: <span className="font-mono text-[var(--text-2)]">{sessionId}</span> ·{' '}
              {fmtDate(session?.updated_at || session?.created_at)}
            </p>
          </div>

          {/* Mode Tabs and Close Button */}
          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-1 rounded-xl p-1 border border-[var(--border-subtle)]"
              style={{ background: 'var(--bg-surface-2)' }}
            >
              <button
                type="button"
                onClick={() => setActiveTab('visualize')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeTab === 'visualize'
                    ? 'bg-[var(--accent)] text-white shadow-xs font-bold'
                    : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
                }`}
              >
                <BarChart3 size={13} />
                Data Visualizations
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('transcript')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeTab === 'transcript'
                    ? 'bg-[var(--accent)] text-white shadow-xs font-bold'
                    : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
                }`}
              >
                <MessageSquare size={13} />
                Transcript ({history.length})
              </button>
            </div>

            <button
              onClick={onClose}
              className="rounded-xl p-2 transition-colors hover:bg-[var(--bg-surface-2)]"
              style={{ color: 'var(--text-3)' }}
              title="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-6">
          {loading && (
            <div className="space-y-4">
              <div className="skeleton h-12 w-full rounded-xl" />
              <div className="skeleton h-64 w-full rounded-2xl" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl p-4 text-sm bg-rose-500/10 text-rose-500 border border-rose-500/20">
              <AlertCircle size={18} />
              <p>Failed to load session details: {error}</p>
            </div>
          )}

          {session && (
            <>
              {/* Session Meta Ribbon */}
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3.5 border border-[var(--border-subtle)]"
                style={{ background: 'var(--bg-surface-2)' }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={session.status} />
                  <span
                    className="badge"
                    style={{
                      background: 'var(--bg-surface)',
                      color: 'var(--text-2)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <Users size={11} className="inline mr-1" />
                    {session.practice_mode ? 'Practice Mode (Human+AI)' : 'AI-vs-AI Simulation'}
                  </span>
                  <span
                    className="badge"
                    style={{
                      background: 'var(--bg-surface)',
                      color: 'var(--text-2)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    Rounds: {session.current_round} / {session.max_rounds}
                  </span>
                  <span
                    className="badge"
                    style={{
                      background: 'var(--bg-surface)',
                      color: 'var(--text-2)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    Consensus: {Math.round((session.consensus || 0) * 100)}%
                  </span>
                </div>

                <p className="text-xs text-[var(--text-3)] font-mono">
                  {history.length} recorded communication turns
                </p>
              </div>

              {/* TAB 1: INTERACTIVE DATA VISUALIZATIONS */}
              {activeTab === 'visualize' && (
                <div className="animate-fade-in space-y-4">
                  <ErrorBoundary title="Historical Visualization Notice">
                    <OutcomeCharts
                      outcomeAnalysis={outcomeAnalysis}
                      history={history}
                      scenarioResources={scenarioResources}
                      participants={participants}
                    />
                  </ErrorBoundary>
                </div>
              )}

              {/* TAB 2: TURN-BY-TURN TRANSCRIPT */}
              {activeTab === 'transcript' && (
                <div className="animate-fade-in space-y-3">
                  {history.length === 0 ? (
                    <div
                      className="rounded-2xl p-10 text-center border border-dashed border-[var(--border)]"
                      style={{ color: 'var(--text-3)' }}
                    >
                      <MessageSquare size={28} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No turn messages were recorded for this session.</p>
                    </div>
                  ) : (
                    history.map((turn, i) => <HistoryTurn key={i} turn={turn} />)
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

// ─────────────────────────────────────────────────────────────
// MAIN HISTORY PAGE
// ─────────────────────────────────────────────────────────────
export default function History() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [modalTab, setModalTab] = useState('visualize');
  const [confirmClear, setConfirmClear] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const r = await fetch(`${API_BASE}/api/history`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      setSessions(d.sessions || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function del(id) {
    try {
      const r = await fetch(`${API_BASE}/api/history/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json()).detail);
      setSessions((p) => p.filter((s) => s.session_id !== id));
    } catch (e) {
      setError(e.message);
    }
  }

  async function clearAll() {
    try {
      const r = await fetch(`${API_BASE}/api/history`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json()).detail);
      setSessions([]);
      setConfirmClear(false);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Page Header */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl p-5"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>
            Negotiation History & Visual Analytics
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-3)' }}>
            {sessions.length} sessions saved to database · View historical outcomes & interactive charts
          </p>
        </div>
        {sessions.length > 0 && (
          <button
            onClick={() => setConfirmClear(true)}
            className="badge px-3 py-2 text-xs transition-colors"
            style={{
              background: 'rgba(239,68,68,0.1)',
              color: '#ef4444',
              border: '1px solid rgba(239,68,68,0.25)',
              cursor: 'pointer',
            }}
          >
            Clear All
          </button>
        )}
      </div>

      {/* Error alert */}
      {error && (
        <div
          className="rounded-xl p-4 text-sm"
          style={{
            background: 'rgba(239,68,68,0.08)',
            color: '#ef4444',
            border: '1px solid rgba(239,68,68,0.2)',
          }}
        >
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton h-52 rounded-2xl" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && sessions.length === 0 && !error && (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-2xl p-16 text-center"
          style={{ background: 'var(--bg-surface)', border: '2px dashed var(--border)' }}
        >
          <Clock3 size={36} style={{ color: 'var(--text-3)', opacity: 0.5 }} />
          <p className="text-base font-semibold" style={{ color: 'var(--text-1)' }}>
            No past negotiations recorded yet.
          </p>
          <p className="text-xs max-w-sm" style={{ color: 'var(--text-3)' }}>
            Run an AI Arena or Practice Mode negotiation and complete it. The full communication history and multi-resource curves will be stored and visualizable here.
          </p>
        </div>
      )}

      {/* Session Cards Grid */}
      {!loading && sessions.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger">
          {sessions.map((s) => (
            <div
              key={s.session_id}
              className="card card-lift animate-fade-up flex flex-col justify-between gap-4 p-5"
            >
              {/* Top row */}
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3
                    className="flex-1 text-sm font-bold leading-snug"
                    style={{ color: 'var(--text-1)' }}
                  >
                    {s.scenario_title}
                  </h3>
                  <button
                    onClick={() => del(s.session_id)}
                    className="rounded-lg p-1.5 transition-colors flex-shrink-0 hover:bg-rose-500/10 hover:text-rose-500"
                    style={{ color: 'var(--text-3)' }}
                    title="Delete session"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Meta badges */}
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <StatusBadge status={s.status} />
                  <span
                    className="badge"
                    style={{
                      background: 'var(--bg-surface-2)',
                      color: 'var(--text-3)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <Users size={9} className="inline mr-1" />
                    {s.practice_mode ? 'Practice' : 'AI-vs-AI'}
                  </span>
                  <span
                    className="badge"
                    style={{
                      background: 'var(--bg-surface-2)',
                      color: 'var(--text-3)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    R{s.current_round}/{s.max_rounds}
                  </span>
                </div>
              </div>

              {/* Consensus Bar */}
              <MiniBar value={s.consensus} />

              {/* Timestamp */}
              <p
                className="flex items-center gap-1 text-[10px]"
                style={{ color: 'var(--text-3)' }}
              >
                <Clock3 size={10} />
                {fmtDate(s.updated_at || s.created_at)}
              </p>

              {/* Action Buttons: Visualize Negotiation & Transcript */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(s.session_id);
                    setModalTab('visualize');
                  }}
                  className="btn-accent flex items-center justify-center gap-1.5 py-2 text-xs font-semibold shadow-xs"
                >
                  <BarChart3 size={13} />
                  Visualize
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(s.session_id);
                    setModalTab('transcript');
                  }}
                  className="btn-ghost flex items-center justify-center gap-1.5 py-2 text-xs font-semibold"
                  style={{ border: '1px solid var(--border)' }}
                >
                  <MessageSquare size={13} />
                  Transcript
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail & Visualization Modal */}
      {selectedId && (
        <DetailModal
          sessionId={selectedId}
          initialTab={modalTab}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* Confirm Clear Modal */}
      {confirmClear && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 animate-scale-in"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
          >
            <h3 className="text-base font-bold" style={{ color: 'var(--text-1)' }}>
              Clear all history?
            </h3>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-3)' }}>
              This permanently deletes every saved negotiation from the database. This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmClear(false)}
                className="btn-ghost px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={clearAll}
                className="rounded-full px-4 py-2 text-sm font-semibold text-white transition-all"
                style={{ background: '#ef4444' }}
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}