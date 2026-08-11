import { NavLink } from 'react-router-dom';
import { Shield } from 'lucide-react';

const links = [
  { to: '/', label: 'Home' },
  { to: '/scenarios', label: 'Scenarios' },
  { to: '/configure', label: 'Configure Agents' },
  { to: '/negotiation', label: 'Negotiation' }
];

function Navbar() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
            <Shield size={18} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">
              Disaster Relief Resource Negotiation System
            </h1>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-2">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `rounded-full px-4 py-2 text-sm font-medium transition-all duration-300 ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}

export default Navbar;
