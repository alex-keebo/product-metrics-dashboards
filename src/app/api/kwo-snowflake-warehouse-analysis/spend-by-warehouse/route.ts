import { NextRequest, NextResponse } from 'next/server'
import { runQuery, AdcAuthError, ORG_ID_PATTERN, loadOrgScopedSql } from '@/lib/bigquery'
import type { WarehouseSpendPoint, WarehouseSpendResponse } from '@/lib/types'

interface WarehouseSpendRow {
  warehouse_name: string
  credits_used: number | null
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    org_id?: string
    warehouse_names?: string[]
    start_date?: string
    end_date?: string
  }
  const orgId = body.org_id ?? null
  const warehouseNames = body.warehouse_names ?? []
  const startDate = body.start_date ?? null
  const endDate = body.end_date ?? null

  if (!orgId || !startDate || !endDate) {
    return NextResponse.json({ error: 'org_id, start_date, and end_date are required' }, { status: 400 })
  }
  if (!ORG_ID_PATTERN.test(orgId)) {
    return NextResponse.json({ error: 'invalid org_id' }, { status: 400 })
  }

  try {
    const sql = loadOrgScopedSql('kwo_snowflake_warehouse_analysis_spend_by_warehouse.sql', orgId)

    const rows = await runQuery<WarehouseSpendRow>(
      sql,
      {
        warehouse_names: warehouseNames,
        start_date: `${startDate} 00:00:00`,
        end_date: `${endDate} 23:59:59.999`,
      },
      { warehouse_names: ['STRING'] }
    )

    const points: WarehouseSpendPoint[] = rows.map((r) => ({
      warehouse_name: r.warehouse_name,
      credits_used: Number(r.credits_used ?? 0),
    }))

    const response: WarehouseSpendResponse = { points }
    return NextResponse.json(response)
  } catch (err) {
    console.error('[snf-warehouse-analysis-spend-by-warehouse]', err)
    if (err instanceof AdcAuthError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 401 })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
