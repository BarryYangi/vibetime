export interface TurnIntervalInput {
  endTs: number
  durationSec?: number | null | undefined
  startTs?: number | null | undefined
}

export interface TimeWindowInput extends TurnIntervalInput {
  windowStart: number
  windowEnd: number
}

export interface DayAllocationInput extends TurnIntervalInput {
  rangeStart: number
  rangeEnd: number
}

export interface TurnInterval {
  start: number
  end: number
}

export interface DayAllocation {
  day: string
  duration: number
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function resolveTurnInterval(input: TurnIntervalInput): TurnInterval | null {
  if (isFiniteNumber(input.durationSec)) {
    const duration = Math.max(0, input.durationSec)
    return {
      start: input.endTs - duration,
      end: input.endTs,
    }
  }

  if (isFiniteNumber(input.startTs)) {
    return {
      start: input.startTs,
      end: input.endTs,
    }
  }

  return null
}

export function durationWithinWindow(input: TimeWindowInput): number | null {
  if (input.windowEnd <= input.windowStart) return 0

  const interval = resolveTurnInterval(input)
  if (!interval) return null

  const start = Math.max(interval.start, input.windowStart)
  const end = Math.min(interval.end, input.windowEnd)
  return Math.max(0, end - start)
}

export function allocateDurationByLocalDay(input: DayAllocationInput): DayAllocation[] {
  if (input.rangeEnd <= input.rangeStart) return []

  const interval = resolveTurnInterval(input)
  if (!interval) return []

  const start = Math.max(interval.start, input.rangeStart)
  const end = Math.min(interval.end, input.rangeEnd)
  if (end <= start) return []

  const allocations: DayAllocation[] = []
  let cursor = start

  while (cursor < end) {
    const cursorDate = new Date(cursor * 1000)
    const dayStart = Math.floor(
      new Date(cursorDate.getFullYear(), cursorDate.getMonth(), cursorDate.getDate()).getTime() /
        1000,
    )
    const nextDayStart = Math.floor(
      new Date(
        cursorDate.getFullYear(),
        cursorDate.getMonth(),
        cursorDate.getDate() + 1,
      ).getTime() / 1000,
    )
    const segmentEnd = Math.min(end, nextDayStart)

    allocations.push({
      day: new Date(dayStart * 1000).toLocaleDateString('en-CA'),
      duration: segmentEnd - cursor,
    })

    cursor = segmentEnd
  }

  return allocations
}
