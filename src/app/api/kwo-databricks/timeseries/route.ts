import { NextRequest, NextResponse } from 'next/server'
import { runQuery, getDataAsOf, getOrgIdsWithData, PROJECT, DATASET, BRONZE_DATASET, SILVER_DATASET } from '@/lib/bigquery'
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
  date: { value: string }
  org_id: string
  warehouse_id: string
  actual_dbus: number
  saved_dbus: number
  active: boolean
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

    const allOrgIds = getOrgIdsForContractTypes(contractTypes, startDate, endDate)
    const orgIds = selectedOrgIds?.length
      ? allOrgIds.filter((id) => selectedOrgIds.includes(id))
      : allOrgIds

    const nameMap = getCustomerNameMap()
    const orgIdsWithData = await getOrgIdsWithData()
    const available_customers = allOrgIds
      .filter((org_id) => orgIdsWithData.has(org_id))
      .map((org_id) => ({ org_id, name: nameMap.get(org_id) ?? 'Unknown' }))
      .sort((a, b) => a.name.localeCompare(b.name))

    if (orgIds.length === 0) {
      const data_as_of = await getDataAsOf()
      return NextResponse.json({
        points: [],
        data_as_of,
        available_customers,
        query_volume_by_period: [],
        auto_stop_by_period: [],
        resizing_by_period: [],
      })
    }

    const sqlPath = path.join(process.cwd(), 'sql', 'kwo_databricks_timeseries.sql')
    const sqlTemplate = fs.readFileSync(sqlPath, 'utf-8')
    const query = sqlTemplate.replace(/`keebo-portal\.k3o_dbx_gold_tf\./g, `\`${PROJECT}.${DATASET}.`)

    const sqlPathQV = path.join(process.cwd(), 'sql', 'kwo_databricks_query_volume.sql')
    const sqlTemplateQV = fs.readFileSync(sqlPathQV, 'utf-8')
    const queryQV = sqlTemplateQV.replace(/`keebo-portal\.k3o_dbx_bronze_tf\./g, `\`${PROJECT}.${BRONZE_DATASET}.`)

    const sqlPathAS = path.join(process.cwd(), 'sql', 'kwo_databricks_auto_stop_events.sql')
    const queryAS = fs.readFileSync(sqlPathAS, 'utf-8')
      .replace(/`keebo-portal\.k3o_dbx_silver_tf\./g, `\`${PROJECT}.${SILVER_DATASET}.`)

    const sqlPathRS = path.join(process.cwd(), 'sql', 'kwo_databricks_resizing_events.sql')
    const queryRS = fs.readFileSync(sqlPathRS, 'utf-8')
      .replace(/`keebo-portal\.k3o_dbx_silver_tf\./g, `\`${PROJECT}.${SILVER_DATASET}.`)

    const params = { start_date: startDate, end_date: endDate, org_ids: orgIds }
    const [rows, qvRows, asRows, rsRows] = await Promise.all([
      runQuery<RawRow>(query, params),
      runQuery<QVRow>(queryQV, params),
      runQuery<EventRow>(queryAS, params),
      runQuery<EventRow>(queryRS, params),
    ])

    const periods = buildPeriods(startDate, endDate, granularity)

    // Aggregate daily rows into period buckets per org
    const points: TimeSeriesPoint[] = []

    for (const period of periods) {
      // group by org
      const byOrg = new Map<string, RawRow[]>()
      for (const row of rows) {
        const d = row.date?.value ?? row.date
        if (d < period.start || d > period.end) continue
        if (!byOrg.has(row.org_id)) byOrg.set(row.org_id, [])
        byOrg.get(row.org_id)!.push(row)
      }

      for (const [org_id, orgRows] of byOrg) {
        // Split rows by contract period boundaries within this bucket
        const contractSegments = getContractPeriodsForOrg(org_id, period.start, period.end)
        for (const segment of contractSegments) {
          const segRows = orgRows.filter((r) => {
            const d = r.date?.value ?? r.date
            return d >= segment.period_start && d <= segment.period_end
          })
          if (segRows.length === 0) continue

          const savings_dbus = segRows.filter((r) => r.active).reduce((s, r) => s + Number(r.saved_dbus), 0)
          const optimized_actual = segRows.filter((r) => r.active).reduce((s, r) => s + Number(r.actual_dbus), 0)
          const unoptimized_spend_dbus = segRows.filter((r) => !r.active).reduce((s, r) => s + Number(r.actual_dbus), 0)
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
            unoptimized_spend_dbus,
            warehouses,
          })
        }
      }
    }

    points.sort((a, b) => b.period_start.localeCompare(a.period_start) || b.savings_dbus - a.savings_dbus)

    const all_periods = periods.map((p) => ({ period_start: p.start, period_label_display: p.displayLabel }))

    const aggregateByPeriod = <T extends { date: { value: string } | string }>(
      eventRows: T[],
      getCount: (r: T) => number,
    ) =>
      periods.map((period) => {
        const event_count = eventRows.reduce((sum, row) => {
          const d = (row.date as { value: string })?.value ?? (row.date as string)
          return d >= period.start && d <= period.end ? sum + getCount(row) : sum
        }, 0)
        return { period_start: period.start, event_count }
      })

    const query_volume_by_period = aggregateByPeriod(qvRows, (r) => Number(r.query_count))
    const auto_stop_by_period = aggregateByPeriod(asRows, (r) => Number(r.event_count))
    const resizing_by_period = aggregateByPeriod(rsRows, (r) => Number(r.event_count))

    const data_as_of = await getDataAsOf()
    return NextResponse.json({
      points,
      data_as_of,
      available_customers,
      all_periods,
      query_volume_by_period,
      auto_stop_by_period,
      resizing_by_period,
    })
  } catch (err) {
    console.error('[timeseries]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
