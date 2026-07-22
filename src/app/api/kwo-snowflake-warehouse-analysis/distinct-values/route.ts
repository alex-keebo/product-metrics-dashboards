import { NextRequest, NextResponse } from 'next/server'
import { getDistinctFieldValues, AdcAuthError, ORG_ID_PATTERN } from '@/lib/bigquery'
import { FILTER_FIELDS } from '@/lib/filterFields'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const orgId = searchParams.get('org_id')
  const field = searchParams.get('field')

  if (!orgId || !field) {
    return NextResponse.json({ error: 'org_id and field are required' }, { status: 400 })
  }
  if (!ORG_ID_PATTERN.test(orgId)) {
    return NextResponse.json({ error: 'invalid org_id' }, { status: 400 })
  }
  const def = FILTER_FIELDS[field]
  if (!def || !def.autocomplete) {
    return NextResponse.json({ error: 'field is not autocomplete-eligible' }, { status: 400 })
  }

  try {
    const values = await getDistinctFieldValues(orgId, def.column)
    return NextResponse.json({ values })
  } catch (err) {
    console.error('[snf-warehouse-distinct-values]', err)
    if (err instanceof AdcAuthError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 401 })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
