import { NextRequest, NextResponse } from 'next/server'
import { searchIssues } from '@/lib/jira'
import { toRow } from '@/lib/jira-row-mapper'

const QUARTER_RE = /^\d{2}-Q[1-4]$/

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl
  const quarter = searchParams.get('quarter')
  if (!quarter || !QUARTER_RE.test(quarter)) {
    return NextResponse.json({ error: 'Missing or invalid "quarter" query param' }, { status: 400 })
  }

  try {
    const jql = `project = PM AND "cf[10049]" = "${quarter}" ORDER BY "cf[10383]" DESC`
    const issues = await searchIssues(jql)
    return NextResponse.json({ rows: issues.map(toRow) })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
