import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Today', icon: '📊' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
]

export default function Sidebar() {
  return (
    <aside className="w-48 bg-tn-bg-dark border-r border-tn-border flex flex-col py-4">
      <div className="px-4 mb-6">
        <h1 className="text-lg font-bold text-tn-primary font-mono">vibetime</h1>
      </div>
      <nav className="flex-1">
        {navItems.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                isActive
                  ? 'text-tn-primary bg-tn-surface'
                  : 'text-tn-muted hover:text-tn-fg hover:bg-tn-surface/50'
              }`
            }
          >
            <span>{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
