import type { HistoryEvent } from '../history.js'
import type { UsageRecordFact } from './types.js'

type HookEvent = Pick<
  HistoryEvent,
  'agent' | 'event_type' | 'project' | 'session_id' | 'turn_id' | 'ts' | 'duration_sec'
>

type HookWindow = {
  event: HookEvent
  start: number
  end: number
}

function eventWindow(event: HookEvent): HookWindow {
  if (event.event_type === 'turn_end' && typeof event.duration_sec === 'number') {
    return { event, start: event.ts - event.duration_sec, end: event.ts }
  }
  return { event, start: event.ts, end: event.ts + 15 * 60 }
}

function containsTs(window: HookWindow, ts: number | null | undefined): boolean {
  return typeof ts === 'number' && ts >= window.start && ts <= window.end
}

function applyAttribution(
  record: UsageRecordFact,
  event: HookEvent,
  attributionMethod: UsageRecordFact['attributionMethod'],
  attributionConfidence: number,
): UsageRecordFact {
  return {
    ...record,
    project: event.project === '_unknown' ? null : event.project,
    sessionId: event.session_id || record.sessionId || null,
    turnId: event.turn_id ?? record.turnId ?? null,
    attributionMethod,
    attributionConfidence,
    meta: {
      ...record.meta,
      attributionReason: attributionMethod,
    },
  }
}

function scopedKey(agent: string, value: string | null | undefined): string | null {
  return value ? `${agent}:${value}` : null
}

function pushWindow(
  index: Map<string, HookWindow[]>,
  key: string | null,
  window: HookWindow,
): void {
  if (!key) return
  const windows = index.get(key) ?? []
  windows.push(window)
  index.set(key, windows)
}

export function reconcileUsageWithHookEvents(
  records: readonly UsageRecordFact[],
  hookEvents: readonly HookEvent[],
): UsageRecordFact[] {
  const eventsByTurnId = new Map<string, HookEvent>()
  const sessionWindows = new Map<string, HookWindow[]>()
  const projectWindows = new Map<string, HookWindow[]>()

  for (const event of hookEvents) {
    const turnKey = scopedKey(event.agent, event.turn_id)
    if (turnKey && !eventsByTurnId.has(turnKey)) eventsByTurnId.set(turnKey, event)

    const window = eventWindow(event)
    pushWindow(sessionWindows, scopedKey(event.agent, event.session_id), window)
    if (event.project !== '_unknown') {
      pushWindow(projectWindows, scopedKey(event.agent, event.project), window)
    }
  }

  return records.map((record) => {
    const byTurnId = record.turnId
      ? eventsByTurnId.get(`${record.agent}:${record.turnId}`)
      : undefined
    if (byTurnId) return applyAttribution(record, byTurnId, 'turn_id', 1)

    const bySessionWindow = record.sessionId
      ? sessionWindows
          .get(`${record.agent}:${record.sessionId}`)
          ?.find((window) => containsTs(window, record.ts))
      : undefined
    if (bySessionWindow) {
      return applyAttribution(record, bySessionWindow.event, 'session_time_window', 0.8)
    }

    const byProjectWindow = record.project
      ? projectWindows
          .get(`${record.agent}:${record.project}`)
          ?.find((window) => containsTs(window, record.ts))
      : undefined
    if (byProjectWindow) {
      return applyAttribution(record, byProjectWindow.event, 'project_time_window', 0.5)
    }

    return {
      ...record,
      project: record.project ?? null,
      attributionMethod: 'unmatched',
      attributionConfidence: 0,
      meta: {
        ...record.meta,
        attributionReason: 'unmatched',
      },
    }
  })
}
