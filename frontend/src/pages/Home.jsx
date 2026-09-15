import { useNavigate } from 'react-router-dom';
import {
  Shield, Users, Settings, Globe, Activity,
  PlayCircle, Gamepad2, ArrowRight, Zap,
  CheckCircle, Clock, TrendingUp,
} from 'lucide-react';

const STATS = [
  { value: '3', label: 'Disaster Scenarios', icon: Globe, color: 'var(--gov-color)', bg: 'var(--gov-bg)' },
  { value: '3', label: 'AI Stakeholders', icon: Users, color: 'var(--ngo-color)', bg: 'var(--ngo-bg)' },
  { value: '3', label: 'Personalities', icon: Settings, color: 'var(--dist-color)', bg: 'var(--dist-bg)' },
  { value: '∞', label: 'Negotiation Rounds', icon: TrendingUp, color: 'var(--accent)', bg: 'var(--accent-bg)' },
];

const FEATURES = [
  {
    icon: Users,
    title: 'Multi-Agent AI',
    desc: 'Autonomous stakeholder negotiation across Government, NGO, and District roles.',
    color: 'var(--gov-color)', bg: 'var(--gov-bg)',
  },
  {
    icon: Settings,
    title: 'Configurable Personalities',
    desc: 'Model aggressive, collaborative, or risk-averse negotiation styles.',
    color: 'var(--ngo-color)', bg: 'var(--ngo-bg)',
  },
  {
    icon: Globe,
    title: 'Disaster Scenarios',
    desc: 'Flood, earthquake, and cyclone response simulations with real constraints.',
    color: 'var(--dist-color)', bg: 'var(--dist-bg)',
  },
  {
    icon: Activity,
    title: 'Live Negotiation Feed',
    desc: 'Watch agents deliberate in real-time with streaming AI responses.',
    color: 'var(--accent)', bg: 'var(--accent-bg)',
  },
];

const HOW_IT_WORKS = [
  { step: '01', title: 'Pick a Scenario', desc: 'Choose flood, earthquake, or cyclone relief.' },
  { step: '02', title: 'Configure Agents', desc: 'Set agent personalities and resource quantities.' },
  { step: '03', title: 'Run Negotiation', desc: 'Watch AI agents negotiate or join as a human.' },
  { step: '04', title: 'Review Outcome', desc: 'Analyse allocations, concessions, and performance.' },
];

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Hero ── */}
      <section
        className="relative overflow-hidden rounded-2xl p-8 lg:p-12"
        style={{
          background: 'linear-gradient(135deg, #1a0a00 0%, #2d1200 40%, #0d1117 100%)',
          border: '1px solid rgba(249,115,22,0.2)',
        }}
      >
        {/* Glow orb */}
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)', filter: 'blur(40px)' }}
        />
        <div
          className="pointer-events-none absolute -bottom-16 left-1/3 h-48 w-48 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, var(--accent-2) 0%, transparent 70%)', filter: 'blur(30px)' }}
        />

        <div className="relative z-10 max-w-3xl">
          {/* Badge */}
          <div className="mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{ background: 'rgba(249,115,22,0.15)', color: '#fb923c', border: '1px solid rgba(249,115,22,0.3)' }}>
            <Zap size={12} strokeWidth={2.5} />
            AI-Powered Coordination Platform
          </div>

          <h1 className="text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">
            Disaster Relief
            <br />
            <span className="gradient-text">Resource Negotiation</span>
          </h1>

          <p className="mt-4 max-w-xl text-sm leading-7 sm:text-base" style={{ color: 'rgba(255,255,255,0.65)' }}>
            Simulate AI-powered negotiations between Government, NGO, and District Administration
            stakeholders to allocate disaster relief resources efficiently during emergencies.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              className="btn-accent flex items-center gap-2 px-6 py-3 text-sm"
              onClick={() => { localStorage.setItem('selectedMode', 'ai'); navigate('/scenarios'); }}
            >
              <PlayCircle size={16} />
              AI vs AI Simulation
              <ArrowRight size={14} />
            </button>
            <button
              className="btn-ghost flex items-center gap-2 px-6 py-3 text-sm"
              style={{ color: 'rgba(255,255,255,0.75)', borderColor: 'rgba(255,255,255,0.15)' }}
              onClick={() => { localStorage.setItem('selectedMode', 'practice'); navigate('/scenarios'); }}
            >
              <Gamepad2 size={16} />
              Human Practice Mode
            </button>
          </div>
        </div>

        {/* Floating badge top-right */}
        <div
          className="absolute bottom-6 right-6 hidden rounded-2xl p-4 lg:block"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-white/80">
            <CheckCircle size={14} className="text-emerald-400" />
            MongoDB Persisted
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-xs font-semibold text-white/80">
            <Zap size={14} style={{ color: 'var(--accent)' }} />
            Powered by Gemini + Groq AI
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-xs font-semibold text-white/80">
            <Clock size={14} className="text-blue-400" />
            Real-time SSE Streaming
          </div>
        </div>
      </section>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 stagger">
        {STATS.map(({ value, label, icon: Icon, color, bg }) => (
          <div key={label} className="card card-lift animate-fade-up p-5">
            <div
              className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: bg, color }}
            >
              <Icon size={18} strokeWidth={2} />
            </div>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>{value}</p>
            <p className="mt-0.5 text-xs font-medium" style={{ color: 'var(--text-3)' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* ── Features ── */}
      <section>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>Platform Features</h2>
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>Built for realistic emergency coordination training</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger">
          {FEATURES.map(({ icon: Icon, title, desc, color, bg }) => (
            <div key={title} className="card card-lift animate-fade-up p-5 space-y-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: bg, color }}
              >
                <Icon size={18} strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{title}</h3>
                <p className="mt-1 text-xs leading-5" style={{ color: 'var(--text-3)' }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ── */}
      <section
        className="rounded-2xl p-6 lg:p-8"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <h2 className="mb-6 text-lg font-bold" style={{ color: 'var(--text-1)' }}>How It Works</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map(({ step, title, desc }, i) => (
            <div key={step} className="flex gap-4">
              <div className="flex-shrink-0">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold"
                  style={{ background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}
                >
                  {step}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>{title}</h3>
                <p className="mt-1 text-xs leading-5" style={{ color: 'var(--text-3)' }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            className="btn-accent flex items-center gap-2 px-6 py-2.5 text-sm"
            onClick={() => { localStorage.setItem('selectedMode', 'ai'); navigate('/scenarios'); }}
          >
            <PlayCircle size={15} />
            Start AI Simulation
          </button>
          <button
            className="btn-ghost flex items-center gap-2 px-6 py-2.5 text-sm"
            onClick={() => { localStorage.setItem('selectedMode', 'practice'); navigate('/scenarios'); }}
          >
            <Gamepad2 size={15} />
            Try Practice Mode
          </button>
        </div>
      </section>

    </div>
  );
}
