export interface JiraIssueFields {
  issuetype: { name: string } | null
  summary: string | null
  status: { name: string; statusCategory: { key: string } | null } | null
  customfield_10383: number | null
  customfield_10049: { value: string } | null
  customfield_10062: string | null
  customfield_10063: string | null
  customfield_10892: string | null
  customfield_10064: { value: string }[] | null
  customfield_10048: { value: string }[] | null
  customfield_10059: { value: string }[] | null
  customfield_10925: number | null
  customfield_10926: string | null
}

export interface JiraIssue {
  id: string
  key: string
  fields: JiraIssueFields
}

interface SearchResponse {
  issues: JiraIssue[]
  isLast: boolean
  nextPageToken?: string
}

const FIELDS = [
  'issuetype',
  'summary',
  'status',
  'customfield_10383',
  'customfield_10049',
  'customfield_10062',
  'customfield_10063',
  'customfield_10892',
  'customfield_10064',
  'customfield_10048',
  'customfield_10059',
  'customfield_10925',
  'customfield_10926',
]

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

function authHeaders(): HeadersInit {
  const email = requireEnv('JIRA_EMAIL')
  const token = requireEnv('JIRA_API_TOKEN')
  const basic = Buffer.from(`${email}:${token}`).toString('base64')
  return { Accept: 'application/json', Authorization: `Basic ${basic}` }
}

export function jiraBrowseUrl(key: string): string {
  return `${requireEnv('JIRA_BASE_URL')}/browse/${key}`
}

export async function searchIssues(jql: string): Promise<JiraIssue[]> {
  const baseUrl = requireEnv('JIRA_BASE_URL')
  const headers = authHeaders()
  const issues: JiraIssue[] = []
  let nextPageToken: string | undefined

  do {
    const params = new URLSearchParams({ jql, fields: FIELDS.join(','), maxResults: '100' })
    if (nextPageToken) params.set('nextPageToken', nextPageToken)

    const res = await fetch(`${baseUrl}/rest/api/3/search/jql?${params.toString()}`, {
      method: 'GET',
      headers,
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Jira API ${res.status} at /search/jql: ${body}`)
    }
    const data = (await res.json()) as SearchResponse
    issues.push(...data.issues)
    nextPageToken = data.isLast ? undefined : data.nextPageToken
  } while (nextPageToken)

  return issues
}
