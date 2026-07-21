import { describe, it, expect } from 'vitest'
import { buildPeriods, formatPeriodLabel, formatCompactPeriodLabel, snapToGranularityBoundaries } from '../dates'
import { parseISO } from 'date-fns'

describe('hour granularity', () => {
  it('buildPeriods produces one period per hour across the day range', () => {
    const periods = buildPeriods('2026-07-01', '2026-07-02', 'hour')
    expect(periods).toHaveLength(48)
    expect(periods[0].start).toBe('2026-07-01T00:00:00')
    expect(periods[0].end).toBe('2026-07-01T00:59:59')
    expect(periods[47].start).toBe('2026-07-02T23:00:00')
    expect(periods[47].end).toBe('2026-07-02T23:59:59')
  })

  it('formatPeriodLabel renders an ISO-like hour label', () => {
    const start = parseISO('2026-07-01T14:00:00')
    expect(formatPeriodLabel(start, start, 'hour')).toBe('2026-07-01T14:00')
  })

  it('formatCompactPeriodLabel renders a short hour label', () => {
    const start = parseISO('2026-07-01T14:00:00')
    expect(formatCompactPeriodLabel(start, start, 'hour')).toBe('Jul 1, 14:00')
  })

  it('snapToGranularityBoundaries is a no-op for hour (date picker stays day-granular)', () => {
    expect(snapToGranularityBoundaries('2026-07-01', '2026-07-02', 'hour')).toEqual({
      start: '2026-07-01',
      end: '2026-07-02',
    })
  })
})
