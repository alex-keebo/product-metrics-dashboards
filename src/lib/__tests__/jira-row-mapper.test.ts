import { describe, it, expect, vi } from 'vitest'
import type { JiraIssue } from '@/lib/jira'

vi.mock('@/lib/jira', () => ({
  jiraBrowseUrl: (key: string) => `https://keebo.atlassian.net/browse/${key}`,
}))

const { toRow, intervalStart } = await import('../jira-row-mapper')

function baseIssue(overrides: Partial<JiraIssue['fields']> = {}): JiraIssue {
  return {
    id: '1',
    key: 'PM-585',
    fields: {
      issuetype: { name: 'Idea' },
      summary: 'Do the thing',
      status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
      customfield_10383: 420,
      customfield_10049: { value: '26-Q2' },
      customfield_10062: '{"start":"2026-07-01","end":"2026-07-15"}',
      customfield_10063: '{"start":"2026-08-01","end":"2026-08-15"}',
      customfield_10891: '{"start":"2026-08-20","end":"2026-08-20"}',
      customfield_10892: '{"start":"2026-08-10","end":"2026-08-10"}',
      customfield_10064: [{ value: 'KWO for Databricks' }, { value: 'KWO for Snowflake' }],
      customfield_10048: [{ value: 'Platform' }],
      customfield_10059: null,
      customfield_10925: 120000,
      customfield_10926: 'OPP-1234',
      ...overrides,
    },
  }
}

describe('intervalStart', () => {
  it('extracts the start date from a JSON interval string', () => {
    expect(intervalStart('{"start":"2026-07-01","end":"2026-07-15"}')).toBe('2026-07-01')
  })

  it('returns null for null input', () => {
    expect(intervalStart(null)).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(intervalStart('not json')).toBeNull()
  })
})

describe('toRow', () => {
  it('maps a full issue to a PMBoardRow', () => {
    expect(toRow(baseIssue())).toEqual({
      key: 'PM-585',
      url: 'https://keebo.atlassian.net/browse/PM-585',
      issueType: 'Idea',
      summary: 'Do the thing',
      status: 'In Progress',
      statusCategory: 'indeterminate',
      priorityOrder: 420,
      roadmap: '26-Q2',
      targetStartDate: '2026-07-01',
      targetCompletionDate: '2026-08-01',
      actualCompletionDate: '2026-08-10',
      featureReleaseDate: '2026-08-20',
      product: ['KWO for Databricks', 'KWO for Snowflake'],
      category: ['Platform'],
      keyCustomers: [],
      salesforceTotalArr: 120000,
      salesforceOpportunities: 'OPP-1234',
    })
  })

  it('defaults missing scalar fields to empty string/null', () => {
    const row = toRow(baseIssue({ issuetype: null, status: null, customfield_10383: null, customfield_10049: null }))
    expect(row).toMatchObject({
      issueType: '',
      status: '',
      statusCategory: '',
      priorityOrder: null,
      roadmap: null,
    })
  })

  it('defaults featureReleaseDate to null when customfield_10891 is null', () => {
    const row = toRow(baseIssue({ customfield_10891: null }))
    expect(row.featureReleaseDate).toBeNull()
  })
})
