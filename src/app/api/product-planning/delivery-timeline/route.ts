import { NextRequest, NextResponse } from 'next/server'
import { searchIssues } from '@/lib/jira'
import { toRow } from '@/lib/jira-row-mapper'
import { quarterMonthRange } from '@/components/delivery-timeline/gantt'

const QUARTER_RE = /^\d{2}-Q[1-4]$/

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl
  const quarter = searchParams.get('quarter')
  if (!quarter || !QUARTER_RE.test(quarter)) {
    return NextResponse.json({ error: 'Missing or invalid "quarter" query param' }, { status: 400 })
  }
  const mode = searchParams.get('mode') === 'date' ? 'date' : 'roadmap'

  try {
    if (mode === 'date') {
      // customfield_10063 is a Jira Product Discovery "interval" field (jira.polaris:interval),
      // not a native date field — JQL relational operators silently match nothing against it.
      // Fetch the union of "assigned to this quarter" (a supported operator) and "has any
      // delivery date set" in one query, then apply the date-range filter in JS.
      const { start, end } = quarterMonthRange(quarter)
      const startStr = isoDate(start)
      const endStr = isoDate(end)
      const jql = `project = PM AND ("cf[10049]" = "${quarter}" OR "cf[10063]" is not EMPTY) ORDER BY "cf[10383]" DESC`
      const issues = await searchIssues(jql)
      const rows = issues
        .map(toRow)
        .filter(
          (row) =>
            row.roadmap === quarter ||
            (row.targetCompletionDate !== null && row.targetCompletionDate >= startStr && row.targetCompletionDate <= endStr)
        )
      return NextResponse.json({ rows })
    }

    const jql = `project = PM AND "cf[10049]" = "${quarter}" ORDER BY "cf[10383]" DESC`
    const issues = await searchIssues(jql)
    return NextResponse.json({ rows: issues.map(toRow) })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
