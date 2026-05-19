import { NextRequest, NextResponse } from 'next/server'
import { runQuery, getSnfDataAsOf, getSnfOrgIdsWithData, PROJECT, SNF_DATASET, AdcAuthError } from '@/lib/bigquery'
import { getOrgIdsForContractTypes, getCustomerNameMap, getContractTypeForOrgInRange } from '@/lib/customers'
import { computeKPIRows, aggregateKPIRows, computeDeltas } from '@/lib/kpi'
import { lastCompleteWeek, toDateString } from '@/lib/dates'
import { ContractType } from '@/lib/types'
import { addDays, differenceInCalendarDays, parseISO } from 'date-fns'
import fs from 'fs'
import path from 'path'

interface RawRow {
  org_id: string
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

    const defaultRange = lastCompleteWeek()
    const periodStart = searchParams.get('start') ?? toDateString(defaultRange.start)
    const periodEnd = searchParams.get('end') ?? toDateString(defaultRange.end)

    const startDate = parseISO(periodStart)
    const endDate = parseISO(periodEnd)
    const lengthDays = differenceInCalendarDays(endDate, startDate)
    const priorEnd = addDays(startDate, -1)
    const priorStart = addDays(priorEnd, -lengthDays)

    const priorStartStr = toDateString(priorStart)
    const priorEndStr = toDateString(priorEnd)

    const allOrgIds = getOrgIdsForContractTypes('kwo-snowflake', contractTypes, priorStartStr, periodEnd)
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
        kpis: null,
        data_as_of,
        period_start: periodStart,
        period_end: periodEnd,
        prior_start: priorStartStr,
        prior_end: priorEndStr,
        available_customers,
      })
    }

    const sqlPath = path.join(process.cwd(), 'sql', 'kwo_snowflake_snapshot.sql')
    const sqlTemplate = fs.readFileSync(sqlPath, 'utf-8')
    const query = sqlTemplate.replace(/`keebo-portal\.federated_views_tf\./g, `\`${PROJECT}.${SNF_DATASET}.`)

    const [currentRaw, priorRaw] = await Promise.all([
      runQuery<RawRow>(query, { start: periodStart, end: periodEnd, org_ids: orgIds }),
      runQuery<RawRow>(query, { start: priorStartStr, end: priorEndStr, org_ids: orgIds }),
    ])

    const currentContractTypeMap = new Map(
      orgIds.map((id) => [id, getContractTypeForOrgInRange(id, periodStart, periodEnd, 'kwo-snowflake') ?? 'consumption'])
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
      period_start: periodStart,
      period_end: periodEnd,
      prior_start: priorStartStr,
      prior_end: priorEndStr,
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
