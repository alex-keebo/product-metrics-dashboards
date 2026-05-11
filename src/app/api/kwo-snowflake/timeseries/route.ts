import { NextRequest, NextResponse } from 'next/server'
import {
  runQuery, getSnfDataAsOf, getSnfOrgIdsWithData, getSnfQueryHistoryDatasets,
  PROJECT, SNF_DATASET, AdcAuthError,
} from '@/lib/bigquery'
import { getOrgIdsForContractTypes, getCustomerNameMap, getContractPeriodsForOrg } from '@/lib/customers'
import { buildPeriods, defaultTimeSeriesRange, toDateString } from '@/lib/dates'
import { ContractType, Granularity, TimeSeriesPoint } from '@/lib/types'
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
  warehouse_id: string
  actual_dbus: number
  saved_dbus: number
  active: boolean
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
  // Query history is sharded per org into separate BigQuery datasets.
  // Only fetch from datasets that actually exist.
  const allDatasets = orgIds.map((id) => ({ org_id: id, dataset: `k3o_prd_${id}_000_tf` }))
  const existingDatasets = await getSnfQueryHistoryDatasets(orgIds)
  const existingSet = new Set(existingDatasets)

  const eligible = allDatasets.filter((d) => existingSet.has(d.dataset))
  if (eligible.length === 0) return []

  // Query history contains every warehouse — filter to those registered with
  // Keebo (present in sql_estimated_costs for this org and date range).
  // sql_estimated_costs keys on warehouse_id; query history keys on
  // warehouse_name; database_warehouses maps between them. The query_history
  // dataset is per-org so org-scoping is implicit.
  const unionParts = eligible.map(({ org_id, dataset }) => `
    SELECT
      DATE(TIMESTAMP_MILLIS(q.start_time)) AS date,
      '${org_id}'        AS org_id,
      COUNT(*)           AS query_count
    FROM \`${PROJECT}.${dataset}.query_history_view_tf\` q
    INNER JOIN (
      SELECT DISTINCT w.warehouse_name
      FROM \`${PROJECT}.${SNF_DATASET}.sql_estimated_costs\` v
      JOIN \`${PROJECT}.${SNF_DATASET}.database_warehouses\` w
        ON v.org_id = w.org_id AND v.warehouse_id = w.warehouse_id
      WHERE v.org_id = '${org_id}'
        AND DATE(v.ts_hour) BETWEEN @start_date AND @end_date
    ) reg
      ON q.warehouse_name = reg.warehouse_name
    WHERE DATE(TIMESTAMP_MILLIS(q.start_time)) BETWEEN @start_date AND @end_date
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
      return NextResponse.json({ points: [], data_as_of, available_customers, all_periods: [] })
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

    const params = { start_date: startDate, end_date: endDate, org_ids: orgIds }
    const t0 = Date.now()
    const [rows, asRows, rsRows, qvRows, data_as_of] = await Promise.all([
      runQuery<RawRow>(query, params).then(r => { console.log(`[snf-ts] timeseries: ${Date.now()-t0}ms`); return r }),
      runQuery<EventRow>(queryAS, params).then(r => { console.log(`[snf-ts] auto_suspend: ${Date.now()-t0}ms`); return r }),
      runQuery<EventRow>(queryRS, params).then(r => { console.log(`[snf-ts] resizing: ${Date.now()-t0}ms`); return r }),
      fetchQueryVolume(orgIds, startDate, endDate).then(r => { console.log(`[snf-ts] query_volume: ${Date.now()-t0}ms`); return r }),
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

          const savings_dbus = segRows.filter((r) => r.active).reduce((s, r) => s + Number(r.saved_dbus), 0)
          const optimized_actual = segRows.filter((r) => r.active).reduce((s, r) => s + Number(r.actual_dbus), 0)
          const paused_spend_dbus = segRows.filter((r) => !r.active).reduce((s, r) => s + Number(r.actual_dbus), 0)
          const total_spend_dbus = segRows.reduce((s, r) => s + Number(r.actual_dbus), 0)
          const grossSpend = optimized_actual + savings_dbus
          const savings_pct = grossSpend > 0 ? (savings_dbus / grossSpend) * 100 : 0
          const warehouses = new Set(segRows.filter((r) => r.active).map((r) => r.warehouse_id)).size

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

    const all_periods = periods.map((p) => ({ period_start: p.start, period_label_display: p.displayLabel }))

    return NextResponse.json({ points, data_as_of, available_customers, all_periods })
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
