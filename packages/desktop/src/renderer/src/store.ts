import { atom, createStore } from 'jotai'
import type {
  AppPreferences,
  HistorySummary,
  IpcPushEvent,
  MenubarState,
  TodayLiveState,
  VibetimeConfig,
} from '../../shared/ipc-types'

export const store = createStore()

export const todayLiveStateAtom = atom<TodayLiveState | null>(null)
export const configAtom = atom<VibetimeConfig | null>(null)
export const historySummaryAtom = atom<HistorySummary | null>(null)
export const menubarStateAtom = atom<MenubarState | null>(null)
export const appPreferencesAtom = atom<AppPreferences | null>(null)

let refreshSeq = 0
let historyRefreshSeq = 0
let menubarRefreshSeq = 0
let appPreferencesRefreshSeq = 0

function activeTurnsEqual(
  a: TodayLiveState['activeTurns'],
  b: TodayLiveState['activeTurns'],
): boolean {
  return (
    a.length === b.length &&
    a.every((turn, index) => {
      const other = b[index]
      if (!other) return false
      return (
        turn.turn_id === other.turn_id &&
        turn.agent === other.agent &&
        turn.project === other.project &&
        turn.session_id === other.session_id &&
        turn.started_at === other.started_at &&
        turn.timezone === other.timezone
      )
    })
  )
}

export function setTodayLiveState(next: TodayLiveState): void {
  const current = store.get(todayLiveStateAtom)
  if (current && next.revision < current.revision) return
  if (
    current &&
    next.revision === current.revision &&
    next.completed.date === current.completed.date &&
    activeTurnsEqual(next.activeTurns, current.activeTurns)
  ) {
    return
  }
  store.set(todayLiveStateAtom, next)
}

export async function refreshTodayLiveState(): Promise<void> {
  const seq = ++refreshSeq
  try {
    const state = await window.api.invoke('getTodayLiveState')
    if (seq !== refreshSeq) return
    if (state.ok) {
      setTodayLiveState(state.data)
    }
  } catch {
    // Push and live refreshes are best-effort; initial page queries still surface errors.
  }
}

export async function refreshHistorySummary(
  periodDays: HistorySummary['periodDays'],
): Promise<void> {
  const seq = ++historyRefreshSeq
  try {
    const result = await window.api.invoke('getHistorySummary', { periodDays })
    if (seq !== historyRefreshSeq) return
    if (result.ok) {
      store.set(historySummaryAtom, result.data)
    }
  } catch {
    // Page-level queries surface initial load errors; push refresh is best-effort.
  }
}

export async function refreshMenubarState(): Promise<void> {
  const seq = ++menubarRefreshSeq
  try {
    const result = await window.api.invoke('getMenubarState')
    if (seq !== menubarRefreshSeq) return
    if (result.ok) {
      store.set(menubarStateAtom, result.data)
    }
  } catch {
    // Menubar refresh is best-effort.
  }
}

export async function refreshAppPreferences(): Promise<void> {
  const seq = ++appPreferencesRefreshSeq
  try {
    const result = await window.api.invoke('getAppPreferences')
    if (seq !== appPreferencesRefreshSeq) return
    if (result.ok) {
      store.set(appPreferencesAtom, result.data)
    }
  } catch {
    // Settings view surfaces explicit errors.
  }
}

export function handlePush(event: IpcPushEvent): void {
  if (event.type === 'db-changed') {
    void refreshTodayLiveState()
    void refreshMenubarState()
  }
}
