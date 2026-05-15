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

export function reconcileUsageWithHookEvents(
  records: readonly UsageRecordFact[],
  hookEvents: readonly HookEvent[],
): UsageRecordFact[] {
  const windows = hookEvents.map(eventWindow)

  return records.map((record) => {
    const byTurnId =
      record.turnId &&
      hookEvents.find((event) => event.agent === record.agent && event.turn_id === record.turnId)
    if (byTurnId) return applyAttribution(record, byTurnId, 'turn_id', 1)

    const bySessionWindow = windows.find(
      ({ event }) =>
        event.agent === record.agent &&
        event.session_id === record.sessionId &&
        containsTs(eventWindow(event), record.ts),
    )
    if (bySessionWindow) {
      return applyAttribution(record, bySessionWindow.event, 'session_time_window', 0.8)
    }

    const byProjectWindow = windows.find(
      ({ event }) =>
        event.agent === record.agent &&
        event.project !== '_unknown' &&
        event.project === record.project &&
        containsTs(eventWindow(event), record.ts),
    )
    if (byProjectWindow) {
      return applyAttribution(record, byProjectWindow.event, 'project_time_window', 0.5)
    }

    return {
      ...record,
      project: null,
      attributionMethod: 'unmatched',
      attributionConfidence: 0,
      meta: {
        ...record.meta,
        attributionReason: 'unmatched',
      },
    }
  })
}
