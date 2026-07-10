import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { JiraIssue } from '@/lib/jira'

vi.mock('@/lib/jira', () => ({
  searchIssues: vi.fn(),
  jiraBrowseUrl: (key: string) => `https://keebo.atlassian.net/browse/${key}`,
}))
vi.mock('@/lib/fiscal-quarter', () => ({
  quarterWindow: () => ['26-Q2', '26-Q3', 'Future'],
}))

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
      customfield_10892: null,
      customfield_10064: [{ value: 'KWO for Databricks' }, { value: 'KWO for Snowflake' }],
      customfield_10048: [{ value: 'Platform' }],
      customfield_10059: null,
      customfield_10925: 120000,
      customfield_10926: 'OPP-1234',
      ...overrides,
    },
  }
}

describe('GET /api/product-planning/pm-board', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds the JQL from the quarter window and returns flattened rows', async () => {
    const { searchIssues } = await import('@/lib/jira')
    vi.mocked(searchIssues).mockResolvedValue([baseIssue()])

    const { GET } = await import('../route')
    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(vi.mocked(searchIssues)).toHaveBeenCalledWith(
      'project = PM AND "cf[10049]" IN (26-Q2, 26-Q3, Future) ORDER BY "cf[10049]" ASC, "cf[10383]" DESC'
    )
    expect(body.rows).toEqual([
      {
        key: 'PM-585',
        url: 'https://keebo.atlassian.net/browse/PM-585',
        issueType: 'Idea',
        summary: 'Do the thing',
        status: 'In Progress',
        statusCategory: 'indeterminate',
        priorityOrder: 420,
        roadmap: '26-Q2',
        targetStartDate: '2026-07-01',
        targetDeliveryDate: '2026-08-01',
        actualDeliveryDate: null,
        product: ['KWO for Databricks', 'KWO for Snowflake'],
        category: ['Platform'],
        keyCustomers: [],
        salesforceTotalArr: 120000,
        salesforceOpportunities: 'OPP-1234',
      },
    ])
  })

  it('defaults missing scalar fields to null and malformed interval JSON to null', async () => {
    const { searchIssues } = await import('@/lib/jira')
    vi.mocked(searchIssues).mockResolvedValue([
      baseIssue({
        issuetype: null,
        status: null,
        customfield_10383: null,
        customfield_10049: null,
        customfield_10062: 'not json',
      }),
    ])

    const { GET } = await import('../route')
    const res = await GET()
    const body = await res.json()

    expect(body.rows[0]).toMatchObject({
      issueType: '',
      status: '',
      statusCategory: '',
      priorityOrder: null,
      roadmap: null,
      targetStartDate: null,
    })
  })

  it('returns a 502 with the error message when searchIssues throws', async () => {
    const { searchIssues } = await import('@/lib/jira')
    vi.mocked(searchIssues).mockRejectedValue(new Error('Jira API 401 at /search/jql: Unauthorized'))

    const { GET } = await import('../route')
    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(502)
    expect(body.error).toContain('401')
  })
})
