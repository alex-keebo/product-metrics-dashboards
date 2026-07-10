import { NextResponse } from 'next/server'
import { searchIssues } from '@/lib/jira'
import { toRow } from '@/lib/jira-row-mapper'

export async function GET(): Promise<NextResponse> {
  try {
    const jql = `project = PM AND statusCategory = Done AND "cf[10892]" >= -90d ORDER BY "cf[10892]" DESC`
    const issues = await searchIssues(jql)
    return NextResponse.json({ rows: issues.map(toRow) })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
