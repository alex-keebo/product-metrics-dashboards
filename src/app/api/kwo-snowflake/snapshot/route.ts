import { NextRequest, NextResponse } from 'next/server'
import { runQuery, getSnfDataAsOf, getSnfOrgIdsWithData, PROJECT, SNF_DATASET, AdcAuthError } from '@/lib/bigquery'
import { getOrgIdsForContractTypes, getCustomerNameMap, getContractTypeForOrgInRange } from '@/lib/customers'
import { computeKPIRows, aggregateKPIRows, computeDeltas } from '@/lib/kpi'
import { lastCompleteWeek, priorWeek, toDateString } from '@/lib/dates'
import { ContractType } from '@/lib/types'
import fs from 'fs'
import path from 'path'

interface RawRow {
  org_id: string
  week_start: { value: string }
  savings_dbus: number
  total_spend_dbus: number
  paused_spend_dbus: number
  optimized_actual_dbus: number
  warehouses: number
  resizing_optimizations: number
  auto_stop_optimizations: number
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const contractTypes = (searchParams.get('contract_types') ?? 'trial,lost_trial,subscription,consumption,churn')
      .split(',')
      .filter(Boolean) as ContractType[]
    const selectedOrgIds = searchParams.get('org_ids')?.split(',').filter(Boolean)

    const { start: weekStart, end: weekEnd } = lastCompleteWeek()
    const { start: priorStart, end: priorEnd } = priorWeek(weekStart)

    const weekStartStr = toDateString(weekStart)
    const weekEndStr = toDateString(weekEnd)
    const priorStartStr = toDateString(priorStart)
    const priorEndStr = toDateString(priorEnd)

    const allOrgIds = getOrgIdsForContractTypes('kwo-snowflake', contractTypes, priorStartStr, weekEndStr)
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
      return NextResponse.json({
        current: null,
        prior: null,
        data_as_of,
        week_start: weekStartStr,
        week_end: weekEndStr,
        available_customers,
      })
    }

    const sqlPath = path.join(process.cwd(), 'sql', 'kwo_snowflake_snapshot.sql')
    const sqlTemplate = fs.readFileSync(sqlPath, 'utf-8')
    const query = sqlTemplate.replace(/`keebo-portal\.federated_views_tf\./g, `\`${PROJECT}.${SNF_DATASET}.`)

    const rows = await runQuery<RawRow>(query, {
      prior_week_start: priorStartStr,
      week_end: weekEndStr,
      org_ids: orgIds,
    })

    const currentRaw = rows.filter((r) => r.week_start?.value === weekStartStr)
    const priorRaw = rows.filter((r) => r.week_start?.value === priorStartStr)

    const currentContractTypeMap = new Map(
      orgIds.map((id) => [id, getContractTypeForOrgInRange(id, weekStartStr, weekEndStr, 'kwo-snowflake') ?? 'consumption'])
    )
    const priorContractTypeMap = new Map(
      orgIds.map((id) => [id, getContractTypeForOrgInRange(id, priorStartStr, priorEndStr, 'kwo-snowflake') ?? 'consumption'])
    )

    const currentRows = computeKPIRows(currentRaw, nameMap, currentContractTypeMap)
    const priorRows = computeKPIRows(priorRaw, nameMap, priorContractTypeMap)

    const current = aggregateKPIRows(currentRows)
    const prior = aggregateKPIRows(priorRows)
    const deltas = computeDeltas(current, prior)

    const data_as_of = await getSnfDataAsOf()

    return NextResponse.json({
      kpis: deltas,
      customer_rows: currentRows,
      data_as_of,
      week_start: weekStartStr,
      week_end: weekEndStr,
      prior_week_start: priorStartStr,
      prior_week_end: toDateString(priorEnd),
      available_customers,
    })
  } catch (err) {
    console.error('[snf-snapshot]', err)
    if (err instanceof AdcAuthError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 401 },
      )
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
