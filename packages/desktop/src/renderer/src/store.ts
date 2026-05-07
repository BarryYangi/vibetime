import { atom, createStore } from 'jotai'
import type { IpcPushEvent, TodayLiveState, VibetimeConfig } from '../../shared/ipc-types'

export const store = createStore()

export const todayLiveStateAtom = atom<TodayLiveState | null>(null)
export const configAtom = atom<VibetimeConfig | null>(null)

let refreshSeq = 0

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

export function handlePush(event: IpcPushEvent): void {
  if (event.type === 'db-changed') {
    void refreshTodayLiveState()
  }
}
