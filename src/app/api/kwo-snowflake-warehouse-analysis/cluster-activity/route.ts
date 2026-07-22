import { NextRequest, NextResponse } from 'next/server'
import { runQuery, AdcAuthError, ORG_ID_PATTERN, loadOrgScopedSql } from '@/lib/bigquery'
import { buildClusterIntervals, type ClusterEventRow } from '@/lib/clusterIntervals'
import type { ClusterActivityResponse } from '@/lib/types'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const orgId = searchParams.get('org_id')
  const warehouseName = searchParams.get('warehouse_name')
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')

  if (!orgId || !warehouseName || !startDate || !endDate) {
    return NextResponse.json(
      { error: 'org_id, warehouse_name, start_date, and end_date are required' },
      { status: 400 }
    )
  }
  if (!ORG_ID_PATTERN.test(orgId)) {
    return NextResponse.json({ error: 'invalid org_id' }, { status: 400 })
  }

  const rangeStart = `${startDate}T00:00:00.000`
  const rangeEnd = `${endDate}T23:59:59.000`

  try {
    const sql = loadOrgScopedSql('kwo_snowflake_warehouse_cluster_events.sql', orgId)

    const rows = await runQuery<ClusterEventRow>(sql, {
      warehouse_name: warehouseName,
      start_date: `${startDate} 00:00:00`,
      end_date: `${endDate} 23:59:59`,
    })

    const intervals = buildClusterIntervals(rows, rangeStart, rangeEnd)
    const response: ClusterActivityResponse = { intervals }
    return NextResponse.json(response)
  } catch (err) {
    console.error('[snf-warehouse-cluster-activity]', err)
    if (err instanceof AdcAuthError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 401 })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
