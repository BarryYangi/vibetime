import { describe, expect, it } from 'vitest'
import { allocateDurationByLocalDay, durationWithinWindow, resolveTurnInterval } from './time.js'

describe('time allocation', () => {
  it('resolves explicit duration as the interval ending at event ts', () => {
    expect(resolveTurnInterval({ endTs: 1200, durationSec: 300, startTs: 1 })).toEqual({
      start: 900,
      end: 1200,
    })
  })

  it('clips a completed duration to the requested window', () => {
    expect(
      durationWithinWindow({
        endTs: 20,
        durationSec: 20,
        windowStart: 10,
        windowEnd: 30,
      }),
    ).toBe(10)
  })

  it('returns null when neither duration nor start time is known', () => {
    expect(durationWithinWindow({ endTs: 20, windowStart: 10, windowEnd: 30 })).toBeNull()
  })

  it('allocates a cross-midnight turn to each local day', () => {
    const start = new Date(2026, 0, 1, 23, 50, 0).getTime() / 1000
    const end = new Date(2026, 0, 2, 0, 10, 0).getTime() / 1000
    const rangeStart = new Date(2026, 0, 1, 0, 0, 0).getTime() / 1000
    const rangeEnd = new Date(2026, 0, 3, 0, 0, 0).getTime() / 1000

    expect(
      allocateDurationByLocalDay({ endTs: end, durationSec: end - start, rangeStart, rangeEnd }),
    ).toEqual([
      { day: '2026-01-01', duration: 600 },
      { day: '2026-01-02', duration: 600 },
    ])
  })
})
