import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/',          label: 'Home',          icon: '▦' },
      { to: '/schedule',  label: 'Schedule',      icon: '📅' },
    ],
  },
  {
    label: 'Sales',
    items: [
      { to: '/clients',   label: 'Clients',       icon: '🏢' },
      { to: '/requests',  label: 'Requests',      icon: '📥' },
      { to: '/quotes',    label: 'Quotes',        icon: '📄' },
    ],
  },
  {
    label: 'Work',
    items: [
      { to: '/projects',  label: 'Landscaping',   icon: '🌿' },
      { to: '/jobs',      label: 'Job Costing',   icon: '🏗' },
    ],
  },
  {
    label: 'Financial',
    items: [
      { to: '/invoices',  label: 'Invoices',      icon: '💰' },
      { to: '/snow',      label: 'Snow Removal',  icon: '❄' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/time',      label: 'Time Tracking', icon: '⏱' },
      { to: '/expenses',  label: 'Expenses',      icon: '🧾' },
    ],
  },
  {
    label: 'Planning',
    items: [
      { to: '/growth',    label: 'Growth Budget', icon: '📈' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { to: '/resources', label: 'Resources',     icon: '⚙' },
      { to: '/reports',   label: 'Reports',       icon: '📊' },
    ],
  },
];

export default function Layout() {
  const [open, setOpen] = useState(true);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Sidebar */}
      <aside className={`flex flex-col bg-[#111111] text-white transition-all duration-200 shrink-0 ${open ? 'w-52' : 'w-14'}`}>
        {/* Logo */}
        <div className="flex items-center justify-between px-3 py-3.5 border-b border-white/10">
          {open && (
            <img src="/logo-dark.png" alt="GreenSun Landscapes" className="h-7 object-contain" />
          )}
          <button onClick={() => setOpen(!open)}
            className="text-gray-500 hover:text-white p-1 rounded transition-colors ml-auto"
            title={open ? 'Collapse' : 'Expand'}>
            {open ? '◀' : '▶'}
          </button>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-4 px-2">
          {NAV_GROUPS.map(group => (
            <div key={group.label}>
              {open && (
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 px-3 mb-1">{group.label}</p>
              )}
              <div className="space-y-0.5">
                {group.items.map(item => (
                  <NavLink key={item.to} to={item.to} end={item.to === '/'}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive ? 'bg-[#27AE60] text-white' : 'text-gray-400 hover:bg-white/10 hover:text-white'
                      }`
                    }>
                    <span className="text-base leading-none shrink-0">{item.icon}</span>
                    {open && <span>{item.label}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {open && (
          <div className="px-4 py-3 border-t border-white/10 text-xs text-gray-600">GreenSun Landscapes</div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

