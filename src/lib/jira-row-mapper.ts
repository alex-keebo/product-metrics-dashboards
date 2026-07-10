import { jiraBrowseUrl, type JiraIssue } from '@/lib/jira'

export interface PMBoardRow {
  key: string
  url: string
  issueType: string
  summary: string
  status: string
  statusCategory: string
  priorityOrder: number | null
  roadmap: string | null
  targetStartDate: string | null
  targetDeliveryDate: string | null
  actualDeliveryDate: string | null
  product: string[]
  category: string[]
  keyCustomers: string[]
  salesforceTotalArr: number | null
  salesforceOpportunities: string | null
}

export function intervalStart(raw: string | null): string | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { start?: string }
    return parsed.start ?? null
  } catch {
    return null
  }
}

export function toRow(issue: JiraIssue): PMBoardRow {
  const f = issue.fields
  return {
    key: issue.key,
    url: jiraBrowseUrl(issue.key),
    issueType: f.issuetype?.name ?? '',
    summary: f.summary ?? '',
    status: f.status?.name ?? '',
    statusCategory: f.status?.statusCategory?.key ?? '',
    priorityOrder: f.customfield_10383 ?? null,
    roadmap: f.customfield_10049?.value ?? null,
    targetStartDate: intervalStart(f.customfield_10062),
    targetDeliveryDate: intervalStart(f.customfield_10063),
    actualDeliveryDate: intervalStart(f.customfield_10892),
    product: (f.customfield_10064 ?? []).map((v) => v.value),
    category: (f.customfield_10048 ?? []).map((v) => v.value),
    keyCustomers: (f.customfield_10059 ?? []).map((v) => v.value),
    salesforceTotalArr: f.customfield_10925 ?? null,
    salesforceOpportunities: f.customfield_10926 ?? null,
  }
}
