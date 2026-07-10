import { describe, it, expect } from 'vitest'
import {
  quarterMonthRange,
  computeAxis,
  barPosition,
  axisMonths,
  dividerLeftPct,
  sortTickets,
  statusPillInfo,
  parseISODate,
  resolveTicketBar,
} from '../gantt'
import type { PMBoardRow } from '@/app/api/product-planning/pm-board/route'

function row(overrides: Partial<PMBoardRow> = {}): PMBoardRow {
  return {
    key: 'PM-1',
    url: 'https://keebo.atlassian.net/browse/PM-1',
    issueType: 'Idea',
    summary: 'Ticket',
    status: 'In Progress',
    statusCategory: 'indeterminate',
    priorityOrder: 0,
    roadmap: '26-Q2',
    targetStartDate: null,
    targetDeliveryDate: null,
    actualDeliveryDate: null,
    product: [],
    category: [],
    keyCustomers: [],
    salesforceTotalArr: null,
    salesforceOpportunities: null,
    ...overrides,
  }
}

describe('parseISODate', () => {
  it('parses a YYYY-MM-DD string as UTC midnight', () => {
    const d = parseISODate('2026-05-01')
    expect(d.getUTCFullYear()).toBe(2026)
    expect(d.getUTCMonth()).toBe(4)
    expect(d.getUTCDate()).toBe(1)
  })
})

describe('quarterMonthRange', () => {
  it('26-Q2 -> May 1 - Jul 31, 2026', () => {
    const { start, end } = quarterMonthRange('26-Q2')
    expect(start.toISOString().slice(0, 10)).toBe('2026-05-01')
    expect(end.toISOString().slice(0, 10)).toBe('2026-07-31')
  })

  it('26-Q4 -> Nov 1, 2026 - Jan 31, 2027 (rolls into next calendar year)', () => {
    const { start, end } = quarterMonthRange('26-Q4')
    expect(start.toISOString().slice(0, 10)).toBe('2026-11-01')
    expect(end.toISOString().slice(0, 10)).toBe('2027-01-31')
  })

  it('26-Q1 -> Feb 1 - Apr 30, 2026', () => {
    const { start, end } = quarterMonthRange('26-Q1')
    expect(start.toISOString().slice(0, 10)).toBe('2026-02-01')
    expect(end.toISOString().slice(0, 10)).toBe('2026-04-30')
  })
})

describe('computeAxis', () => {
  it('with allowSpillover=false, axis is fixed to the quarter regardless of ticket dates', () => {
    const tickets = [row({ targetDeliveryDate: '2026-09-04' })]
    const { axisStart, axisEnd, quarterEnd } = computeAxis('26-Q2', tickets, false)
    expect(axisStart.toISOString().slice(0, 10)).toBe('2026-05-01')
    expect(axisEnd.toISOString().slice(0, 10)).toBe('2026-07-31')
    expect(quarterEnd.toISOString().slice(0, 10)).toBe('2026-07-31')
  })

  it('with allowSpillover=true, extends axisEnd to end-of-month of the latest targetDeliveryDate past quarter end', () => {
    const tickets = [row({ targetDeliveryDate: '2026-08-15' }), row({ targetDeliveryDate: '2026-07-20' })]
    const { axisStart, axisEnd, quarterEnd } = computeAxis('26-Q2', tickets, true)
    expect(axisStart.toISOString().slice(0, 10)).toBe('2026-05-01')
    expect(axisEnd.toISOString().slice(0, 10)).toBe('2026-08-31')
    expect(quarterEnd.toISOString().slice(0, 10)).toBe('2026-07-31')
  })

  it('with allowSpillover=true and no ticket past quarter end, axis stays at the quarter end', () => {
    const tickets = [row({ targetDeliveryDate: '2026-07-01' })]
    const { axisEnd } = computeAxis('26-Q2', tickets, true)
    expect(axisEnd.toISOString().slice(0, 10)).toBe('2026-07-31')
  })

  it('ignores tickets with no targetDeliveryDate', () => {
    const tickets = [row({ targetDeliveryDate: null })]
    const { axisEnd } = computeAxis('26-Q2', tickets, true)
    expect(axisEnd.toISOString().slice(0, 10)).toBe('2026-07-31')
  })
})

describe('barPosition', () => {
  it('places a bar spanning the full 31-day axis at 0%/100%', () => {
    const axisStart = parseISODate('2026-05-01')
    const axisEnd = parseISODate('2026-05-31')
    const pos = barPosition(axisStart, axisEnd, parseISODate('2026-05-01'), parseISODate('2026-05-31'))
    expect(pos.leftPct).toBeCloseTo(0, 5)
    expect(pos.widthPct).toBeCloseTo(100, 5)
  })

  it('places a bar starting midway through a 31-day axis', () => {
    const axisStart = parseISODate('2026-05-01')
    const axisEnd = parseISODate('2026-05-31')
    const pos = barPosition(axisStart, axisEnd, parseISODate('2026-05-16'), parseISODate('2026-05-31'))
    expect(pos.leftPct).toBeCloseTo((15 / 31) * 100, 5)
    expect(pos.widthPct).toBeCloseTo((16 / 31) * 100, 5)
  })

  it('clamps a ticket that starts before the axis to the axis start', () => {
    const axisStart = parseISODate('2026-05-01')
    const axisEnd = parseISODate('2026-05-31')
    const pos = barPosition(axisStart, axisEnd, parseISODate('2026-04-01'), parseISODate('2026-05-16'))
    expect(pos.leftPct).toBeCloseTo(0, 5)
    expect(pos.widthPct).toBeCloseTo((16 / 31) * 100, 5)
  })
})

describe('axisMonths', () => {
  it('splits a May 1 - Aug 31 axis (with Jul 31 quarter end) into 4 months, marking Aug as spillover', () => {
    const axisStart = parseISODate('2026-05-01')
    const axisEnd = parseISODate('2026-08-31')
    const quarterEnd = parseISODate('2026-07-31')
    const months = axisMonths(axisStart, axisEnd, quarterEnd)

    expect(months.map((m) => m.label)).toEqual(['May', 'June', 'July', 'August'])
    expect(months.map((m) => m.isSpillover)).toEqual([false, false, false, true])

    expect(months[0].leftPct).toBeCloseTo(0, 2)
    expect(months[0].widthPct).toBeCloseTo((31 / 123) * 100, 2)
    expect(months[1].leftPct).toBeCloseTo((31 / 123) * 100, 2)
    expect(months[1].widthPct).toBeCloseTo((30 / 123) * 100, 2)
    expect(months[2].leftPct).toBeCloseTo((61 / 123) * 100, 2)
    expect(months[2].widthPct).toBeCloseTo((31 / 123) * 100, 2)
    expect(months[3].leftPct).toBeCloseTo((92 / 123) * 100, 2)
    expect(months[3].widthPct).toBeCloseTo((31 / 123) * 100, 2)
  })
})

describe('dividerLeftPct', () => {
  it('returns the boundary position when the axis extends past the quarter end', () => {
    const axisStart = parseISODate('2026-05-01')
    const axisEnd = parseISODate('2026-08-31')
    const quarterEnd = parseISODate('2026-07-31')
    expect(dividerLeftPct(axisStart, axisEnd, quarterEnd)).toBeCloseTo((92 / 123) * 100, 2)
  })

  it('returns null when the axis does not extend past the quarter end', () => {
    const axisStart = parseISODate('2026-05-01')
    const axisEnd = parseISODate('2026-07-31')
    expect(dividerLeftPct(axisStart, axisEnd, axisEnd)).toBeNull()
  })
})

describe('sortTickets', () => {
  it('sorts started-before tickets first by priorityOrder desc, then the rest by priorityOrder desc', () => {
    const axisStart = parseISODate('2026-05-01')
    const a = row({ key: 'A', targetStartDate: '2026-04-01', priorityOrder: 10 })
    const b = row({ key: 'B', targetStartDate: '2026-05-05', priorityOrder: 50 })
    const c = row({ key: 'C', targetStartDate: null, priorityOrder: 100 })
    const d = row({ key: 'D', targetStartDate: '2026-04-15', priorityOrder: 5 })

    const sorted = sortTickets([a, b, c, d], axisStart)
    expect(sorted.map((t) => t.key)).toEqual(['A', 'D', 'C', 'B'])
  })
})

describe('statusPillInfo', () => {
  it('maps new -> To Do', () => {
    expect(statusPillInfo('new').label).toBe('To Do')
  })

  it('maps indeterminate -> In Progress', () => {
    expect(statusPillInfo('indeterminate').label).toBe('In Progress')
  })

  it('maps done -> Done', () => {
    expect(statusPillInfo('done').label).toBe('Done')
  })
})

describe('resolveTicketBar', () => {
  const axisStart = parseISODate('2026-05-01')
  const axisEnd = parseISODate('2026-07-31')

  it('both dates present: uses the real dates and isTbd is false', () => {
    const t = row({ targetStartDate: '2026-05-10', targetDeliveryDate: '2026-06-01' })
    const bar = resolveTicketBar(t, axisStart, axisEnd)
    expect(bar.start.toISOString().slice(0, 10)).toBe('2026-05-10')
    expect(bar.end.toISOString().slice(0, 10)).toBe('2026-06-01')
    expect(bar.isTbd).toBe(false)
  })

  it('missing targetStartDate only: bar opens at axisStart, isTbd is true', () => {
    const t = row({ targetStartDate: null, targetDeliveryDate: '2026-06-01' })
    const bar = resolveTicketBar(t, axisStart, axisEnd)
    expect(bar.start.toISOString().slice(0, 10)).toBe('2026-05-01')
    expect(bar.end.toISOString().slice(0, 10)).toBe('2026-06-01')
    expect(bar.isTbd).toBe(true)
  })

  it('missing targetDeliveryDate only: bar extends to axisEnd, isTbd is true', () => {
    const t = row({ targetStartDate: '2026-05-10', targetDeliveryDate: null })
    const bar = resolveTicketBar(t, axisStart, axisEnd)
    expect(bar.start.toISOString().slice(0, 10)).toBe('2026-05-10')
    expect(bar.end.toISOString().slice(0, 10)).toBe('2026-07-31')
    expect(bar.isTbd).toBe(true)
  })

  it('both missing: bar spans the full axis, isTbd is true', () => {
    const t = row({ targetStartDate: null, targetDeliveryDate: null })
    const bar = resolveTicketBar(t, axisStart, axisEnd)
    expect(bar.start.toISOString().slice(0, 10)).toBe('2026-05-01')
    expect(bar.end.toISOString().slice(0, 10)).toBe('2026-07-31')
    expect(bar.isTbd).toBe(true)
  })
})

describe('sortTickets with a mixed started-before + TBD delivery ticket', () => {
  it('a ticket with a real targetStartDate before axisStart sorts as started-before even when targetDeliveryDate is missing', () => {
    const axisStart = parseISODate('2026-05-01')
    const a = row({ key: 'A', targetStartDate: '2026-04-01', targetDeliveryDate: null, priorityOrder: 1 })
    const b = row({ key: 'B', targetStartDate: '2026-05-10', targetDeliveryDate: '2026-05-20', priorityOrder: 100 })
    const sorted = sortTickets([b, a], axisStart)
    expect(sorted.map((t) => t.key)).toEqual(['A', 'B'])
  })
})
