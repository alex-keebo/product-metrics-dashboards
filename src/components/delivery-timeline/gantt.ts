import type { PMBoardRow } from '@/app/api/product-planning/pm-board/route'

const QUARTER_START_MONTH: Record<number, number> = { 1: 1, 2: 4, 3: 7, 4: 10 }

export function parseISODate(value: string): Date {
  return new Date(`${value}T00:00:00Z`)
}

export function formatShortDate(value: string): string {
  return parseISODate(value).toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

function diffDaysInclusive(a: Date, b: Date): number {
  return diffDays(a, b) + 1
}

export function quarterMonthRange(label: string): { start: Date; end: Date } {
  const match = /^(\d{2})-Q([1-4])$/.exec(label)
  if (!match) throw new Error(`Invalid fiscal quarter label: ${label}`)
  const year = 2000 + Number(match[1])
  const quarter = Number(match[2])
  const startMonth = QUARTER_START_MONTH[quarter]
  const start = new Date(Date.UTC(year, startMonth, 1))
  const end = new Date(Date.UTC(year, startMonth + 3, 0))
  return { start, end }
}

export function computeAxis(
  quarterLabel: string,
  tickets: PMBoardRow[],
  allowSpillover: boolean
): { axisStart: Date; axisEnd: Date; quarterEnd: Date } {
  const { start, end } = quarterMonthRange(quarterLabel)
  if (!allowSpillover) return { axisStart: start, axisEnd: end, quarterEnd: end }

  let axisEnd = end
  for (const ticket of tickets) {
    const completionDate = effectiveCompletionDate(ticket)
    if (!completionDate) continue
    const delivery = parseISODate(completionDate)
    if (delivery > axisEnd) {
      const extended = endOfMonth(delivery)
      if (extended > axisEnd) axisEnd = extended
    }
  }
  return { axisStart: start, axisEnd, quarterEnd: end }
}

export function barPosition(
  axisStart: Date,
  axisEnd: Date,
  ticketStart: Date,
  ticketEnd: Date
): { leftPct: number; widthPct: number } {
  const totalDays = diffDaysInclusive(axisStart, axisEnd)
  const clampedStart = ticketStart < axisStart ? axisStart : ticketStart
  const clampedEnd = ticketEnd > axisEnd ? axisEnd : ticketEnd
  const startOffsetDays = diffDays(axisStart, clampedStart)
  const durationDays = diffDaysInclusive(clampedStart, clampedEnd)
  return {
    leftPct: (startOffsetDays / totalDays) * 100,
    widthPct: (durationDays / totalDays) * 100,
  }
}

export interface AxisMonth {
  label: string
  leftPct: number
  widthPct: number
  isSpillover: boolean
}

export function axisMonths(axisStart: Date, axisEnd: Date, quarterEnd: Date): AxisMonth[] {
  const totalDays = diffDaysInclusive(axisStart, axisEnd)
  const months: AxisMonth[] = []
  let cursor = new Date(Date.UTC(axisStart.getUTCFullYear(), axisStart.getUTCMonth(), 1))

  while (cursor <= axisEnd) {
    const monthStart = cursor < axisStart ? axisStart : cursor
    const monthEndRaw = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0))
    const monthEnd = monthEndRaw > axisEnd ? axisEnd : monthEndRaw
    months.push({
      label: monthStart.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }),
      leftPct: (diffDays(axisStart, monthStart) / totalDays) * 100,
      widthPct: (diffDaysInclusive(monthStart, monthEnd) / totalDays) * 100,
      isSpillover: monthStart > quarterEnd,
    })
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
  }

  return months
}

export function dividerLeftPct(axisStart: Date, axisEnd: Date, quarterEnd: Date): number | null {
  if (quarterEnd >= axisEnd) return null
  const totalDays = diffDaysInclusive(axisStart, axisEnd)
  return ((diffDays(axisStart, quarterEnd) + 1) / totalDays) * 100
}

function isStartedBefore(ticket: PMBoardRow, axisStart: Date): boolean {
  return ticket.targetStartDate !== null && parseISODate(ticket.targetStartDate) < axisStart
}

export function sortTickets(tickets: PMBoardRow[], axisStart: Date): PMBoardRow[] {
  const priority = (t: PMBoardRow) => t.priorityOrder ?? -Infinity
  return [...tickets].sort((a, b) => {
    const aBefore = isStartedBefore(a, axisStart)
    const bBefore = isStartedBefore(b, axisStart)
    if (aBefore !== bBefore) return aBefore ? -1 : 1
    return priority(b) - priority(a)
  })
}

export function statusPillInfo(statusCategory: string, status?: string): { label: string; className: string } {
  if (status?.toLowerCase() === 'released (in-progress)') {
    return { label: 'Released (In-progress)', className: 'bg-success-light text-success-light-foreground' }
  }
  if (status?.toLowerCase() === 'paused') {
    return { label: 'Paused', className: 'border border-border text-muted-foreground' }
  }
  switch (statusCategory) {
    case 'new':
      return { label: 'To Do', className: 'border border-border text-muted-foreground' }
    case 'indeterminate':
      return { label: 'In Progress', className: 'bg-primary text-primary-foreground' }
    case 'done':
      return { label: 'Done', className: 'bg-success text-success-foreground' }
    default:
      return { label: statusCategory || 'Unknown', className: 'bg-muted text-muted-foreground' }
  }
}

export function effectiveCompletionDate(ticket: PMBoardRow): string | null {
  if (ticket.statusCategory === 'done' && ticket.actualCompletionDate) return ticket.actualCompletionDate
  return ticket.targetCompletionDate
}

export function resolveTicketBar(
  ticket: PMBoardRow,
  axisStart: Date,
  axisEnd: Date
): { start: Date; end: Date; isTbd: boolean } {
  const completionDate = effectiveCompletionDate(ticket)
  const start = ticket.targetStartDate ? parseISODate(ticket.targetStartDate) : axisStart
  const end = completionDate ? parseISODate(completionDate) : axisEnd
  const isTbd = ticket.targetStartDate === null || completionDate === null
  return { start, end, isTbd }
}
