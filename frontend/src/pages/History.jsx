import { useEffect, useState } from 'react';
import { Clock3, Trash2, Users, X, ChevronRight, Search, Filter } from 'lucide-react';

const API_BASE = 'http://127.0.0.1:8000';

function fmtDate(iso) {
  if (!iso) return 'Unknown';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function StatusBadge({ status }) {
  const map = {
    agreement_reached:    { label: 'Agreement', cls: 'status-agreement' },
    negotiation_breakdown:{ label: 'Breakdown',  cls: 'status-breakdown' },
    deadlock_no_consensus:{ label: 'Deadlock',   cls: 'status-deadlock' },
    ongoing:              { label: 'Ongoing',     cls: 'status-ongoing' },
  };
  const { label, cls } = map[status] || { label: (status || 'Unknown').replace(/_/g, ' '), cls: '' };
  return <span className={`badge ${cls}`}>{label}</span>;
}

function MiniBar({ value }) {
  const pct = Math.round((value || 0) * 100);
  const color = pct >= 70 ? '#10b981' : pct >= 40 ? '#f97316' : '#ef4444';
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-1" style={{ color: 'var(--text-3)' }}>
        <span>Consensus</span><span style={{ color }}>{pct}%</span>
      </div>
      <div className="progress-track h-1">
        <div className="progress-fill h-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}88, ${color})` }} />
      </div>
    </div>
  );
}

function ProposalPill({ resource, amount }) {
  return (
    <span className="badge text-[10px]" style={{ background: 'var(--bg-surface)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
      {resource}: {amount}
    </span>
  );
}

function HistoryTurn({ turn }) {
  const proposal = turn.parsed_proposal || turn.incoming_proposal;
  const isNested = proposal && Object.values(proposal).some((v) => v && typeof v === 'object' && !Array.isArray(v));
  const actionColors = { OFFER: '#60a5fa', COUNTER: '#f97316', ACCEPT: '#10b981', REJECT: '#ef4444' };
  const ac = actionColors[(turn.action || '').toUpperCase()] || 'var(--text-3)';

  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="badge" style={{ background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}>
            R{turn.round ?? '?'}
          </span>
          <span className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>{turn.agent || 'Unknown'}</span>
          <span className="badge uppercase" style={{ background: `${ac}18`, color: ac, border: `1px solid ${ac}40` }}>{turn.action || 'N/A'}</span>
        </div>
      </div>
      {turn.message && <p className="mt-2 text-xs leading-5" style={{ color: 'var(--text-2)' }}>{turn.message}</p>}
      {proposal && Object.keys(proposal).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {isNested
            ? Object.entries(proposal).map(([who, vals]) =>
                Object.entries(vals || {}).map(([res, amt]) => (
                  <ProposalPill key={`${who}-${res}`} resource={`${who}·${res}`} amount={amt} />
                ))
              )
            : Object.entries(proposal).map(([res, amt]) => <ProposalPill key={res} resource={res} amount={amt} />)}
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
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/history/${sessionId}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.detail);
        if (!cancelled) setSession(d.session);
      } catch (e) { if (!cancelled) setError(e.message); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl shadow-2xl animate-scale-in" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="sticky top-0 z-10 flex items-center justify-between p-5" style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{session?.scenario?.title || 'Negotiation Detail'}</h2>
          <button onClick={onClose} className="rounded-xl p-1.5 transition-colors" style={{ color: 'var(--text-3)' }}><X size={16} /></button>
        </div>

        <div className="p-5">
          {loading && (
            <div className="space-y-3">
              {[1,2,3].map((i) => <div key={i} className="skeleton h-16" />)}
            </div>
          )}
          {error && <p className="text-sm" style={{ color: '#ef4444' }}>{error}</p>}
          {session && (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                <StatusBadge status={session.status} />
                <span className="badge" style={{ background: 'var(--bg-surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
                  {session.practice_mode ? 'Practice Mode' : 'AI-vs-AI'}
                </span>
                <span className="badge" style={{ background: 'var(--bg-surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
                  Round {session.current_round}/{session.max_rounds}
                </span>
                <span className="badge" style={{ background: 'var(--bg-surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
                  Consensus {Math.round((session.consensus || 0) * 100)}%
                </span>
              </div>
              {(session.history || []).length === 0 && (
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>No turns recorded.</p>
              )}
              <div className="space-y-2">
                {(session.history || []).map((turn, i) => <HistoryTurn key={i} turn={turn} />)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function History() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);

  async function load() {
    setLoading(true); setError('');
    try {
      const r = await fetch(`${API_BASE}/api/history`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail);
      setSessions(d.sessions || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function del(id) {
    try {
      const r = await fetch(`${API_BASE}/api/history/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json()).detail);
      setSessions((p) => p.filter((s) => s.session_id !== id));
    } catch (e) { setError(e.message); }
  }

  async function clearAll() {
    try {
      const r = await fetch(`${API_BASE}/api/history`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json()).detail);
      setSessions([]); setConfirmClear(false);
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>Negotiation History</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-3)' }}>{sessions.length} sessions saved to database</p>
        </div>
        {sessions.length > 0 && (
          <button
            onClick={() => setConfirmClear(true)}
            className="badge px-3 py-2 text-xs transition-colors"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', cursor: 'pointer' }}
          >
            Clear All
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl p-4 text-sm" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1,2,3,4,5,6].map((i) => <div key={i} className="skeleton h-44 rounded-2xl" />)}
        </div>
      )}

      {/* Empty */}
      {!loading && sessions.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl p-16 text-center"
          style={{ background: 'var(--bg-surface)', border: '2px dashed var(--border)' }}>
          <Clock3 size={32} style={{ color: 'var(--text-3)', opacity: 0.5 }} />
          <p className="text-sm" style={{ color: 'var(--text-3)' }}>No past negotiations yet.</p>
          <p className="text-xs" style={{ color: 'var(--text-3)', opacity: 0.7 }}>Run a negotiation and it will appear here.</p>
        </div>
      )}

      {/* Session Cards */}
      {!loading && sessions.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger">
          {sessions.map((s) => (
            <div key={s.session_id} className="card card-lift animate-fade-up flex flex-col gap-4 p-5">
              {/* Top row */}
              <div className="flex items-start justify-between gap-2">
                <h3 className="flex-1 text-sm font-semibold leading-snug" style={{ color: 'var(--text-1)' }}>{s.scenario_title}</h3>
                <button
                  onClick={() => del(s.session_id)}
                  className="rounded-lg p-1.5 transition-colors flex-shrink-0"
                  style={{ color: 'var(--text-3)' }}
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Meta */}
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={s.status} />
                <span className="badge" style={{ background: 'var(--bg-surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
                  <Users size={9} className="inline mr-1" />
                  {s.practice_mode ? 'Practice' : 'AI-vs-AI'}
                </span>
                <span className="badge" style={{ background: 'var(--bg-surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
                  R{s.current_round}/{s.max_rounds}
                </span>
              </div>

              {/* Consensus bar */}
              <MiniBar value={s.consensus} />

              {/* Date */}
              <p className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-3)' }}>
                <Clock3 size={10} />
                {fmtDate(s.updated_at || s.created_at)}
              </p>

              {/* Actions */}
              <button
                onClick={() => setSelectedId(s.session_id)}
                className="btn-accent mt-auto flex items-center justify-center gap-1.5 w-full py-2 text-xs"
              >
                View Details <ChevronRight size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedId && <DetailModal sessionId={selectedId} onClose={() => setSelectedId(null)} />}

      {/* Confirm Clear Modal */}
      {confirmClear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6 animate-scale-in" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-base font-bold" style={{ color: 'var(--text-1)' }}>Clear all history?</h3>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-3)' }}>This permanently deletes every saved negotiation. Cannot be undone.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmClear(false)} className="btn-ghost px-4 py-2 text-sm">Cancel</button>
              <button onClick={clearAll} className="rounded-full px-4 py-2 text-sm font-semibold text-white transition-all" style={{ background: '#ef4444' }}>Delete All</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}