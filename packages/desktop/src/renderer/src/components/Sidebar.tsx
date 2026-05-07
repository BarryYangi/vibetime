import { BarChart3Icon, SettingsIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: 'Today', icon: BarChart3Icon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

type SidebarProps = {
  className?: string
}

export default function Sidebar({ className }: SidebarProps) {
  return (
    <aside
      className={cn('flex w-[13rem] shrink-0 flex-col items-stretch py-3 text-left', className)}
    >
      <div className="mb-4 w-full pl-0 pr-1">
        <p className="w-full text-left font-logo text-[2.35rem] font-bold leading-[0.92] tracking-tight text-foreground">
          VibeTime
        </p>
      </div>
      <nav className="electron-no-drag flex flex-1 flex-col gap-1 pl-0 pr-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                buttonVariants({ variant: 'ghost', size: 'lg' }),
                'h-8.5 w-full justify-start gap-2 rounded-lg px-2.5 text-[13.5px] sm:h-8.5 sm:text-[13.5px]',
                isActive && 'bg-accent text-foreground',
                !isActive && 'text-muted-foreground',
              )
            }
          >
            <Icon aria-hidden="true" className="size-[17px]" />
            <span className="leading-none">{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
