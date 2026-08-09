import { useLocation } from 'react-router-dom';
import Navbar from './Navbar';

const steps = [
  { label: 'Home', path: '/' },
  { label: 'Scenario', path: '/scenarios' },
  { label: 'Configure', path: '/configure' },
  { label: 'Negotiation', path: '/negotiation' }
];

function Layout({ children }) {
  const location = useLocation();
  const currentIndex = steps.findIndex((step) => step.path === location.pathname);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <Navbar />

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8 rounded-[1.75rem] border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur sm:p-5">
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            {steps.map((step, index) => {
              const isActive = index === currentIndex;
              const isCompleted = index < currentIndex;

              return (
                <div key={step.path} className="flex items-center">
                  <div className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-all duration-300 ${isActive ? 'bg-blue-600 text-white shadow-md' : isCompleted ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${isCompleted ? 'bg-emerald-600 text-white' : isActive ? 'bg-white text-blue-600' : 'bg-white text-slate-500'}`}>
                      {isCompleted ? '✓' : index + 1}
                    </span>
                    {step.label}
                  </div>
                  {index < steps.length - 1 && <div className="mx-2 h-px w-5 bg-slate-300 sm:w-6" />}
                </div>
              );
            })}
          </div>
        </div>

        {children}
      </div>

      <footer className="border-t border-slate-200 bg-white/80 py-8 text-center text-sm text-slate-500 backdrop-blur">
        <p className="text-base font-semibold text-slate-700">Disaster Relief Resource Negotiation System</p>
        <p className="mt-1">Powered by React · FastAPI · Gemini AI</p>
        <p className="mt-3 text-xs uppercase tracking-[0.3em] text-slate-400">© 2026</p>
      </footer>
    </div>
  );
}

export default Layout;
