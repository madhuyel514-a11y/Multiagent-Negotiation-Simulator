import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Globe, PlayCircle, Settings, Shield, Users } from 'lucide-react';

const stats = [
  { value: '3', label: 'Disaster Scenarios' },
  { value: '3', label: 'AI Stakeholders' },
  { value: '3', label: 'Negotiation Personalities' },
  { value: '∞', label: 'Multi-Round Negotiation Ready' }
];

const features = [
  {
    title: 'Multi-Agent AI',
    description: 'Autonomous stakeholder negotiation across critical disaster response roles.',
    icon: Users
  },
  {
    title: 'Configurable Personalities',
    description: 'Model aggressive, collaborative, or risk-averse decision styles.',
    icon: Settings
  },
  {
    title: 'Disaster Scenarios',
    description: 'Explore flood, earthquake, and cyclone response simulations.',
    icon: Globe
  },
  {
    title: 'Negotiation Dashboard',
    description: 'Track decision flow and negotiation outcomes with a polished interface.',
    icon: Activity
  }
];

function Home() {
  const navigate = useNavigate();
  const featuresRef = useRef(null);

  const handleLearnMore = () => {
    featuresRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 p-8 text-white shadow-2xl shadow-blue-600/20 sm:p-10 lg:p-14">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-sm font-medium text-blue-50 backdrop-blur">
            <Shield size={16} />
            AI-Powered Coordination Platform
          </div>
          <h1 className="mt-6 text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
            Disaster Relief Resource Negotiation System
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-blue-50 sm:text-xl">
            Simulate AI-powered negotiations between Government, NGO, and District Administration stakeholders to allocate disaster relief resources efficiently during emergencies.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate('/scenarios')}
              className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-base font-semibold text-blue-700 shadow-lg transition-all duration-300 hover:scale-105 hover:bg-slate-100"
            >
              <PlayCircle size={18} />
              Start Simulation
            </button>
            <button
              type="button"
              onClick={handleLearnMore}
              className="rounded-full border border-white/30 bg-white/10 px-6 py-3 text-base font-semibold text-white transition-all duration-300 hover:scale-105 hover:bg-white/20"
            >
              Learn More
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-3xl font-semibold text-slate-900">{stat.value}</div>
            <div className="mt-1 text-sm text-slate-600">{stat.label}</div>
          </div>
        ))}
      </section>

      <section ref={featuresRef} className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <div key={feature.title} className="rounded-[1.5rem] border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <Icon size={20} />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">{feature.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{feature.description}</p>
            </div>
          );
        })}
      </section>
    </div>
  );
}

export default Home;
