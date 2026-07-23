import { NextRequest, NextResponse } from 'next/server'
import { parseISO } from 'date-fns'
import { runQuery, AdcAuthError, ORG_ID_PATTERN, loadOrgScopedSql } from '@/lib/bigquery'
import { buildPeriods, snapToGranularityBoundaries, formatPeriodLabel, formatCompactPeriodLabel } from '@/lib/dates'
import type { Granularity, WarehouseUsagePoint, WarehouseUsageResponse } from '@/lib/types'

const MAX_HOUR_RANGE_DAYS = 14

interface WarehouseUsageRow {
  period_start: string
  credits_used: number | null
}

function daysBetween(start: string, end: string): number {
  const startMs = new Date(`${start}T00:00:00Z`).getTime()
  const endMs = new Date(`${end}T00:00:00Z`).getTime()
  return Math.round((endMs - startMs) / (1000 * 60 * 60 * 24))
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    org_id?: string
    warehouse_names?: string[]
    start_date?: string
    end_date?: string
    granularity?: Granularity
  }
  const orgId = body.org_id ?? null
  const warehouseNames = body.warehouse_names ?? []
  const startDate = body.start_date ?? null
  const endDate = body.end_date ?? null
  const granularityParam = body.granularity || 'day'

  if (!orgId || !startDate || !endDate) {
    return NextResponse.json({ error: 'org_id, start_date, and end_date are required' }, { status: 400 })
  }
  if (!ORG_ID_PATTERN.test(orgId)) {
    return NextResponse.json({ error: 'invalid org_id' }, { status: 400 })
  }

  let granularityUsed: Granularity = granularityParam
  if (granularityParam === 'hour' && daysBetween(startDate, endDate) > MAX_HOUR_RANGE_DAYS) {
    granularityUsed = 'day'
  }

  const { start, end } = snapToGranularityBoundaries(startDate, endDate, granularityUsed)
  const periods = buildPeriods(start, end, granularityUsed)

  if (periods.length === 0) {
    const response: WarehouseUsageResponse = { granularity_used: granularityUsed, points: [] }
    return NextResponse.json(response)
  }

  try {
    const sql = loadOrgScopedSql('kwo_snowflake_warehouse_analysis_usage_by_period.sql', orgId)

    const queryStartDate = granularityUsed === 'hour' ? periods[0].start : `${periods[0].start} 00:00:00`
    const queryEndDate =
      granularityUsed === 'hour'
        ? `${periods[periods.length - 1].end}.999`
        : `${periods[periods.length - 1].end} 23:59:59.999`

    const periodStartBounds = periods.map((p) => (granularityUsed === 'hour' ? p.start : `${p.start} 00:00:00`))
    const periodEndBounds = periods.map((p) =>
      granularityUsed === 'hour' ? `${p.end}.999` : `${p.end} 23:59:59.999`
    )

    const rows = await runQuery<WarehouseUsageRow>(
      sql,
      {
        warehouse_names: warehouseNames,
        start_date: queryStartDate,
        end_date: queryEndDate,
        period_starts: periods.map((p) => p.start),
        period_start_bounds: periodStartBounds,
        period_end_bounds: periodEndBounds,
      },
      { warehouse_names: ['STRING'] }
    )

    const rowsByPeriod = new Map(rows.map((r) => [r.period_start, r]))

    const points: WarehouseUsagePoint[] = periods.map((period) => {
      const row = rowsByPeriod.get(period.start)
      const startForLabel = parseISO(period.start)
      const endForLabel = parseISO(period.end)

      return {
        period_label: formatPeriodLabel(startForLabel, endForLabel, granularityUsed),
        period_label_display: formatCompactPeriodLabel(startForLabel, endForLabel, granularityUsed),
        period_start: period.start,
        period_end: period.end,
        credits_used: Number(row?.credits_used ?? 0),
      }
    })

    const response: WarehouseUsageResponse = { granularity_used: granularityUsed, points }
    return NextResponse.json(response)
  } catch (err) {
    console.error('[snf-warehouse-analysis-usage-by-period]', err)
    if (err instanceof AdcAuthError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 401 })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
