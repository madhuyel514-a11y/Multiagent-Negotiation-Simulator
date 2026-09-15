import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, Clock3, Users, TrendingUp, TrendingDown, Minus, Award, ChevronDown, ChevronUp } from 'lucide-react';
import OutcomeCharts from '../components/OutcomeCharts';
import ErrorBoundary from '../components/ErrorBoundary';

const API_BASE = 'http://127.0.0.1:8000';

function fmt(v) { return v == null || v === '' ? 'N/A' : String(v); }

function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="progress-track h-1.5 w-full">
      <div className="progress-fill h-full" style={{ width: `${pct}%`, background: color || 'linear-gradient(90deg, var(--accent), var(--accent-2))' }} />
    </div>
  );
}

function AllocationCard({ recipient, values, isNested }) {
  const entries = isNested ? Object.entries(values) : [[recipient, values]];
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
      {isNested && <p className="mb-3 text-xs font-bold" style={{ color: 'var(--text-1)' }}>{recipient}</p>}
      <div className="space-y-2">
        {entries.map(([res, amt]) => (
          <div key={res} className="flex items-center justify-between gap-3">
            <span className="text-xs" style={{ color: 'var(--text-2)' }}>{res}</span>
            <span className="text-xs font-bold" style={{ color: 'var(--accent)' }}>{amt}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineEvent({ event, index }) {
  const [open, setOpen] = useState(false);
  const actionColors = { OFFER: '#60a5fa', COUNTER: '#f97316', ACCEPT: '#10b981', REJECT: '#ef4444' };
  const ac = actionColors[(event.action || '').toUpperCase()] || 'var(--text-3)';

  return (
    <div className="relative pl-6">
      <span className="absolute left-0 top-4 h-3 w-3 rounded-full border-2" style={{ borderColor: 'var(--bg-surface)', background: ac }} />
      <div className="rounded-xl p-4 transition-all" style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="badge px-2 py-0.5" style={{ background: `${ac}18`, color: ac, border: `1px solid ${ac}40` }}>R{fmt(event.round)}</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{fmt(event.agent)}</span>
            <span className="badge px-2 py-0.5 uppercase" style={{ background: `${ac}18`, color: ac, border: `1px solid ${ac}40` }}>{fmt(event.action)}</span>
          </div>
          {event.proposal && (
            <button onClick={() => setOpen(!open)} className="text-xs" style={{ color: 'var(--text-3)' }}>
              {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </div>
        {open && event.proposal && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {Object.entries(event.proposal).map(([k, v]) => (
              <div key={k} className="flex justify-between text-xs px-2 py-1 rounded-lg" style={{ background: 'var(--bg-surface)', color: 'var(--text-2)' }}>
                <span>{k}</span><span className="font-bold" style={{ color: 'var(--text-1)' }}>{typeof v === 'object' ? JSON.stringify(v) : v}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Outcome() {
  const location = useLocation();
  const navigate = useNavigate();
  const historicalSessionId = new URLSearchParams(location.search).get('session_id');
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(Boolean(historicalSessionId));
  const [error, setError] = useState('');

  useEffect(() => {
    if (historicalSessionId) {
      let cancelled = false;
      (async () => {
        try {
          const response = await fetch(`${API_BASE}/api/history/${encodeURIComponent(historicalSessionId)}`);
          const data = await response.json();
          if (!response.ok) throw new Error(data.detail || 'Failed to load historical outcome.');
          if (!cancelled) setSaved(data.session || null);
        } catch (loadError) {
          if (!cancelled) setError(loadError.message || 'Failed to load historical outcome.');
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }

    try { const v = localStorage.getItem('negotiationOutcome'); setSaved(v ? JSON.parse(v) : null); } catch { setSaved(null); }
    setLoading(false);
    return undefined;
  }, [historicalSessionId]);

  if (loading) return <div className="card p-6 text-sm" style={{ color: 'var(--text-2)' }}>Loading negotiation outcome...</div>;
  if (error) return (
    <div className="space-y-3">
      <div className="rounded-xl p-4 text-sm" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</div>
      <button type="button" onClick={() => navigate(historicalSessionId ? `/negotiation/replay?session_id=${encodeURIComponent(historicalSessionId)}` : '/negotiation')} className="btn-accent px-4 py-2 text-xs">Back</button>
    </div>
  );

  const analysis = saved?.final_report?.outcome_analysis || saved?.final_report || {};
  const terms = analysis.agreement_terms || {};
  const allocation = analysis.final_allocation ?? terms.final_allocation ?? saved?.final_allocation;
  const agreed = saved?.consensus_reached === true || analysis.outcome === 'agreement_reached' || terms.unanimous_agreement === true;
  const performance = analysis.agent_performance || {};
  const concessions = analysis.concession_patterns || {};
  const timeline = analysis.concession_timeline || [];
  const participants = Object.keys(performance).length > 0
    ? Object.keys(performance)
    : Array.from(new Set([
      ...(saved?.agents || []).map((agent) => agent.name).filter(Boolean),
      ...(saved?.practice_mode && saved?.history?.some((event) => event.agent === 'Human Participant') ? ['Human Participant'] : []),
      ...(terms.accepted_participants || []),
      ...timeline.map((e) => e.agent).filter(Boolean),
    ]));

  const isNested = allocation && typeof allocation === 'object' && Object.values(allocation).some((v) => v && typeof v === 'object' && !Array.isArray(v));

  const totals = terms.per_resource_totals || {};
  const maxTotal = Math.max(...Object.values(totals).map(Number), 1);

  const history = saved?.history || [];
  const scenarioResources = saved?.scenario?.resourceQuantities || saved?.resourceQuantities || {};

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Hero Banner */}
      <section
        className="relative overflow-hidden rounded-2xl p-6 lg:p-8"
        style={{
          background: agreed
            ? 'linear-gradient(135deg, #065f46 0%, #047857 50%, #064e3b 100%)'
            : 'linear-gradient(135deg, #1f2328 0%, #161b22 100%)',
          border: `1px solid ${agreed ? 'rgba(52,211,153,0.3)' : 'var(--border)'}`,
        }}
      >
        {/* glow */}
        <div className="pointer-events-none absolute inset-0 opacity-25"
          style={{ background: `radial-gradient(circle at 90% 50%, ${agreed ? '#34d399' : '#f97316'}44 0%, transparent 60%)` }} />

        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.55)' }}>Negotiation Outcome</p>
            <h1 className="mt-2 text-3xl font-bold text-white">{agreed ? '🎉 Agreement Reached' : 'No Agreement'}</h1>
            <p className="mt-2 max-w-xl text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>
              {agreed ? 'All agents reached a unanimous allocation agreement.' : 'The negotiation ended without a final agreement.'}
            </p>
          </div>
          {agreed
            ? <CheckCircle2 size={48} color="#34d399" className="opacity-80 animate-float" />
            : <XCircle size={48} color="#f87171" className="opacity-70" />}
        </div>

        <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { icon: Clock3, label: 'Rounds', val: fmt(analysis.rounds) },
            { icon: Users, label: 'Participants', val: fmt(terms.total_participants ?? participants.length) },
            { icon: Award, label: 'Agreement Round', val: fmt(terms.agreement_round) },
          ].map(({ icon: Ic, label, val }) => (
            <div key={label} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <Ic size={14} color="rgba(255,255,255,0.5)" />
              <p className="mt-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>{label}</p>
              <p className="text-xl font-bold text-white">{val}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive Visual Charts */}
      <ErrorBoundary title="Analytics & Charts Display Notice">
        <OutcomeCharts
          outcomeAnalysis={analysis}
          history={history}
          scenarioResources={scenarioResources}
          participants={participants}
        />
      </ErrorBoundary>

      {/* Final Allocation */}
      {allocation && (
        <section className="rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <h2 className="mb-4 text-sm font-bold" style={{ color: 'var(--text-1)' }}>Final Resource Allocation</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(allocation).map(([k, v]) => (
              <AllocationCard key={k} recipient={k} values={v} isNested={isNested} />
            ))}
          </div>
        </section>
      )}

      {/* Resource Totals */}
      {Object.keys(totals).length > 0 && (
        <section className="rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <h2 className="mb-4 text-sm font-bold" style={{ color: 'var(--text-1)' }}>Resource Totals</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(totals).map(([res, amt]) => (
              <div key={res} className="rounded-xl p-4" style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>{res}</p>
                <p className="my-2 text-2xl font-bold" style={{ color: 'var(--text-1)' }}>{amt}</p>
                <MiniBar value={Number(amt)} max={maxTotal} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Agent Performance */}
      {participants.length > 0 && (
        <section className="rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <h2 className="mb-4 text-sm font-bold" style={{ color: 'var(--text-1)' }}>Agent Performance</h2>
          <div className="space-y-3">
            {participants.map((agent) => {
              const item = performance[agent] || {};
              const pattern = concessions[agent] || {};
              const sat = item.objective_satisfaction;
              const satColor = sat >= 70 ? '#10b981' : sat >= 40 ? '#f97316' : '#ef4444';
              return (
                <div key={agent} className="flex flex-wrap items-center gap-4 rounded-xl p-4" style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
                  <p className="w-40 text-sm font-semibold flex-shrink-0" style={{ color: 'var(--text-1)' }}>{agent}</p>
                  <div className="flex-1 min-w-[120px]">
                    <div className="flex justify-between text-[10px] mb-1" style={{ color: 'var(--text-3)' }}>
                      <span>Satisfaction</span>
                      <span style={{ color: satColor }}>{sat != null ? `${sat}%` : 'N/A'}</span>
                    </div>
                    <MiniBar value={sat || 0} max={100} color={`linear-gradient(90deg, ${satColor}88, ${satColor})`} />
                  </div>
                  <div className="flex gap-4 text-xs" style={{ color: 'var(--text-3)' }}>
                    <span>Concessions: <b style={{ color: 'var(--text-1)' }}>{fmt(item.concession_count ?? pattern.concession_count)}</b></span>
                    <span>Actions: <b style={{ color: 'var(--text-1)' }}>{(item.offers || 0) + (item.counters || 0) + (item.accepts || 0) + (item.rejects || 0)}</b></span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Concession Timeline */}
      {timeline.length > 0 && (
        <section className="rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <h2 className="mb-4 text-sm font-bold" style={{ color: 'var(--text-1)' }}>Concession Timeline</h2>
          <div className="space-y-3 border-l-2 pl-4" style={{ borderColor: 'var(--border)' }}>
            {timeline.map((ev, i) => <TimelineEvent key={i} event={ev} index={i} />)}
          </div>
        </section>
      )}

      {/* Summary */}
      <section className="rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <h2 className="mb-4 text-sm font-bold" style={{ color: 'var(--text-1)' }}>Negotiation Summary</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Total Rounds', analysis.rounds],
            ['Final Outcome', agreed ? 'Agreement Reached' : 'No Agreement'],
            ['Accepted By', (terms.accepted_participants || []).join(', ') || 'None'],
            ['Status', analysis.status],
          ].map(([label, val]) => (
            <div key={label} className="rounded-xl p-4" style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>{label}</p>
              <p className="mt-2 text-sm font-semibold break-words" style={{ color: 'var(--text-1)' }}>{fmt(val)}</p>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
