import { useState, useMemo } from 'react';
import {
  TrendingDown,
  Award,
  PieChart as PieIcon,
  Activity,
  Layers,
  Info,
  Maximize2,
  Minimize2,
} from 'lucide-react';

const AGENT_COLORS = {
  government: {
    stroke: '#3b82f6',
    fill: 'rgba(59, 130, 246, 0.15)',
    border: 'rgba(59, 130, 246, 0.3)',
    text: 'text-blue-500',
    name: 'Government Agent',
  },
  ngo: {
    stroke: '#10b981',
    fill: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.3)',
    text: 'text-emerald-500',
    name: 'NGO Agent',
  },
  district: {
    stroke: '#a855f7',
    fill: 'rgba(168, 85, 247, 0.15)',
    border: 'rgba(168, 85, 247, 0.3)',
    text: 'text-purple-500',
    name: 'District Admin Agent',
  },
  human: {
    stroke: '#6366f1',
    fill: 'rgba(99, 102, 241, 0.15)',
    border: 'rgba(99, 102, 241, 0.3)',
    text: 'text-indigo-500',
    name: 'Human Participant',
  },
  default: {
    stroke: '#f97316',
    fill: 'rgba(249, 115, 22, 0.15)',
    border: 'rgba(249, 115, 22, 0.3)',
    text: 'text-orange-500',
    name: 'Stakeholder',
  },
};

function getAgentColor(name = '') {
  const n = String(name).toLowerCase();
  if (n.includes('government')) return AGENT_COLORS.government;
  if (n.includes('ngo')) return AGENT_COLORS.ngo;
  if (n.includes('district')) return AGENT_COLORS.district;
  if (n.includes('human') || n.includes('you')) return AGENT_COLORS.human;
  return AGENT_COLORS.default;
}

function flattenAllocation(proposal) {
  const totals = {};
  if (!proposal || typeof proposal !== 'object') return totals;
  for (const [key, val] of Object.entries(proposal)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      for (const [res, amt] of Object.entries(val)) {
        if (typeof amt === 'number') totals[res] = (totals[res] || 0) + amt;
      }
    } else if (typeof val === 'number') {
      totals[key] = (totals[key] || 0) + val;
    }
  }
  return totals;
}

// ─────────────────────────────────────────────────────────────
// RESOURCE TRAJECTORY HELPERS & EXTRACTION
// ─────────────────────────────────────────────────────────────
function extractResourceValue(proposal, resName, districtScope = 'all') {
  if (!proposal || typeof proposal !== 'object') return 0;
  const target = String(resName).toLowerCase().trim();

  // 1. Direct flat key match (e.g. proposal["Food"])
  for (const [k, v] of Object.entries(proposal)) {
    if (String(k).toLowerCase().trim() === target && typeof v === 'number') {
      return v;
    }
  }

  // 2. Nested by district (e.g. proposal["Riverbend District"]["Food"])
  let sum = 0;
  let found = false;
  for (const [district, val] of Object.entries(proposal)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      if (districtScope !== 'all' && district !== districtScope) continue;
      for (const [k, v] of Object.entries(val)) {
        if (String(k).toLowerCase().trim() === target && typeof v === 'number') {
          sum += v;
          found = true;
        }
      }
    }
  }
  return found ? sum : 0;
}

function extractDistrictBreakdown(proposal, resName) {
  const breakdown = {};
  if (!proposal || typeof proposal !== 'object') return breakdown;
  const target = String(resName).toLowerCase().trim();

  for (const [district, val] of Object.entries(proposal)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      for (const [k, v] of Object.entries(val)) {
        if (String(k).toLowerCase().trim() === target && typeof v === 'number') {
          breakdown[district] = v;
        }
      }
    }
  }
  return breakdown;
}

// ─────────────────────────────────────────────────────────────
// SINGLE RESOURCE TRAJECTORY CHART (Timeline across communications)
// ─────────────────────────────────────────────────────────────
function SingleResourceTrajectoryChart({
  resourceName,
  capacity = 0,
  history = [],
  participants = [],
  availableDistricts = [],
}) {
  const [districtScope, setDistrictScope] = useState('all');
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const agentList = useMemo(() => {
    if (participants.length > 0) return participants;
    const found = Array.from(new Set(history.map((h) => h.agent).filter(Boolean)));
    return found.length > 0 ? found : ['Government Agent', 'NGO Agent', 'District Administration Agent'];
  }, [participants, history]);

  // Build communication timeline data from turn 1 to N
  const timelineData = useMemo(() => {
    if (!history || history.length === 0) return { turns: [], globalMax: capacity || 100, globalMin: 0 };

    const latestProposals = {};
    let lastActiveProposal = {};

    // First pass: find initial proposals for each agent to backfill early turns
    const initialProposals = {};
    for (const entry of history) {
      const a = entry.agent;
      const prop = entry.parsed_proposal || entry.proposal || entry.incoming_proposal;
      if (a && prop && Object.keys(prop).length > 0 && !initialProposals[a]) {
        initialProposals[a] = prop;
      }
    }

    const turns = [];
    let globalMax = capacity > 0 ? capacity : 10;
    let globalMin = 0;

    history.forEach((entry, idx) => {
      const turnNum = idx + 1;
      const speakingAgent = entry.agent || 'Unknown';
      const action = (entry.action || 'COUNTER').toUpperCase();
      const rawProp =
        (entry.parsed_proposal && Object.keys(entry.parsed_proposal).length > 0 && entry.parsed_proposal) ||
        (entry.proposal && Object.keys(entry.proposal).length > 0 && entry.proposal) ||
        (action === 'ACCEPT' ? (entry.incoming_proposal || lastActiveProposal) : null);

      if (rawProp && Object.keys(rawProp).length > 0) {
        lastActiveProposal = rawProp;
        latestProposals[speakingAgent] = rawProp;
      }

      const agentValues = {};
      const agentBreakdowns = {};

      agentList.forEach((agent) => {
        const prop = latestProposals[agent] || initialProposals[agent] || lastActiveProposal || {};
        const val = extractResourceValue(prop, resourceName, districtScope);
        const breakdown = extractDistrictBreakdown(prop, resourceName);
        agentValues[agent] = val;
        agentBreakdowns[agent] = breakdown;
        if (val > globalMax) globalMax = val;
      });

      turns.push({
        turn: turnNum,
        round: entry.round || 1,
        agent: speakingAgent,
        action,
        message: entry.message || '',
        agentValues,
        agentBreakdowns,
      });
    });

    return { turns, globalMax: Math.ceil(globalMax * 1.1), globalMin };
  }, [history, agentList, resourceName, districtScope, capacity]);

  const { turns, globalMax } = timelineData;
  const totalTurns = Math.max(1, turns.length);

  const width = 760;
  const height = 280;
  const padLeft = 55;
  const padRight = 35;
  const padTop = 35;
  const padBottom = 45;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const getX = (turnNum) => {
    if (totalTurns <= 1) return padLeft + chartW / 2;
    return padLeft + ((turnNum - 1) / (totalTurns - 1)) * chartW;
  };

  const getY = (val) => {
    if (globalMax === 0) return padTop + chartH;
    return padTop + chartH - (val / globalMax) * chartH;
  };

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
    val: Math.round(globalMax * pct),
    y: padTop + chartH - pct * chartH,
  }));

  const capacityY = capacity > 0 && capacity <= globalMax ? getY(capacity) : null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] p-4 shadow-sm" style={{ background: 'var(--bg-surface)' }}>
      {/* Header with Title and District Scope */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/15 text-amber-500 font-bold text-xs">
            {resourceName.charAt(0)}
          </span>
          <h4 className="text-sm font-bold text-[var(--text-1)]">
            {resourceName}
          </h4>
          {capacity > 0 && (
            <span className="badge rounded-full px-2.5 py-0.5 text-[10px] font-semibold bg-[var(--bg-surface-2)] text-[var(--text-2)] border border-[var(--border-subtle)]">
              Quota Limit: {capacity} units
            </span>
          )}
        </div>

        {/* District scope selector pills if nested */}
        {availableDistricts.length > 0 && (
          <div className="flex items-center gap-1 rounded-xl p-1 border border-[var(--border-subtle)] text-[11px]" style={{ background: 'var(--bg-surface-2)' }}>
            <button
              type="button"
              onClick={() => setDistrictScope('all')}
              className={`rounded-lg px-2.5 py-1 font-semibold transition-all ${
                districtScope === 'all'
                  ? 'bg-[var(--accent)] text-white shadow-xs font-bold'
                  : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
              }`}
            >
              Total (All Districts)
            </button>
            {availableDistricts.map((dist) => (
              <button
                key={dist}
                type="button"
                onClick={() => setDistrictScope(dist)}
                className={`rounded-lg px-2.5 py-1 font-semibold transition-all ${
                  districtScope === dist
                    ? 'bg-[var(--accent)] text-white shadow-xs font-bold'
                    : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
                }`}
              >
                {dist.replace(' District', '')}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* SVG Chart Canvas */}
      <div className="relative overflow-hidden rounded-xl border border-[var(--border-subtle)] p-2" style={{ background: 'var(--bg-surface-2)' }}>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto select-none">
          <defs>
            {agentList.map((agent) => {
              const color = getAgentColor(agent);
              const gradId = `resgrad-${resourceName.replace(/[^a-zA-Z0-9]/g, '')}-${agent.replace(/[^a-zA-Z0-9]/g, '')}`;
              return (
                <linearGradient key={gradId} id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color.stroke} stopOpacity="0.22" />
                  <stop offset="100%" stopColor={color.stroke} stopOpacity="0.0" />
                </linearGradient>
              );
            })}
          </defs>

          {/* Grid lines */}
          {yTicks.map(({ val, y }, i) => (
            <g key={i}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="var(--border)"
                strokeDasharray="3 3"
                opacity="0.6"
              />
              <text
                x={padLeft - 10}
                y={y + 4}
                fill="var(--text-3)"
                fontSize="10"
                textAnchor="end"
                className="font-mono"
              >
                {val}
              </text>
            </g>
          ))}

          {/* Capacity Reference Benchmark Line */}
          {capacityY !== null && (
            <g>
              <line
                x1={padLeft}
                y1={capacityY}
                x2={width - padRight}
                y2={capacityY}
                stroke="#ef4444"
                strokeDasharray="4 4"
                strokeWidth="1.5"
                opacity="0.75"
              />
              <text
                x={width - padRight - 5}
                y={capacityY - 6}
                fill="#ef4444"
                fontSize="9"
                textAnchor="end"
                className="font-mono font-bold"
              >
                Max Capacity ({capacity})
              </text>
            </g>
          )}

          {/* X Axis Communication Turn Labels */}
          {turns.map((t, idx) => {
            const x = getX(t.turn);
            return (
              <g key={idx}>
                <line
                  x1={x}
                  y1={padTop + chartH}
                  x2={x}
                  y2={padTop + chartH + 5}
                  stroke="var(--border)"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={padTop + chartH + 18}
                  fill={hoveredPoint?.turn === t.turn ? 'var(--accent)' : 'var(--text-3)'}
                  fontSize="9"
                  textAnchor="middle"
                  className="font-mono"
                >
                  T{t.turn}
                </text>
                <text
                  x={x}
                  y={padTop + chartH + 28}
                  fill="var(--text-4)"
                  fontSize="8"
                  textAnchor="middle"
                >
                  {t.agent.split(' ')[0]}
                </text>
              </g>
            );
          })}

          {/* Agent Lines & Dots */}
          {agentList.map((agent) => {
            const color = getAgentColor(agent);
            const gradId = `resgrad-${resourceName.replace(/[^a-zA-Z0-9]/g, '')}-${agent.replace(/[^a-zA-Z0-9]/g, '')}`;

            const points = turns.map((t) => ({
              turn: t.turn,
              round: t.round,
              val: t.agentValues[agent] || 0,
              breakdown: t.agentBreakdowns[agent] || {},
              speakingAgent: t.agent,
              action: t.action,
              isSpeaker: t.agent === agent,
            }));

            if (points.length === 0) return null;

            const pathD = points
              .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(p.turn)} ${getY(p.val)}`)
              .join(' ');

            const areaD = `${pathD} L ${getX(points[points.length - 1].turn)} ${padTop + chartH} L ${getX(points[0].turn)} ${padTop + chartH} Z`;

            return (
              <g key={agent}>
                <path d={areaD} fill={`url(#${gradId})`} />
                <path
                  d={pathD}
                  fill="none"
                  stroke={color.stroke}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Point dots */}
                {points.map((p, pIdx) => {
                  const cx = getX(p.turn);
                  const cy = getY(p.val);
                  const isHovered =
                    hoveredPoint?.agent === agent && hoveredPoint?.turn === p.turn;

                  return (
                    <g key={pIdx} className="cursor-pointer">
                      {p.isSpeaker && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isHovered ? 8 : 6}
                          fill="none"
                          stroke={color.stroke}
                          strokeWidth="1.5"
                          opacity="0.4"
                        />
                      )}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isHovered ? 5.5 : p.isSpeaker ? 4 : 3}
                        fill={p.isSpeaker ? color.stroke : 'var(--bg-surface)'}
                        stroke={color.stroke}
                        strokeWidth="2"
                        className="transition-all duration-150"
                        onMouseEnter={() =>
                          setHoveredPoint({
                            agent,
                            turn: p.turn,
                            round: p.round,
                            val: p.val,
                            breakdown: p.breakdown,
                            speakingAgent: p.speakingAgent,
                            action: p.action,
                            x: cx,
                            y: cy,
                            color: color.stroke,
                          })
                        }
                        onMouseLeave={() => setHoveredPoint(null)}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip */}
        {hoveredPoint && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl px-3 py-2 shadow-xl border text-xs animate-scale-in"
            style={{
              left: `${Math.max(12, Math.min(88, (hoveredPoint.x / width) * 100))}%`,
              top: `${Math.max(5, (hoveredPoint.y / height) * 100)}%`,
              background: 'var(--bg-surface)',
              borderColor: hoveredPoint.color,
            }}
          >
            <div className="flex items-center gap-1.5 font-bold text-[var(--text-1)]">
              <span className="h-2 w-2 rounded-full" style={{ background: hoveredPoint.color }} />
              {hoveredPoint.agent}
            </div>
            <p className="mt-0.5 text-[10px] text-[var(--text-3)]">
              Turn {hoveredPoint.turn} (Round {hoveredPoint.round}) ·{' '}
              <span className="font-semibold text-[var(--accent)]">{hoveredPoint.action}</span>
            </p>
            <p className="mt-1 font-mono font-bold text-[var(--text-1)]">
              {resourceName}: {hoveredPoint.val} units
            </p>

            {/* Breakdown per district */}
            {Object.keys(hoveredPoint.breakdown).length > 0 && (
              <div className="mt-1.5 border-t border-[var(--border-subtle)] pt-1 space-y-0.5 text-[10px] text-[var(--text-2)]">
                {Object.entries(hoveredPoint.breakdown).map(([dist, val]) => (
                  <div key={dist} className="flex justify-between gap-2">
                    <span className="truncate">{dist.replace(' District', '')}:</span>
                    <span className="font-mono font-bold">{val}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend with Current Demands */}
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs pt-1">
        <div className="flex items-center gap-4 flex-wrap">
          {agentList.map((agent) => {
            const color = getAgentColor(agent);
            const lastTurn = turns[turns.length - 1];
            const currentVal = lastTurn?.agentValues[agent] ?? 0;
            return (
              <div key={agent} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: color.stroke }} />
                <span className="text-[var(--text-2)] font-medium">{agent}:</span>
                <strong className="font-mono text-[var(--text-1)]">{currentVal} units</strong>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-[var(--text-3)] italic">
          Tracks proposal variations at each communication step from start to consensus
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPACT MINI TRAJECTORY CARD (For All-Resources Grid)
// ─────────────────────────────────────────────────────────────
function MiniResourceCard({
  resourceName,
  capacity = 0,
  history = [],
  participants = [],
  onSelect,
}) {
  const agentList = useMemo(() => {
    if (participants.length > 0) return participants;
    const found = Array.from(new Set(history.map((h) => h.agent).filter(Boolean)));
    return found.length > 0 ? found : ['Government Agent', 'NGO Agent', 'District Administration Agent'];
  }, [participants, history]);

  const { turns, globalMax } = useMemo(() => {
    let max = capacity || 10;
    const latest = {};
    const t = [];

    history.forEach((entry, idx) => {
      const sp = entry.agent;
      const prop = entry.parsed_proposal || entry.proposal || entry.incoming_proposal;
      if (sp && prop) latest[sp] = prop;

      const vals = {};
      agentList.forEach((a) => {
        const v = extractResourceValue(latest[a] || prop || {}, resourceName);
        vals[a] = v;
        if (v > max) max = v;
      });

      t.push({ turn: idx + 1, vals });
    });

    return { turns: t, globalMax: Math.ceil(max * 1.1) };
  }, [history, agentList, resourceName, capacity]);

  const w = 260;
  const h = 75;
  const pad = 8;
  const cW = w - pad * 2;
  const cH = h - pad * 2;

  const totalTurns = Math.max(1, turns.length);
  const getX = (tn) => pad + ((tn - 1) / Math.max(1, totalTurns - 1)) * cW;
  const getY = (v) => (globalMax === 0 ? pad + cH : pad + cH - (v / globalMax) * cH);

  const lastTurn = turns[turns.length - 1];

  return (
    <div
      onClick={onSelect}
      className="group flex flex-col justify-between rounded-xl border border-[var(--border)] p-3.5 transition-all hover:border-[var(--accent)] hover:shadow-md cursor-pointer"
      style={{ background: 'var(--bg-surface)' }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-500/20 text-amber-500 font-bold text-[10px]">
            {resourceName.charAt(0)}
          </span>
          <span className="text-xs font-bold text-[var(--text-1)] group-hover:text-[var(--accent)] transition-colors">
            {resourceName}
          </span>
        </div>
        {capacity > 0 && (
          <span className="text-[10px] font-mono text-[var(--text-3)]">
            Quota: {capacity}
          </span>
        )}
      </div>

      {/* Mini SVG Sparkline */}
      <div className="my-2 overflow-hidden rounded-lg" style={{ background: 'var(--bg-surface-2)' }}>
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-14 select-none">
          {/* Capacity dashed line */}
          {capacity > 0 && capacity <= globalMax && (
            <line
              x1={pad}
              y1={getY(capacity)}
              x2={w - pad}
              y2={getY(capacity)}
              stroke="#ef4444"
              strokeDasharray="2 2"
              strokeWidth="1"
              opacity="0.5"
            />
          )}

          {/* Lines for each agent */}
          {agentList.map((agent) => {
            const color = getAgentColor(agent);
            const pts = turns.map((t) => ({ x: getX(t.turn), y: getY(t.vals[agent] || 0) }));
            if (pts.length === 0) return null;
            const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

            return (
              <path
                key={agent}
                d={d}
                fill="none"
                stroke={color.stroke}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.85"
              />
            );
          })}
        </svg>
      </div>

      {/* Settled / Current values */}
      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-[var(--border-subtle)]">
        <span className="text-[10px] text-[var(--text-3)]">Latest:</span>
        <div className="flex items-center gap-2">
          {agentList.map((a) => {
            const color = getAgentColor(a);
            const val = lastTurn?.vals[a] ?? 0;
            return (
              <span key={a} className="font-mono font-semibold" style={{ color: color.stroke }}>
                {val}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CHART 1 SUITE: MULTI-RESOURCE CONCESSION & TRAJECTORY SUITE
// ─────────────────────────────────────────────────────────────
function ResourceTrajectorySuite({ history = [], participants = [], scenarioResources = {} }) {
  // Discover all distinct resources across scenarioResources, history proposals, or fallbacks
  const resourcesList = useMemo(() => {
    const set = new Set();

    // 1. From scenarioResources
    if (scenarioResources && typeof scenarioResources === 'object') {
      Object.keys(scenarioResources).forEach((r) => set.add(r));
    }

    // 2. From history proposals
    for (const entry of history) {
      const prop = entry.parsed_proposal || entry.proposal || entry.incoming_proposal || {};
      for (const [k, v] of Object.entries(prop)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          Object.keys(v).forEach((nestedRes) => set.add(nestedRes));
        } else if (typeof v === 'number') {
          set.add(k);
        }
      }
    }

    const arr = Array.from(set).filter(Boolean);
    return arr.length > 0
      ? arr
      : ['Food', 'Medicine', 'Rescue Boats', 'Temporary Shelters', 'Emergency Supplies'];
  }, [scenarioResources, history]);

  // Discover all districts if nested
  const availableDistricts = useMemo(() => {
    const districts = new Set();
    for (const entry of history) {
      const prop = entry.parsed_proposal || entry.proposal || entry.incoming_proposal || {};
      for (const [k, v] of Object.entries(prop)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          districts.add(k);
        }
      }
    }
    return Array.from(districts);
  }, [history]);

  const [selectedResource, setSelectedResource] = useState('all');

  return (
    <div className="space-y-4">
      {/* Header bar with Navigation Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-1)] flex items-center gap-1.5">
            <TrendingDown size={14} className="text-orange-500" />
            Resource Trajectory Curves ({resourcesList.length} Scenario Resources)
          </h4>
          <p className="text-[11px] text-[var(--text-3)]">
            Tracks how each resource is manipulated across every communication step from start to consensus
          </p>
        </div>

        {/* Resource Selector Buttons */}
        <div className="flex items-center gap-1 rounded-xl p-1 border border-[var(--border-subtle)] flex-wrap" style={{ background: 'var(--bg-surface-2)' }}>
          <button
            type="button"
            onClick={() => setSelectedResource('all')}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
              selectedResource === 'all'
                ? 'bg-[var(--accent)] text-white shadow-xs font-bold'
                : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
            }`}
          >
            All Resources Grid
          </button>
          {resourcesList.map((res) => {
            const cap = scenarioResources[res] || 0;
            return (
              <button
                key={res}
                type="button"
                onClick={() => setSelectedResource(res)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                  selectedResource === res
                    ? 'bg-[var(--accent)] text-white shadow-xs font-bold'
                    : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
                }`}
              >
                {res} {cap > 0 ? `(${cap})` : ''}
              </button>
            );
          })}
        </div>
      </div>

      {/* Display mode: Either All Resources Grid or Focused Single Resource Chart */}
      {selectedResource === 'all' ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {resourcesList.map((res) => (
              <MiniResourceCard
                key={res}
                resourceName={res}
                capacity={scenarioResources[res] || 0}
                history={history}
                participants={participants}
                onSelect={() => setSelectedResource(res)}
              />
            ))}
          </div>

          {/* Also render the primary first resource as expanded view */}
          {resourcesList.length > 0 && (
            <SingleResourceTrajectoryChart
              resourceName={resourcesList[0]}
              capacity={scenarioResources[resourcesList[0]] || 0}
              history={history}
              participants={participants}
              availableDistricts={availableDistricts}
            />
          )}
        </div>
      ) : (
        <SingleResourceTrajectoryChart
          resourceName={selectedResource}
          capacity={scenarioResources[selectedResource] || 0}
          history={history}
          participants={participants}
          availableDistricts={availableDistricts}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CHART 2: STAKEHOLDER SATISFACTION & OBJECTIVE FULFILLMENT
// ─────────────────────────────────────────────────────────────
function StakeholderSatisfactionChart({ performance = {}, terms = {} }) {
  const [hoveredAgent, setHoveredAgent] = useState(null);

  const participants = Object.keys(performance);

  const data = useMemo(() => {
    return participants.map((agent) => {
      const stats = performance[agent] || {};
      const avgSat = Math.round(Number(stats.average_satisfaction || stats.objective_satisfaction || 0));
      const acceptanceRate = Math.round(Number(stats.acceptance_rate || 0) * 100);
      const stability = Math.round(Number(stats.proposal_stability || 0) * 100);
      const isAccepted = Boolean(stats.contribution_to_agreement);
      const color = getAgentColor(agent);

      return {
        agent,
        satisfaction: avgSat,
        acceptanceRate,
        stability,
        isAccepted,
        color,
        concessions: stats.concession_count || 0,
        unitsConceded: stats.total_quantity_conceded || 0,
      };
    });
  }, [performance]);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-1)] flex items-center gap-1.5">
          <Award size={14} className="text-emerald-500" />
          Stakeholder Objective Fulfillment
        </h4>
        <p className="text-[11px] text-[var(--text-3)]">
          Evaluates how well the final consensus met each agent's individual goals & priority metrics
        </p>
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] p-4 space-y-4" style={{ background: 'var(--bg-surface)' }}>
        {data.map((item) => (
          <div
            key={item.agent}
            className="space-y-1.5 p-2 rounded-lg transition-colors hover:bg-[var(--bg-surface-2)]"
            onMouseEnter={() => setHoveredAgent(item)}
            onMouseLeave={() => setHoveredAgent(null)}
          >
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color.stroke }} />
                <span className="font-bold text-[var(--text-1)]">{item.agent}</span>
                {item.isAccepted && (
                  <span className="badge text-[9px] py-0 px-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Agreed
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 font-mono">
                <span className="text-[11px] text-[var(--text-2)]">Satisfaction:</span>
                <span className="font-bold text-sm" style={{ color: item.color.stroke }}>
                  {item.satisfaction}%
                </span>
              </div>
            </div>

            {/* Main Satisfaction Bar */}
            <div className="h-3 w-full rounded-full overflow-hidden p-0.5 border border-[var(--border-subtle)]" style={{ background: 'var(--bg-base)' }}>
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${Math.max(5, Math.min(100, item.satisfaction))}%`,
                  background: `linear-gradient(90deg, ${item.color.stroke}88, ${item.color.stroke})`,
                }}
              />
            </div>

            {/* Sub-metrics */}
            <div className="flex items-center justify-between text-[10px] text-[var(--text-3)] pt-0.5">
              <span>Proposal Stability: <strong className="text-[var(--text-2)]">{item.stability}%</strong></span>
              <span>Acceptance Rate: <strong className="text-[var(--text-2)]">{item.acceptanceRate}%</strong></span>
              <span>Concessions Made: <strong className="text-[var(--text-2)]">{item.concessions} ({item.unitsConceded} units)</strong></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CHART 3: RESOURCE ALLOCATION DISTRIBUTION (Sector Distribution)
// ─────────────────────────────────────────────────────────────
function ResourceDistributionChart({ finalAllocation = {}, scenarioResources = {} }) {
  const isNested = useMemo(() => {
    return (
      finalAllocation &&
      typeof finalAllocation === 'object' &&
      Object.values(finalAllocation).some((v) => v && typeof v === 'object' && !Array.isArray(v))
    );
  }, [finalAllocation]);

  // Available resource keys
  const resourceNames = useMemo(() => {
    const fromScenario = Object.keys(scenarioResources || {});
    if (fromScenario.length > 0) return fromScenario;
    if (isNested) {
      const allRes = new Set();
      Object.values(finalAllocation).forEach((sec) => {
        if (sec && typeof sec === 'object') {
          Object.keys(sec).forEach((r) => allRes.add(r));
        }
      });
      return Array.from(allRes);
    }
    return Object.keys(finalAllocation || {});
  }, [scenarioResources, finalAllocation, isNested]);

  const [selectedResource, setSelectedResource] = useState(resourceNames[0] || '');

  // Calculate allocation across sectors for selectedResource
  const distribution = useMemo(() => {
    if (!selectedResource) return [];

    if (isNested) {
      const items = [];
      let totalAllocated = 0;
      const totalSupply = scenarioResources[selectedResource] || 0;

      for (const [sector, resObj] of Object.entries(finalAllocation)) {
        if (resObj && typeof resObj === 'object') {
          const qty = Number(resObj[selectedResource] || 0);
          totalAllocated += qty;
          items.push({ label: sector, qty });
        }
      }

      const unallocated = Math.max(0, totalSupply - totalAllocated);
      if (unallocated > 0) {
        items.push({ label: 'Emergency Reserve', qty: unallocated, isReserve: true });
      }

      const sum = Math.max(1, totalAllocated + unallocated);
      return items.map((item) => ({
        ...item,
        pct: Math.round((item.qty / sum) * 100),
      }));
    } else {
      // Flat allocation
      const items = Object.entries(finalAllocation).map(([label, qty]) => ({
        label,
        qty: Number(qty) || 0,
        pct: 100,
      }));
      return items;
    }
  }, [selectedResource, isNested, finalAllocation, scenarioResources]);

  const palette = ['#3b82f6', '#10b981', '#a855f7', '#f59e0b', '#ec4899', '#6366f1'];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-1)] flex items-center gap-1.5">
            <PieIcon size={14} className="text-blue-500" />
            Sector Resource Distribution
          </h4>
          <p className="text-[11px] text-[var(--text-3)]">
            Shows final allocation proportion divided across districts vs. emergency reserve
          </p>
        </div>

        {/* Resource Selector Tabs */}
        <div className="flex items-center gap-1 flex-wrap">
          {resourceNames.map((res) => (
            <button
              key={res}
              type="button"
              onClick={() => setSelectedResource(res)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                selectedResource === res
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'bg-[var(--bg-surface-2)] text-[var(--text-2)] hover:text-[var(--text-1)] border border-[var(--border-subtle)]'
              }`}
            >
              {res}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] p-4 space-y-4" style={{ background: 'var(--bg-surface)' }}>
        {/* Multi-segment distribution bar */}
        <div className="flex h-5 w-full overflow-hidden rounded-lg p-0.5 border border-[var(--border-subtle)]" style={{ background: 'var(--bg-base)' }}>
          {distribution.map((item, idx) => {
            const color = item.isReserve ? 'rgba(148, 163, 184, 0.4)' : palette[idx % palette.length];
            return (
              <div
                key={item.label}
                className="h-full transition-all duration-500 hover:opacity-90 relative group"
                style={{
                  width: `${Math.max(2, item.pct)}%`,
                  background: color,
                }}
                title={`${item.label}: ${item.qty} units (${item.pct}%)`}
              />
            );
          })}
        </div>

        {/* Distribution Legend & Values */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
          {distribution.map((item, idx) => {
            const color = item.isReserve ? '#94a3b8' : palette[idx % palette.length];
            return (
              <div
                key={item.label}
                className="flex items-center justify-between p-2 rounded-lg border border-[var(--border-subtle)]"
                style={{ background: 'var(--bg-surface-2)' }}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="truncate text-[var(--text-2)] font-medium">{item.label}</span>
                </div>
                <div className="flex items-center gap-1.5 font-mono">
                  <strong className="text-[var(--text-1)]">{item.qty}</strong>
                  <span className="text-[10px] text-[var(--text-3)]">({item.pct}%)</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CHART 4: NEGOTIATION STRATEGY & ACTION DYNAMICS MATRIX
// ─────────────────────────────────────────────────────────────
function NegotiationStrategyMatrix({ performance = {} }) {
  const participants = Object.keys(performance);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-1)] flex items-center gap-1.5">
          <Activity size={14} className="text-purple-500" />
          Negotiation Strategy & Behavioral Profile
        </h4>
        <p className="text-[11px] text-[var(--text-3)]">
          Breakdown of moves executed (Offer, Counter, Accept, Reject) and willingness to concede
        </p>
      </div>

      <div className="rounded-xl border border-[var(--border-subtle)] p-4 space-y-4" style={{ background: 'var(--bg-surface)' }}>
        {participants.map((agent) => {
          const stats = performance[agent] || {};
          const offers = stats.offers || 0;
          const counters = stats.counters || 0;
          const accepts = stats.accepts || 0;
          const rejects = stats.rejects || 0;
          const total = Math.max(1, offers + counters + accepts + rejects);

          const offerPct = Math.round((offers / total) * 100);
          const counterPct = Math.round((counters / total) * 100);
          const acceptPct = Math.round((accepts / total) * 100);
          const rejectPct = Math.round((rejects / total) * 100);

          const color = getAgentColor(agent);

          return (
            <div key={agent} className="space-y-1.5 p-2 rounded-lg" style={{ background: 'var(--bg-surface-2)' }}>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: color.stroke }} />
                  <span className="font-bold text-[var(--text-1)]">{agent}</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-mono">
                  <span className="text-sky-500">OFFER: {offers}</span>
                  <span className="text-amber-500">COUNTER: {counters}</span>
                  <span className="text-emerald-500">ACCEPT: {accepts}</span>
                  {rejects > 0 && <span className="text-rose-500">REJECT: {rejects}</span>}
                </div>
              </div>

              {/* Stacked Action Bar */}
              <div className="flex h-3 w-full overflow-hidden rounded-full border border-[var(--border-subtle)]" style={{ background: 'var(--bg-base)' }}>
                {offers > 0 && <div style={{ width: `${offerPct}%`, background: '#38bdf8' }} title={`Offers: ${offers}`} />}
                {counters > 0 && <div style={{ width: `${counterPct}%`, background: '#fb923c' }} title={`Counters: ${counters}`} />}
                {accepts > 0 && <div style={{ width: `${acceptPct}%`, background: '#34d399' }} title={`Accepts: ${accepts}`} />}
                {rejects > 0 && <div style={{ width: `${rejectPct}%`, background: '#f87171' }} title={`Rejects: ${rejects}`} />}
              </div>

              <div className="flex items-center justify-between text-[10px] text-[var(--text-3)] pt-0.5">
                <span>Concession Count: <strong className="text-[var(--text-1)]">{stats.concession_count || 0}</strong></span>
                <span>Total Quantity Conceded: <strong className="text-[var(--text-1)]">{stats.total_quantity_conceded || 0} units</strong></span>
                <span>Agreement Stance: <strong className="text-emerald-400">{stats.contribution_to_agreement ? 'Harmonized' : 'Unyielding'}</strong></span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN WRAPPER: OUTCOME CHARTS SUITE
// ─────────────────────────────────────────────────────────────
export default function OutcomeCharts({
  outcomeAnalysis = {},
  history = [],
  scenarioResources = {},
  participants = [],
}) {
  const [activeTab, setActiveTab] = useState('all');

  const performance = outcomeAnalysis.agent_performance || {};
  const terms = outcomeAnalysis.agreement_terms || {};
  const finalAllocation = outcomeAnalysis.final_allocation || terms.final_allocation || {};

  const tabs = [
    { id: 'all', label: 'All Charts' },
    { id: 'trajectory', label: 'Convergence Curve' },
    { id: 'satisfaction', label: 'Satisfaction Radar' },
    { id: 'distribution', label: 'Resource Distribution' },
    { id: 'strategy', label: 'Strategy Matrix' },
  ];

  return (
    <section className="space-y-4 rounded-2xl border border-[var(--border)] p-5 animate-fade-in" style={{ background: 'var(--bg-surface)' }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent-bg)] text-[var(--accent)] border border-[var(--accent-border)]">
              <Layers size={16} />
            </span>
            <h3 className="text-sm font-bold text-[var(--text-1)]">
              Interactive Outcome & Negotiation Analytics
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-3)]">
            Multi-dimensional analysis of convergence dynamics, stakeholder satisfaction, and resource allocation
          </p>
        </div>

        {/* View mode buttons */}
        <div className="flex items-center gap-1 rounded-xl p-1 border border-[var(--border-subtle)]" style={{ background: 'var(--bg-surface-2)' }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                activeTab === t.id
                  ? 'bg-[var(--bg-surface)] text-[var(--accent)] shadow-sm font-bold'
                  : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of charts based on activeTab */}
      <div className="grid gap-6">
        {(activeTab === 'all' || activeTab === 'trajectory') && (
          <ResourceTrajectorySuite
            history={history}
            participants={participants}
            scenarioResources={scenarioResources}
          />
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {(activeTab === 'all' || activeTab === 'satisfaction') && (
            <StakeholderSatisfactionChart performance={performance} terms={terms} />
          )}

          {(activeTab === 'all' || activeTab === 'distribution') && (
            <ResourceDistributionChart finalAllocation={finalAllocation} scenarioResources={scenarioResources} />
          )}
        </div>

        {(activeTab === 'all' || activeTab === 'strategy') && (
          <NegotiationStrategyMatrix performance={performance} />
        )}
      </div>
    </section>
  );
}
