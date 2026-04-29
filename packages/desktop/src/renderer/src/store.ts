import { createStore, atom } from 'jotai'
import type { TodaySummary, VibetimeConfig, IpcPushEvent } from '../../shared/ipc-types'

export const store = createStore()

export const todaySummaryAtom = atom<TodaySummary | null>(null)
export const configAtom = atom<VibetimeConfig | null>(null)

export function handlePush(event: IpcPushEvent): void {
  if (event.type === 'db-changed') {
    window.api.invoke('getTodaySummary').then((result) => {
      if (result.ok) store.set(todaySummaryAtom, result.data)
    })
  }
}
