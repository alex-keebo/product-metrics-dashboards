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
      status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
      customfield_10383: 420,
      customfield_10049: { value: '26-Q2' },
      customfield_10062: '{"start":"2026-07-01","end":"2026-07-15"}',
      customfield_10063: '{"start":"2026-08-01","end":"2026-08-15"}',
      customfield_10892: null,
      customfield_10064: [],
      customfield_10048: [],
      customfield_10059: [],
      customfield_10925: null,
      customfield_10926: null,
      ...overrides,
    },
  }
}

function makeRequest(url: string) {
  return { nextUrl: new URL(url) } as unknown as Parameters<typeof import('../route').GET>[0]
}

describe('GET /api/product-planning/delivery-timeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds the single-quarter JQL and returns flattened rows', async () => {
    const { searchIssues } = await import('@/lib/jira')
    vi.mocked(searchIssues).mockResolvedValue([baseIssue()])

    const { GET } = await import('../route')
    const res = await GET(makeRequest('http://localhost/api/product-planning/delivery-timeline?quarter=26-Q2'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(vi.mocked(searchIssues)).toHaveBeenCalledWith(
      'project = PM AND "cf[10049]" = "26-Q2" ORDER BY "cf[10383]" DESC'
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
        product: [],
        category: [],
        keyCustomers: [],
        salesforceTotalArr: null,
        salesforceOpportunities: null,
      },
    ])
  })

  it('returns 400 when the quarter param is missing', async () => {
    const { GET } = await import('../route')
    const res = await GET(makeRequest('http://localhost/api/product-planning/delivery-timeline'))
    expect(res.status).toBe(400)
  })

  it('returns 400 when the quarter param is malformed', async () => {
    const { GET } = await import('../route')
    const res = await GET(makeRequest('http://localhost/api/product-planning/delivery-timeline?quarter=not-a-quarter'))
    expect(res.status).toBe(400)
  })

  it('returns a 502 with the error message when searchIssues throws', async () => {
    const { searchIssues } = await import('@/lib/jira')
    vi.mocked(searchIssues).mockRejectedValue(new Error('Jira API 401 at /search/jql: Unauthorized'))

    const { GET } = await import('../route')
    const res = await GET(makeRequest('http://localhost/api/product-planning/delivery-timeline?quarter=26-Q2'))
    const body = await res.json()

    expect(res.status).toBe(502)
    expect(body.error).toContain('401')
  })
})
