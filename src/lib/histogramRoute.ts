import { NextRequest, NextResponse } from 'next/server'
import { runQuery, AdcAuthError, ORG_ID_PATTERN, loadOrgScopedSql } from '@/lib/bigquery'
import { buildFilterWhereClause } from '@/lib/filterCompiler'
import type { HistogramBucket, HistogramResponse, FilterGroup } from '@/lib/types'

interface HistogramRow {
  bucket_label: string
  bucket_order: number
  query_count: number
}

interface HistogramRequestBody {
  org_id: string
  warehouse_names: string[]
  start_date: string
  end_date: string
  filter_conditions?: FilterGroup
}

export function createHistogramRouteHandler(sqlFile: string, logTag: string) {
  return async function POST(request: NextRequest) {
    const body = (await request.json()) as Partial<HistogramRequestBody>
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

      const rows = await runQuery<HistogramRow>(
        sql,
        {
          warehouse_names: warehouseNames,
          start_date: `${startDate} 00:00:00`,
          end_date: `${endDate} 23:59:59`,
          ...filterParams,
        },
        { warehouse_names: ['STRING'], ...filterTypes }
      )

      const buckets: HistogramBucket[] = rows
        .sort((a, b) => a.bucket_order - b.bucket_order)
        .map((r) => ({ bucket_label: r.bucket_label, query_count: Number(r.query_count) }))

      const response: HistogramResponse = { buckets }
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
