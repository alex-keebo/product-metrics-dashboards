import { NextResponse } from 'next/server'
import { searchIssues } from '@/lib/jira'
import { toRow, shippedDate } from '@/lib/jira-row-mapper'

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

function isWithinLast90Days(dateStr: string): boolean {
  const date = new Date(`${dateStr}T00:00:00Z`)
  return Date.now() - date.getTime() <= NINETY_DAYS_MS
}

export async function GET(): Promise<NextResponse> {
  try {
    // "cf[10892]"/"cf[10891]" are jira.polaris:interval fields — JQL relational operators
    // silently match nothing against them, so the 90-day recency window is applied in JS
    // below, using whichever date field applies to each ticket's status.
    const jql = `project = PM AND (statusCategory = Done OR status = "Released (In-progress)") AND ("cf[10892]" is not EMPTY OR "cf[10891]" is not EMPTY) ORDER BY updated DESC`
    const issues = await searchIssues(jql)
    const rows = issues
      .map(toRow)
      .filter((row) => {
        const date = shippedDate(row)
        return date !== null && isWithinLast90Days(date)
      })
    return NextResponse.json({ rows })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
