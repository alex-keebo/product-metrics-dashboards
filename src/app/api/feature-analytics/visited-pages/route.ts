import { NextRequest, NextResponse } from 'next/server'
import { hogql } from '@/lib/posthog'
import { subDays, parseISO, format, isValid } from 'date-fns'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
function validateDate(s: string, field: string): string {
  if (!DATE_RE.test(s) || !isValid(parseISO(s))) {
    throw new Error(`Invalid ${field} date: must be YYYY-MM-DD`)
  }
  return s
}

const ALL_MODULE_SLUGS = [
  'databricks-warehouse-optimization',
  'warehouse-optimization',
  'workload-iq',
  'platform',
]

// Module filter uses URL-contains matching. 'platform' means none of the 3 product slugs.
function buildModuleFilter(selected: string[]): string {
  const parts: string[] = []

  if (selected.includes('databricks-warehouse-optimization')) {
    parts.push(`properties.$current_url LIKE '%/databricks-warehouse-optimization/%'`)
  }
  if (selected.includes('warehouse-optimization')) {
    parts.push(`properties.$current_url LIKE '%/warehouse-optimization/%'`)
  }
  if (selected.includes('workload-iq')) {
    parts.push(`properties.$current_url LIKE '%/workload-iq/%'`)
  }
  if (selected.includes('platform')) {
    parts.push(`(
      properties.$current_url NOT LIKE '%/databricks-warehouse-optimization/%'
      AND properties.$current_url NOT LIKE '%/warehouse-optimization/%'
      AND properties.$current_url NOT LIKE '%/workload-iq/%'
    )`)
  }

  if (parts.length === 0) return '1 = 0'
  return `(${parts.join(' OR ')})`
}

function buildUserFilter(userType: string): string {
  if (userType === 'external') return `person.properties.is_internal_user != true`
  if (userType === 'internal') return `person.properties.is_internal_user = true`
  return '1 = 1'
}

const PROJECT_IDS: Record<string, string> = {
  portal: process.env.POSTHOG_PROJECT_ID!,
  integration: process.env.POSTHOG_INTEGRATION_PROJECT_ID!,
}

const PAGE_NAME_EXPR = `concat(
  CASE
    WHEN properties.$current_url LIKE '%/databricks-warehouse-optimization/%' THEN 'KWO-DBX'
    WHEN properties.$current_url LIKE '%/warehouse-optimization/%' THEN 'KWO-SF'
    WHEN properties.$current_url LIKE '%/workload-iq/%' THEN 'KWI-SF'
    ELSE 'Platform'
  END,
  ': ',
  CASE
    WHEN extract(properties.$current_url, 'https?://[^/]+/[^/?]+/[^/?]+/([^/?]+)') = ''
    THEN extract(properties.$current_url, 'https?://[^/]+/[^/?]+/([^/?]+)')
    ELSE concat(
      extract(properties.$current_url, 'https?://[^/]+/[^/?]+/([^/?]+)'),
      ' → ',
      extract(properties.$current_url, 'https?://[^/]+/[^/?]+/[^/?]+/([^/?]+)')
    )
  END
)`

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl

    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
    const sevenDaysAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd')

    const start = validateDate(searchParams.get('start') ?? sevenDaysAgo, 'start')
    const end = validateDate(searchParams.get('end') ?? yesterday, 'end')

    const rawModules = searchParams.get('modules')
    const slugs = rawModules
      ? rawModules.split(',').filter((s) => ALL_MODULE_SLUGS.includes(s))
      : ALL_MODULE_SLUGS

    const userType = ['external', 'internal', 'all'].includes(searchParams.get('user_type') ?? '')
      ? (searchParams.get('user_type') as string)
      : 'external'

    const rawProject = searchParams.get('project') ?? 'portal'
    const pid = PROJECT_IDS[rawProject] ?? PROJECT_IDS.portal

    const mf = buildModuleFilter(slugs.length ? slugs : ALL_MODULE_SLUGS)
    const uf = buildUserFilter(userType)

    const rows = await hogql(`
      SELECT
        ${PAGE_NAME_EXPR} AS page_name,
        count() AS count
      FROM events
      WHERE event = '$pageview'
        AND toDate(timestamp) >= '${start}' AND toDate(timestamp) <= '${end}'
        AND ${mf}
        AND ${uf}
      GROUP BY page_name
      ORDER BY count DESC
      LIMIT 100
    `, pid)

    const pages = rows.map((r) => ({
      page_name: String(r.page_name ?? ''),
      count: Number(r.count ?? 0),
    }))

    return NextResponse.json({ pages, period: { start, end } })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
