import { atom, createStore } from 'jotai'
import type {
  AgentStatus,
  AppPreferences,
  AppUpdateState,
  CliInstallStatus,
  HistoryPeriodDays,
  HistorySummary,
  IpcPushEvent,
  IpcResult,
  MenubarState,
  TodayLiveState,
} from '../../shared/ipc-types'

export const store = createStore()

type HistorySummaryCache = Partial<Record<HistoryPeriodDays, HistorySummary>>

export const todayLiveStateAtom = atom<TodayLiveState | null>(null)
export const historySummariesAtom = atom<HistorySummaryCache>({})
export const menubarStateAtom = atom<MenubarState | null>(null)
export const appPreferencesAtom = atom<AppPreferences | null>(null)
export const agentStatusAtom = atom<AgentStatus[] | null>(null)
export const cliStatusAtom = atom<CliInstallStatus | null>(null)
export const updateStateAtom = atom<AppUpdateState | null>(null)

let refreshSeq = 0
const historyRefreshSeqByPeriod = new Map<HistoryPeriodDays, number>()
let activeHistoryPeriod: HistorySummary['periodDays'] | null = null
let menubarRefreshSeq = 0
let appPreferencesRefreshSeq = 0
let agentStatusRefreshSeq = 0
let cliStatusRefreshSeq = 0
let updateStateRefreshSeq = 0

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

export function clearActiveHistoryPeriod(): void {
  activeHistoryPeriod = null
}

function setHistorySummary(next: HistorySummary): void {
  store.set(historySummariesAtom, {
    ...store.get(historySummariesAtom),
    [next.periodDays]: next,
  })
}

export async function refreshHistorySummary(
  periodDays: HistorySummary['periodDays'],
): Promise<IpcResult<HistorySummary> | null> {
  activeHistoryPeriod = periodDays
  const seq = (historyRefreshSeqByPeriod.get(periodDays) ?? 0) + 1
  historyRefreshSeqByPeriod.set(periodDays, seq)
  try {
    const result = await window.api.invoke('getHistorySummary', { periodDays })
    if (seq !== historyRefreshSeqByPeriod.get(periodDays)) return null
    if (result.ok) {
      setHistorySummary(result.data)
    }
    return result
  } catch {
    // Page-level queries surface initial load errors; push refresh is best-effort.
    return null
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

export async function refreshAgentStatus(): Promise<void> {
  const seq = ++agentStatusRefreshSeq
  try {
    const result = await window.api.invoke('getAgentStatus')
    if (seq !== agentStatusRefreshSeq) return
    if (result.ok) {
      store.set(agentStatusAtom, result.data)
    }
  } catch {
    // Best-effort prefetch.
  }
}

export async function refreshCliStatus(): Promise<void> {
  const seq = ++cliStatusRefreshSeq
  try {
    const result = await window.api.invoke('getCliInstallStatus')
    if (seq !== cliStatusRefreshSeq) return
    if (result.ok) {
      store.set(cliStatusAtom, result.data)
    }
  } catch {
    // Best-effort prefetch.
  }
}

export async function refreshUpdateState(): Promise<void> {
  const seq = ++updateStateRefreshSeq
  try {
    const result = await window.api.invoke('getUpdateState')
    if (seq !== updateStateRefreshSeq) return
    if (result.ok) {
      store.set(updateStateAtom, result.data)
    }
  } catch {
    // Update state is best-effort; explicit actions surface errors.
  }
}

export async function runUpdateAction(): Promise<void> {
  const result = await window.api.invoke('runUpdateAction')
  if (!result.ok) throw new Error(result.error)
  store.set(updateStateAtom, result.data)
}

export async function runUpdateCheck(): Promise<void> {
  const result = await window.api.invoke('runUpdateCheck')
  if (!result.ok) throw new Error(result.error)
  store.set(updateStateAtom, result.data)
}

/**
 * Eagerly load all data needed by the Settings page so switch states
 * are resolved before the user navigates there.
 */
export function prefetchSettingsData(): void {
  void refreshAppPreferences()
  void refreshAgentStatus()
  void refreshCliStatus()
  void refreshUpdateState()
}

export function handlePush(event: IpcPushEvent): void {
  if (event.type === 'db-changed') {
    void refreshTodayLiveState()
    void refreshMenubarState()
    // Incremental history refresh only after the History view has loaded once.
    // This avoids extra IPC work for users who never open History.
    if (activeHistoryPeriod !== null && Object.keys(store.get(historySummariesAtom)).length > 0) {
      void refreshHistorySummary(activeHistoryPeriod)
    }
    return
  }
  if (event.type === 'update-state-changed') {
    void refreshUpdateState()
  }
}
