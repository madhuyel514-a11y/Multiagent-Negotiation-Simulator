import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';

import Home from './pages/Home';
import ScenarioSelection from './pages/ScenarioSelection';
import AgentConfiguration from './pages/AgentConfiguration';
import NegotiationArena from './pages/NegotiationArena';
import PracticeMode from './pages/PracticeMode';
import Outcome from './pages/Outcome';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>

          <Route path="/" element={<Home />} />

          <Route
            path="/scenarios"
            element={<ScenarioSelection />}
          />

          <Route
            path="/configure"
            element={<AgentConfiguration />}
          />

          <Route
            path="/negotiation"
            element={<NegotiationArena />}
          />

          <Route
            path="/practice"
            element={<PracticeMode />}
          />

          <Route
            path="/outcome"
            element={<Outcome />}
          />

        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;