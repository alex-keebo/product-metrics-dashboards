import { NextRequest, NextResponse } from 'next/server'
import { runQuery, AdcAuthError, ORG_ID_PATTERN, loadOrgScopedSql } from '@/lib/bigquery'
import { buildFilterWhereClause } from '@/lib/filterCompiler'
import type { QueryTypeMetricResponse, FilterGroup } from '@/lib/types'

interface QueryTypeMetricRow {
  query_type: string
  metric_value: number
}

const TOP_TYPES_LIMIT = 10
const OTHER_TYPE_LABEL = 'Other'

interface QueryTypeMetricRequestBody {
  org_id: string
  warehouse_names: string[]
  start_date: string
  end_date: string
  filter_conditions?: FilterGroup
}

/** SQL groups by query_type and returns one row per type. Collapses everything past the
 * top 10 (by metric value) into 'Other', then returns rows sorted descending by value. */
export function createQueryTypeMetricRouteHandler(sqlFile: string, logTag: string) {
  return async function POST(request: NextRequest) {
    const body = (await request.json()) as Partial<QueryTypeMetricRequestBody>
    const { org_id: orgId, warehouse_names: warehouseNames, start_date: startDate, end_date: endDate, filter_conditions: filterConditions } = body

    if (!orgId || !warehouseNames?.length || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'org_id, warehouse_names, start_date, and end_date are required' },
        { status: 400 }
      )
    }
    if (!ORG_ID_PATTERN.test(orgId)) {
      return NextResponse.json({ error: 'invalid org_id' }, { status: 400 })
    }

    try {
      let sql = loadOrgScopedSql(sqlFile, orgId)
      let filterParams: Record<string, unknown> = {}
      let filterTypes: Record<string, string | string[]> = {}

      if (filterConditions) {
        const compiled = buildFilterWhereClause(filterConditions)
        filterParams = compiled.params
        filterTypes = compiled.types
        sql = sql.replace('{{FILTER_CLAUSE}}', compiled.sql ? `AND (${compiled.sql})` : '')
      } else {
        sql = sql.replace('{{FILTER_CLAUSE}}', '')
      }

      const rows = await runQuery<QueryTypeMetricRow>(
        sql,
        {
          warehouse_names: warehouseNames,
          start_date: `${startDate} 00:00:00`,
          end_date: `${endDate} 23:59:59`,
          ...filterParams,
        },
        { warehouse_names: ['STRING'], ...filterTypes }
      )

      const totals = new Map<string, number>()
      for (const r of rows) {
        totals.set(r.query_type, (totals.get(r.query_type) ?? 0) + Number(r.metric_value))
      }

      const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])
      const top = sorted.slice(0, TOP_TYPES_LIMIT)
      const rest = sorted.slice(TOP_TYPES_LIMIT)
      const result = top.map(([query_type, value]) => ({ query_type, value }))
      const otherValue = rest.reduce((sum, [, value]) => sum + value, 0)
      if (otherValue > 0) result.push({ query_type: OTHER_TYPE_LABEL, value: otherValue })

      const response: QueryTypeMetricResponse = { rows: result }
      return NextResponse.json(response)
    } catch (err) {
      console.error(`[${logTag}]`, err)
      if (err instanceof AdcAuthError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: 401 })
      }
      return NextResponse.json({ error: String(err) }, { status: 500 })
    }
  }
}
