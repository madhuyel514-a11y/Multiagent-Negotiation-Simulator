import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { useState, useCallback, createContext, useContext } from 'react';
import Layout from './components/Layout';

import Home from './pages/Home';
import ScenarioSelection from './pages/ScenarioSelection';
import AgentConfiguration from './pages/AgentConfiguration';
import NegotiationArena from './pages/NegotiationArena';
import PracticeMode from './pages/PracticeMode';
import History from './pages/History';
import Outcome from './pages/Outcome';

// ── Theme Context ──────────────────────────────────────────────
export const ThemeContext = createContext({ isDark: false, toggle: () => {} });
export const useTheme = () => useContext(ThemeContext);

function App() {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains('dark')
  );

  const toggle = useCallback(() => {
    const html = document.documentElement;
    if (html.classList.contains('dark')) {
      html.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setIsDark(false);
    } else {
      html.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setIsDark(true);
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ isDark, toggle }}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/"          element={<Home />} />
            <Route path="/scenarios" element={<ScenarioSelection />} />
            <Route path="/configure" element={<AgentConfiguration />} />
            <Route path="/negotiation" element={<NegotiationArena />} />
            <Route path="/practice"  element={<PracticeMode />} />
            <Route path="/outcome"   element={<Outcome />} />
            <Route path="/history"   element={<History />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </ThemeContext.Provider>
  );
}

export default App;