import { NextRequest, NextResponse } from 'next/server'
import { hogql } from '@/lib/posthog'
import { subDays, parseISO, format, isValid } from 'date-fns'
import { MODULE_ACTIONS } from '@/lib/feature-action-defs'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
function validateDate(s: string, field: string): string {
  if (!DATE_RE.test(s) || !isValid(parseISO(s))) {
    throw new Error(`Invalid ${field} date: must be YYYY-MM-DD`)
  }
  return s
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

interface ActionDataPoint { date: string; count: number }
interface ActionSeries    { key: string; label: string; data: ActionDataPoint[] }

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl

    const yesterday    = format(subDays(new Date(), 1), 'yyyy-MM-dd')
    const sevenDaysAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd')

    const start   = validateDate(searchParams.get('start') ?? sevenDaysAgo, 'start')
    const end     = validateDate(searchParams.get('end')   ?? yesterday,    'end')
    const module  = searchParams.get('module') ?? ''
    const userType = ['external', 'internal', 'all'].includes(searchParams.get('user_type') ?? '')
      ? (searchParams.get('user_type') as string)
      : 'external'
    const rawProject = searchParams.get('project') ?? 'portal'
    const pid = PROJECT_IDS[rawProject] ?? PROJECT_IDS.portal

    const actions = MODULE_ACTIONS[module]
    if (!actions?.length) {
      return NextResponse.json({ error: `No action definitions for module: ${module}` }, { status: 400 })
    }

    const autocaptureActions = actions.filter((a) => a.kind === 'autocapture') as Extract<typeof actions[number], { kind: 'autocapture' }>[]
    const customActions      = actions.filter((a) => a.kind === 'custom')      as Extract<typeof actions[number], { kind: 'custom' }>[]

    const uf = buildUserFilter(userType)

    const labelMap = new Map<string, string>()
    for (const a of actions) {
      const key = a.kind === 'autocapture' ? a.dataAttr : a.event
      labelMap.set(key, a.label)
    }

    const acc = new Map<string, { total: number; points: Map<string, number> }>()
    for (const [key] of labelMap) acc.set(key, { total: 0, points: new Map() })

    const absorb = (key: string, date: string, cnt: number) => {
      const entry = acc.get(key)
      if (!entry) return
      entry.points.set(date, cnt)
      entry.total += cnt
    }

    const queries: Promise<void>[] = []

    if (autocaptureActions.length > 0) {
      const alternation = autocaptureActions.map((a) => a.dataAttr).join('|')
      queries.push(
        hogql(`
          SELECT
            toDate(timestamp) AS date,
            extract(elements_chain, 'data-attr="([^"]+)"') AS data_attr,
            count() AS cnt
          FROM events
          WHERE event = '$autocapture'
            AND toDate(timestamp) >= '${start}' AND toDate(timestamp) <= '${end}'
            AND ${uf}
            AND match(elements_chain, 'data-attr="(${alternation})"')
          GROUP BY date, data_attr
          ORDER BY date, data_attr
        `, pid).then((rows) => {
          for (const row of rows) {
            absorb(String(row.data_attr), String(row.date).split('T')[0], Number(row.cnt))
          }
        })
      )
    }

    if (customActions.length > 0) {
      const inList = customActions.map((a) => `'${a.event}'`).join(', ')
      queries.push(
        hogql(`
          SELECT
            toDate(timestamp) AS date,
            event,
            count() AS cnt
          FROM events
          WHERE event IN (${inList})
            AND toDate(timestamp) >= '${start}' AND toDate(timestamp) <= '${end}'
            AND ${uf}
          GROUP BY date, event
          ORDER BY date, event
        `, pid).then((rows) => {
          for (const row of rows) {
            absorb(String(row.event), String(row.date).split('T')[0], Number(row.cnt))
          }
        })
      )
    }

    await Promise.all(queries)

    const series: ActionSeries[] = [...acc.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([key, { points }]) => ({
        key,
        label: labelMap.get(key) ?? key,
        data: [...points.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, count]) => ({ date, count })),
      }))

    return NextResponse.json({ series, period: { start, end } })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
