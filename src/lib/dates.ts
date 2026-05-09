import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subWeeks,
  addDays,
  parseISO,
  isBefore,
  isAfter,
  isSameMonth,
} from 'date-fns'
import { Granularity } from './types'

export function lastCompleteWeek(): { start: Date; end: Date } {
  const today = new Date()
  const end = endOfWeek(subWeeks(today, 1), { weekStartsOn: 0 })
  const start = startOfWeek(end, { weekStartsOn: 0 })
  return { start, end }
}

export function priorWeek(weekStart: Date): { start: Date; end: Date } {
  const start = subWeeks(weekStart, 1)
  const end = endOfWeek(start, { weekStartsOn: 0 })
  return { start, end }
}

export function defaultTimeSeriesRange(): { start: Date; end: Date } {
  const { end } = lastCompleteWeek()
  // Go back ~13 complete weeks (91 days) from end of last complete week
  const rawStart = addDays(end, -90)
  const start = startOfWeek(rawStart, { weekStartsOn: 0 })
  return { start, end }
}

export function toDateString(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function formatPeriodLabel(start: Date, end: Date, granularity: Granularity): string {
  switch (granularity) {
    case 'day':
      return format(start, 'yyyy-MM-dd')
    case 'week':
    case 'rolling7':
      return `${format(start, 'yyyy-MM-dd')} – ${format(end, 'yyyy-MM-dd')}`
    case 'month':
      return format(start, 'yyyy-MM')
  }
}

// Compact human-readable labels for charts (not the data table)
export function formatCompactPeriodLabel(start: Date, end: Date, granularity: Granularity): string {
  switch (granularity) {
    case 'day':
      return format(start, 'MMM d')
    case 'week':
    case 'rolling7':
      return isSameMonth(start, end)
        ? `${format(start, 'MMM d')} – ${format(end, 'd')}`
        : `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`
    case 'month':
      return format(start, 'MMM yyyy')
  }
}

// Compact range label from two ISO date strings (e.g. for snapshot week display)
export function formatCompactDateRange(startStr: string, endStr: string): string {
  const start = parseISO(startStr)
  const end = parseISO(endStr)
  if (startStr === endStr) return format(start, 'MMM d')
  return isSameMonth(start, end)
    ? `${format(start, 'MMM d')} – ${format(end, 'd')}`
    : `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`
}

export interface Period {
  label: string
  displayLabel: string
  start: string
  end: string
}

export function buildPeriods(startDate: string, endDate: string, granularity: Granularity): Period[] {
  const periods: Period[] = []
  let cursor = parseISO(startDate)
  const rangeEnd = parseISO(endDate)

  while (!isAfter(cursor, rangeEnd)) {
    let periodEnd: Date

    switch (granularity) {
      case 'day':
        periodEnd = cursor
        break
      case 'week':
        periodEnd = endOfWeek(cursor, { weekStartsOn: 0 })
        break
      case 'rolling7':
        periodEnd = addDays(cursor, 6)
        break
      case 'month':
        periodEnd = endOfMonth(cursor)
        break
    }

    // week and month show partial periods at boundaries — no clipping per spec
    const shouldClamp = granularity === 'day' || granularity === 'rolling7'
    const clampedEnd = shouldClamp && isAfter(periodEnd, rangeEnd) ? rangeEnd : periodEnd

    periods.push({
      label: formatPeriodLabel(cursor, clampedEnd, granularity),
      displayLabel: formatCompactPeriodLabel(cursor, clampedEnd, granularity),
      start: toDateString(cursor),
      end: toDateString(clampedEnd),
    })

    // advance past the range end once the full period (unclamped) is consumed
    cursor = addDays(isAfter(periodEnd, rangeEnd) ? periodEnd : clampedEnd, 1)
  }

  return periods
}

export function snapToGranularityBoundaries(
  startDate: string,
  endDate: string,
  granularity: Granularity
): { start: string; end: string } {
  const start = parseISO(startDate)
  const end = parseISO(endDate)

  switch (granularity) {
    case 'day':
      return { start: startDate, end: endDate }
    case 'rolling7':
      return { start: startDate, end: endDate }
    case 'week': {
      const snappedStart = startOfWeek(start, { weekStartsOn: 0 })
      const snappedEnd = endOfWeek(end, { weekStartsOn: 0 })
      return { start: toDateString(snappedStart), end: toDateString(snappedEnd) }
    }
    case 'month': {
      const snappedStart = startOfMonth(start)
      const snappedEnd = endOfMonth(end)
      return { start: toDateString(snappedStart), end: toDateString(snappedEnd) }
    }
  }
}
