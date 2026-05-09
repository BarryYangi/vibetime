import { BarChart3Icon, CalendarDaysIcon, RadioIcon, SettingsIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useI18n } from '../i18n'

const navItems = [
  { to: '/', labelKey: 'nav.today', icon: BarChart3Icon },
  { to: '/live', labelKey: 'nav.live', icon: RadioIcon },
  { to: '/history', labelKey: 'nav.history', icon: CalendarDaysIcon },
  { to: '/settings', labelKey: 'nav.settings', icon: SettingsIcon },
] as const

type SidebarProps = {
  className?: string
}

export default function Sidebar({ className }: SidebarProps) {
  const { t } = useI18n()

  return (
    <aside
      className={cn('flex w-[13rem] shrink-0 flex-col items-stretch py-3 text-left', className)}
    >
      <div className="mb-5 w-full pl-0 pr-1">
        <p className="w-full text-left font-logo text-[2rem] font-bold leading-[0.92] tracking-wide text-foreground">
          VibeTime
        </p>
      </div>
      <nav className="electron-no-drag flex flex-1 flex-col gap-1 pl-0 pr-1">
        {navItems.map(({ to, labelKey, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                buttonVariants({ variant: 'ghost', size: 'lg' }),
                'h-9 w-full justify-start gap-2 rounded-lg px-2.5 text-[14px] sm:h-9 sm:text-[14px]',
                isActive && 'bg-accent text-foreground',
                !isActive && 'text-muted-foreground',
              )
            }
          >
            <Icon aria-hidden="true" className="size-[18px]" />
            <span className="leading-none">{t(labelKey)}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
