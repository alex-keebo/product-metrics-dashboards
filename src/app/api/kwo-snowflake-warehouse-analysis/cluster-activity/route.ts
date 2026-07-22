import { NextRequest, NextResponse } from 'next/server'
import { runQuery, AdcAuthError, ORG_ID_PATTERN, loadOrgScopedSql } from '@/lib/bigquery'
import { buildClusterIntervals, buildSizeIntervals, type ClusterEventRow, type SizeEventRow } from '@/lib/clusterIntervals'
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
    const sizeSql = loadOrgScopedSql('kwo_snowflake_warehouse_size_history.sql', orgId)

    const queryParams = {
      warehouse_name: warehouseName,
      start_date: `${startDate} 00:00:00`,
      end_date: `${endDate} 23:59:59`,
    }

    const [rows, sizeRows] = await Promise.all([
      runQuery<ClusterEventRow>(sql, queryParams),
      runQuery<SizeEventRow>(sizeSql, queryParams),
    ])

    const intervals = buildClusterIntervals(rows, rangeStart, rangeEnd)
    const sizeIntervals = buildSizeIntervals(sizeRows, rangeStart, rangeEnd)
    const response: ClusterActivityResponse = { intervals, sizeIntervals }
    return NextResponse.json(response)
  } catch (err) {
    console.error('[snf-warehouse-cluster-activity]', err)
    if (err instanceof AdcAuthError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 401 })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
