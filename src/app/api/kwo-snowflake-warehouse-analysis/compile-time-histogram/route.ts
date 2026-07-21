import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { runQuery, AdcAuthError } from '@/lib/bigquery'
import type { CompileTimeHistogramBucket, CompileTimeHistogramResponse } from '@/lib/types'

const ORG_ID_PATTERN = /^[0-9a-f]+$/

interface HistogramRow {
  bucket_label: string
  bucket_order: number
  query_count: number
}

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

  try {
    const sqlTemplate = fs.readFileSync(
      path.join(process.cwd(), 'sql', 'kwo_snowflake_warehouse_compile_time_histogram.sql'),
      'utf-8'
    )
    const sql = sqlTemplate.replace(/k3o_prd_ORGID_000_tf/g, `k3o_prd_${orgId}_000_tf`)

    const rows = await runQuery<HistogramRow>(sql, {
      warehouse_name: warehouseName,
      start_date: `${startDate} 00:00:00`,
      end_date: `${endDate} 23:59:59`,
    })

    const buckets: CompileTimeHistogramBucket[] = rows
      .sort((a, b) => a.bucket_order - b.bucket_order)
      .map((r) => ({ bucket_label: r.bucket_label, query_count: Number(r.query_count) }))

    const response: CompileTimeHistogramResponse = { buckets }
    return NextResponse.json(response)
  } catch (err) {
    console.error('[snf-warehouse-compile-time-histogram]', err)
    if (err instanceof AdcAuthError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 401 })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
