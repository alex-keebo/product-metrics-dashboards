import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const ENV = {
  JIRA_BASE_URL: 'https://keebo.atlassian.net',
  JIRA_EMAIL: 'alex@keebo.ai',
  JIRA_API_TOKEN: 'test-token',
}

function issue(key: string): { id: string; key: string; fields: Record<string, unknown> } {
  return { id: key, key, fields: { summary: `Summary for ${key}` } }
}

describe('searchIssues', () => {
  beforeEach(() => {
    process.env.JIRA_BASE_URL = ENV.JIRA_BASE_URL
    process.env.JIRA_EMAIL = ENV.JIRA_EMAIL
    process.env.JIRA_API_TOKEN = ENV.JIRA_API_TOKEN
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends Basic auth and the jql query param', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ issues: [issue('PM-1')], isLast: true }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await import('../jira').then((m) => m.searchIssues('project = PM'))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('https://keebo.atlassian.net/rest/api/3/search/jql?')
    expect(String(url)).toContain('jql=project')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from('alex@keebo.ai:test-token').toString('base64')}`
    )
  })

  it('paginates via nextPageToken until isLast', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ issues: [issue('PM-1')], isLast: false, nextPageToken: 'tok-2' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ issues: [issue('PM-2')], isLast: true }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const { searchIssues } = await import('../jira')
    const result = await searchIssues('project = PM')

    expect(result.map((i) => i.key)).toEqual(['PM-1', 'PM-2'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[1][0])).toContain('nextPageToken=tok-2')
  })

  it('throws with status and body on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    })
    vi.stubGlobal('fetch', fetchMock)

    const { searchIssues } = await import('../jira')
    await expect(searchIssues('project = PM')).rejects.toThrow(/401/)
  })

  it('throws if JIRA_API_TOKEN is not set', async () => {
    delete process.env.JIRA_API_TOKEN
    const { searchIssues } = await import('../jira')
    await expect(searchIssues('project = PM')).rejects.toThrow('JIRA_API_TOKEN')
  })
})

describe('jiraBrowseUrl', () => {
  it('builds a browse URL from the base URL and issue key', async () => {
    process.env.JIRA_BASE_URL = ENV.JIRA_BASE_URL
    const { jiraBrowseUrl } = await import('../jira')
    expect(jiraBrowseUrl('PM-585')).toBe('https://keebo.atlassian.net/browse/PM-585')
  })
})
