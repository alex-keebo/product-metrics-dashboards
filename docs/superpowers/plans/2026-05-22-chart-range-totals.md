# Chart Range Totals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display a range-total value in the top-right corner of every line/bar chart card across all dashboards, calculated using the same formula as individual data points but aggregated across the full selected date range.

**Architecture:** Extend both KWO timeseries API routes to return a `range_totals` field alongside existing `points`; these totals require backend computation because `warehouses` is a COUNT DISTINCT that can't be derived from per-period sums. Feature Analytics totals are computed client-side since they're simple sums/averages of data already in memory. `ChartWrapper` gains an optional `totals` prop that renders a right-aligned label+value block in the header row.

**Tech Stack:** Next.js 14 App Router, TypeScript, Recharts, Vitest (to be installed for unit tests), Tailwind CSS.

---

## File Map

| File | Change |
|------|--------|
| `src/lib/types.ts` | Add `TimeSeriesRangeTotals`; add `range_totals` to `TimeSeriesResponse` |
| `src/lib/kpi.ts` | Add `computeRangeTotalsFromPoints(points, warehouses)` |
| `src/lib/__tests__/kpi.test.ts` | **New** — unit tests for `computeRangeTotalsFromPoints` |
| `src/app/api/kwo-databricks/timeseries/route.ts` | Compute `rangeWarehouses` (COUNT DISTINCT from raw rows); call `computeRangeTotalsFromPoints`; include in JSON response |
| `src/app/api/kwo-snowflake/timeseries/route.ts` | Compute `rangeWarehouses` (per-org max then sum); call `computeRangeTotalsFromPoints`; include in JSON response |
| `src/components/charts/TimeSeriesCharts.tsx` | Add `totals` prop to `ChartWrapper`; add `rangeTotals` prop to `TimeSeriesCharts`; pass pre-formatted totals to each `ChartWrapper` |
| `src/app/kwo-databricks/page.tsx` | Add `range_totals: TimeSeriesRangeTotals` to local `TimeSeriesResponse`; pass `rangeTotals` to `<TimeSeriesCharts>` |
| `src/app/kwo-snowflake/page.tsx` | Same as above |
| `src/app/feature-analytics/page.tsx` | Migrate `ModulePagesCard` to use `ChartWrapper`; add client-side totals to `ModulePagesCard`, `PageDauCard`, `ActionTrendCard` |

---

## Task 1: Install Vitest

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install vitest**

```bash
cd /Users/alex/Keebo/pm_operations/product-metrics-dashboards
npm install --save-dev vitest
```

- [ ] **Step 2: Add test script to package.json**

In `package.json`, add `"test": "vitest run"` to the `"scripts"` block. Open the file, find the scripts section, and add the entry alongside `dev`, `build`, `lint`.

- [ ] **Step 3: Verify vitest runs (no tests yet)**

```bash
npx vitest run
```

Expected: exits 0 with "No test files found" or similar.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add vitest for unit testing"
```

---

## Task 2: Add types and pure computation function (TDD)

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/kpi.ts`
- Create: `src/lib/__tests__/kpi.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/kpi.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { computeRangeTotalsFromPoints } from '../kpi'
import type { TimeSeriesPoint } from '../types'

function makePoint(overrides: Partial<TimeSeriesPoint> = {}): TimeSeriesPoint {
  return {
    period_label: '2024-01-01',
    period_label_display: 'Jan 1',
    period_start: '2024-01-01',
    period_end: '2024-01-07',
    org_id: 'org1',
    name: 'Org 1',
    contract_type: 'subscription',
    savings_dbus: 0,
    savings_pct: 0,
    total_spend_dbus: 0,
    paused_spend_dbus: 0,
    warehouses: 0,
    query_volume: 0,
    auto_stop_events: 0,
    resizing_events: 0,
    ...overrides,
  }
}

describe('computeRangeTotalsFromPoints', () => {
  it('returns zeros for empty points array', () => {
    const result = computeRangeTotalsFromPoints([], 0)
    expect(result.savings_dbus).toBe(0)
    expect(result.savings_pct).toBe(0)
    expect(result.warehouses).toBe(0)
  })

  it('sums savings_dbus across all points', () => {
    const points = [
      makePoint({ savings_dbus: 100, total_spend_dbus: 300, paused_spend_dbus: 0 }),
      makePoint({ savings_dbus: 200, total_spend_dbus: 500, paused_spend_dbus: 0 }),
    ]
    expect(computeRangeTotalsFromPoints(points, 0).savings_dbus).toBe(300)
  })

  it('re-aggregates savings_pct from sums, not by averaging per-period pcts', () => {
    // Period 1: savings=100, optimized_actual=200 → gross=300 → 33.3%
    // Period 2: savings=100, optimized_actual=900 → gross=1000 → 10%
    // Naive average: (33.3 + 10) / 2 = 21.65%  — WRONG
    // Correct: total_savings=200, total_gross=1300 → 15.38%
    const points = [
      makePoint({ org_id: 'org1', savings_dbus: 100, total_spend_dbus: 200, paused_spend_dbus: 0 }),
      makePoint({ org_id: 'org2', savings_dbus: 100, total_spend_dbus: 900, paused_spend_dbus: 0 }),
    ]
    expect(computeRangeTotalsFromPoints(points, 0).savings_pct).toBeCloseTo(15.38, 1)
  })

  it('excludes paused spend from gross when computing savings_pct', () => {
    // optimized_actual = total_spend - paused_spend = 1000 - 200 = 800
    // gross = 800 + 200 (savings) = 1000
    // savings_pct = 200/1000 * 100 = 20%
    const points = [
      makePoint({ savings_dbus: 200, total_spend_dbus: 1000, paused_spend_dbus: 200 }),
    ]
    expect(computeRangeTotalsFromPoints(points, 0).savings_pct).toBeCloseTo(20, 1)
  })

  it('returns 0 savings_pct when gross spend is zero', () => {
    const points = [makePoint({ savings_dbus: 0, total_spend_dbus: 0, paused_spend_dbus: 0 })]
    expect(computeRangeTotalsFromPoints(points, 0).savings_pct).toBe(0)
  })

  it('uses the passed-in warehouses count directly', () => {
    const points = [makePoint({ warehouses: 3 }), makePoint({ warehouses: 5 })]
    expect(computeRangeTotalsFromPoints(points, 7).warehouses).toBe(7)
  })

  it('sums query_volume, auto_stop_events, resizing_events', () => {
    const points = [
      makePoint({ query_volume: 100, auto_stop_events: 10, resizing_events: 5 }),
      makePoint({ query_volume: 200, auto_stop_events: 20, resizing_events: 8 }),
    ]
    const result = computeRangeTotalsFromPoints(points, 0)
    expect(result.query_volume).toBe(300)
    expect(result.auto_stop_events).toBe(30)
    expect(result.resizing_events).toBe(13)
  })

  it('sums total_spend_dbus and paused_spend_dbus', () => {
    const points = [
      makePoint({ total_spend_dbus: 500, paused_spend_dbus: 50 }),
      makePoint({ total_spend_dbus: 800, paused_spend_dbus: 100 }),
    ]
    const result = computeRangeTotalsFromPoints(points, 0)
    expect(result.total_spend_dbus).toBe(1300)
    expect(result.paused_spend_dbus).toBe(150)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/__tests__/kpi.test.ts
```

Expected: FAIL — `computeRangeTotalsFromPoints is not a function` or similar.

- [ ] **Step 3: Add `TimeSeriesRangeTotals` to types.ts**

In `src/lib/types.ts`, add after the `TimeSeriesPoint` interface:

```typescript
export interface TimeSeriesRangeTotals {
  savings_dbus: number
  savings_pct: number
  total_spend_dbus: number
  paused_spend_dbus: number
  warehouses: number
  query_volume: number
  auto_stop_events: number
  resizing_events: number
}
```

Also update `TimeSeriesResponse`:

```typescript
export interface TimeSeriesResponse {
  points: TimeSeriesPoint[]
  data_as_of: string
  range_totals: TimeSeriesRangeTotals
}
```

- [ ] **Step 4: Add `computeRangeTotalsFromPoints` to kpi.ts**

In `src/lib/kpi.ts`, add this import at the top (update existing import):

```typescript
import { KPIRow, AggregatedKPIs, SnapshotKPIWithDelta, TimeSeriesPoint, TimeSeriesRangeTotals } from './types'
```

Then add the function at the bottom of the file:

```typescript
export function computeRangeTotalsFromPoints(
  points: TimeSeriesPoint[],
  warehouses: number,
): TimeSeriesRangeTotals {
  const savings_dbus = points.reduce((s, p) => s + p.savings_dbus, 0)
  const total_spend_dbus = points.reduce((s, p) => s + p.total_spend_dbus, 0)
  const paused_spend_dbus = points.reduce((s, p) => s + p.paused_spend_dbus, 0)
  const optimized_actual = total_spend_dbus - paused_spend_dbus
  const grossSpend = optimized_actual + savings_dbus
  const savings_pct = grossSpend > 0 ? (savings_dbus / grossSpend) * 100 : 0
  return {
    savings_dbus,
    savings_pct,
    total_spend_dbus,
    paused_spend_dbus,
    warehouses,
    query_volume: points.reduce((s, p) => s + p.query_volume, 0),
    auto_stop_events: points.reduce((s, p) => s + p.auto_stop_events, 0),
    resizing_events: points.reduce((s, p) => s + p.resizing_events, 0),
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/lib/__tests__/kpi.test.ts
```

Expected: all 8 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/kpi.ts src/lib/__tests__/kpi.test.ts
git commit -m "feat: add TimeSeriesRangeTotals type and computeRangeTotalsFromPoints"
```

---

## Task 3: Extend KWO Databricks timeseries API

**Files:**
- Modify: `src/app/api/kwo-databricks/timeseries/route.ts`

The Databricks raw rows have a `warehouse_id` field. The range-level COUNT DISTINCT for warehouses must be computed from those raw rows (you cannot sum per-period per-org warehouse counts without double-counting).

- [ ] **Step 1: Add import for `computeRangeTotalsFromPoints`**

In `src/app/api/kwo-databricks/timeseries/route.ts`, update the import from `@/lib/types`:

```typescript
import { ContractType, Granularity, TimeSeriesPoint, TimeSeriesRangeTotals } from '@/lib/types'
```

And add a new import:

```typescript
import { computeRangeTotalsFromPoints } from '@/lib/kpi'
```

- [ ] **Step 2: Compute range_totals after `points` is built**

In the `GET` handler, after the line `points.sort(...)` (around line 165) and before building `all_periods`, add:

```typescript
const rangeWarehouses = new Set(
  rows.filter((r) => r.active).map((r) => r.warehouse_id)
).size
const range_totals: TimeSeriesRangeTotals = computeRangeTotalsFromPoints(points, rangeWarehouses)
```

- [ ] **Step 3: Include `range_totals` in the response**

Update the final `return NextResponse.json(...)` call to include `range_totals`:

```typescript
return NextResponse.json({ points, data_as_of, available_customers, all_periods, range_totals })
```

Also update the early-exit empty response (line ~83) so it always includes `range_totals`:

```typescript
const emptyTotals: TimeSeriesRangeTotals = {
  savings_dbus: 0, savings_pct: 0, total_spend_dbus: 0, paused_spend_dbus: 0,
  warehouses: 0, query_volume: 0, auto_stop_events: 0, resizing_events: 0,
}
return NextResponse.json({ points: [], data_as_of, available_customers, all_periods: [], range_totals: emptyTotals })
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/kwo-databricks/timeseries/route.ts
git commit -m "feat: add range_totals to KWO Databricks timeseries API"
```

---

## Task 4: Extend KWO Snowflake timeseries API

**Files:**
- Modify: `src/app/api/kwo-snowflake/timeseries/route.ts`

Snowflake raw rows store `active_warehouses: number` (a count per row), not individual warehouse IDs. The range total uses: per-org max of `active_warehouses` across the full date range, summed across orgs.

- [ ] **Step 1: Add imports**

In `src/app/api/kwo-snowflake/timeseries/route.ts`, update the types import:

```typescript
import { ContractType, Granularity, TimeSeriesPoint, TimeSeriesRangeTotals } from '@/lib/types'
```

Add import:

```typescript
import { computeRangeTotalsFromPoints } from '@/lib/kpi'
```

- [ ] **Step 2: Compute range_totals after `points` is built**

After `points.sort(...)` (around line 201), add:

```typescript
const byOrgWarehouseMax = new Map<string, number>()
for (const row of rows) {
  const cur = byOrgWarehouseMax.get(row.org_id) ?? 0
  byOrgWarehouseMax.set(row.org_id, Math.max(cur, Number(row.active_warehouses)))
}
const rangeWarehouses = Array.from(byOrgWarehouseMax.values()).reduce((s, v) => s + v, 0)
const range_totals: TimeSeriesRangeTotals = computeRangeTotalsFromPoints(points, rangeWarehouses)
```

- [ ] **Step 3: Include `range_totals` in the response**

Update the final return:

```typescript
return NextResponse.json({ points, data_as_of, available_customers, all_periods, range_totals })
```

Update the early-exit empty response (line ~120):

```typescript
const emptyTotals: TimeSeriesRangeTotals = {
  savings_dbus: 0, savings_pct: 0, total_spend_dbus: 0, paused_spend_dbus: 0,
  warehouses: 0, query_volume: 0, auto_stop_events: 0, resizing_events: 0,
}
return NextResponse.json({ points: [], data_as_of, available_customers, all_periods: [], range_totals: emptyTotals })
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/kwo-snowflake/timeseries/route.ts
git commit -m "feat: add range_totals to KWO Snowflake timeseries API"
```

---

## Task 5: Update ChartWrapper with totals display

**Files:**
- Modify: `src/components/charts/TimeSeriesCharts.tsx` (lines 161–211)

The `ChartWrapper` header row changes from a single title div to a flex row with title on the left and optional totals block on the right. The `totals` prop:
- `undefined` → render nothing in the right side (backward compatible)
- `null` → render a skeleton shimmer (for future loading states)
- `{ label: string; value: string }[]` → render each label+value pair

- [ ] **Step 1: Update `ChartWrapperProps`**

Replace the existing `ChartWrapperProps` interface (lines 161–166):

```typescript
interface ChartWrapperProps {
  title: string
  children: React.ReactNode
  isLight: boolean
  height?: number
  totals?: { label: string; value: string }[] | null
}
```

- [ ] **Step 2: Update the light-mode ChartWrapper render**

Replace the title `<div>` inside the light-mode branch (lines 178–186) with a header row:

```tsx
<div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
  <div style={{
    fontFamily: 'Exo, sans-serif',
    fontWeight: 500,
    fontSize: 18,
    lineHeight: '24px',
    color: '#051c27',
  }}>{title}</div>
  {totals !== undefined && (
    <div style={{ display: 'flex', gap: 16, flexShrink: 0, marginLeft: 12 }}>
      {totals === null ? (
        <div className="animate-pulse" style={{ width: 56, height: 36, background: '#e4f0f7', borderRadius: 4 }} />
      ) : (
        totals.map(({ label, value }) => (
          <div key={label} style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 10, fontWeight: 400, color: '#4a6373', marginBottom: 1 }}>{label}</div>
            <div style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 15, fontWeight: 600, color: '#051c27' }}>{value}</div>
          </div>
        ))
      )}
    </div>
  )}
</div>
```

- [ ] **Step 3: Update the dark-mode ChartWrapper render**

Replace the title `<div>` inside the dark-mode branch (lines 199–207) with the same flex row using dark theme colors:

```tsx
<div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
  <div style={{
    fontFamily: 'Exo, sans-serif',
    fontWeight: 500,
    fontSize: 16,
    lineHeight: '22px',
    color: '#e8f0f4',
  }}>{title}</div>
  {totals !== undefined && (
    <div style={{ display: 'flex', gap: 16, flexShrink: 0, marginLeft: 12 }}>
      {totals === null ? (
        <div className="animate-pulse" style={{ width: 56, height: 36, background: '#0d3344', borderRadius: 4 }} />
      ) : (
        totals.map(({ label, value }) => (
          <div key={label} style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 10, fontWeight: 400, color: '#6b7f8a', marginBottom: 1 }}>{label}</div>
            <div style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 15, fontWeight: 600, color: '#e8f0f4' }}>{value}</div>
          </div>
        ))
      )}
    </div>
  )}
</div>
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/charts/TimeSeriesCharts.tsx
git commit -m "feat: add totals display to ChartWrapper header"
```

---

## Task 6: Update TimeSeriesCharts to pass range totals

**Files:**
- Modify: `src/components/charts/TimeSeriesCharts.tsx` (lines 215–546)

Add `rangeTotals` prop to `TimeSeriesCharts`. For each chart, compute a pre-formatted totals array using the same formatters as the chart's Y-axis, then pass to `ChartWrapper`.

- [ ] **Step 1: Add `TimeSeriesRangeTotals` import**

Update the import at line 10:

```typescript
import { TimeSeriesPoint, TimeSeriesRangeTotals } from '@/lib/types'
```

- [ ] **Step 2: Add `rangeTotals` to `TimeSeriesChartsProps`**

Update the `TimeSeriesChartsProps` interface (lines 222–228):

```typescript
interface TimeSeriesChartsProps {
  points: TimeSeriesPoint[]
  allPeriods?: PeriodMeta[]
  unit?: string
  queryVolumeEnabled?: boolean
  autoStopLabel?: string
  rangeTotals?: TimeSeriesRangeTotals | null
}
```

- [ ] **Step 3: Add `rangeTotals` to the function signature**

Update the function declaration (line 230):

```typescript
export function TimeSeriesCharts({ points, allPeriods, unit = 'DBUs', queryVolumeEnabled = true, autoStopLabel = 'Auto-stop', rangeTotals }: TimeSeriesChartsProps) {
```

- [ ] **Step 4: Add a simple K/M formatter helper and compute formatted totals**

After the `fmtKMResizing` line (line ~249), add a helper and compute totals for all charts:

```typescript
function fmtKMSingle(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(2)}K`
  return String(Math.round(v))
}

const totalsSavingsPct = rangeTotals
  ? [{ label: 'Avg', value: `${rangeTotals.savings_pct.toFixed(1)}%` }]
  : rangeTotals === null ? null : undefined

const totalsUsageSavings = rangeTotals
  ? [
      { label: 'Saved', value: fmtDbu.format(rangeTotals.savings_dbus) },
      { label: 'Spent', value: fmtDbu.format(rangeTotals.total_spend_dbus) },
    ]
  : rangeTotals === null ? null : undefined

const totalsWarehouses = rangeTotals
  ? [{ label: 'Total', value: fmtInt.format(rangeTotals.warehouses) }]
  : rangeTotals === null ? null : undefined

const totalsQueryVolume = rangeTotals
  ? [{ label: 'Total', value: fmtKMSingle(rangeTotals.query_volume) }]
  : rangeTotals === null ? null : undefined

const totalsAutoStop = rangeTotals
  ? [{ label: 'Total', value: fmtKMSingle(rangeTotals.auto_stop_events) }]
  : rangeTotals === null ? null : undefined

const totalsResizing = rangeTotals
  ? [{ label: 'Total', value: fmtKMSingle(rangeTotals.resizing_events) }]
  : rangeTotals === null ? null : undefined
```

Note: the ternary `rangeTotals ? [...] : rangeTotals === null ? null : undefined` means:
- If `rangeTotals` is a value → show formatted totals
- If `rangeTotals` is `null` → pass `null` to ChartWrapper (skeleton)
- If `rangeTotals` is `undefined` → pass `undefined` to ChartWrapper (no totals block)

- [ ] **Step 5: Pass totals to each ChartWrapper**

Update each `<ChartWrapper>` call in the JSX return to include the corresponding totals prop:

```tsx
<ChartWrapper title="Savings (%)" isLight={isLight} totals={totalsSavingsPct}>
```

```tsx
<ChartWrapper title={`Usage & Savings (${unit})`} isLight={isLight} totals={totalsUsageSavings}>
```

```tsx
<ChartWrapper title="Warehouses (#)" isLight={isLight} totals={totalsWarehouses}>
```

```tsx
<ChartWrapper title="Query Volumes" isLight={isLight} height={queryVolumeEnabled ? undefined : 290} totals={totalsQueryVolume}>
```

```tsx
<ChartWrapper title={`${autoStopLabel} Optimizations`} isLight={isLight} totals={totalsAutoStop}>
```

```tsx
<ChartWrapper title="Resizing Optimizations" isLight={isLight} totals={totalsResizing}>
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/charts/TimeSeriesCharts.tsx
git commit -m "feat: pass range totals to TimeSeriesCharts chart wrappers"
```

---

## Task 7: Wire range_totals in KWO Databricks page

**Files:**
- Modify: `src/app/kwo-databricks/page.tsx`

- [ ] **Step 1: Add `TimeSeriesRangeTotals` import**

In the import on line 9, add `TimeSeriesRangeTotals` to the `@/lib/types` import:

```typescript
import { ContractType, Granularity, KPIRow, SnapshotKPIWithDelta, TimeSeriesPoint, TimeSeriesRangeTotals } from '@/lib/types'
```

- [ ] **Step 2: Update local `TimeSeriesResponse` interface**

The local `TimeSeriesResponse` interface (lines 33–38) needs `range_totals`:

```typescript
interface TimeSeriesResponse {
  points: TimeSeriesPoint[]
  data_as_of: string
  available_customers: { org_id: string; name: string }[]
  all_periods: { period_start: string; period_label_display: string }[]
  range_totals: TimeSeriesRangeTotals
}
```

- [ ] **Step 3: Pass `rangeTotals` to `<TimeSeriesCharts>`**

Find the `<TimeSeriesCharts>` render (around line 343):

```tsx
<TimeSeriesCharts points={timeseries.points} allPeriods={timeseries.all_periods} />
```

Replace with:

```tsx
<TimeSeriesCharts
  points={timeseries.points}
  allPeriods={timeseries.all_periods}
  rangeTotals={timeseries.range_totals}
/>
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/kwo-databricks/page.tsx
git commit -m "feat: wire range_totals to KWO Databricks time series charts"
```

---

## Task 8: Wire range_totals in KWO Snowflake page

**Files:**
- Modify: `src/app/kwo-snowflake/page.tsx`

- [ ] **Step 1: Add `TimeSeriesRangeTotals` import**

Update the `@/lib/types` import to include `TimeSeriesRangeTotals`.

- [ ] **Step 2: Update local `TimeSeriesResponse` interface**

Same change as Task 7 Step 2 — add `range_totals: TimeSeriesRangeTotals` to the local `TimeSeriesResponse` interface.

- [ ] **Step 3: Find the `<TimeSeriesCharts>` render in the snowflake page**

Search the file for `<TimeSeriesCharts` and update it to pass `rangeTotals`:

```tsx
<TimeSeriesCharts
  points={timeseries.points}
  allPeriods={timeseries.all_periods}
  unit="Credits"
  queryVolumeEnabled={queryVolumeEnabled}
  autoStopLabel="Auto-suspend"
  rangeTotals={timeseries.range_totals}
/>
```

(Keep any existing props like `unit`, `queryVolumeEnabled`, `autoStopLabel` that are already there — only add `rangeTotals`.)

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/kwo-snowflake/page.tsx
git commit -m "feat: wire range_totals to KWO Snowflake time series charts"
```

---

## Task 9: Migrate ModulePagesCard to ChartWrapper and add total

**Files:**
- Modify: `src/app/feature-analytics/page.tsx` (lines 281–364)

`ModulePagesCard` currently uses a custom `<div className="rounded-lg border border-border bg-card p-4 ...">` card. Replace it with `ChartWrapper` for visual consistency, keep bars horizontal, and add a "Total" showing the sum of all bar values.

- [ ] **Step 1: Update `ModulePagesCard` props to include `isLight`**

The function signature (line 281) currently doesn't receive `isLight`. Update it to pass `isLight` from `useTheme`:

```typescript
function ModulePagesCard({
  label,
  prefix,
  data,
  loading,
  error,
}: {
  label: string
  prefix: string
  data: PageRow[] | null
  loading: boolean
  error: string | null
}) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
```

(This is already in the component — just confirm `isLight` is computed at the top.)

- [ ] **Step 2: Compute total and totals prop**

Add after `const isLight = theme === 'light'`:

```typescript
const total = (data ?? []).reduce((s, r) => s + r.count, 0)
const chartTotals: { label: string; value: string }[] | null = loading
  ? null
  : [{ label: 'Total', value: total.toLocaleString() }]
```

- [ ] **Step 3: Replace the custom card wrapper with ChartWrapper**

The outer div (line 308) `<div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">` and the header inside it need to be replaced. Replace the entire return statement with:

```tsx
return (
  <ChartWrapper title={`${label} (${prefix})`} isLight={isLight} totals={chartTotals}>
    {loading ? (
      <CardLoader />
    ) : error ? (
      <p className="text-sm text-destructive">{error}</p>
    ) : stripped.length === 0 ? (
      <p className="text-sm text-muted-foreground py-6 text-center">No data in selected period</p>
    ) : (
      <div style={{ height: containerHeight, overflowY: scrollable ? 'auto' : 'visible' }}>
        <BarChart
          width={undefined as unknown as number}
          height={chartHeight}
          data={stripped}
          layout="vertical"
          margin={{ top: 4, right: 48, bottom: 4, left: MODULE_BAR_Y_AXIS_WIDTH }}
          style={{ width: '100%' }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
          <XAxis
            type="number"
            tickFormatter={(v) => v.toLocaleString()}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
            domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.2)]}
          />
          <YAxis
            type="category"
            dataKey="page_name"
            width={MODULE_BAR_Y_AXIS_WIDTH}
            tick={ModuleYAxisTick as unknown as React.ReactElement}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <Tooltip content={<ModuleChartTooltip />} cursor={{ fill: cursorFill }} />
          <Bar dataKey="count" radius={[0, 3, 3, 0]} maxBarSize={18}>
            {stripped.map((_, i) => (
              <Cell key={i} fill="#2a6985" />
            ))}
            <LabelList
              dataKey="count"
              position="right"
              formatter={(v: unknown) => Number(v).toLocaleString()}
              style={{ fontSize: 10, fill: '#4a6373' }}
            />
          </Bar>
        </BarChart>
      </div>
    )}
  </ChartWrapper>
)
```

Note: The title now combines label and prefix (e.g. "KWO for Snowflake (KWO-SF)") so the prefix chip from the old design is preserved in the title.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/feature-analytics/page.tsx
git commit -m "feat: migrate ModulePagesCard to ChartWrapper with range total"
```

---

## Task 10: Add totals to PageDauCard and ActionTrendCard

**Files:**
- Modify: `src/app/feature-analytics/page.tsx` (lines 394–525)

Both components already use `ChartWrapper`. Totals are computed client-side from the padded data arrays that are already in scope.

**PageDauCard**: Avg DAU = arithmetic mean of all days in the padded range (including zeros). Formula: `sum(dau) / padded.length`. Use "Avg" label.

**ActionTrendCard**: Total = `sum(count)` across all padded days. Use "Total" label.

- [ ] **Step 1: Add avg DAU total to `PageDauCard`**

In `PageDauCard` (line 394), after `const padded = padDateRange(...)`, add:

```typescript
const avgDau = padded.length > 0
  ? padded.reduce((s, d) => s + d.dau, 0) / padded.length
  : 0
const dauTotals: { label: string; value: string }[] = [
  { label: 'Avg', value: fmtInt.format(Math.round(avgDau)) },
]
```

Then update the `<ChartWrapper>` call:

```tsx
<ChartWrapper title={title} isLight={isLight} totals={dauTotals}>
```

- [ ] **Step 2: Add total actions to `ActionTrendCard`**

In `ActionTrendCard` (line 461), after `const padded = padActionRange(...)`, add:

```typescript
const totalActions = padded.reduce((s, d) => s + d.count, 0)
const actionTotals: { label: string; value: string }[] = [
  { label: 'Total', value: fmtInt.format(totalActions) },
]
```

Then update the `<ChartWrapper>` call:

```tsx
<ChartWrapper title={series.label} isLight={isLight} totals={actionTotals}>
```

- [ ] **Step 3: Type-check and lint**

```bash
npx tsc --noEmit && npm run lint
```

Expected: no errors.

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/feature-analytics/page.tsx
git commit -m "feat: add avg DAU and total action counts to Feature Analytics charts"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|---|---|
| Total in top-right corner of chart card | Task 5 (ChartWrapper), Task 6 (TimeSeriesCharts) |
| Full selected date range calculation | Tasks 2–4 (computeRangeTotalsFromPoints + API routes) |
| Same formula as individual data points | Task 2 (savings_pct re-aggregated, not averaged) |
| Savings (%) — re-aggregate, not average | Task 2 test + Task 3/4 |
| Warehouses — COUNT DISTINCT from raw rows | Tasks 3 and 4 |
| KWO Databricks charts | Tasks 3, 7 |
| KWO Snowflake charts | Tasks 4, 8 |
| Usage & Savings stacked bar — two numbers (Saved + Spent) | Task 6, Step 4 |
| Savings (%) — label "Avg" | Task 6, Step 4 |
| DAU charts — avg, label "Avg" | Task 10 |
| Action trends — sum, label "Total" | Task 10 |
| Most-used features — sum total + ChartWrapper migration | Task 9 |
| Number formatting consistent with chart axes | Tasks 6, 9, 10 (using same fmtDbu, fmtInt, fmtKMSingle) |
| Loading: skeleton | ChartWrapper accepts `null` → animate-pulse shimmer |
| No data: "—" | Not explicitly needed — chart body handles empty state; totals show 0 |
| Platform Usage excluded | Confirmed in grilling — no charts there |

**Placeholder scan:** No TBDs, TODOs, or "similar to" references found.

**Type consistency check:** `TimeSeriesRangeTotals` defined in Task 2, imported in Tasks 3, 4, 6, 7, 8. `computeRangeTotalsFromPoints` defined in Task 2, imported in Tasks 3, 4. `ChartWrapper.totals` prop defined in Task 5, used in Tasks 6, 9, 10. All consistent.
