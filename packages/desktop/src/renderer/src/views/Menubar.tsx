import { RadioIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import type { MenubarState } from '../../../shared/ipc-types'
import { useIpcQuery } from '../hooks/useIpcQuery'
import { menubarStateAtom, refreshMenubarState, store } from '../store'

const ACTIVE_REFRESH_INTERVAL_MS = 1000

function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  if (whole < 60) return `${whole}s`
  if (whole < 3600) return `${Math.floor(whole / 60)}m ${whole % 60}s`
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  return `${h}h ${m}m`
}

function setMenubarState(state: MenubarState): void {
  store.set(menubarStateAtom, state)
}

export default function Menubar() {
  const { data: state, error, isLoading } = useIpcQuery(
    'getMenubarState',
    menubarStateAtom,
    setMenubarState,
  )
  const [now, setNow] = useState(() => Date.now() / 1000)

  useEffect(() => {
    if (!state?.active) return
    const timer = window.setInterval(() => {
      setNow(Date.now() / 1000)
      void refreshMenubarState()
    }, ACTIVE_REFRESH_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [state?.active])

  const openMainWindow = () => {
    void window.api.invoke('showMainWindow', {})
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-popover">
        <Spinner className="text-muted-foreground" />
      </div>
    )
  }

  if (!state) {
    return (
      <div className="flex h-screen flex-col justify-between bg-popover p-4 text-popover-foreground">
        <p className="text-[13px] text-muted-foreground">
          {error ?? 'Unable to load menubar state.'}
        </p>
        <Button className="w-full" onClick={openMainWindow} size="sm">
          Open vibetime
        </Button>
      </div>
    )
  }

  const activeTurns = state.activeTurns.map((turn) => ({
    ...turn,
    elapsed: Math.max(0, now - turn.started_at),
  }))

  return (
    <div className="flex h-screen flex-col bg-popover p-4 text-popover-foreground">
      <header className="border-border/70 border-b pb-3">
        <p className="text-[12px] text-muted-foreground">Today</p>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <h1 className="font-heading text-[28px] font-semibold leading-none">VibeTime</h1>
          <span className="font-mono text-[15px] tabular-nums">
            {formatDuration(state.todayTotal)}
          </span>
        </div>
      </header>

      <section className="min-h-0 flex-1 overflow-hidden py-3">
        {state.projects.length > 0 ? (
          <div className="space-y-2.5">
            {state.projects.map((project) => (
              <div className="flex items-baseline justify-between gap-3" key={project.name}>
                <span className="min-w-0 truncate text-[13px] font-medium">{project.name}</span>
                <span className="shrink-0 font-mono text-[12px] text-muted-foreground tabular-nums">
                  {formatDuration(project.total)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">No activity today.</p>
        )}

        <div className="mt-4 border-border/70 border-t pt-3">
          <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
            <RadioIcon aria-hidden className="size-3.5" />
            <span>Active now</span>
          </div>
          {activeTurns.length > 0 ? (
            <div className="space-y-2">
              {activeTurns.map((turn) => (
                <div
                  className="rounded-lg border border-border bg-card px-3 py-2"
                  key={turn.turn_id}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[13px] font-medium">{turn.project}</span>
                    <span className="shrink-0 font-mono text-[12px] text-muted-foreground tabular-nums">
                      {formatDuration(turn.elapsed)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">{turn.agent}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">None</p>
          )}
        </div>
      </section>

      <Button className="w-full" onClick={openMainWindow} size="sm">
        Open vibetime
      </Button>
    </div>
  )
}
