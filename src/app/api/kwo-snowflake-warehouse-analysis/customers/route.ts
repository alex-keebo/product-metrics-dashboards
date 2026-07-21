import { NextResponse } from 'next/server'
import { getCustomerNameMap } from '@/lib/customers'
import { getSnfQueryHistoryDatasets, AdcAuthError } from '@/lib/bigquery'

export async function GET() {
  try {
    const nameMap = getCustomerNameMap('kwo-snowflake')
    const orgIds = [...nameMap.keys()]
    const datasets = new Set(await getSnfQueryHistoryDatasets(orgIds))

    const customers = orgIds
      .filter((orgId) => datasets.has(`k3o_prd_${orgId}_000_tf`))
      .map((orgId) => ({ org_id: orgId, name: nameMap.get(orgId)! }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json(customers)
  } catch (err) {
    console.error('[snf-warehouse-analysis-customers]', err)
    if (err instanceof AdcAuthError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 401 })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
