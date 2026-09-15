import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Home, Map, Settings2, Swords, Gamepad2, BarChart3,
  History, Moon, Sun, Menu, X, Shield, ChevronRight,
} from 'lucide-react';
import { useTheme } from '../App';

const NAV_ITEMS = [
  { to: '/',           icon: Home,      label: 'Home',        end: true },
  { to: '/scenarios',  icon: Map,       label: 'Scenarios' },
  { to: '/configure',  icon: Settings2, label: 'Configure' },
  { to: '/negotiation',icon: Swords,    label: 'AI Arena' },
  { to: '/practice',   icon: Gamepad2,  label: 'Practice' },
  { to: '/outcome',    icon: BarChart3, label: 'Outcome' },
  { to: '/history',    icon: History,   label: 'History' },
];

const PAGE_TITLES = {
  '/':            { title: 'Home', sub: 'AI-powered disaster relief negotiation' },
  '/scenarios':   { title: 'Scenarios', sub: 'Choose a disaster relief scenario' },
  '/configure':   { title: 'Configure Agents', sub: 'Set personalities & resources' },
  '/negotiation': { title: 'Negotiation Arena', sub: 'AI vs AI simulation' },
  '/practice':    { title: 'Practice Mode', sub: 'Human-in-the-loop negotiation' },
  '/outcome':     { title: 'Outcome', sub: 'Final negotiation results' },
  '/history':     { title: 'History', sub: 'Past negotiations' },
};

export default function Layout({ children }) {
  const { isDark, toggle } = useTheme();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const pageInfo = PAGE_TITLES[location.pathname] || { title: 'DRNS', sub: '' };

  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: 'linear-gradient(135deg, var(--accent), #fb923c)', boxShadow: '0 4px 14px var(--accent-glow)' }}
        >
          <Shield size={18} color="#fff" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight" style={{ color: 'var(--text-1)' }}>DRNS</p>
          <p className="text-[10px] font-medium leading-tight" style={{ color: 'var(--text-3)' }}>Negotiation AI</p>
        </div>
      </div>

      <div className="mx-4 mb-4" style={{ height: 1, background: 'var(--border)' }} />

      {/* Nav label */}
      <p className="section-title px-5">Navigation</p>

      {/* Nav Items */}
      <nav className="flex-1 space-y-0.5 px-3">
        {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 group ${
                isActive
                  ? 'text-[var(--accent)]'
                  : 'hover:text-[var(--text-1)]'
              }`
            }
            style={({ isActive }) => ({
              background: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
              color: isActive ? 'var(--sidebar-active-color)' : 'var(--text-2)',
            })}
          >
            {({ isActive }) => (
              <>
                <Icon size={17} strokeWidth={isActive ? 2.2 : 1.8} />
                <span className="flex-1">{label}</span>
                {isActive && <ChevronRight size={13} strokeWidth={2.5} style={{ color: 'var(--accent)' }} />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div className="p-4 space-y-3">
        <div style={{ height: 1, background: 'var(--border)' }} />

        {/* Theme Toggle */}
        <button
          onClick={toggle}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200"
          style={{
            background: 'var(--sidebar-hover-bg)',
            color: 'var(--text-2)',
            border: '1px solid var(--border)',
          }}
        >
          <div
            className="flex h-6 w-11 items-center rounded-full px-0.5 transition-all duration-300"
            style={{
              background: isDark ? 'linear-gradient(135deg, var(--accent), #fb923c)' : 'var(--border)',
              justifyContent: isDark ? 'flex-end' : 'flex-start',
            }}
          >
            <div className="h-5 w-5 rounded-full bg-white shadow-sm flex items-center justify-center">
              {isDark ? <Moon size={10} strokeWidth={2} style={{ color: 'var(--accent)' }} /> : <Sun size={10} strokeWidth={2} color="#ea580c" />}
            </div>
          </div>
          <span>{isDark ? 'Dark Mode' : 'Light Mode'}</span>
        </button>

        {/* Footer info */}
        <p className="text-[10px] text-center" style={{ color: 'var(--text-3)' }}>
          Powered by Gemini AI · FastAPI · React
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg-base)', color: 'var(--text-1)' }}>

      {/* ── Desktop Sidebar ── */}
      <aside
        className="fixed left-0 top-0 z-30 hidden h-screen w-60 flex-col lg:flex select-none overflow-y-auto custom-scrollbar"
        style={{
          background: 'var(--sidebar-bg)',
          borderRight: '1px solid var(--sidebar-border)',
        }}
      >
        <SidebarContent />
      </aside>

      {/* ── Mobile Sidebar Overlay ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.5)' }}
            onClick={() => setSidebarOpen(false)}
          />
          <aside
            className="absolute left-0 top-0 h-full w-64"
            style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--border)' }}
          >
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* ── Main Column ── */}
      <div className="flex flex-1 flex-col lg:ml-60">

        {/* ── Top Bar ── */}
        <header
          className="sticky top-0 z-20 flex items-center justify-between px-5 py-3"
          style={{
            background: 'var(--topbar-bg)',
            borderBottom: '1px solid var(--border)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
          }}
        >
          {/* Left: hamburger + page title */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-1.5 transition-colors lg:hidden"
              style={{ color: 'var(--text-2)' }}
            >
              <Menu size={20} />
            </button>
            <div>
              <h1 className="text-sm font-semibold leading-tight" style={{ color: 'var(--text-1)' }}>
                {pageInfo.title}
              </h1>
              {pageInfo.sub && (
                <p className="text-[11px] leading-tight" style={{ color: 'var(--text-3)' }}>
                  {pageInfo.sub}
                </p>
              )}
            </div>
          </div>

          {/* Right: theme toggle (mobile/tablet) + branding */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 text-[11px] font-medium px-3 py-1.5 rounded-full"
              style={{ background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}>
              <Shield size={11} />
              AI-Powered
            </div>
            <button
              onClick={toggle}
              className="flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 lg:hidden"
              style={{ background: 'var(--bg-surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </header>

        {/* ── Page Content ── */}
        <main className="flex-1 p-5 lg:p-6">
          {children}
        </main>

        {/* ── Footer ── */}
        <footer
          className="px-6 py-4 text-center text-[11px]"
          style={{ color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}
        >
          Disaster Relief Negotiation Simulator · © 2026
        </footer>
      </div>
    </div>
  );
}
