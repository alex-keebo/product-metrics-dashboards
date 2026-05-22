import { NextRequest, NextResponse } from 'next/server'
import {
  runQuery, getSnfDataAsOf, getSnfOrgIdsWithData, getSnfQueryHistoryDatasets,
  PROJECT, SNF_DATASET, AdcAuthError,
} from '@/lib/bigquery'
import { getOrgIdsForContractTypes, getCustomerNameMap, getContractPeriodsForOrg } from '@/lib/customers'
import { buildPeriods, defaultTimeSeriesRange, toDateString } from '@/lib/dates'
import { ContractType, Granularity, TimeSeriesPoint, TimeSeriesRangeTotals } from '@/lib/types'
import { computeRangeTotalsFromPoints } from '@/lib/kpi'
import fs from 'fs'
import path from 'path'

interface QVRow {
  date: { value: string } | string
  org_id: string
  query_count: number
}

interface EventRow {
  date: { value: string } | string
  org_id: string
  event_count: number
}

interface RawRow {
  date: { value: string } | string
  org_id: string
  active_actual_dbus: number
  saved_dbus: number
  paused_actual_dbus: number
  active_warehouses: number
}

type OrgDateMap = Map<string, Map<string, number>>

function buildOrgDateMap<T extends { date: { value: string } | string; org_id: string }>(
  rows: T[],
  getCount: (r: T) => number,
): OrgDateMap {
  const m: OrgDateMap = new Map()
  for (const row of rows) {
    const d = (row.date as { value: string })?.value ?? (row.date as string)
    if (!m.has(row.org_id)) m.set(row.org_id, new Map())
    const inner = m.get(row.org_id)!
    inner.set(d, (inner.get(d) ?? 0) + getCount(row))
  }
  return m
}

function sumOrgDateMap(m: OrgDateMap, orgId: string, start: string, end: string): number {
  const inner = m.get(orgId)
  if (!inner) return 0
  let total = 0
  for (const [date, count] of inner) {
    if (date >= start && date <= end) total += count
  }
  return total
}

async function fetchQueryVolume(
  orgIds: string[],
  startDate: string,
  endDate: string,
): Promise<QVRow[]> {
  const existingDatasets = await getSnfQueryHistoryDatasets(orgIds)
  const existingSet = new Set(existingDatasets)
  const eligible = orgIds
    .map((id) => ({ org_id: id, dataset: `k3o_prd_${id}_000_tf` }))
    .filter((d) => existingSet.has(d.dataset))
  if (eligible.length === 0) return []

  const unionParts = eligible.map(({ org_id, dataset }) => `
    SELECT
      q.dt        AS date,
      '${org_id}' AS org_id,
      COUNT(*)    AS query_count
    FROM \`${PROJECT}.${dataset}.query_history_view_tf\` q
    INNER JOIN (
      SELECT DISTINCT w.warehouse_name
      FROM \`${PROJECT}.${SNF_DATASET}.sql_estimated_costs\` v
      JOIN \`${PROJECT}.${SNF_DATASET}.database_warehouses\` w
        ON v.org_id = w.org_id AND v.warehouse_id = w.warehouse_id
      WHERE v.org_id = '${org_id}'
        AND v.ts_hour >= TIMESTAMP(@start_date)
        AND v.ts_hour <  TIMESTAMP_ADD(TIMESTAMP(@end_date), INTERVAL 1 DAY)
    ) reg ON q.warehouse_name = reg.warehouse_name
    WHERE q.dt BETWEEN @start_date AND @end_date
    GROUP BY date`)

  const query = unionParts.join('\nUNION ALL\n') + '\nORDER BY date, org_id'
  return runQuery<QVRow>(query, { start_date: startDate, end_date: endDate })
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const contractTypes = (searchParams.get('contract_types') ?? 'trial,lost_trial,subscription,consumption,churn')
      .split(',')
      .filter(Boolean) as ContractType[]
    const selectedOrgIds = searchParams.get('org_ids')?.split(',').filter(Boolean)
    const granularity = (searchParams.get('granularity') ?? 'week') as Granularity

    const defaults = defaultTimeSeriesRange()
    const startDate = searchParams.get('start') ?? toDateString(defaults.start)
    const endDate = searchParams.get('end') ?? toDateString(defaults.end)

    const allOrgIds = getOrgIdsForContractTypes('kwo-snowflake', contractTypes, startDate, endDate)
    const orgIds = selectedOrgIds?.length
      ? allOrgIds.filter((id) => selectedOrgIds.includes(id))
      : allOrgIds

    const nameMap = getCustomerNameMap('kwo-snowflake')
    const orgIdsWithData = await getSnfOrgIdsWithData()
    const available_customers = allOrgIds
      .filter((org_id) => orgIdsWithData.has(org_id))
      .map((org_id) => ({ org_id, name: nameMap.get(org_id) ?? 'Unknown' }))
      .sort((a, b) => a.name.localeCompare(b.name))

    if (orgIds.length === 0) {
      const data_as_of = await getSnfDataAsOf()
      const emptyTotals: TimeSeriesRangeTotals = {
        savings_dbus: 0, savings_pct: 0, total_spend_dbus: 0, paused_spend_dbus: 0,
        warehouses: 0, query_volume: 0, auto_stop_events: 0, resizing_events: 0,
      }
      return NextResponse.json({ points: [], data_as_of, available_customers, all_periods: [], range_totals: emptyTotals })
    }

    const sqlPath = path.join(process.cwd(), 'sql', 'kwo_snowflake_timeseries.sql')
    const sqlTemplate = fs.readFileSync(sqlPath, 'utf-8')
    const query = sqlTemplate.replace(/`keebo-portal\.federated_views_tf\./g, `\`${PROJECT}.${SNF_DATASET}.`)

    const sqlPathAS = path.join(process.cwd(), 'sql', 'kwo_snowflake_auto_suspend_events.sql')
    const queryAS = fs.readFileSync(sqlPathAS, 'utf-8')
      .replace(/`keebo-portal\.federated_views_tf\./g, `\`${PROJECT}.${SNF_DATASET}.`)

    const sqlPathRS = path.join(process.cwd(), 'sql', 'kwo_snowflake_resizing_events.sql')
    const queryRS = fs.readFileSync(sqlPathRS, 'utf-8')
      .replace(/`keebo-portal\.federated_views_tf\./g, `\`${PROJECT}.${SNF_DATASET}.`)

    const includeQueryVolume = searchParams.get('include_query_volume') === 'true'

    const params = { start_date: startDate, end_date: endDate, org_ids: orgIds }
    const [rows, asRows, rsRows, qvRows, data_as_of] = await Promise.all([
      runQuery<RawRow>(query, params),
      runQuery<EventRow>(queryAS, params),
      runQuery<EventRow>(queryRS, params),
      includeQueryVolume ? fetchQueryVolume(orgIds, startDate, endDate) : Promise.resolve([] as QVRow[]),
      getSnfDataAsOf(),
    ])

    const asMap = buildOrgDateMap(asRows, (r) => Number(r.event_count))
    const rsMap = buildOrgDateMap(rsRows, (r) => Number(r.event_count))
    const qvMap = buildOrgDateMap(qvRows, (r) => Number(r.query_count))

    const periods = buildPeriods(startDate, endDate, granularity)

    const points: TimeSeriesPoint[] = []

    for (const period of periods) {
      const byOrg = new Map<string, RawRow[]>()
      for (const row of rows) {
        const d = (row.date as { value: string })?.value ?? (row.date as string)
        if (d < period.start || d > period.end) continue
        if (!byOrg.has(row.org_id)) byOrg.set(row.org_id, [])
        byOrg.get(row.org_id)!.push(row)
      }

      for (const [org_id, orgRows] of byOrg) {
        const contractSegments = getContractPeriodsForOrg(org_id, period.start, period.end, 'kwo-snowflake')
        for (const segment of contractSegments) {
          const segRows = orgRows.filter((r) => {
            const d = (r.date as { value: string })?.value ?? (r.date as string)
            return d >= segment.period_start && d <= segment.period_end
          })
          if (segRows.length === 0) continue

          const savings_dbus = segRows.reduce((s, r) => s + Number(r.saved_dbus), 0)
          const optimized_actual = segRows.reduce((s, r) => s + Number(r.active_actual_dbus), 0)
          const paused_spend_dbus = segRows.reduce((s, r) => s + Number(r.paused_actual_dbus), 0)
          const total_spend_dbus = optimized_actual + paused_spend_dbus
          const grossSpend = optimized_actual + savings_dbus
          const savings_pct = grossSpend > 0 ? (savings_dbus / grossSpend) * 100 : 0
          const warehouses = segRows.reduce((m, r) => Math.max(m, Number(r.active_warehouses)), 0)

          points.push({
            period_label: period.label,
            period_label_display: period.displayLabel,
            period_start: period.start,
            period_end: period.end,
            org_id,
            name: nameMap.get(org_id) ?? 'Unknown',
            contract_type: segment.contract_type,
            savings_dbus,
            savings_pct,
            total_spend_dbus,
            paused_spend_dbus,
            warehouses,
            query_volume: sumOrgDateMap(qvMap, org_id, segment.period_start, segment.period_end),
            auto_stop_events: sumOrgDateMap(asMap, org_id, segment.period_start, segment.period_end),
            resizing_events: sumOrgDateMap(rsMap, org_id, segment.period_start, segment.period_end),
          })
        }
      }
    }

    points.sort((a, b) => b.period_start.localeCompare(a.period_start) || b.savings_dbus - a.savings_dbus)

    const byOrgWarehouseMax = new Map<string, number>()
    for (const row of rows) {
      const cur = byOrgWarehouseMax.get(row.org_id) ?? 0
      byOrgWarehouseMax.set(row.org_id, Math.max(cur, Number(row.active_warehouses)))
    }
    const rangeWarehouses = Array.from(byOrgWarehouseMax.values()).reduce((s, v) => s + v, 0)
    const range_totals: TimeSeriesRangeTotals = computeRangeTotalsFromPoints(points, rangeWarehouses)

    const all_periods = periods.map((p) => ({ period_start: p.start, period_label_display: p.displayLabel }))

    return NextResponse.json({ points, data_as_of, available_customers, all_periods, range_totals })
  } catch (err) {
    console.error('[snf-timeseries]', err)
    if (err instanceof AdcAuthError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 401 },
      )
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
