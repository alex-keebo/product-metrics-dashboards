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
    targetCompletionDate: null,
    actualCompletionDate: null,
    featureReleaseDate: null,
    product: [],
    category: [],
    keyCustomers: [],
    salesforceTotalArr: null,
    salesforceOpportunities: null,
    ...overrides,
  }
}

describe('groupShippedByMonth', () => {
  it('excludes tickets with no actualCompletionDate', () => {
    const groups = groupShippedByMonth([row({ actualCompletionDate: null })])
    expect(groups).toEqual([])
  })

  it('excludes tickets that are not Done, even with an actualCompletionDate', () => {
    const groups = groupShippedByMonth([row({ statusCategory: 'indeterminate', actualCompletionDate: '2026-03-10' })])
    expect(groups).toEqual([])
  })

  it('groups shipped tickets by calendar month, in chronological order', () => {
    const groups = groupShippedByMonth([
      row({ key: 'A', actualCompletionDate: '2026-03-10', priorityOrder: 5 }),
      row({ key: 'B', actualCompletionDate: '2026-02-20', priorityOrder: 10 }),
      row({ key: 'C', actualCompletionDate: '2026-02-05', priorityOrder: 20 }),
    ])

    expect(groups.map((g) => g.monthLabel)).toEqual(['February', 'March'])
    expect(groups[0].tickets.map((t) => t.key)).toEqual(['C', 'B'])
    expect(groups[1].tickets.map((t) => t.key)).toEqual(['A'])
  })

  it('sorts tickets within a month by priorityOrder descending', () => {
    const groups = groupShippedByMonth([
      row({ key: 'LOW', actualCompletionDate: '2026-02-05', priorityOrder: 1 }),
      row({ key: 'HIGH', actualCompletionDate: '2026-02-20', priorityOrder: 99 }),
    ])

    expect(groups[0].tickets.map((t) => t.key)).toEqual(['HIGH', 'LOW'])
  })

  it('omits months with no shipped tickets rather than rendering an empty section', () => {
    const groups = groupShippedByMonth([row({ actualCompletionDate: '2026-03-10' })])
    expect(groups).toHaveLength(1)
    expect(groups[0].monthLabel).toBe('March')
  })

  it('admits a "Released (In-progress)" ticket and groups it by featureReleaseDate', () => {
    const groups = groupShippedByMonth([
      row({
        key: 'REL',
        status: 'Released (In-progress)',
        statusCategory: 'indeterminate',
        actualCompletionDate: null,
        featureReleaseDate: '2026-04-12',
      }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].monthLabel).toBe('April')
    expect(groups[0].tickets.map((t) => t.key)).toEqual(['REL'])
  })

  it('excludes a "Released (In-progress)" ticket with no featureReleaseDate', () => {
    const groups = groupShippedByMonth([
      row({ status: 'Released (In-progress)', statusCategory: 'indeterminate', featureReleaseDate: null }),
    ])
    expect(groups).toEqual([])
  })

  it('matches status case-insensitively for "Released (In-progress)"', () => {
    const groups = groupShippedByMonth([
      row({
        key: 'REL',
        status: 'released (in-progress)',
        statusCategory: 'indeterminate',
        featureReleaseDate: '2026-04-12',
      }),
    ])
    expect(groups).toHaveLength(1)
  })
})
