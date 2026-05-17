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

function buildModuleFilter(slugs: string[]): string {
  const list = slugs.map((s) => `'${s}'`).join(', ')
  return `extract(properties.$current_url, 'https?://[^/]+/([^/?]+)') IN (${list})`
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

const PROJECT_IDS: Record<string, string> = {
  portal: process.env.POSTHOG_PROJECT_ID!,
  integration: process.env.POSTHOG_INTEGRATION_PROJECT_ID!,
}

async function queryTotalCustomers(start: string, end: string, mf: string, uf: string, pid: string) {
  const rows = await hogql(`
    SELECT count(distinct org.properties.name) AS count
    FROM events
    WHERE event = '$pageview'
      AND toDate(timestamp) >= '${start}' AND toDate(timestamp) <= '${end}'
      AND ${mf}
      AND ${uf}
      AND isNotNull(org.properties.name)
      AND org.properties.name != ''
  `, pid)
  return Number(rows[0]?.count ?? 0)
}

async function queryAvgDailyCustomers(start: string, end: string, mf: string, uf: string, pid: string) {
  const rows = await hogql(`
    SELECT avg(daily_count) AS avg_count
    FROM (
      SELECT toDate(timestamp) AS day, count(distinct org.properties.name) AS daily_count
      FROM events
      WHERE event = '$pageview'
        AND toDate(timestamp) >= '${start}' AND toDate(timestamp) <= '${end}'
        AND ${mf}
        AND ${uf}
        AND isNotNull(org.properties.name)
        AND org.properties.name != ''
      GROUP BY day
    )
  `, pid)
  return Number(rows[0]?.avg_count ?? 0)
}

async function queryTotalUsers(start: string, end: string, mf: string, uf: string, pid: string) {
  const rows = await hogql(`
    SELECT count(distinct properties.$user_id) AS count
    FROM events
    WHERE event = '$pageview'
      AND toDate(timestamp) >= '${start}' AND toDate(timestamp) <= '${end}'
      AND ${mf}
      AND ${uf}
      AND isNotNull(properties.$user_id)
      AND properties.$user_id != ''
  `, pid)
  return Number(rows[0]?.count ?? 0)
}

async function queryAvgDailyUsers(start: string, end: string, mf: string, uf: string, pid: string) {
  const rows = await hogql(`
    SELECT avg(daily_count) AS avg_count
    FROM (
      SELECT toDate(timestamp) AS day, count(distinct properties.$user_id) AS daily_count
      FROM events
      WHERE event = '$pageview'
        AND toDate(timestamp) >= '${start}' AND toDate(timestamp) <= '${end}'
        AND ${mf}
        AND ${uf}
        AND isNotNull(properties.$user_id)
        AND properties.$user_id != ''
      GROUP BY day
    )
  `, pid)
  return Number(rows[0]?.avg_count ?? 0)
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
      curCustomers, prevCustomers,
      curAvgCustomers, prevAvgCustomers,
      curUsers, prevUsers,
      curAvgUsers, prevAvgUsers,
    ] = await Promise.all([
      queryTotalCustomers(start, end, mf, uf, pid),
      queryTotalCustomers(prev.start, prev.end, mf, uf, pid),
      queryAvgDailyCustomers(start, end, mf, uf, pid),
      queryAvgDailyCustomers(prev.start, prev.end, mf, uf, pid),
      queryTotalUsers(start, end, mf, uf, pid),
      queryTotalUsers(prev.start, prev.end, mf, uf, pid),
      queryAvgDailyUsers(start, end, mf, uf, pid),
      queryAvgDailyUsers(prev.start, prev.end, mf, uf, pid),
    ])

    return NextResponse.json({
      total_customers: { current: curCustomers, previous: prevCustomers, delta: curCustomers - prevCustomers },
      avg_daily_customers: { current: curAvgCustomers, previous: prevAvgCustomers, delta: curAvgCustomers - prevAvgCustomers },
      total_users: { current: curUsers, previous: prevUsers, delta: curUsers - prevUsers },
      avg_daily_users: { current: curAvgUsers, previous: prevAvgUsers, delta: curAvgUsers - prevAvgUsers },
      period: { start, end },
      prev_period: prev,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
