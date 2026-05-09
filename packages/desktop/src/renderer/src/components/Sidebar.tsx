import { BarChart3Icon, CalendarDaysIcon, RadioIcon, SettingsIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: 'Today', icon: BarChart3Icon },
  { to: '/live', label: 'Live', icon: RadioIcon },
  { to: '/history', label: 'History', icon: CalendarDaysIcon },
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
      <div className="mb-6 mt-1 w-full pl-2 pr-1">
        <h2 className="flex items-center gap-2 font-heading text-[1.05rem] font-bold tracking-tight text-foreground">
          VibeTime
        </h2>
      </div>
      <nav className="electron-no-drag flex flex-1 flex-col gap-0.5 pl-0 pr-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                buttonVariants({ variant: 'ghost', size: 'lg' }),
                'h-8.5 w-full justify-start gap-2 rounded-lg px-2.5 text-[13.5px] sm:h-8.5 sm:text-[13.5px] transition-colors',
                isActive && 'bg-accent/80 text-foreground font-medium',
                !isActive && 'text-muted-foreground font-normal hover:bg-accent/40',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon aria-hidden="true" className="size-[17px]" strokeWidth={isActive ? 2.5 : 2} />
                <span className="leading-none">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
