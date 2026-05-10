import { useAtomValue } from 'jotai'
import {
  BarChart3Icon,
  CalendarDaysIcon,
  DownloadIcon,
  RadioIcon,
  SettingsIcon,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useI18n } from '../i18n'
import { runUpdateAction, updateStateAtom } from '../store'

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
  const updateState = useAtomValue(updateStateAtom)
  const updateStatus = updateState?.status ?? 'idle'
  const showUpdateAction = updateStatus === 'available'
  const tooltip = t('settings.update.actionDownloadAvailable')

  const handleUpdateAction = async () => {
    try {
      await runUpdateAction()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <aside
      className={cn('flex w-[13rem] shrink-0 flex-col items-stretch pt-3 text-left', className)}
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
      {showUpdateAction && (
        <div className="electron-no-drag mt-auto pl-0 pr-1">
          <Button
            aria-label={tooltip}
            className="cursor-default bg-foreground/6 text-foreground transition-colors hover:bg-foreground/12 dark:bg-foreground/8 dark:hover:bg-foreground/16"
            onClick={handleUpdateAction}
            size="icon-sm"
            title={tooltip}
            variant="secondary"
          >
            <DownloadIcon aria-hidden="true" />
          </Button>
        </div>
      )}
    </aside>
  )
}
