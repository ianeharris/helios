import { Routes, Route } from 'react-router-dom';
import { EnergyHeader } from './components/EnergyHeader.js';
import { NavBar } from './components/NavBar.js';
import { Home } from './pages/Home.js';
import { Rooms } from './pages/Rooms.js';
import { Energy } from './pages/Energy.js';
import { Security } from './pages/Security.js';
import { Settings } from './pages/Settings.js';

export const App = (): JSX.Element => (
  <div className="flex flex-col h-dvh bg-slate-950 text-slate-100 max-w-lg mx-auto">
    <EnergyHeader />

    <main className="flex-1 overflow-y-auto">
      <Routes>
        <Route path="/"         element={<Home />} />
        <Route path="/rooms"    element={<Rooms />} />
        <Route path="/energy"   element={<Energy />} />
        <Route path="/security" element={<Security />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </main>

    <NavBar />
  </div>
);
