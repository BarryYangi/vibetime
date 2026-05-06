import { BarChart3Icon, SettingsIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: 'Today', icon: BarChart3Icon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

export default function Sidebar() {
  return (
    <aside className="flex w-[14rem] shrink-0 flex-col items-stretch py-3 text-left">
      <div className="mb-4 w-full pl-0 pr-1">
        <p className="w-full text-left font-logo text-[2.35rem] font-bold leading-[0.92] tracking-tight text-foreground">
          vibetime
        </p>
      </div>
      <nav className="electron-no-drag flex flex-1 flex-col gap-1 pl-0 pr-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                buttonVariants({ variant: 'ghost', size: 'sm' }),
                'w-full justify-start',
                isActive && 'bg-accent text-foreground',
                !isActive && 'text-muted-foreground',
              )
            }
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
