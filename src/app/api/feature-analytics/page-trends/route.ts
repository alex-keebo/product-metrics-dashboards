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

function buildModuleFilter(slug: string): string {
  switch (slug) {
    case 'databricks-warehouse-optimization':
      return `properties.$current_url LIKE '%/databricks-warehouse-optimization/%'`
    case 'warehouse-optimization':
      return `properties.$current_url LIKE '%/warehouse-optimization/%'`
    case 'workload-iq':
      return `properties.$current_url LIKE '%/workload-iq/%'`
    case 'platform':
      return `(
        properties.$current_url NOT LIKE '%/databricks-warehouse-optimization/%'
        AND properties.$current_url NOT LIKE '%/warehouse-optimization/%'
        AND properties.$current_url NOT LIKE '%/workload-iq/%'
      )`
    default:
      return '1 = 0'
  }
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

export interface DauDataPoint {
  date: string
  dau: number
}

export interface DauSeries {
  page: string
  data: DauDataPoint[]
}

export interface PageTrendsResponse {
  series: DauSeries[]
  period: { start: string; end: string }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl

    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
    const sevenDaysAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd')

    const start = validateDate(searchParams.get('start') ?? sevenDaysAgo, 'start')
    const end = validateDate(searchParams.get('end') ?? yesterday, 'end')

    const moduleSlug = searchParams.get('module') ?? ''
    if (!ALL_MODULE_SLUGS.includes(moduleSlug)) {
      return NextResponse.json({ error: `Invalid module: ${moduleSlug}` }, { status: 400 })
    }

    const userType = ['external', 'internal', 'all'].includes(searchParams.get('user_type') ?? '')
      ? (searchParams.get('user_type') as string)
      : 'external'

    const rawProject = searchParams.get('project') ?? 'portal'
    const pid = PROJECT_IDS[rawProject] ?? PROJECT_IDS.portal

    const rawLimit = parseInt(searchParams.get('limit') ?? '8', 10)
    const limit = isNaN(rawLimit) || rawLimit < 1 ? 8 : Math.min(rawLimit, 20)

    const mf = buildModuleFilter(moduleSlug)
    const uf = buildUserFilter(userType)

    // Step 1: get top N pages by total pageviews in the period
    const topRows = await hogql(`
      SELECT
        ${PAGE_NAME_EXPR} AS page_name,
        count() AS total
      FROM events
      WHERE event = '$pageview'
        AND toDate(timestamp) >= '${start}' AND toDate(timestamp) <= '${end}'
        AND ${mf}
        AND ${uf}
      GROUP BY page_name
      ORDER BY total DESC
      LIMIT ${limit}
    `, pid)

    const topPageNames = topRows.map((r) => String(r.page_name))

    if (topPageNames.length === 0) {
      return NextResponse.json({ series: [], period: { start, end } })
    }

    // Step 2: get daily DAU for those top pages
    const inList = topPageNames
      .map((p) => `'${p.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`)
      .join(', ')

    const dailyRows = await hogql(`
      SELECT
        toDate(timestamp) AS date,
        ${PAGE_NAME_EXPR} AS page_name,
        count(DISTINCT person_id) AS dau
      FROM events
      WHERE event = '$pageview'
        AND toDate(timestamp) >= '${start}' AND toDate(timestamp) <= '${end}'
        AND ${mf}
        AND ${uf}
        AND ${PAGE_NAME_EXPR} IN (${inList})
      GROUP BY date, page_name
      ORDER BY date, page_name
    `, pid)

    const seriesMap = new Map<string, DauDataPoint[]>()
    for (const row of dailyRows) {
      const page = String(row.page_name)
      const date = String(row.date).split('T')[0]
      const dau = Number(row.dau)
      if (!seriesMap.has(page)) seriesMap.set(page, [])
      seriesMap.get(page)!.push({ date, dau })
    }

    const series: DauSeries[] = topPageNames
      .filter((p) => seriesMap.has(p))
      .map((p) => ({ page: p, data: seriesMap.get(p)! }))

    return NextResponse.json({ series, period: { start, end } })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
