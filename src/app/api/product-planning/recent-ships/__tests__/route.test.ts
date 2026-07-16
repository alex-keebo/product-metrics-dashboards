import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { JiraIssue } from '@/lib/jira'

vi.mock('@/lib/jira', () => ({
  searchIssues: vi.fn(),
  jiraBrowseUrl: (key: string) => `https://keebo.atlassian.net/browse/${key}`,
}))

function baseIssue(overrides: Partial<JiraIssue['fields']> = {}, key = 'PM-585'): JiraIssue {
  return {
    id: '1',
    key,
    fields: {
      issuetype: { name: 'Idea' },
      summary: 'Do the thing',
      status: { name: 'Done', statusCategory: { key: 'done' } },
      customfield_10383: 420,
      customfield_10049: { value: '26-Q2' },
      customfield_10062: '{"start":"2026-07-01","end":"2026-07-15"}',
      customfield_10063: '{"start":"2026-08-01","end":"2026-08-15"}',
      customfield_10891: null,
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

  it('queries Jira for Done and Released (In-progress) issues, unioned', async () => {
    const { searchIssues } = await import('@/lib/jira')
    vi.mocked(searchIssues).mockResolvedValue([baseIssue()])

    const { GET } = await import('../route')
    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(vi.mocked(searchIssues)).toHaveBeenCalledWith(
      'project = PM AND (statusCategory = Done OR status = "Released (In-progress)") AND ("cf[10892]" is not EMPTY OR "cf[10891]" is not EMPTY) ORDER BY updated DESC'
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
        targetCompletionDate: '2026-08-01',
        actualCompletionDate: '2026-08-10',
        featureReleaseDate: null,
        product: [],
        category: [],
        keyCustomers: [],
        salesforceTotalArr: null,
        salesforceOpportunities: null,
      },
    ])
  })

  it('includes a "Released (In-progress)" ticket with a recent featureReleaseDate', async () => {
    const { searchIssues } = await import('@/lib/jira')
    vi.mocked(searchIssues).mockResolvedValue([
      baseIssue(
        {
          status: { name: 'Released (In-progress)', statusCategory: { key: 'indeterminate' } },
          customfield_10891: '{"start":"2026-08-05","end":"2026-08-05"}',
          customfield_10892: null,
        },
        'PM-600'
      ),
    ])

    const { GET } = await import('../route')
    const res = await GET()
    const body = await res.json()

    expect(body.rows.map((r: { key: string }) => r.key)).toEqual(['PM-600'])
    expect(body.rows[0].featureReleaseDate).toBe('2026-08-05')
  })

  it('excludes a Done ticket whose actualCompletionDate is more than 90 days old, and a Released (In-progress) ticket whose featureReleaseDate is more than 90 days old', async () => {
    const { searchIssues } = await import('@/lib/jira')
    vi.mocked(searchIssues).mockResolvedValue([
      baseIssue({ customfield_10892: '{"start":"2020-01-01","end":"2020-01-01"}' }, 'PM-OLD-DONE'),
      baseIssue(
        {
          status: { name: 'Released (In-progress)', statusCategory: { key: 'indeterminate' } },
          customfield_10891: '{"start":"2020-01-01","end":"2020-01-01"}',
          customfield_10892: null,
        },
        'PM-OLD-RELEASED'
      ),
    ])

    const { GET } = await import('../route')
    const res = await GET()
    const body = await res.json()

    expect(body.rows).toEqual([])
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
