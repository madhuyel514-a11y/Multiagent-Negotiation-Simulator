import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';

import Home from './pages/Home';
import ScenarioSelection from './pages/ScenarioSelection';
import AgentConfiguration from './pages/AgentConfiguration';
import NegotiationArena from './pages/NegotiationArena';
import PracticeMode from './pages/PracticeMode';

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

        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;