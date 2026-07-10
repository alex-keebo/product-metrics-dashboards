import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { JiraIssue } from '@/lib/jira'

vi.mock('@/lib/jira', () => ({
  searchIssues: vi.fn(),
  jiraBrowseUrl: (key: string) => `https://keebo.atlassian.net/browse/${key}`,
}))

function baseIssue(overrides: Partial<JiraIssue['fields']> = {}): JiraIssue {
  return {
    id: '1',
    key: 'PM-585',
    fields: {
      issuetype: { name: 'Idea' },
      summary: 'Do the thing',
      status: { name: 'Done', statusCategory: { key: 'done' } },
      customfield_10383: 420,
      customfield_10049: { value: '26-Q2' },
      customfield_10062: '{"start":"2026-07-01","end":"2026-07-15"}',
      customfield_10063: '{"start":"2026-08-01","end":"2026-08-15"}',
      customfield_10892: '{"start":"2026-08-10","end":"2026-08-10"}',
      customfield_10064: [],
      customfield_10048: [],
      customfield_10059: [],
      customfield_10925: null,
      customfield_10926: null,
      ...overrides,
    },
  }
}

describe('GET /api/product-planning/recent-ships', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries Jira for Done issues delivered in the last 90 days, regardless of roadmap quarter', async () => {
    const { searchIssues } = await import('@/lib/jira')
    vi.mocked(searchIssues).mockResolvedValue([baseIssue()])

    const { GET } = await import('../route')
    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(vi.mocked(searchIssues)).toHaveBeenCalledWith(
      'project = PM AND statusCategory = Done AND "cf[10892]" >= -90d ORDER BY "cf[10892]" DESC'
    )
    expect(body.rows).toEqual([
      {
        key: 'PM-585',
        url: 'https://keebo.atlassian.net/browse/PM-585',
        issueType: 'Idea',
        summary: 'Do the thing',
        status: 'Done',
        statusCategory: 'done',
        priorityOrder: 420,
        roadmap: '26-Q2',
        targetStartDate: '2026-07-01',
        targetDeliveryDate: '2026-08-01',
        actualDeliveryDate: '2026-08-10',
        product: [],
        category: [],
        keyCustomers: [],
        salesforceTotalArr: null,
        salesforceOpportunities: null,
      },
    ])
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
