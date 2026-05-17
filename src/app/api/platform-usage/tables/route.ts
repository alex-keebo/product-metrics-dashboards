import { NextRequest, NextResponse } from 'next/server'
import { hogql } from '@/lib/posthog'
import { subDays, differenceInCalendarDays, parseISO, format, isValid } from 'date-fns'

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
]

const MODULE_DISPLAY: Record<string, string> = {
  'databricks-warehouse-optimization': 'KWO for Databricks',
  'warehouse-optimization': 'KWO for Snowflake',
  'workload-iq': 'KWI for Snowflake',
}

function buildModuleFilter(slugs: string[]): string {
  const list = slugs.map((s) => `'${s}'`).join(', ')
  return `extract(properties.$current_url, 'https?://[^/]+/([^/?]+)') IN (${list})`
}

const PROJECT_IDS: Record<string, string> = {
  portal: process.env.POSTHOG_PROJECT_ID!,
  integration: process.env.POSTHOG_INTEGRATION_PROJECT_ID!,
}

function buildUserFilter(userType: string): string {
  if (userType === 'external') return `person.properties.is_internal_user != true`
  if (userType === 'internal') return `person.properties.is_internal_user = true`
  return '1 = 1'
}

function prevPeriod(start: string, end: string) {
  const s = parseISO(start)
  const e = parseISO(end)
  const days = differenceInCalendarDays(e, s) + 1
  const prevEnd = subDays(s, 1)
  const prevStart = subDays(prevEnd, days - 1)
  return { start: format(prevStart, 'yyyy-MM-dd'), end: format(prevEnd, 'yyyy-MM-dd') }
}

function slugsToDisplayString(slugsRaw: unknown): string {
  const arr = Array.isArray(slugsRaw) ? (slugsRaw as string[]) : []
  return arr
    .map((s) => MODULE_DISPLAY[s] ?? s)
    .filter(Boolean)
    .sort()
    .join(', ')
}

async function queryCustomersPerModule(start: string, end: string, mf: string, uf: string, pid: string) {
  return hogql(`
    SELECT
      extract(properties.$current_url, 'https?://[^/]+/([^/?]+)') AS module_slug,
      count(distinct org.properties.name) AS count
    FROM events
    WHERE event = '$pageview'
      AND toDate(timestamp) >= '${start}' AND toDate(timestamp) <= '${end}'
      AND ${mf}
      AND ${uf}
      AND isNotNull(org.properties.name)
      AND org.properties.name != ''
    GROUP BY module_slug
  `, pid)
}

async function queryUsersPerModule(start: string, end: string, mf: string, uf: string, pid: string) {
  return hogql(`
    SELECT
      extract(properties.$current_url, 'https?://[^/]+/([^/?]+)') AS module_slug,
      count(distinct properties.$user_id) AS count
    FROM events
    WHERE event = '$pageview'
      AND toDate(timestamp) >= '${start}' AND toDate(timestamp) <= '${end}'
      AND ${mf}
      AND ${uf}
      AND isNotNull(properties.$user_id)
      AND properties.$user_id != ''
    GROUP BY module_slug
  `, pid)
}

async function queryMostActiveCustomers(start: string, end: string, mf: string, uf: string, pid: string) {
  return hogql(`
    SELECT
      org.properties.name AS customer_name,
      count(*) AS pageviews,
      count(distinct toDate(timestamp)) AS active_days,
      groupUniqArray(extract(properties.$current_url, 'https?://[^/]+/([^/?]+)')) AS modules
    FROM events
    WHERE event = '$pageview'
      AND toDate(timestamp) >= '${start}' AND toDate(timestamp) <= '${end}'
      AND ${mf}
      AND ${uf}
      AND isNotNull(org.properties.name)
      AND org.properties.name != ''
    GROUP BY customer_name
    ORDER BY pageviews DESC
    LIMIT 100
  `, pid)
}

async function queryMostActiveUsers(start: string, end: string, mf: string, uf: string, pid: string) {
  return hogql(`
    SELECT
      properties.$user_id AS user_id,
      multiIf(any(person.properties.is_internal_user) = true, 'Keebo', any(org.properties.name)) AS customer_name,
      any(person.properties.name) AS user_name,
      count(*) AS pageviews,
      count(distinct toDate(timestamp)) AS active_days,
      groupUniqArray(extract(properties.$current_url, 'https?://[^/]+/([^/?]+)')) AS modules
    FROM events
    WHERE event = '$pageview'
      AND toDate(timestamp) >= '${start}' AND toDate(timestamp) <= '${end}'
      AND ${mf}
      AND ${uf}
      AND isNotNull(properties.$user_id)
      AND properties.$user_id != ''
    GROUP BY user_id
    ORDER BY pageviews DESC
    LIMIT 100
  `, pid)
}

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

    const prev = prevPeriod(start, end)
    const mf = buildModuleFilter(slugs.length ? slugs : ALL_MODULE_SLUGS)
    const uf = buildUserFilter(userType)

    const [
      curCustPerModule, prevCustPerModule,
      curUsersPerModule, prevUsersPerModule,
      curTopCustomers, prevTopCustomers,
      curTopUsers, prevTopUsers,
    ] = await Promise.all([
      queryCustomersPerModule(start, end, mf, uf, pid),
      queryCustomersPerModule(prev.start, prev.end, mf, uf, pid),
      queryUsersPerModule(start, end, mf, uf, pid),
      queryUsersPerModule(prev.start, prev.end, mf, uf, pid),
      queryMostActiveCustomers(start, end, mf, uf, pid),
      queryMostActiveCustomers(prev.start, prev.end, mf, uf, pid),
      queryMostActiveUsers(start, end, mf, uf, pid),
      queryMostActiveUsers(prev.start, prev.end, mf, uf, pid),
    ])

    // Build lookup maps for previous period counts
    const prevCustModuleMap = new Map(
      prevCustPerModule.map((r) => [String(r.module_slug), Number(r.count)])
    )
    const prevUsersModuleMap = new Map(
      prevUsersPerModule.map((r) => [String(r.module_slug), Number(r.count)])
    )
    const prevCustMap = new Map(
      prevTopCustomers.map((r) => [String(r.customer_name), Number(r.pageviews)])
    )
    const prevUserMap = new Map(
      prevTopUsers.map((r) => [String(r.user_id), Number(r.pageviews)])
    )

    // Merge per-module data — include all selected module slugs (even if 0 activity)
    const activeSlugSet = new Set([
      ...curCustPerModule.map((r) => String(r.module_slug)),
      ...prevCustPerModule.map((r) => String(r.module_slug)),
      ...curUsersPerModule.map((r) => String(r.module_slug)),
      ...prevUsersPerModule.map((r) => String(r.module_slug)),
    ])
    const allSlugs = (slugs.length ? slugs : ALL_MODULE_SLUGS).filter(
      (s) => activeSlugSet.has(s) || ALL_MODULE_SLUGS.includes(s)
    )
    const displayedSlugs = slugs.length ? slugs : ALL_MODULE_SLUGS

    const customers_per_module = displayedSlugs.map((slug) => {
      const cur = Number(curCustPerModule.find((r) => r.module_slug === slug)?.count ?? 0)
      const prv = prevCustModuleMap.get(slug) ?? 0
      return { module_slug: slug, module_name: MODULE_DISPLAY[slug] ?? slug, count: cur, prev_count: prv, delta: cur - prv }
    })

    const users_per_module = displayedSlugs.map((slug) => {
      const cur = Number(curUsersPerModule.find((r) => r.module_slug === slug)?.count ?? 0)
      const prv = prevUsersModuleMap.get(slug) ?? 0
      return { module_slug: slug, module_name: MODULE_DISPLAY[slug] ?? slug, count: cur, prev_count: prv, delta: cur - prv }
    })

    const most_active_customers = curTopCustomers.map((r) => {
      const name = String(r.customer_name)
      const pageviews = Number(r.pageviews)
      const prev_pageviews = prevCustMap.get(name) ?? 0
      return {
        name,
        pageviews,
        prev_pageviews,
        delta: pageviews - prev_pageviews,
        active_days: Number(r.active_days),
        modules: slugsToDisplayString(r.modules),
      }
    })

    const most_active_users = curTopUsers.map((r) => {
      const userId = String(r.user_id)
      const customerName = r.customer_name ? String(r.customer_name) : 'Unknown'
      const userName = r.user_name ? String(r.user_name) : userId
      const pageviews = Number(r.pageviews)
      const prev_pageviews = prevUserMap.get(userId) ?? 0
      return {
        display_name: `${customerName} – ${userName}`,
        user_id: userId,
        pageviews,
        prev_pageviews,
        delta: pageviews - prev_pageviews,
        active_days: Number(r.active_days),
        modules: slugsToDisplayString(r.modules),
      }
    })

    return NextResponse.json({
      customers_per_module,
      users_per_module,
      most_active_customers,
      most_active_users,
      period: { start, end },
      prev_period: prev,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
