import { describe, it, expect } from 'vitest'
import { groupShippedByMonth } from '../recent-ships'
import type { PMBoardRow } from '@/app/api/product-planning/pm-board/route'

function row(overrides: Partial<PMBoardRow> = {}): PMBoardRow {
  return {
    key: 'PM-1',
    url: 'https://keebo.atlassian.net/browse/PM-1',
    issueType: 'Idea',
    summary: 'Ticket',
    status: 'Done',
    statusCategory: 'done',
    priorityOrder: 0,
    roadmap: '26-Q1',
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

describe('groupShippedByMonth', () => {
  it('excludes tickets with no actualDeliveryDate', () => {
    const groups = groupShippedByMonth([row({ actualDeliveryDate: null })])
    expect(groups).toEqual([])
  })

  it('excludes tickets that are not Done, even with an actualDeliveryDate', () => {
    const groups = groupShippedByMonth([row({ statusCategory: 'indeterminate', actualDeliveryDate: '2026-03-10' })])
    expect(groups).toEqual([])
  })

  it('groups shipped tickets by calendar month, in chronological order', () => {
    const groups = groupShippedByMonth([
      row({ key: 'A', actualDeliveryDate: '2026-03-10', priorityOrder: 5 }),
      row({ key: 'B', actualDeliveryDate: '2026-02-20', priorityOrder: 10 }),
      row({ key: 'C', actualDeliveryDate: '2026-02-05', priorityOrder: 20 }),
    ])

    expect(groups.map((g) => g.monthLabel)).toEqual(['February', 'March'])
    expect(groups[0].tickets.map((t) => t.key)).toEqual(['C', 'B'])
    expect(groups[1].tickets.map((t) => t.key)).toEqual(['A'])
  })

  it('sorts tickets within a month by priorityOrder descending', () => {
    const groups = groupShippedByMonth([
      row({ key: 'LOW', actualDeliveryDate: '2026-02-05', priorityOrder: 1 }),
      row({ key: 'HIGH', actualDeliveryDate: '2026-02-20', priorityOrder: 99 }),
    ])

    expect(groups[0].tickets.map((t) => t.key)).toEqual(['HIGH', 'LOW'])
  })

  it('omits months with no shipped tickets rather than rendering an empty section', () => {
    const groups = groupShippedByMonth([row({ actualDeliveryDate: '2026-03-10' })])
    expect(groups).toHaveLength(1)
    expect(groups[0].monthLabel).toBe('March')
  })
})
