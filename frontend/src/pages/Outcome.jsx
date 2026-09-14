import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, CheckCircle2, Clock3, Users, XCircle } from 'lucide-react';

const API_BASE = 'http://127.0.0.1:8000';

function formatValue(value) {
  return value === null || value === undefined || value === '' ? 'N/A' : String(value);
}

function Allocation({ allocation }) {
  if (!allocation || typeof allocation !== 'object' || Object.keys(allocation).length === 0) {
    return <p className="text-sm text-slate-500">No final allocation recorded.</p>;
  }

  const nested = Object.values(allocation).some(
    (value) => value && typeof value === 'object' && !Array.isArray(value)
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Object.entries(allocation).map(([recipient, values]) => (
        <div key={recipient} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-semibold text-slate-800">{nested ? recipient : 'Allocation'}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(nested ? values : { [recipient]: values }).map(([resource, amount]) => (
              <span key={resource} className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                {resource}: {amount}
              </span>
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
      <p className={`text-xs font-bold uppercase tracking-wider ${positive ? 'text-emerald-700' : 'text-rose-700'}`}>
        {title}
      </p>
      {entries.length > 0 ? (
        <div className="mt-2 space-y-1">
          {entries.map(([path, amount]) => (
            <p key={path} className="flex items-center gap-1.5 text-xs text-slate-600">
              {positive ? <ArrowUp size={13} className="text-emerald-600" /> : <ArrowDown size={13} className="text-rose-600" />}
              <span>{path}: {amount}</span>
            </p>
          ))}
        </div>
      ) : <p className="mt-2 text-xs text-slate-400">None</p>}
    </div>
  );
}

function Outcome() {
  const location = useLocation();
  const navigate = useNavigate();
  const historicalSessionId = new URLSearchParams(location.search).get('session_id');
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(Boolean(historicalSessionId));
  const [error, setError] = useState('');

  useEffect(() => {
    if (historicalSessionId) {
      let cancelled = false;

      async function loadHistoricalOutcome() {
        setLoading(true);
        setError('');
        try {
          const response = await fetch(`${API_BASE}/api/history/${encodeURIComponent(historicalSessionId)}`);
          const data = await response.json();
          if (!response.ok) throw new Error(data.detail || 'Failed to load historical outcome.');
          if (!cancelled) {
            const session = data.session || {};
            setSaved({
              ...session,
              final_report: session.final_report || null,
              final_allocation: session.final_allocation || null,
              history: session.history || [],
            });
          }
        } catch (loadError) {
          if (!cancelled) setError(loadError.message || 'Failed to load historical outcome.');
        } finally {
          if (!cancelled) setLoading(false);
        }
      }

      loadHistoricalOutcome();
      return () => { cancelled = true; };
    }

    try {
      const value = localStorage.getItem('negotiationOutcome');
      setSaved(value ? JSON.parse(value) : null);
      setLoading(false);
    } catch {
      setSaved(null);
      setLoading(false);
    }
  }, [historicalSessionId]);

  const analysis = saved?.final_report?.outcome_analysis || saved?.final_report || {};
  const terms = analysis.agreement_terms || {};
  const allocation = analysis.final_allocation ?? terms.final_allocation ?? saved?.final_allocation;
  const agreementReached = analysis.outcome === 'agreement_reached' || terms.unanimous_agreement === true;
  const performance = analysis.agent_performance || {};
  const concessions = analysis.concession_patterns || {};
  const timeline = analysis.concession_timeline || [];
  const participants = Object.keys(performance).length > 0
    ? Object.keys(performance)
    : Array.from(new Set([
      ...(saved?.agents || []).map((agent) => agent.name).filter(Boolean),
      ...(saved?.practice_mode && saved?.history?.some((event) => event.agent === 'Human Participant') ? ['Human Participant'] : []),
      ...(terms.accepted_participants || []),
      ...timeline.map((event) => event.agent).filter(Boolean),
    ]));

  if (loading) {
    return <main className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">Loading negotiation outcome...</main>;
  }

  if (error) {
    return (
      <main className="space-y-4">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">{error}</div>
        <button type="button" onClick={() => navigate(historicalSessionId ? `/negotiation/replay?session_id=${encodeURIComponent(historicalSessionId)}` : '/negotiation')} className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          Back
        </button>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <section className={`rounded-[2rem] p-6 text-white shadow-lg sm:p-8 ${agreementReached ? 'bg-emerald-700' : 'bg-slate-800'}`}>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/70">Negotiation outcome</p>
            <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">
              {agreementReached ? 'Agreement Reached' : 'No Agreement Reached'}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80">
              {agreementReached ? 'The final allocation below reflects the negotiated plan for affected recipients.' : 'The negotiation summary and proposal history remain available for review.'}
            </p>
          </div>
          {agreementReached ? <CheckCircle2 size={42} /> : <XCircle size={42} />}
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-white/10 p-4"><Clock3 size={18} /><p className="mt-2 text-xs text-white/70">Rounds elapsed</p><p className="text-xl font-semibold">{formatValue(analysis.rounds)}</p></div>
          <div className="rounded-xl bg-white/10 p-4"><Users size={18} /><p className="mt-2 text-xs text-white/70">Participants</p><p className="text-xl font-semibold">{formatValue(terms.total_participants ?? participants.length)}</p></div>
          <div className="rounded-xl bg-white/10 p-4"><p className="text-xs text-white/70">Agreement round</p><p className="mt-2 text-xl font-semibold">{formatValue(terms.agreement_round)}</p></div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Final agreement terms</h2>
        <p className="mt-1 text-sm text-slate-500">Resources allocated to affected districts and recipients.</p>
        <div className="mt-5"><Allocation allocation={allocation} /></div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Resource totals</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(terms.per_resource_totals || {}).map(([resource, amount]) => (
            <div key={resource} className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-500">{resource}</p><p className="mt-1 text-2xl font-semibold text-slate-800">{amount}</p></div>
          ))}
          {Object.keys(terms.per_resource_totals || {}).length === 0 && <p className="text-sm text-slate-500">No resource totals recorded.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Concession timeline</h2>
        <div className="mt-5 space-y-4 border-l-2 border-slate-200 pl-5">
          {timeline.length > 0 ? timeline.map((event, index) => (
            <article key={`${event.agent}-${event.round}-${index}`} className="relative rounded-xl bg-slate-50 p-4">
              <span className="absolute -left-[2rem] top-5 h-3 w-3 rounded-full border-2 border-white bg-blue-600" />
              <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold uppercase tracking-wider text-slate-400">Round {formatValue(event.round)}</span><span className="font-semibold text-slate-800">{formatValue(event.agent)}</span><span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-800">{formatValue(event.action)}</span></div>
              {event.proposal && <div className="mt-3"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Proposal</p><div className="mt-2"><Allocation allocation={event.proposal} /></div></div>}
              <div className="mt-4 grid gap-4 sm:grid-cols-2"><ChangeList title="Increases" changes={event.increased} positive /><ChangeList title="Concessions / decreases" changes={event.concessions || event.decreased} positive={false} /></div>
            </article>
          )) : <p className="text-sm text-slate-500">No negotiation history was recorded.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Objective satisfaction</h2>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-3 py-3">Agent</th><th className="px-3 py-3">Satisfaction</th><th className="px-3 py-3">Concessions</th><th className="px-3 py-3">Actions</th><th className="px-3 py-3">Contribution</th></tr></thead><tbody className="divide-y divide-slate-100">{participants.map((agent) => { const item = performance[agent] || {}; const pattern = concessions[agent] || {}; const actions = (item.offers || 0) + (item.counters || 0) + (item.accepts || 0) + (item.rejects || 0); return <tr key={agent}><td className="px-3 py-4 font-semibold text-slate-800">{agent}</td><td className="px-3 py-4 font-semibold text-blue-700">{item.objective_satisfaction == null ? 'N/A' : `${item.objective_satisfaction}%`}</td><td className="px-3 py-4 text-slate-600">{formatValue(item.concession_count ?? pattern.concession_count)}</td><td className="px-3 py-4 text-slate-600">{actions}</td><td className="px-3 py-4 text-slate-600">{item.contribution_to_agreement ? 'Contributed to agreement' : agreementReached ? 'Participated' : 'Participated'}</td></tr>; })}</tbody></table>{participants.length === 0 && <p className="py-4 text-sm text-slate-500">No participant performance data was recorded.</p>}</div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Negotiation summary</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['Total rounds', analysis.rounds], ['Final outcome', agreementReached ? 'Agreement reached' : 'No agreement'], ['Accepted participants', (terms.accepted_participants || []).join(', ') || 'None'], ['Agreement status', formatValue(analysis.status)]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 break-words font-semibold text-slate-800">{formatValue(value)}</p></div>)}</div>
      </section>
    </main>
  );
}

export default Outcome;
