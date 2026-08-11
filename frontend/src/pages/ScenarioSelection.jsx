import { useNavigate } from 'react-router-dom';
import ScenarioCard from '../components/ScenarioCard';
import { scenarios } from '../data/scenarios';

function ScenarioSelection() {
  const navigate = useNavigate();

  const handleSelectScenario = (scenario) => {
    localStorage.setItem('selectedScenario', JSON.stringify(scenario));
    navigate('/configure');
  };

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-semibold text-slate-800 sm:text-4xl">
          Choose a Disaster Relief Scenario
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-base text-slate-600 sm:text-lg">
          Select one scenario before configuring the AI agents for the negotiation simulation.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {scenarios.map((scenario) => (
            <ScenarioCard
              key={scenario.id}
              title={scenario.title}
              description={scenario.description}
              scenario={scenario}
              onSelect={() => handleSelectScenario(scenario)}
            />
          ))}
      </div>
    </div>
  );
}

export default ScenarioSelection;
