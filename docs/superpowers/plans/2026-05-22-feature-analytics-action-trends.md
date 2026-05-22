# Feature Analytics — User Action Trend Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "User Actions" section to the KWO for Databricks and KWO for Snowflake tabs in the Feature Analytics dashboard, rendering one daily-count area chart per tracked action (autocapture data-attr clicks for DBX, named custom events for SF).

**Architecture:** A static config file defines all tracked actions per module. A new API route queries PostHog HogQL — running up to two parallel queries per module (one for autocapture, one for named events) — and returns merged series sorted by total volume DESC. The frontend adds a new `ActionTrendCard` component and a "User Actions" section inside the existing `DetailTab`, fetching alongside the current DAU trends.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Recharts, PostHog HogQL API, date-fns

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/feature-action-defs.ts` | Create | Static registry of all tracked actions per module slug |
| `src/app/api/feature-analytics/action-trends/route.ts` | Create | HogQL queries, merge + sort logic, response |
| `src/app/feature-analytics/page.tsx` | Modify | `ActionTrendCard` component, `DetailTab` section, fetch + state |

---

## Task 1: Event Definitions Config

**Files:**
- Create: `src/lib/feature-action-defs.ts`

- [ ] **Step 1.1: Create the config file**

```ts
// src/lib/feature-action-defs.ts

export type AutocaptureAction = { kind: 'autocapture'; dataAttr: string; label: string }
export type CustomAction      = { kind: 'custom'; event: string; label: string }
export type ActionDef         = AutocaptureAction | CustomAction

export const MODULE_ACTIONS: Record<string, ActionDef[]> = {
  'databricks-warehouse-optimization': [
    // Warehouse (autocapture)
    { kind: 'autocapture', dataAttr: 'dbx-warehouse-edit',                      label: 'Warehouse: Edit' },
    { kind: 'autocapture', dataAttr: 'dbx-warehouse-edit-idle-time',             label: 'Warehouse: Idle time' },
    { kind: 'autocapture', dataAttr: 'dbx-warehouse-edit-downsizing',            label: 'Warehouse: Downsizing' },
    { kind: 'autocapture', dataAttr: 'dbx-warehouse-edit-save',                  label: 'Warehouse: Save' },
    { kind: 'autocapture', dataAttr: 'dbx-warehouse-edit-cancel',                label: 'Warehouse: Cancel edit' },
    { kind: 'autocapture', dataAttr: 'dbx-warehouse-add',                        label: 'Warehouse: Add' },
    { kind: 'autocapture', dataAttr: 'dbx-warehouse-toggle-status',              label: 'Warehouse: Toggle status' },
    { kind: 'autocapture', dataAttr: 'dbx-warehouse-filter',                     label: 'Warehouse: Filter' },
    { kind: 'autocapture', dataAttr: 'dbx-warehouse-error-help',                 label: 'Warehouse: Error help' },
    { kind: 'autocapture', dataAttr: 'dbx-warehouse-permissions-dialog-verify',  label: 'Verify permissions' },
    // Account / Workspace (autocapture)
    { kind: 'autocapture', dataAttr: 'dbx-add-account',             label: 'Add account' },
    { kind: 'autocapture', dataAttr: 'dbx-add-workspace',           label: 'Add workspace' },
    { kind: 'autocapture', dataAttr: 'dbx-account-picker',          label: 'Account picker' },
    { kind: 'autocapture', dataAttr: 'dbx-account-filter',          label: 'Account filter' },
    { kind: 'autocapture', dataAttr: 'dbx-workspace-picker',        label: 'Workspace picker' },
    { kind: 'autocapture', dataAttr: 'dbx-workspace-filter',        label: 'Workspace filter' },
    { kind: 'autocapture', dataAttr: 'dbx-workspace-dialog-cancel', label: 'Workspace dialog: Cancel' },
    // Guardrails (autocapture)
    { kind: 'autocapture', dataAttr: 'dbx-guardrails-edit',             label: 'Guardrails: Edit' },
    { kind: 'autocapture', dataAttr: 'dbx-guardrails-mode-custom',      label: 'Guardrails: Custom mode' },
    { kind: 'autocapture', dataAttr: 'dbx-guardrails-mode-autoguard',   label: 'Guardrails: Autoguard' },
    { kind: 'autocapture', dataAttr: 'dbx-guardrails-dialog-cancel',    label: 'Guardrails: Cancel' },
    { kind: 'autocapture', dataAttr: 'dbx-guardrails-chart-date-range', label: 'Guardrails: Chart date range' },
    // Settings (autocapture)
    { kind: 'autocapture', dataAttr: 'dbx-settings-warehouse-permissions-button', label: 'Settings: Warehouse permissions' },
    { kind: 'autocapture', dataAttr: 'dbx-settings-workspace-permissions-button', label: 'Settings: Workspace permissions' },
    { kind: 'autocapture', dataAttr: 'dbx-settings-service-principal-button',     label: 'Settings: Service principal' },
    { kind: 'autocapture', dataAttr: 'dbx-settings-schema-config-button',         label: 'Settings: Schema config' },
    // Onboarding (named custom events)
    { kind: 'custom', event: 'databricks_onboarding_started',              label: 'Onboarding: Started' },
    { kind: 'custom', event: 'databricks_onboarding_account_connected',    label: 'Onboarding: Account connected' },
    { kind: 'custom', event: 'databricks_onboarding_workspace_connected',  label: 'Onboarding: Workspace connected' },
    { kind: 'custom', event: 'databricks_onboarding_warehouses_connected', label: 'Onboarding: Warehouses connected' },
    { kind: 'custom', event: 'databricks_onboarding_schema_verified',      label: 'Onboarding: Schema verified' },
    { kind: 'custom', event: 'databricks_onboarding_complete',             label: 'Onboarding: Complete' },
    { kind: 'custom', event: 'databricks_onboarding_abandoned',            label: 'Onboarding: Abandoned' },
    // Dialogs (named custom events)
    { kind: 'custom', event: 'databricks_account_dialog_opened',   label: 'Account dialog: Opened' },
    { kind: 'custom', event: 'databricks_account_added',           label: 'Account added' },
    { kind: 'custom', event: 'databricks_warehouse_dialog_opened', label: 'Warehouse dialog: Opened' },
    { kind: 'custom', event: 'databricks_warehouse_added',         label: 'Warehouse added' },
    { kind: 'custom', event: 'databricks_warehouse_failed',        label: 'Warehouse: Failed' },
    { kind: 'custom', event: 'databricks_workspace_dialog_opened', label: 'Workspace dialog: Opened' },
  ],
  'warehouse-optimization': [
    { kind: 'custom', event: 'settings_warehouse_optimization_toggled', label: 'Optimization toggled' },
    { kind: 'custom', event: 'settings_warehouse_dialog_opened',        label: 'Warehouse dialog: Opened' },
    { kind: 'custom', event: 'settings_warehouse_dialog_closed',        label: 'Warehouse dialog: Closed' },
    { kind: 'custom', event: 'settings_aggressiveness_slider_changed',  label: 'Aggressiveness slider' },
    { kind: 'custom', event: 'settings_guardrails_updated',             label: 'Guardrails updated' },
    { kind: 'custom', event: 'settings_bulk_operation_performed',       label: 'Bulk operation' },
    { kind: 'custom', event: 'settings_advanced_filters_applied',       label: 'Advanced filters' },
  ],
}
```

- [ ] **Step 1.2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 1.3: Commit**

```bash
git add src/lib/feature-action-defs.ts
git commit -m "feat: add feature action definitions config"
```

---

## Task 2: API Route

**Files:**
- Create: `src/app/api/feature-analytics/action-trends/route.ts`

The route reads the module's `ActionDef[]`, splits into autocapture vs. custom, runs up to two HogQL queries in parallel, merges results, sorts by total count DESC.

- [ ] **Step 2.1: Create the route file**

```ts
// src/app/api/feature-analytics/action-trends/route.ts
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

    // Build a lookup: key -> label
    const labelMap = new Map<string, string>()
    for (const a of actions) {
      const key = a.kind === 'autocapture' ? a.dataAttr : a.event
      labelMap.set(key, a.label)
    }

    // Accumulator: key -> { total, points: Map<date, count> }
    const acc = new Map<string, { total: number; points: Map<string, number> }>()
    for (const [key] of labelMap) acc.set(key, { total: 0, points: new Map() })

    function absorb(key: string, date: string, cnt: number) {
      const entry = acc.get(key)
      if (!entry) return
      entry.points.set(date, cnt)
      entry.total += cnt
    }

    // Run up to two queries in parallel
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

    // Sort by total DESC, build series
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
```

- [ ] **Step 2.2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2.3: Smoke-test the route manually**

Start the dev server (`npm run dev`), then in a new terminal:

```bash
source .env.local
curl "http://localhost:3000/api/feature-analytics/action-trends?module=databricks-warehouse-optimization&start=2026-05-01&end=2026-05-22&user_type=all&project=portal" | python3 -m json.tool | head -40
```

Expected: JSON with `series` array. Each item has `key`, `label`, `data` (array of `{ date, count }`). Series with non-zero counts appear at the top.

- [ ] **Step 2.4: Commit**

```bash
git add src/app/api/feature-analytics/action-trends/route.ts
git commit -m "feat: add action-trends API route for feature analytics"
```

---

## Task 3: UI — ActionTrendCard + DetailTab Section + Fetch

**Files:**
- Modify: `src/app/feature-analytics/page.tsx`

This task has three sub-parts: new types + helper, new `ActionTrendCard` component, and wiring fetch/state/rendering into the existing page.

- [ ] **Step 3.1: Add types and `padActionRange` helper**

In `src/app/feature-analytics/page.tsx`, add these after the existing type block (after line ~50, after `PageTrendsResponse`):

```ts
interface ActionDataPoint {
  date: string
  count: number
}

interface ActionSeries {
  key: string
  label: string
  data: ActionDataPoint[]
}

interface ActionTrendsResponse {
  series: ActionSeries[]
  period: { start: string; end: string }
}
```

And add `padActionRange` alongside the existing `padDateRange` helper (after line ~120):

```ts
function padActionRange(data: ActionDataPoint[], start: string, end: string): ActionDataPoint[] {
  const map = new Map(data.map((d) => [d.date, d.count]))
  const result: ActionDataPoint[] = []
  let cur = parseISO(start)
  const last = parseISO(end)
  while (cur <= last) {
    const dateStr = format(cur, 'yyyy-MM-dd')
    result.push({ date: dateStr, count: map.get(dateStr) ?? 0 })
    cur = addDays(cur, 1)
  }
  return result
}
```

- [ ] **Step 3.2: Add `ActionTrendCard` component**

Add this component after the existing `PageDauCard` component (after line ~430):

```tsx
function ActionTrendCard({ series, start, end }: { series: ActionSeries; start: string; end: string }) {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const padded = padActionRange(series.data, start, end)
  const gradientId = `action-fill-${series.key.replace(/[^a-zA-Z0-9]/g, '-')}`

  const GRID = isLight ? LIGHT_GRID : DARK_GRID
  const AXIS = isLight ? LIGHT_AXIS : DARK_AXIS
  const TT   = isLight ? LIGHT_TOOLTIP : DARK_TOOLTIP

  const dot = isLight
    ? { fill: C_NAVY, stroke: C_NAVY, strokeWidth: 2, r: 4 }
    : { fill: C_NAVY, stroke: C_NAVY, strokeWidth: 0, r: 4 }
  const activeDot = isLight
    ? { fill: '#daeaf4', stroke: C_NAVY, strokeWidth: 2, r: 6 }
    : { fill: C_NAVY, stroke: C_NAVY, strokeWidth: 0, r: 6 }

  return (
    <ChartWrapper title={series.label} isLight={isLight}>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={padded} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C_NAVY} stopOpacity={isLight ? 1 : 0.35} />
              <stop offset="100%" stopColor={C_NAVY} stopOpacity={isLight ? 0.4 : 0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="date"
            tick={AXIS}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => { try { return format(parseISO(v), 'M/d') } catch { return v } }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={AXIS}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            tickFormatter={(v) => fmtInt.format(v)}
          />
          <Tooltip
            {...TT}
            labelFormatter={(v) => { try { return format(parseISO(String(v)), 'MMM d, yyyy') } catch { return v } }}
            formatter={(v) => [fmtInt.format(Number(v)), 'Clicks']}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke={C_NAVY}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={dot}
            activeDot={activeDot}
            connectNulls={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartWrapper>
  )
}
```

- [ ] **Step 3.3: Update `DetailTab` to accept and render action series**

Replace the existing `DetailTab` function signature and body:

```tsx
function DetailTab({
  series,
  loading,
  error,
  start,
  end,
  actionSeries,
  actionLoading,
  actionError,
}: {
  series: DauSeries[] | null
  loading: boolean
  error: string | null
  start: string
  end: string
  actionSeries: ActionSeries[] | null
  actionLoading: boolean
  actionError: string | null
}) {
  if (loading) return <SectionLoader />
  if (error) return <SectionError message={error} />
  return (
    <div className="flex flex-col gap-6">
      {(!series || series.length === 0) ? (
        <p className="text-sm text-muted-foreground py-10 text-center">No data in selected period</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {series.map((s) => (
            <PageDauCard key={s.page} series={s} start={start} end={end} />
          ))}
        </div>
      )}

      {(actionLoading || (actionSeries && actionSeries.length > 0) || actionError) && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-foreground">User Actions</h3>
          {actionLoading ? (
            <SectionLoader />
          ) : actionError ? (
            <SectionError message={actionError} />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {(actionSeries ?? []).map((s) => (
                <ActionTrendCard key={s.key} series={s} start={start} end={end} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3.4: Add action trends state and fetch to `FeatureAnalyticsPage`**

In `FeatureAnalyticsPage`, add state after the existing `dauTrends` state block:

```ts
// Action trends for per-module tabs
const [actionTrends, setActionTrends]               = useState<Record<string, ActionSeries[] | null>>({})
const [actionTrendsLoading, setActionTrendsLoading] = useState(false)
const [actionTrendsError, setActionTrendsError]     = useState<string | null>(null)
```

Add the fetch function after `fetchDauTrends`:

```ts
const fetchActionTrends = useCallback(async () => {
  setActionTrendsLoading(true)
  setActionTrendsError(null)
  try {
    const results = await Promise.all(
      MODULE_DEFS
        .filter((m) => (MODULE_ACTIONS[m.slug]?.length ?? 0) > 0)
        .map(async (m) => {
          const p = buildCommonParams()
          p.set('module', m.slug)
          const res = await fetch(`/api/feature-analytics/action-trends?${p}`)
          const data: ActionTrendsResponse = await res.json()
          if (!res.ok) throw new Error((data as unknown as { error: string }).error ?? 'Unknown error')
          return { slug: m.slug, series: data.series }
        })
    )
    const map: Record<string, ActionSeries[]> = {}
    for (const { slug, series } of results) map[slug] = series
    setActionTrends(map)
  } catch (e) {
    setActionTrendsError(e instanceof Error ? e.message : String(e))
  } finally {
    setActionTrendsLoading(false)
  }
}, [buildCommonParams])
```

- [ ] **Step 3.5: Add `MODULE_ACTIONS` import and wire `fetchActionTrends` into useEffect**

At the top of `page.tsx`, add the import after existing imports:

```ts
import { MODULE_ACTIONS } from '@/lib/feature-action-defs'
```

Update the `useEffect` that currently calls `fetchModulePages` and `fetchDauTrends`:

```ts
useEffect(() => {
  fetchModulePages()
  fetchDauTrends()
  fetchActionTrends()
}, [fetchModulePages, fetchDauTrends, fetchActionTrends])
```

- [ ] **Step 3.6: Pass action props to `DetailTab` in the render**

Find the `<DetailTab ... />` JSX in the render (currently inside `{activeTab !== 'most-used-features' && ...}`) and add the three new props:

```tsx
<DetailTab
  series={dauTrends[activeTab] ?? null}
  loading={dauTrendsLoading}
  error={dauTrendsError}
  start={startDate}
  end={endDate}
  actionSeries={actionTrends[activeTab] ?? null}
  actionLoading={actionTrendsLoading}
  actionError={actionTrendsError}
/>
```

- [ ] **Step 3.7: Type-check and lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors.

- [ ] **Step 3.8: Manual verification**

Start dev server (`npm run dev`). Navigate to `http://localhost:3000/feature-analytics`.

1. Click the **KWO for Databricks** tab — after loading, a "User Actions" section appears below the DAU charts with area charts for each action. Charts sorted highest-volume first.
2. Click the **KWO for Snowflake** tab — "User Actions" section appears with the 7 SF named event charts.
3. Click **Platform** and **KWI for Snowflake** tabs — no "User Actions" section rendered.
4. Change the date range — all action charts re-fetch and update.
5. Switch User Type to "Internal" — charts re-fetch.

- [ ] **Step 3.9: Commit**

```bash
git add src/app/feature-analytics/page.tsx
git commit -m "feat: add User Actions section to Feature Analytics module tabs"
```
