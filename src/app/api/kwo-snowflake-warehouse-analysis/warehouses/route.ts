import { NextRequest, NextResponse } from 'next/server'
import { getWarehousesForOrg, AdcAuthError } from '@/lib/bigquery'

const ORG_ID_PATTERN = /^[0-9a-f]+$/

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get('org_id')
  if (!orgId) {
    return NextResponse.json({ error: 'org_id is required' }, { status: 400 })
  }
  if (!ORG_ID_PATTERN.test(orgId)) {
    return NextResponse.json({ error: 'invalid org_id' }, { status: 400 })
  }

  try {
    const warehouses = await getWarehousesForOrg(orgId)
    return NextResponse.json(warehouses)
  } catch (err) {
    console.error('[snf-warehouse-analysis-warehouses]', err)
    if (err instanceof AdcAuthError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 401 })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
