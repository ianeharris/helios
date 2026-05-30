import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/',         label: 'Home',     icon: '⌂' },
  { to: '/rooms',    label: 'Rooms',    icon: '🏠' },
  { to: '/energy',   label: 'Energy',   icon: '⚡' },
  { to: '/security', label: 'Security', icon: '🔒' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
] as const;

export const NavBar = (): JSX.Element => (
  <nav className="flex border-t border-slate-800 bg-slate-900">
    {tabs.map(({ to, label, icon }) => (
      <NavLink
        key={to}
        to={to}
        end={to === '/'}
        className={({ isActive }) =>
          `flex-1 flex flex-col items-center py-2 gap-0.5 text-xs transition-colors ${
            isActive ? 'text-amber-400' : 'text-slate-500 active:text-slate-300'
          }`
        }
      >
        <span className="text-lg leading-none">{icon}</span>
        <span>{label}</span>
      </NavLink>
    ))}
  </nav>
);
