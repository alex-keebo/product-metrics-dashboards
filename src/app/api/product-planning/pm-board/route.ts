import { NextResponse } from 'next/server'
import { searchIssues } from '@/lib/jira'
import { quarterWindow } from '@/lib/fiscal-quarter'
import { toRow } from '@/lib/jira-row-mapper'

export type { PMBoardRow } from '@/lib/jira-row-mapper'

export async function GET(): Promise<NextResponse> {
  try {
    const quarters = quarterWindow()
    const jql = `project = PM AND "cf[10049]" IN (${quarters.join(', ')}) ORDER BY "cf[10049]" ASC, "cf[10383]" DESC`
    const issues = await searchIssues(jql)
    return NextResponse.json({ rows: issues.map(toRow) })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
