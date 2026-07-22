import { NextRequest, NextResponse } from 'next/server'
import { parseISO } from 'date-fns'
import { runQuery, AdcAuthError, ORG_ID_PATTERN, loadOrgScopedSql } from '@/lib/bigquery'
import { buildPeriods, snapToGranularityBoundaries, formatPeriodLabel, formatCompactPeriodLabel } from '@/lib/dates'
import type { Granularity, WarehouseAnalysisPoint, WarehouseAnalysisResponse } from '@/lib/types'

const MAX_HOUR_RANGE_DAYS = 14

interface WarehouseAnalysisRow {
  period_start: string
  by_type: { query_type: string; query_count: number }[] | null
  execution_time_avg_ms: number | null
  execution_time_p95_ms: number | null
  execution_time_p99_ms: number | null
  queued_query_count: number | null
  queue_time_avg_ms: number | null
  queue_time_p95_ms: number | null
  queue_time_p99_ms: number | null
  queue_time_max_ms: number | null
  bytes_spilled_local: number | null
  bytes_spilled_remote: number | null
  bytes_scanned: number | null
  by_error: { error_code: string; error_count: number }[] | null
  credits_used: number | null
  concurrent_queries_max: number | null
  concurrent_queries_avg: number | null
}

function daysBetween(start: string, end: string): number {
  const startMs = new Date(`${start}T00:00:00Z`).getTime()
  const endMs = new Date(`${end}T00:00:00Z`).getTime()
  return Math.round((endMs - startMs) / (1000 * 60 * 60 * 24))
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const orgId = searchParams.get('org_id')
  const warehouseName = searchParams.get('warehouse_name')
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')
  const granularityParam = (searchParams.get('granularity') || 'day') as Granularity

  if (!orgId || !warehouseName || !startDate || !endDate) {
    return NextResponse.json(
      { error: 'org_id, warehouse_name, start_date, and end_date are required' },
      { status: 400 }
    )
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
    const response: WarehouseAnalysisResponse = { granularity_used: granularityUsed, points: [] }
    return NextResponse.json(response)
  }

  try {
    const sql = loadOrgScopedSql('kwo_snowflake_warehouse_analysis_timeseries.sql', orgId)

    // end bounds carry .999 milliseconds: start_time is epoch-millisecond precision, so a
    // second-precision bound (e.g. HH:59:59) leaves a sub-second gap before the next period's
    // start bound, silently dropping any row timestamped in that gap from every period-joined
    // aggregate (query_volume, latency, queue, etc.) even though it's within the overall range.
    const queryStartDate = granularityUsed === 'hour' ? periods[0].start : `${periods[0].start} 00:00:00`
    const queryEndDate =
      granularityUsed === 'hour'
        ? `${periods[periods.length - 1].end}.999`
        : `${periods[periods.length - 1].end} 23:59:59.999`

    const periodStartBounds = periods.map((p) => (granularityUsed === 'hour' ? p.start : `${p.start} 00:00:00`))
    const periodEndBounds = periods.map((p) =>
      granularityUsed === 'hour' ? `${p.end}.999` : `${p.end} 23:59:59.999`
    )

    const rows = await runQuery<WarehouseAnalysisRow>(sql, {
      warehouse_name: warehouseName,
      start_date: queryStartDate,
      end_date: queryEndDate,
      period_starts: periods.map((p) => p.start),
      period_start_bounds: periodStartBounds,
      period_end_bounds: periodEndBounds,
    })

    const rowsByPeriod = new Map(rows.map((r) => [r.period_start, r]))

    const points: WarehouseAnalysisPoint[] = periods.map((period) => {
      const row = rowsByPeriod.get(period.start)

      const queryVolumeByType: Record<string, number> = {}
      for (const entry of row?.by_type ?? []) {
        queryVolumeByType[entry.query_type] = Number(entry.query_count)
      }
      const failedQueryCountByError: Record<string, number> = {}
      for (const entry of row?.by_error ?? []) {
        failedQueryCountByError[entry.error_code] = Number(entry.error_count)
      }

      const startForLabel = parseISO(period.start)
      const endForLabel = parseISO(period.end)

      return {
        period_label: formatPeriodLabel(startForLabel, endForLabel, granularityUsed),
        period_label_display: formatCompactPeriodLabel(startForLabel, endForLabel, granularityUsed),
        period_start: period.start,
        period_end: period.end,
        query_volume_by_type: queryVolumeByType,
        execution_time_avg_ms: Number(row?.execution_time_avg_ms ?? 0),
        execution_time_p95_ms: Number(row?.execution_time_p95_ms ?? 0),
        execution_time_p99_ms: Number(row?.execution_time_p99_ms ?? 0),
        queued_query_count: Number(row?.queued_query_count ?? 0),
        queue_time_avg_ms: Number(row?.queue_time_avg_ms ?? 0),
        queue_time_p95_ms: Number(row?.queue_time_p95_ms ?? 0),
        queue_time_p99_ms: Number(row?.queue_time_p99_ms ?? 0),
        queue_time_max_ms: Number(row?.queue_time_max_ms ?? 0),
        bytes_spilled_local: Number(row?.bytes_spilled_local ?? 0),
        bytes_spilled_remote: Number(row?.bytes_spilled_remote ?? 0),
        bytes_scanned: Number(row?.bytes_scanned ?? 0),
        failed_query_count_by_error: failedQueryCountByError,
        credits_used: Number(row?.credits_used ?? 0),
        concurrent_queries_max: Number(row?.concurrent_queries_max ?? 0),
        concurrent_queries_avg: Number(row?.concurrent_queries_avg ?? 0),
      }
    })

    const response: WarehouseAnalysisResponse = { granularity_used: granularityUsed, points }
    return NextResponse.json(response)
  } catch (err) {
    console.error('[snf-warehouse-analysis-timeseries]', err)
    if (err instanceof AdcAuthError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 401 })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
