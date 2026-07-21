# Snowflake Warehouse Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single-customer, single-warehouse Snowflake query-performance drill-down page (`/kwo-snowflake-warehouse-analysis`) under the "Warehouse Optimization" nav group, backed by Snowflake's `QUERY_HISTORY` export data in BigQuery.

**Architecture:** A new BigQuery-backed SQL file with named CTEs computes six metric groups (query volume by type, execution-time percentiles, queue-time percentiles, spillage, failed queries by error code) bucketed into caller-supplied periods; a new API route computes those periods with the existing `buildPeriods`/`snapToGranularityBoundaries` helpers (extended with an `'hour'` granularity), applies the 14-day Hour fallback rule server-side, and returns one row per period. Two supporting routes list the Customer and Warehouse dropdown options. A new client page composes a new filters component and a new charts component (reusing `ChartWrapper` from the existing `TimeSeriesCharts.tsx`) plus the existing generic `DataTable`.

**Tech Stack:** Next.js (client components, API routes), `@google-cloud/bigquery`, `recharts@^3.8.1`, `date-fns`, `vitest` + `@testing-library/react` (jsdom).

## Global Constraints

- All colors must come from the Keebo palette mapped to CSS variables in `src/app/globals.css` — never introduce colors not in this palette, never hardcode hex values in component files (`docs/design-system.md`). Reuse the existing chart color constants `C_GREEN`, `C_NAVY`, `C_TEAL`, `C_SLATE` from `src/components/charts/TimeSeriesCharts.tsx` — do not invent new hex values.
- Test runner is `vitest` (not jest) — `describe`/`it`/`expect` from `'vitest'`, `vi.mock()` for module mocks, dynamic `await import(...)` after `vi.mock()` calls when the module under test needs a mocked dependency pre-registered. Tests live in colocated `__tests__/` directories next to the source they test.
- No credentials committed to the repo; BigQuery access goes through the existing `runQuery`/`AdcAuthError` pattern in `src/lib/bigquery.ts` — never bypass it.
- Table names cannot be BigQuery query parameters. The customer's dataset name (`k3o_prd_<org_id>_000_tf`) must be validated with `/^[0-9]+$/` on `org_id` before being string-interpolated into the SQL template — never interpolate an unvalidated value into SQL.
- Existing shared components/patterns must be reused, not duplicated: `SingleSelect` (`src/components/filters/SingleSelect.tsx`), `DateRangePicker` (`src/components/filters/DateRangePicker.tsx`), `DataTable` (`src/components/tables/DataTable.tsx`), `ChartWrapper` (`src/components/charts/TimeSeriesCharts.tsx`), `AdcAuthError`/`isAdcAuthError` banner pattern, `getSnfQueryHistoryDatasets` (`src/lib/bigquery.ts`).
- `npx tsc --noEmit` and `npm run lint` must stay clean throughout.

---

## File Structure

- **Modify** `src/lib/types.ts` — add `'hour'` to `Granularity`; add `WarehouseOption`, `WarehouseAnalysisPoint`, `WarehouseAnalysisResponse` interfaces.
- **Modify** `src/lib/dates.ts` — add an `'hour'` case to `formatPeriodLabel`, `formatCompactPeriodLabel`, `buildPeriods`, `snapToGranularityBoundaries`.
- **Modify** `src/lib/bigquery.ts` — add `getWarehousesForOrg(orgId: string): Promise<WarehouseOption[]>`.
- **Create** `sql/kwo_snowflake_warehouse_analysis_timeseries.sql` — CTE-organized query, one row per period.
- **Create** `src/app/api/kwo-snowflake-warehouse-analysis/customers/route.ts` — `GET` returning customers with a `query_history_view_tf` dataset.
- **Create** `src/app/api/kwo-snowflake-warehouse-analysis/warehouses/route.ts` — `GET ?org_id=` returning that org's warehouse list.
- **Create** `src/app/api/kwo-snowflake-warehouse-analysis/timeseries/route.ts` — `GET ?org_id=&warehouse_name=&start_date=&end_date=&granularity=` returning `{ granularity_used, points }`.
- **Create** `src/components/filters/WarehouseAnalysisFilters.tsx` — Customer (single-select) → Date Range → Group By (single-select, includes Hour) → Warehouse (single-select, dependent on Customer).
- **Create** `src/components/charts/WarehouseAnalysisCharts.tsx` — 6 charts: Total Queries (dynamic stacked bar), Execution Time (3-series area), Queued Queries (simple bar), Queue Time (3-series area), Spillage (2-series stacked bar), Failed Queries (dynamic stacked bar).
- **Create** `src/app/kwo-snowflake-warehouse-analysis/page.tsx` — page composing filters, charts, `DataTable`, and all empty/error states.
- **Modify** `src/components/layout/Sidebar.tsx` — add nav entry.

---

## Task 1: `Granularity` type + `dates.ts` Hour support

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/dates.ts`
- Test: `src/lib/__tests__/dates-hour.test.ts` (new file)

**Interfaces:**
- Consumes: nothing new
- Produces: `Granularity` now includes `'hour'`; `buildPeriods`, `formatPeriodLabel`, `formatCompactPeriodLabel`, `snapToGranularityBoundaries` all accept `'hour'`. For `'hour'`, `Period.start`/`Period.end` are full datetime strings formatted as `yyyy-MM-dd'T'HH:mm:ss` (every other granularity keeps bare `yyyy-MM-dd` strings).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/dates-hour.test.ts
import { describe, it, expect } from 'vitest'
import { buildPeriods, formatPeriodLabel, formatCompactPeriodLabel, snapToGranularityBoundaries } from '../dates'
import { parseISO } from 'date-fns'

describe('hour granularity', () => {
  it('buildPeriods produces one period per hour across the day range', () => {
    const periods = buildPeriods('2026-07-01', '2026-07-02', 'hour')
    expect(periods).toHaveLength(48)
    expect(periods[0].start).toBe('2026-07-01T00:00:00')
    expect(periods[0].end).toBe('2026-07-01T00:59:59')
    expect(periods[47].start).toBe('2026-07-02T23:00:00')
    expect(periods[47].end).toBe('2026-07-02T23:59:59')
  })

  it('formatPeriodLabel renders an ISO-like hour label', () => {
    const start = parseISO('2026-07-01T14:00:00')
    expect(formatPeriodLabel(start, start, 'hour')).toBe('2026-07-01T14:00')
  })

  it('formatCompactPeriodLabel renders a short hour label', () => {
    const start = parseISO('2026-07-01T14:00:00')
    expect(formatCompactPeriodLabel(start, start, 'hour')).toBe('Jul 1, 14:00')
  })

  it('snapToGranularityBoundaries is a no-op for hour (date picker stays day-granular)', () => {
    expect(snapToGranularityBoundaries('2026-07-01', '2026-07-02', 'hour')).toEqual({
      start: '2026-07-01',
      end: '2026-07-02',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/dates-hour.test.ts`
Expected: FAIL — `buildPeriods`/etc. don't return a value for the `'hour'` case yet (TypeScript non-exhaustive switch returns `undefined`, or the test throws on the missing branch).

- [ ] **Step 3: Implement**

In `src/lib/types.ts`, change:

```ts
export type Granularity = 'day' | 'week' | 'month' | 'rolling7'
```

to:

```ts
export type Granularity = 'day' | 'week' | 'month' | 'rolling7' | 'hour'
```

In `src/lib/dates.ts`, add `addHours` to the `date-fns` import:

```ts
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subWeeks,
  addDays,
  addHours,
  parseISO,
  isBefore,
  isAfter,
  isSameMonth,
} from 'date-fns'
```

Add the `'hour'` case to `formatPeriodLabel`:

```ts
export function formatPeriodLabel(start: Date, end: Date, granularity: Granularity): string {
  switch (granularity) {
    case 'day':
      return format(start, 'yyyy-MM-dd')
    case 'week':
    case 'rolling7':
      return `${format(start, 'yyyy-MM-dd')} – ${format(end, 'yyyy-MM-dd')}`
    case 'month':
      return format(start, 'yyyy-MM')
    case 'hour':
      return format(start, "yyyy-MM-dd'T'HH:00")
  }
}
```

Add the `'hour'` case to `formatCompactPeriodLabel`:

```ts
export function formatCompactPeriodLabel(start: Date, end: Date, granularity: Granularity): string {
  switch (granularity) {
    case 'day':
      return format(start, 'MMM d')
    case 'week':
    case 'rolling7':
      return isSameMonth(start, end)
        ? `${format(start, 'MMM d')} – ${format(end, 'd')}`
        : `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`
    case 'month':
      return format(start, 'MMM yyyy')
    case 'hour':
      return format(start, 'MMM d, HH:00')
  }
}
```

Add an `'hour'` case to `buildPeriods`. Since hour periods need datetime-precision `start`/`end` strings (unlike every other granularity's bare date strings), branch it out before the existing day-string logic:

```ts
export function buildPeriods(startDate: string, endDate: string, granularity: Granularity): Period[] {
  if (granularity === 'hour') {
    const periods: Period[] = []
    let cursor = parseISO(`${startDate}T00:00:00`)
    const rangeEnd = parseISO(`${endDate}T23:00:00`)
    while (!isAfter(cursor, rangeEnd)) {
      periods.push({
        label: formatPeriodLabel(cursor, cursor, 'hour'),
        displayLabel: formatCompactPeriodLabel(cursor, cursor, 'hour'),
        start: format(cursor, "yyyy-MM-dd'T'HH:00:00"),
        end: format(cursor, "yyyy-MM-dd'T'HH:59:59"),
      })
      cursor = addHours(cursor, 1)
    }
    return periods
  }

  const periods: Period[] = []
  let cursor = parseISO(startDate)
  const rangeEnd = parseISO(endDate)

  while (!isAfter(cursor, rangeEnd)) {
    let periodEnd: Date

    switch (granularity) {
      case 'day':
        periodEnd = cursor
        break
      case 'week':
        periodEnd = endOfWeek(cursor, { weekStartsOn: 0 })
        break
      case 'rolling7':
        periodEnd = addDays(cursor, 6)
        break
      case 'month':
        periodEnd = endOfMonth(cursor)
        break
    }

    const shouldClamp = granularity === 'day' || granularity === 'rolling7'
    const clampedEnd = shouldClamp && isAfter(periodEnd, rangeEnd) ? rangeEnd : periodEnd

    periods.push({
      label: formatPeriodLabel(cursor, clampedEnd, granularity),
      displayLabel: formatCompactPeriodLabel(cursor, clampedEnd, granularity),
      start: toDateString(cursor),
      end: toDateString(clampedEnd),
    })

    cursor = addDays(isAfter(periodEnd, rangeEnd) ? periodEnd : clampedEnd, 1)
  }

  return periods
}
```

Add the `'hour'` case to `snapToGranularityBoundaries` (no snapping — the date picker stays day-granular):

```ts
export function snapToGranularityBoundaries(
  startDate: string,
  endDate: string,
  granularity: Granularity
): { start: string; end: string } {
  const start = parseISO(startDate)
  const end = parseISO(endDate)

  switch (granularity) {
    case 'day':
    case 'rolling7':
    case 'hour':
      return { start: startDate, end: endDate }
    case 'week': {
      const snappedStart = startOfWeek(start, { weekStartsOn: 0 })
      const snappedEnd = endOfWeek(end, { weekStartsOn: 0 })
      return { start: toDateString(snappedStart), end: toDateString(snappedEnd) }
    }
    case 'month': {
      const snappedStart = startOfMonth(start)
      const snappedEnd = endOfMonth(end)
      return { start: toDateString(snappedStart), end: toDateString(snappedEnd) }
    }
  }
}
```

Now add the new interfaces to `src/lib/types.ts` (append at the end of the file):

```ts
export interface WarehouseOption {
  warehouse_id: string
  warehouse_name: string
}

export interface WarehouseAnalysisPoint {
  period_label: string
  period_label_display: string
  period_start: string
  period_end: string
  query_volume_by_type: Record<string, number>
  execution_time_avg_ms: number
  execution_time_p95_ms: number
  execution_time_p99_ms: number
  queued_query_count: number
  queue_time_avg_ms: number
  queue_time_p95_ms: number
  queue_time_p99_ms: number
  bytes_spilled_local: number
  bytes_spilled_remote: number
  failed_query_count_by_error: Record<string, number>
}

export interface WarehouseAnalysisResponse {
  granularity_used: Granularity
  points: WarehouseAnalysisPoint[]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/dates-hour.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run full type check**

Run: `npx tsc --noEmit`
Expected: no errors (confirms no other switch over `Granularity` in the codebase broke — if one does, add an `'hour'` case there too before continuing)

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/dates.ts src/lib/__tests__/dates-hour.test.ts
git commit -m "feat: add hour granularity to Granularity type and dates helpers"
```

---

## Task 2: `getWarehousesForOrg` in `bigquery.ts`

**Files:**
- Modify: `src/lib/bigquery.ts`
- Test: `src/lib/__tests__/warehouses.test.ts` (new file)

**Interfaces:**
- Consumes: `runQuery`, `PROJECT`, `SNF_DATASET` (already in `bigquery.ts`), `WarehouseOption` (from Task 1)
- Produces: `getWarehousesForOrg(orgId: string): Promise<WarehouseOption[]>` — later used by the `warehouses` API route (Task 4).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/warehouses.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const runQueryMock = vi.fn()

vi.mock('@google-cloud/bigquery', () => ({
  BigQuery: vi.fn().mockImplementation(() => ({ query: vi.fn() })),
}))

describe('getWarehousesForOrg', () => {
  beforeEach(() => {
    vi.resetModules()
    runQueryMock.mockReset()
  })

  it('returns distinct warehouse_id/warehouse_name rows for the given org', async () => {
    const bigquery = await import('../bigquery')
    vi.spyOn(bigquery, 'runQuery').mockResolvedValue([
      { warehouse_id: 'wh1', warehouse_name: 'ANALYTICS_WH' },
      { warehouse_id: 'wh2', warehouse_name: 'ETL_WH' },
    ])

    const result = await bigquery.getWarehousesForOrg('90402')

    expect(result).toEqual([
      { warehouse_id: 'wh1', warehouse_name: 'ANALYTICS_WH' },
      { warehouse_id: 'wh2', warehouse_name: 'ETL_WH' },
    ])
    expect(bigquery.runQuery).toHaveBeenCalledWith(expect.stringContaining('database_warehouses'), {
      org_id: '90402',
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/warehouses.test.ts`
Expected: FAIL with `bigquery.getWarehousesForOrg is not a function`

- [ ] **Step 3: Implement**

Append to `src/lib/bigquery.ts` (after `getSnfQueryHistoryDatasets`):

```ts
export async function getWarehousesForOrg(orgId: string): Promise<{ warehouse_id: string; warehouse_name: string }[]> {
  const query = `
    SELECT DISTINCT warehouse_id, warehouse_name
    FROM \`${PROJECT}.${SNF_DATASET}.database_warehouses\`
    WHERE org_id = @org_id
    ORDER BY warehouse_name
  `
  return runQuery<{ warehouse_id: string; warehouse_name: string }>(query, { org_id: orgId })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/warehouses.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/bigquery.ts src/lib/__tests__/warehouses.test.ts
git commit -m "feat: add getWarehousesForOrg to bigquery lib"
```

---

## Task 3: SQL file — `kwo_snowflake_warehouse_analysis_timeseries.sql`

**Files:**
- Create: `sql/kwo_snowflake_warehouse_analysis_timeseries.sql`

**Interfaces:**
- Consumes: nothing (raw SQL file)
- Produces: a query template consumed by Task 4's route. Placeholder table `` `keebo-portal.k3o_prd_ORGID_000_tf.query_history_view_tf` `` — the literal string `ORGID` is replaced by the route with the validated numeric `org_id` before execution (dataset name embeds `org_id` and cannot be a query parameter). Named params: `@warehouse_name` (STRING), `@start_date`/`@end_date` (STRING, `yyyy-MM-dd HH:mm:ss`), `@period_starts`/`@period_ends` (ARRAY<STRING>, parallel arrays of period boundaries, `yyyy-MM-dd'T'HH:mm:ss` for hour or `yyyy-MM-dd` for other granularities). Returns one row per period with columns: `period_start`, `by_type` (REPEATED STRUCT<query_type STRING, query_count INT64>), `execution_time_avg_ms`, `execution_time_p95_ms`, `execution_time_p99_ms`, `queued_query_count`, `queue_time_avg_ms`, `queue_time_p95_ms`, `queue_time_p99_ms`, `bytes_spilled_local`, `bytes_spilled_remote`, `by_error` (REPEATED STRUCT<error_code STRING, error_count INT64>).

No automated test for this task — it's validated end-to-end by Task 4's route test (which mocks `runQuery`, so the SQL text itself isn't executed against BigQuery in CI) and should be manually verified against a real BigQuery project during rollout (see Task 4, Step 6).

- [ ] **Step 1: Write the file**

```sql
-- kwo_snowflake_warehouse_analysis_timeseries.sql
--
-- Parameters:
--   @warehouse_name STRING
--   @start_date STRING  (yyyy-MM-dd HH:mm:ss, inclusive lower bound, UTC)
--   @end_date STRING    (yyyy-MM-dd HH:mm:ss, inclusive upper bound, UTC)
--   @period_starts ARRAY<STRING>  (period boundary starts, same order/length as @period_ends)
--   @period_ends ARRAY<STRING>    (period boundary ends)
--
-- Table placeholder `k3o_prd_ORGID_000_tf` is rewritten by the API route to the
-- caller's validated org_id before the query runs (dataset name embeds org_id,
-- so it cannot be passed as a query parameter).
--
-- Returns: one row per period_start, left-joined across all metric CTEs so
-- periods with no matching queries still appear with zero/empty aggregates.

WITH periods AS (
  SELECT
    period_start,
    period_end
  FROM UNNEST(@period_starts) AS period_start WITH OFFSET idx1
  JOIN UNNEST(@period_ends) AS period_end WITH OFFSET idx2
    ON idx1 = idx2
),
base AS (
  SELECT
    q.query_type,
    q.execution_time,
    (IFNULL(q.queued_provisioning_time, 0) + IFNULL(q.queued_repair_time, 0) + IFNULL(q.queued_overload_time, 0)) AS queue_time,
    q.bytes_spilled_to_local_storage,
    q.bytes_spilled_to_remote_storage,
    q.execution_status,
    q.error_code,
    p.period_start
  FROM `keebo-portal.k3o_prd_ORGID_000_tf.query_history_view_tf` q
  JOIN periods p
    ON CAST(q.start_time AS STRING) >= p.period_start
   AND CAST(q.start_time AS STRING) <= p.period_end
  WHERE q.warehouse_name = @warehouse_name
    AND CAST(q.start_time AS STRING) >= @start_date
    AND CAST(q.start_time AS STRING) <= @end_date
),
query_volume AS (
  SELECT period_start, query_type, COUNT(*) AS query_count
  FROM base
  GROUP BY period_start, query_type
),
query_volume_agg AS (
  SELECT period_start, ARRAY_AGG(STRUCT(query_type, query_count)) AS by_type
  FROM query_volume
  GROUP BY period_start
),
latency AS (
  SELECT
    period_start,
    AVG(execution_time) AS execution_time_avg_ms,
    APPROX_QUANTILES(execution_time, 100)[OFFSET(95)] AS execution_time_p95_ms,
    APPROX_QUANTILES(execution_time, 100)[OFFSET(99)] AS execution_time_p99_ms
  FROM base
  GROUP BY period_start
),
queue AS (
  SELECT
    period_start,
    COUNTIF(queue_time > 0) AS queued_query_count,
    AVG(queue_time) AS queue_time_avg_ms,
    APPROX_QUANTILES(queue_time, 100)[OFFSET(95)] AS queue_time_p95_ms,
    APPROX_QUANTILES(queue_time, 100)[OFFSET(99)] AS queue_time_p99_ms
  FROM base
  GROUP BY period_start
),
spillage AS (
  SELECT
    period_start,
    SUM(IFNULL(bytes_spilled_to_local_storage, 0)) AS bytes_spilled_local,
    SUM(IFNULL(bytes_spilled_to_remote_storage, 0)) AS bytes_spilled_remote
  FROM base
  GROUP BY period_start
),
errors_raw AS (
  SELECT period_start, error_code, COUNT(*) AS error_count
  FROM base
  WHERE execution_status = 'fail'
  GROUP BY period_start, error_code
),
errors_ranked AS (
  SELECT
    period_start,
    error_code,
    error_count,
    ROW_NUMBER() OVER (PARTITION BY period_start ORDER BY error_count DESC) AS rn
  FROM errors_raw
),
errors_bucketed AS (
  SELECT
    period_start,
    CASE WHEN rn <= 10 THEN error_code ELSE 'Other' END AS error_code,
    error_count
  FROM errors_ranked
),
errors_agg_raw AS (
  SELECT period_start, error_code, SUM(error_count) AS error_count
  FROM errors_bucketed
  GROUP BY period_start, error_code
),
errors_agg AS (
  SELECT period_start, ARRAY_AGG(STRUCT(error_code, error_count)) AS by_error
  FROM errors_agg_raw
  GROUP BY period_start
)
SELECT
  p.period_start,
  qv.by_type,
  l.execution_time_avg_ms,
  l.execution_time_p95_ms,
  l.execution_time_p99_ms,
  q.queued_query_count,
  q.queue_time_avg_ms,
  q.queue_time_p95_ms,
  q.queue_time_p99_ms,
  s.bytes_spilled_local,
  s.bytes_spilled_remote,
  e.by_error
FROM periods p
LEFT JOIN query_volume_agg qv ON qv.period_start = p.period_start
LEFT JOIN latency l ON l.period_start = p.period_start
LEFT JOIN queue q ON q.period_start = p.period_start
LEFT JOIN spillage s ON s.period_start = p.period_start
LEFT JOIN errors_agg e ON e.period_start = p.period_start
ORDER BY p.period_start
```

- [ ] **Step 2: Commit**

```bash
git add sql/kwo_snowflake_warehouse_analysis_timeseries.sql
git commit -m "feat: add warehouse analysis timeseries SQL"
```

---

## Task 4: `timeseries` API route

**Files:**
- Create: `src/app/api/kwo-snowflake-warehouse-analysis/timeseries/route.ts`
- Test: `src/app/api/kwo-snowflake-warehouse-analysis/timeseries/__tests__/route.test.ts` (new file)

**Interfaces:**
- Consumes: `runQuery`, `PROJECT`, `AdcAuthError` (`@/lib/bigquery`), `buildPeriods`, `snapToGranularityBoundaries`, `formatPeriodLabel`, `formatCompactPeriodLabel` (`@/lib/dates`), `Granularity`, `WarehouseAnalysisPoint`, `WarehouseAnalysisResponse` (`@/lib/types`), `sql/kwo_snowflake_warehouse_analysis_timeseries.sql` (Task 3)
- Produces: `GET` handler at `/api/kwo-snowflake-warehouse-analysis/timeseries` returning `WarehouseAnalysisResponse` JSON — consumed by the page (Task 8).

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/kwo-snowflake-warehouse-analysis/timeseries/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/bigquery', async () => {
  const actual = await vi.importActual<typeof import('@/lib/bigquery')>('@/lib/bigquery')
  return {
    ...actual,
    runQuery: vi.fn(),
  }
})

function makeRequest(params: Record<string, string>) {
  const url = new URL('http://localhost/api/kwo-snowflake-warehouse-analysis/timeseries')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

describe('GET /api/kwo-snowflake-warehouse-analysis/timeseries', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns 400 when required params are missing', async () => {
    const { GET } = await import('../route')
    const res = await GET(makeRequest({ org_id: '90402' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for a non-numeric org_id', async () => {
    const { GET } = await import('../route')
    const res = await GET(
      makeRequest({
        org_id: '90402; DROP TABLE x',
        warehouse_name: 'ANALYTICS_WH',
        start_date: '2026-07-01',
        end_date: '2026-07-07',
        granularity: 'day',
      })
    )
    expect(res.status).toBe(400)
  })

  it('falls back to day granularity when hour range exceeds 14 days', async () => {
    const bigquery = await import('@/lib/bigquery')
    vi.mocked(bigquery.runQuery).mockResolvedValue([])
    const { GET } = await import('../route')
    const res = await GET(
      makeRequest({
        org_id: '90402',
        warehouse_name: 'ANALYTICS_WH',
        start_date: '2026-06-01',
        end_date: '2026-07-01',
        granularity: 'hour',
      })
    )
    const body = await res.json()
    expect(body.granularity_used).toBe('day')
  })

  it('returns points with zero-filled aggregates for periods with no matching rows', async () => {
    const bigquery = await import('@/lib/bigquery')
    vi.mocked(bigquery.runQuery).mockResolvedValue([])
    const { GET } = await import('../route')
    const res = await GET(
      makeRequest({
        org_id: '90402',
        warehouse_name: 'ANALYTICS_WH',
        start_date: '2026-07-01',
        end_date: '2026-07-02',
        granularity: 'day',
      })
    )
    const body = await res.json()
    expect(body.granularity_used).toBe('day')
    expect(body.points).toHaveLength(2)
    expect(body.points[0].execution_time_avg_ms).toBe(0)
    expect(body.points[0].query_volume_by_type).toEqual({})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/kwo-snowflake-warehouse-analysis/timeseries/__tests__/route.test.ts`
Expected: FAIL — `Cannot find module '../route'`

- [ ] **Step 3: Implement**

```ts
// src/app/api/kwo-snowflake-warehouse-analysis/timeseries/route.ts
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { parseISO } from 'date-fns'
import { runQuery, PROJECT, AdcAuthError } from '@/lib/bigquery'
import { buildPeriods, snapToGranularityBoundaries, formatPeriodLabel, formatCompactPeriodLabel } from '@/lib/dates'
import type { Granularity, WarehouseAnalysisPoint, WarehouseAnalysisResponse } from '@/lib/types'

const ORG_ID_PATTERN = /^[0-9]+$/
const MAX_HOUR_RANGE_DAYS = 14

interface WarehouseAnalysisRow {
  period_start: string
  by_type: { query_type: string; query_count: number }[] | null
  execution_time_avg_ms: number | null
  execution_time_p95_ms: number | null
  execution_time_p99_ms: number | null
  queued_query_count: number | null
  queue_time_avg_ms: number | null
  queue_time_p95_ms: number | null
  queue_time_p99_ms: number | null
  bytes_spilled_local: number | null
  bytes_spilled_remote: number | null
  by_error: { error_code: string; error_count: number }[] | null
}

function daysBetween(start: string, end: string): number {
  const startMs = new Date(`${start}T00:00:00Z`).getTime()
  const endMs = new Date(`${end}T00:00:00Z`).getTime()
  return Math.round((endMs - startMs) / (1000 * 60 * 60 * 24))
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const orgId = searchParams.get('org_id')
  const warehouseName = searchParams.get('warehouse_name')
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')
  const granularityParam = (searchParams.get('granularity') || 'day') as Granularity

  if (!orgId || !warehouseName || !startDate || !endDate) {
    return NextResponse.json(
      { error: 'org_id, warehouse_name, start_date, and end_date are required' },
      { status: 400 }
    )
  }
  if (!ORG_ID_PATTERN.test(orgId)) {
    return NextResponse.json({ error: 'invalid org_id' }, { status: 400 })
  }

  let granularityUsed: Granularity = granularityParam
  if (granularityParam === 'hour' && daysBetween(startDate, endDate) > MAX_HOUR_RANGE_DAYS) {
    granularityUsed = 'day'
  }

  const { start, end } = snapToGranularityBoundaries(startDate, endDate, granularityUsed)
  const periods = buildPeriods(start, end, granularityUsed)

  if (periods.length === 0) {
    const response: WarehouseAnalysisResponse = { granularity_used: granularityUsed, points: [] }
    return NextResponse.json(response)
  }

  try {
    const sqlTemplate = fs.readFileSync(
      path.join(process.cwd(), 'sql', 'kwo_snowflake_warehouse_analysis_timeseries.sql'),
      'utf-8'
    )
    const sql = sqlTemplate.replace(/k3o_prd_ORGID_000_tf/g, `k3o_prd_${orgId}_000_tf`)

    const queryStartDate = granularityUsed === 'hour' ? periods[0].start : `${periods[0].start} 00:00:00`
    const queryEndDate =
      granularityUsed === 'hour' ? periods[periods.length - 1].end : `${periods[periods.length - 1].end} 23:59:59`

    const rows = await runQuery<WarehouseAnalysisRow>(sql, {
      warehouse_name: warehouseName,
      start_date: queryStartDate,
      end_date: queryEndDate,
      period_starts: periods.map((p) => p.start),
      period_ends: periods.map((p) => p.end),
    })

    const rowsByPeriod = new Map(rows.map((r) => [r.period_start, r]))

    const points: WarehouseAnalysisPoint[] = periods.map((period) => {
      const row = rowsByPeriod.get(period.start)

      const queryVolumeByType: Record<string, number> = {}
      for (const entry of row?.by_type ?? []) {
        queryVolumeByType[entry.query_type] = entry.query_count
      }
      const failedQueryCountByError: Record<string, number> = {}
      for (const entry of row?.by_error ?? []) {
        failedQueryCountByError[entry.error_code] = entry.error_count
      }

      const startForLabel = parseISO(period.start)
      const endForLabel = parseISO(period.end)

      return {
        period_label: formatPeriodLabel(startForLabel, endForLabel, granularityUsed),
        period_label_display: formatCompactPeriodLabel(startForLabel, endForLabel, granularityUsed),
        period_start: period.start,
        period_end: period.end,
        query_volume_by_type: queryVolumeByType,
        execution_time_avg_ms: row?.execution_time_avg_ms ?? 0,
        execution_time_p95_ms: row?.execution_time_p95_ms ?? 0,
        execution_time_p99_ms: row?.execution_time_p99_ms ?? 0,
        queued_query_count: row?.queued_query_count ?? 0,
        queue_time_avg_ms: row?.queue_time_avg_ms ?? 0,
        queue_time_p95_ms: row?.queue_time_p95_ms ?? 0,
        queue_time_p99_ms: row?.queue_time_p99_ms ?? 0,
        bytes_spilled_local: row?.bytes_spilled_local ?? 0,
        bytes_spilled_remote: row?.bytes_spilled_remote ?? 0,
        failed_query_count_by_error: failedQueryCountByError,
      }
    })

    const response: WarehouseAnalysisResponse = { granularity_used: granularityUsed, points }
    return NextResponse.json(response)
  } catch (err) {
    console.error('[snf-warehouse-analysis-timeseries]', err)
    if (err instanceof AdcAuthError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 401 })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

Note: `PROJECT` is imported but unused directly in this file's logic — remove it from the import if `tsc`/`lint` flags it unused (it isn't needed since the table's project prefix is already baked into the SQL template literal).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/kwo-snowflake-warehouse-analysis/timeseries/__tests__/route.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: no errors — if `PROJECT` is reported unused, remove it from the import line.

- [ ] **Step 6: Manual verification against real BigQuery (not part of CI)**

After `gcloud auth application-default login`, hit `http://localhost:4000/api/kwo-snowflake-warehouse-analysis/timeseries?org_id=<real_org_id>&warehouse_name=<real_warehouse>&start_date=2026-07-01&end_date=2026-07-07&granularity=day` and confirm the response shape matches `WarehouseAnalysisResponse` with non-zero aggregates for a known-active warehouse.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/kwo-snowflake-warehouse-analysis/timeseries/route.ts src/app/api/kwo-snowflake-warehouse-analysis/timeseries/__tests__/route.test.ts
git commit -m "feat: add warehouse analysis timeseries API route"
```

---

## Task 5: `warehouses` API route

**Files:**
- Create: `src/app/api/kwo-snowflake-warehouse-analysis/warehouses/route.ts`
- Test: `src/app/api/kwo-snowflake-warehouse-analysis/warehouses/__tests__/route.test.ts` (new file)

**Interfaces:**
- Consumes: `getWarehousesForOrg` (Task 2), `AdcAuthError` (`@/lib/bigquery`)
- Produces: `GET ?org_id=` returning `WarehouseOption[]` JSON — consumed by `WarehouseAnalysisFilters` (Task 6) via the page (Task 8).

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/kwo-snowflake-warehouse-analysis/warehouses/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/bigquery', async () => {
  const actual = await vi.importActual<typeof import('@/lib/bigquery')>('@/lib/bigquery')
  return {
    ...actual,
    getWarehousesForOrg: vi.fn(),
  }
})

function makeRequest(params: Record<string, string>) {
  const url = new URL('http://localhost/api/kwo-snowflake-warehouse-analysis/warehouses')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

describe('GET /api/kwo-snowflake-warehouse-analysis/warehouses', () => {
  beforeEach(() => vi.resetModules())

  it('returns 400 when org_id is missing', async () => {
    const { GET } = await import('../route')
    const res = await GET(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns the warehouse list for a valid org_id', async () => {
    const bigquery = await import('@/lib/bigquery')
    vi.mocked(bigquery.getWarehousesForOrg).mockResolvedValue([
      { warehouse_id: 'wh1', warehouse_name: 'ANALYTICS_WH' },
    ])
    const { GET } = await import('../route')
    const res = await GET(makeRequest({ org_id: '90402' }))
    const body = await res.json()
    expect(body).toEqual([{ warehouse_id: 'wh1', warehouse_name: 'ANALYTICS_WH' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/kwo-snowflake-warehouse-analysis/warehouses/__tests__/route.test.ts`
Expected: FAIL — `Cannot find module '../route'`

- [ ] **Step 3: Implement**

```ts
// src/app/api/kwo-snowflake-warehouse-analysis/warehouses/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getWarehousesForOrg, AdcAuthError } from '@/lib/bigquery'

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get('org_id')
  if (!orgId) {
    return NextResponse.json({ error: 'org_id is required' }, { status: 400 })
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/kwo-snowflake-warehouse-analysis/warehouses/__tests__/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/kwo-snowflake-warehouse-analysis/warehouses/route.ts src/app/api/kwo-snowflake-warehouse-analysis/warehouses/__tests__/route.test.ts
git commit -m "feat: add warehouse analysis warehouses API route"
```

---

## Task 6: `customers` API route

**Files:**
- Create: `src/app/api/kwo-snowflake-warehouse-analysis/customers/route.ts`
- Test: `src/app/api/kwo-snowflake-warehouse-analysis/customers/__tests__/route.test.ts` (new file)

**Interfaces:**
- Consumes: `getCustomerNameMap` (`@/lib/customers`), `getSnfQueryHistoryDatasets`, `AdcAuthError` (`@/lib/bigquery`)
- Produces: `GET` returning `{ org_id: string; name: string }[]` — only customers with an existing `k3o_prd_<org_id>_000_tf` dataset — consumed by `WarehouseAnalysisFilters` (Task 6) via the page (Task 8).

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/kwo-snowflake-warehouse-analysis/customers/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/customers', () => ({
  getCustomerNameMap: vi.fn(),
}))

vi.mock('@/lib/bigquery', async () => {
  const actual = await vi.importActual<typeof import('@/lib/bigquery')>('@/lib/bigquery')
  return {
    ...actual,
    getSnfQueryHistoryDatasets: vi.fn(),
  }
})

describe('GET /api/kwo-snowflake-warehouse-analysis/customers', () => {
  beforeEach(() => vi.resetModules())

  it('returns only customers with a query_history_view_tf dataset', async () => {
    const customers = await import('@/lib/customers')
    const bigquery = await import('@/lib/bigquery')
    vi.mocked(customers.getCustomerNameMap).mockReturnValue(
      new Map([
        ['90402', 'Acme Corp'],
        ['90999', 'No Export Co'],
      ])
    )
    vi.mocked(bigquery.getSnfQueryHistoryDatasets).mockResolvedValue(['k3o_prd_90402_000_tf'])

    const { GET } = await import('../route')
    const res = await GET(new NextRequest('http://localhost/api/kwo-snowflake-warehouse-analysis/customers'))
    const body = await res.json()

    expect(body).toEqual([{ org_id: '90402', name: 'Acme Corp' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/kwo-snowflake-warehouse-analysis/customers/__tests__/route.test.ts`
Expected: FAIL — `Cannot find module '../route'`

- [ ] **Step 3: Implement**

```ts
// src/app/api/kwo-snowflake-warehouse-analysis/customers/route.ts
import { NextResponse } from 'next/server'
import { getCustomerNameMap } from '@/lib/customers'
import { getSnfQueryHistoryDatasets, AdcAuthError } from '@/lib/bigquery'

export async function GET() {
  try {
    const nameMap = getCustomerNameMap('kwo-snowflake')
    const orgIds = [...nameMap.keys()]
    const datasets = await getSnfQueryHistoryDatasets(orgIds)
    const orgIdsWithData = new Set(datasets.map((d) => d.replace(/^k3o_prd_/, '').replace(/_000_tf$/, '')))

    const customers = orgIds
      .filter((orgId) => orgIdsWithData.has(orgId))
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/kwo-snowflake-warehouse-analysis/customers/__tests__/route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/kwo-snowflake-warehouse-analysis/customers/route.ts src/app/api/kwo-snowflake-warehouse-analysis/customers/__tests__/route.test.ts
git commit -m "feat: add warehouse analysis customers API route"
```

---

## Task 7: `WarehouseAnalysisFilters` component

**Files:**
- Create: `src/components/filters/WarehouseAnalysisFilters.tsx`
- Test: `src/components/filters/__tests__/WarehouseAnalysisFilters.test.tsx` (new file)

**Interfaces:**
- Consumes: `SingleSelect` (`./SingleSelect`), `DateRangePicker` (`./DateRangePicker`), `Granularity`, `WarehouseOption` (`@/lib/types`)
- Produces:
  ```ts
  interface WarehouseAnalysisFiltersProps {
    customers: { org_id: string; name: string }[]
    selectedCustomer: string | null
    onCustomerChange: (orgId: string | null) => void
    startDate: string
    endDate: string
    onRangeChange: (start: string, end: string) => void
    granularity: Granularity
    onGranularityChange: (g: Granularity) => void
    warehouses: WarehouseOption[]
    selectedWarehouse: string | null
    onWarehouseChange: (warehouseName: string | null) => void
    warehousesDisabled: boolean
    warehousesError: string | null
  }
  export function WarehouseAnalysisFilters(props: WarehouseAnalysisFiltersProps): JSX.Element
  ```
  Consumed by the page (Task 8), which owns all filter state and passes it down.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/filters/__tests__/WarehouseAnalysisFilters.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WarehouseAnalysisFilters } from '../WarehouseAnalysisFilters'

const baseProps = {
  customers: [{ org_id: '90402', name: 'Acme Corp' }],
  selectedCustomer: null,
  onCustomerChange: vi.fn(),
  startDate: '2026-07-01',
  endDate: '2026-07-07',
  onRangeChange: vi.fn(),
  granularity: 'day' as const,
  onGranularityChange: vi.fn(),
  warehouses: [],
  selectedWarehouse: null,
  onWarehouseChange: vi.fn(),
  warehousesDisabled: true,
  warehousesError: null,
}

describe('WarehouseAnalysisFilters', () => {
  it('renders Group By options including Hour', () => {
    render(<WarehouseAnalysisFilters {...baseProps} />)
    fireEvent.click(screen.getByText('Group By'))
    expect(screen.getByText('Hour')).toBeInTheDocument()
  })

  it('disables the Warehouse select until a Customer is chosen', () => {
    render(<WarehouseAnalysisFilters {...baseProps} />)
    const warehouseButton = screen.getByTestId('warehouse-select-trigger')
    expect(warehouseButton).toBeDisabled()
  })

  it('calls onWarehouseChange(null) when Customer changes', () => {
    const onWarehouseChange = vi.fn()
    const onCustomerChange = vi.fn()
    render(
      <WarehouseAnalysisFilters
        {...baseProps}
        selectedCustomer="90402"
        warehousesDisabled={false}
        onCustomerChange={onCustomerChange}
        onWarehouseChange={onWarehouseChange}
      />
    )
    fireEvent.click(screen.getByText('Customer'))
    fireEvent.click(screen.getByText('Acme Corp'))
    expect(onCustomerChange).toHaveBeenCalledWith('90402')
    expect(onWarehouseChange).toHaveBeenCalledWith(null)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/filters/__tests__/WarehouseAnalysisFilters.test.tsx`
Expected: FAIL — `Cannot find module '../WarehouseAnalysisFilters'`

- [ ] **Step 3: Implement**

```tsx
// src/components/filters/WarehouseAnalysisFilters.tsx
'use client'

import { SingleSelect } from './SingleSelect'
import { DateRangePicker } from './DateRangePicker'
import type { Granularity, WarehouseOption } from '@/lib/types'

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Calendar Week' },
  { value: 'month', label: 'Calendar Month' },
  { value: 'rolling7', label: '7-Day Rolling' },
  { value: 'hour', label: 'Hour' },
]

interface WarehouseAnalysisFiltersProps {
  customers: { org_id: string; name: string }[]
  selectedCustomer: string | null
  onCustomerChange: (orgId: string | null) => void
  startDate: string
  endDate: string
  onRangeChange: (start: string, end: string) => void
  granularity: Granularity
  onGranularityChange: (g: Granularity) => void
  warehouses: WarehouseOption[]
  selectedWarehouse: string | null
  onWarehouseChange: (warehouseName: string | null) => void
  warehousesDisabled: boolean
  warehousesError: string | null
}

export function WarehouseAnalysisFilters({
  customers,
  selectedCustomer,
  onCustomerChange,
  startDate,
  endDate,
  onRangeChange,
  granularity,
  onGranularityChange,
  warehouses,
  selectedWarehouse,
  onWarehouseChange,
  warehousesDisabled,
  warehousesError,
}: WarehouseAnalysisFiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <SingleSelect
        label="Customer"
        options={customers.map((c) => ({ value: c.org_id, label: c.name }))}
        value={selectedCustomer ?? ''}
        onChange={(value) => {
          onCustomerChange(value || null)
          onWarehouseChange(null)
        }}
      />
      <DateRangePicker startDate={startDate} endDate={endDate} onRangeChange={onRangeChange} />
      <SingleSelect
        label="Group By"
        options={GRANULARITY_OPTIONS}
        value={granularity}
        onChange={(value) => onGranularityChange(value as Granularity)}
      />
      <div className="flex flex-col gap-1">
        <SingleSelect
          label="Warehouse"
          options={warehouses.map((w) => ({ value: w.warehouse_name, label: w.warehouse_name }))}
          value={selectedWarehouse ?? ''}
          onChange={(value) => onWarehouseChange(value || null)}
          disabled={warehousesDisabled}
        />
        {warehousesError && <span className="text-xs text-destructive">{warehousesError}</span>}
      </div>
    </div>
  )
}
```

Since `SingleSelect`'s trigger button doesn't currently expose a `data-testid`, add one so Task 7's disabled-state test can target the Warehouse trigger specifically (there are multiple `SingleSelect` triggers on the page). Modify `src/components/filters/SingleSelect.tsx`'s button element to accept and forward a `testId` prop:

```ts
interface SingleSelectProps {
  label: string
  options: Option[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  testId?: string
}
```

and on the trigger `<button>`, add `data-testid={testId}`. Then in `WarehouseAnalysisFilters.tsx`, pass `testId="warehouse-select-trigger"` on the Warehouse `SingleSelect`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/filters/__tests__/WarehouseAnalysisFilters.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/filters/WarehouseAnalysisFilters.tsx src/components/filters/SingleSelect.tsx src/components/filters/__tests__/WarehouseAnalysisFilters.test.tsx
git commit -m "feat: add WarehouseAnalysisFilters component"
```

---

## Task 8: `WarehouseAnalysisCharts` component

**Files:**
- Create: `src/components/charts/WarehouseAnalysisCharts.tsx`
- Test: `src/components/charts/__tests__/WarehouseAnalysisCharts.test.tsx` (new file)

**Interfaces:**
- Consumes: `ChartWrapper`, `C_GREEN`, `C_NAVY`, `C_TEAL`, `C_SLATE` (`./TimeSeriesCharts`), `WarehouseAnalysisPoint` (`@/lib/types`), `recharts` (`BarChart`, `Bar`, `AreaChart`, `Area`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `Legend`, `ResponsiveContainer`), `useTheme` (`@/components/layout/ThemeProvider`)
- Produces:
  ```ts
  interface WarehouseAnalysisChartsProps {
    points: WarehouseAnalysisPoint[]
  }
  export function WarehouseAnalysisCharts({ points }: WarehouseAnalysisChartsProps): JSX.Element
  ```
  Consumed by the page (Task 9).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/charts/__tests__/WarehouseAnalysisCharts.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WarehouseAnalysisCharts } from '../WarehouseAnalysisCharts'
import type { WarehouseAnalysisPoint } from '@/lib/types'

const points: WarehouseAnalysisPoint[] = [
  {
    period_label: '2026-07-01',
    period_label_display: 'Jul 1',
    period_start: '2026-07-01',
    period_end: '2026-07-01',
    query_volume_by_type: { SELECT: 120, INSERT: 30 },
    execution_time_avg_ms: 450,
    execution_time_p95_ms: 900,
    execution_time_p99_ms: 1500,
    queued_query_count: 4,
    queue_time_avg_ms: 20,
    queue_time_p95_ms: 60,
    queue_time_p99_ms: 100,
    bytes_spilled_local: 1024,
    bytes_spilled_remote: 0,
    failed_query_count_by_error: { '1234': 2 },
  },
]

describe('WarehouseAnalysisCharts', () => {
  it('renders all six chart titles', () => {
    render(<WarehouseAnalysisCharts points={points} />)
    expect(screen.getByText('Total Queries')).toBeInTheDocument()
    expect(screen.getByText('Execution Time')).toBeInTheDocument()
    expect(screen.getByText('Queued Queries')).toBeInTheDocument()
    expect(screen.getByText('Queue Time')).toBeInTheDocument()
    expect(screen.getByText('Spillage')).toBeInTheDocument()
    expect(screen.getByText('Failed Queries')).toBeInTheDocument()
  })

  it('renders without crashing when points is empty', () => {
    render(<WarehouseAnalysisCharts points={[]} />)
    expect(screen.getByText('Total Queries')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/charts/__tests__/WarehouseAnalysisCharts.test.tsx`
Expected: FAIL — `Cannot find module '../WarehouseAnalysisCharts'`

- [ ] **Step 3: Implement**

```tsx
// src/components/charts/WarehouseAnalysisCharts.tsx
'use client'

import { useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useTheme } from '@/components/layout/ThemeProvider'
import { ChartWrapper, C_GREEN, C_NAVY, C_TEAL, C_SLATE } from './TimeSeriesCharts'
import type { WarehouseAnalysisPoint } from '@/lib/types'

const DARK_GRID = { stroke: '#0d3344' }
const DARK_AXIS = { stroke: '#5a5e65', fontSize: 11 }
const DARK_TOOLTIP = { backgroundColor: '#04202d', border: '1px solid #0d3344', color: '#ffffff' }
const LIGHT_GRID = { stroke: '#bdd4e0' }
const LIGHT_AXIS = { stroke: '#4a6373', fontSize: 11 }
const LIGHT_TOOLTIP = { backgroundColor: '#ffffff', border: '1px solid #bdd4e0', color: '#061c27' }

const SERIES_COLORS = [C_GREEN, C_NAVY, C_TEAL, C_SLATE, '#9ac6da', '#6c9db3', '#2a6985', '#08394f']

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${bytes} B`
}

function collectKeys(points: WarehouseAnalysisPoint[], field: 'query_volume_by_type' | 'failed_query_count_by_error'): string[] {
  const keys = new Set<string>()
  for (const p of points) {
    for (const key of Object.keys(p[field])) keys.add(key)
  }
  return [...keys]
}

function useHiddenSeries() {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  return { hidden, toggle }
}

function ClickableLegend({ payload, hidden, toggle }: { payload?: { value: string; color: string }[]; hidden: Set<string>; toggle: (k: string) => void }) {
  return (
    <div className="flex flex-wrap gap-3 justify-center text-xs mt-2">
      {(payload ?? []).map((entry) => (
        <button
          key={entry.value}
          onClick={() => toggle(entry.value)}
          className="flex items-center gap-1"
          style={{ opacity: hidden.has(entry.value) ? 0.4 : 1 }}
        >
          <span style={{ width: 8, height: 8, background: entry.color, display: 'inline-block', borderRadius: 2 }} />
          {entry.value}
        </button>
      ))}
    </div>
  )
}

export function WarehouseAnalysisCharts({ points }: WarehouseAnalysisChartsProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const grid = isLight ? LIGHT_GRID : DARK_GRID
  const axis = isLight ? LIGHT_AXIS : DARK_AXIS
  const tooltipStyle = isLight ? LIGHT_TOOLTIP : DARK_TOOLTIP

  const queryTypes = useMemo(() => collectKeys(points, 'query_volume_by_type'), [points])
  const errorCodes = useMemo(() => collectKeys(points, 'failed_query_count_by_error'), [points])

  const volumeData = useMemo(
    () =>
      points.map((p) => ({
        period_label_display: p.period_label_display,
        ...Object.fromEntries(queryTypes.map((t) => [t, p.query_volume_by_type[t] ?? 0])),
      })),
    [points, queryTypes]
  )

  const executionData = useMemo(
    () =>
      points.map((p) => ({
        period_label_display: p.period_label_display,
        avg: p.execution_time_avg_ms,
        p95: p.execution_time_p95_ms,
        p99: p.execution_time_p99_ms,
      })),
    [points]
  )

  const queuedData = useMemo(
    () => points.map((p) => ({ period_label_display: p.period_label_display, queued_query_count: p.queued_query_count })),
    [points]
  )

  const queueTimeData = useMemo(
    () =>
      points.map((p) => ({
        period_label_display: p.period_label_display,
        avg: p.queue_time_avg_ms,
        p95: p.queue_time_p95_ms,
        p99: p.queue_time_p99_ms,
      })),
    [points]
  )

  const spillageData = useMemo(
    () =>
      points.map((p) => ({
        period_label_display: p.period_label_display,
        local: p.bytes_spilled_local,
        remote: p.bytes_spilled_remote,
      })),
    [points]
  )

  const errorData = useMemo(
    () =>
      points.map((p) => ({
        period_label_display: p.period_label_display,
        ...Object.fromEntries(errorCodes.map((e) => [e, p.failed_query_count_by_error[e] ?? 0])),
      })),
    [points, errorCodes]
  )

  const volumeLegend = useHiddenSeries()
  const errorLegend = useHiddenSeries()

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartWrapper title="Total Queries" isLight={isLight}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={volumeData}>
            <CartesianGrid {...grid} />
            <XAxis dataKey="period_label_display" {...axis} />
            <YAxis {...axis} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend
              content={({ payload }) => <ClickableLegend payload={payload as never} hidden={volumeLegend.hidden} toggle={volumeLegend.toggle} />}
            />
            {queryTypes.map((t, i) => (
              <Bar key={t} dataKey={t} stackId="volume" fill={SERIES_COLORS[i % SERIES_COLORS.length]} hide={volumeLegend.hidden.has(t)} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Execution Time" isLight={isLight}>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={executionData}>
            <defs>
              <linearGradient id="execAvg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C_GREEN} stopOpacity={0.4} />
                <stop offset="95%" stopColor={C_GREEN} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...grid} />
            <XAxis dataKey="period_label_display" {...axis} />
            <YAxis {...axis} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            <Area type="monotone" dataKey="avg" name="Avg (ms)" stroke={C_GREEN} fill="url(#execAvg)" />
            <Area type="monotone" dataKey="p95" name="P95 (ms)" stroke={C_NAVY} fillOpacity={0} />
            <Area type="monotone" dataKey="p99" name="P99 (ms)" stroke={C_TEAL} fillOpacity={0} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Queued Queries" isLight={isLight}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={queuedData}>
            <CartesianGrid {...grid} />
            <XAxis dataKey="period_label_display" {...axis} />
            <YAxis {...axis} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="queued_query_count" name="Queued Queries" fill={C_NAVY} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Queue Time" isLight={isLight}>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={queueTimeData}>
            <defs>
              <linearGradient id="queueAvg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C_SLATE} stopOpacity={0.4} />
                <stop offset="95%" stopColor={C_SLATE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...grid} />
            <XAxis dataKey="period_label_display" {...axis} />
            <YAxis {...axis} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            <Area type="monotone" dataKey="avg" name="Avg (ms)" stroke={C_SLATE} fill="url(#queueAvg)" />
            <Area type="monotone" dataKey="p95" name="P95 (ms)" stroke={C_NAVY} fillOpacity={0} />
            <Area type="monotone" dataKey="p99" name="P99 (ms)" stroke={C_TEAL} fillOpacity={0} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Spillage" isLight={isLight}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={spillageData}>
            <CartesianGrid {...grid} />
            <XAxis dataKey="period_label_display" {...axis} />
            <YAxis {...axis} tickFormatter={(v: number) => formatBytes(v)} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatBytes(v)} />
            <Legend />
            <Bar dataKey="local" name="Local" stackId="spillage" fill={C_GREEN} />
            <Bar dataKey="remote" name="Remote" stackId="spillage" fill={C_NAVY} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Failed Queries" isLight={isLight}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={errorData}>
            <CartesianGrid {...grid} />
            <XAxis dataKey="period_label_display" {...axis} />
            <YAxis {...axis} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend
              content={({ payload }) => <ClickableLegend payload={payload as never} hidden={errorLegend.hidden} toggle={errorLegend.toggle} />}
            />
            {errorCodes.map((code, i) => (
              <Bar
                key={code}
                dataKey={code}
                stackId="errors"
                fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                hide={errorLegend.hidden.has(code)}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>
    </div>
  )
}

interface WarehouseAnalysisChartsProps {
  points: WarehouseAnalysisPoint[]
}
```

`ChartWrapper` must be exported already from `TimeSeriesCharts.tsx` (confirmed) — if its signature requires `height`/`totals` as non-optional, pass `height={320}` explicitly; adjust the call sites above to match the real prop list before running the test.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/charts/__tests__/WarehouseAnalysisCharts.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/charts/WarehouseAnalysisCharts.tsx src/components/charts/__tests__/WarehouseAnalysisCharts.test.tsx
git commit -m "feat: add WarehouseAnalysisCharts component"
```

---

## Task 9: Page — `kwo-snowflake-warehouse-analysis/page.tsx`

**Files:**
- Create: `src/app/kwo-snowflake-warehouse-analysis/page.tsx`
- Test: `src/app/kwo-snowflake-warehouse-analysis/__tests__/page.test.tsx` (new file)

**Interfaces:**
- Consumes: `WarehouseAnalysisFilters` (Task 7), `WarehouseAnalysisCharts` (Task 8), `DataTable`, `Column` (`@/components/tables/DataTable`), `WarehouseAnalysisPoint`, `WarehouseOption`, `Granularity` (`@/lib/types`), `defaultTimeSeriesRange`, `toDateString` (`@/lib/dates`), the three new API routes (Tasks 4–6)
- Produces: default-exported page component at `/kwo-snowflake-warehouse-analysis`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/kwo-snowflake-warehouse-analysis/__tests__/page.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import Page from '../page'

const originalFetch = global.fetch

describe('Snowflake Warehouse Analysis page', () => {
  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('prompts to select a Customer before showing charts', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/customers')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ org_id: '90402', name: 'Acme Corp' }]) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    }) as unknown as typeof fetch

    render(<Page />)
    await waitFor(() => expect(screen.getByText(/select a customer/i)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/kwo-snowflake-warehouse-analysis/__tests__/page.test.tsx`
Expected: FAIL — `Cannot find module '../page'`

- [ ] **Step 3: Implement**

```tsx
// src/app/kwo-snowflake-warehouse-analysis/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { WarehouseAnalysisFilters } from '@/components/filters/WarehouseAnalysisFilters'
import { WarehouseAnalysisCharts } from '@/components/charts/WarehouseAnalysisCharts'
import { DataTable, type Column } from '@/components/tables/DataTable'
import { defaultTimeSeriesRange, toDateString } from '@/lib/dates'
import type { Granularity, WarehouseAnalysisPoint, WarehouseAnalysisResponse, WarehouseOption } from '@/lib/types'

const MAX_HOUR_RANGE_DAYS = 14

interface FetchError {
  message: string
  code?: string
}

function SectionError({ error }: { error: FetchError }) {
  if (error.code === 'ADC_UNAUTHENTICATED') {
    return (
      <div className="p-4 rounded border border-destructive text-destructive text-sm">
        {error.message} — visit <a href="/settings" className="underline">Settings</a> to re-authenticate.
      </div>
    )
  }
  return <div className="p-4 rounded border border-destructive text-destructive text-sm">{error.message}</div>
}

const TABLE_COLUMNS: Column<WarehouseAnalysisPoint>[] = [
  { key: 'period_label', label: 'Period' },
  { key: 'execution_time_avg_ms', label: 'Avg Exec Time (ms)', align: 'right' },
  { key: 'execution_time_p95_ms', label: 'P95 Exec Time (ms)', align: 'right' },
  { key: 'execution_time_p99_ms', label: 'P99 Exec Time (ms)', align: 'right' },
  { key: 'queued_query_count', label: 'Queued Queries', align: 'right' },
  { key: 'queue_time_avg_ms', label: 'Avg Queue Time (ms)', align: 'right' },
  { key: 'bytes_spilled_local', label: 'Local Spillage (bytes)', align: 'right' },
  { key: 'bytes_spilled_remote', label: 'Remote Spillage (bytes)', align: 'right' },
]

export default function WarehouseAnalysisPage() {
  const defaultRange = defaultTimeSeriesRange()

  const [customers, setCustomers] = useState<{ org_id: string; name: string }[]>([])
  const [customersError, setCustomersError] = useState<FetchError | null>(null)

  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null)
  const [startDate, setStartDate] = useState(toDateString(defaultRange.start))
  const [endDate, setEndDate] = useState(toDateString(defaultRange.end))
  const [granularity, setGranularity] = useState<Granularity>('day')

  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])
  const [warehousesError, setWarehousesError] = useState<string | null>(null)
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | null>(null)

  const [points, setPoints] = useState<WarehouseAnalysisPoint[]>([])
  const [granularityUsed, setGranularityUsed] = useState<Granularity>('day')
  const [timeseriesError, setTimeseriesError] = useState<FetchError | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/kwo-snowflake-warehouse-analysis/customers')
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw body
        setCustomers(body)
      })
      .catch((err) => setCustomersError({ message: err.error ?? String(err), code: err.code }))
  }, [])

  useEffect(() => {
    if (!selectedCustomer) {
      setWarehouses([])
      return
    }
    setWarehousesError(null)
    fetch(`/api/kwo-snowflake-warehouse-analysis/warehouses?org_id=${selectedCustomer}`)
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw body
        setWarehouses(body)
      })
      .catch((err) => setWarehousesError(err.error ?? String(err)))
  }, [selectedCustomer])

  useEffect(() => {
    if (!selectedCustomer || !selectedWarehouse) {
      setPoints([])
      return
    }
    const controller = new AbortController()
    setLoading(true)
    setTimeseriesError(null)

    const params = new URLSearchParams({
      org_id: selectedCustomer,
      warehouse_name: selectedWarehouse,
      start_date: startDate,
      end_date: endDate,
      granularity,
    })

    fetch(`/api/kwo-snowflake-warehouse-analysis/timeseries?${params}`, { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json()) as WarehouseAnalysisResponse & { error?: string; code?: string }
        if (!res.ok) throw body
        setPoints(body.points)
        setGranularityUsed(body.granularity_used)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setTimeseriesError({ message: err.error ?? String(err), code: err.code })
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [selectedCustomer, selectedWarehouse, startDate, endDate, granularity])

  return (
    <div className="p-6 flex flex-col gap-4">
      <h1 className="text-xl font-heading font-semibold">Snowflake Warehouse Analysis</h1>

      {customersError && <SectionError error={customersError} />}

      <WarehouseAnalysisFilters
        customers={customers}
        selectedCustomer={selectedCustomer}
        onCustomerChange={setSelectedCustomer}
        startDate={startDate}
        endDate={endDate}
        onRangeChange={(start, end) => {
          setStartDate(start)
          setEndDate(end)
        }}
        granularity={granularity}
        onGranularityChange={setGranularity}
        warehouses={warehouses}
        selectedWarehouse={selectedWarehouse}
        onWarehouseChange={setSelectedWarehouse}
        warehousesDisabled={!selectedCustomer}
        warehousesError={warehousesError}
      />

      {granularity === 'hour' && granularityUsed === 'day' && (
        <div className="text-xs text-muted-foreground p-2 rounded bg-muted">
          Hourly granularity supports up to a {MAX_HOUR_RANGE_DAYS}-day range — showing daily data instead.
        </div>
      )}

      {!selectedCustomer && (
        <div className="p-8 text-center text-muted-foreground text-sm">Select a Customer to view warehouse analysis.</div>
      )}

      {selectedCustomer && !selectedWarehouse && (
        <div className="p-8 text-center text-muted-foreground text-sm">Select a Warehouse to view query performance.</div>
      )}

      {selectedCustomer && selectedWarehouse && timeseriesError && <SectionError error={timeseriesError} />}

      {selectedCustomer && selectedWarehouse && !timeseriesError && !loading && points.length === 0 && (
        <div className="p-8 text-center text-muted-foreground text-sm">
          No query history for this warehouse in the selected range.
        </div>
      )}

      {selectedCustomer && selectedWarehouse && !timeseriesError && points.length > 0 && (
        <>
          <WarehouseAnalysisCharts points={points} />
          <DataTable columns={TABLE_COLUMNS} rows={points} defaultSortKey="period_label" defaultSortDir="asc" csvFilename="warehouse_analysis.csv" />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/kwo-snowflake-warehouse-analysis/__tests__/page.test.tsx`
Expected: PASS

- [ ] **Step 5: Type check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors

- [ ] **Step 6: Manual browser verification**

Run `npm run dev`, visit `http://localhost:4000/kwo-snowflake-warehouse-analysis`. Confirm: page loads with "Select a Customer" prompt; selecting a Customer populates and enables Warehouse; selecting a Warehouse renders all 6 charts + table; switching Group By to Hour on a >14-day range shows the fallback notice; toggling light/dark theme keeps chart colors within the Keebo palette.

- [ ] **Step 7: Commit**

```bash
git add src/app/kwo-snowflake-warehouse-analysis/page.tsx src/app/kwo-snowflake-warehouse-analysis/__tests__/page.test.tsx
git commit -m "feat: add Snowflake Warehouse Analysis page"
```

---

## Task 10: Sidebar nav entry

**Files:**
- Modify: `src/components/layout/Sidebar.tsx:12-15`

**Interfaces:**
- Consumes: nothing new
- Produces: nothing consumed elsewhere — this is the final wiring step.

- [ ] **Step 1: Implement (no test — this is a static data array; covered by manual verification)**

In `src/components/layout/Sidebar.tsx`, change:

```ts
  {
    group: 'Warehouse Optimization',
    items: [
      { label: 'KWO for Databricks', href: '/kwo-databricks' },
      { label: 'KWO for Snowflake', href: '/kwo-snowflake' },
    ],
  },
```

to:

```ts
  {
    group: 'Warehouse Optimization',
    items: [
      { label: 'KWO for Databricks', href: '/kwo-databricks' },
      { label: 'KWO for Snowflake', href: '/kwo-snowflake' },
      { label: 'Snowflake Warehouse Analysis', href: '/kwo-snowflake-warehouse-analysis' },
    ],
  },
```

- [ ] **Step 2: Manual verification**

Run `npm run dev`, confirm "Snowflake Warehouse Analysis" appears under "Warehouse Optimization" in the sidebar and navigates to the new page with active-state highlighting.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat: add Snowflake Warehouse Analysis nav entry"
```

---

## Self-Review

**1. Spec coverage:**
- Navigation entry → Task 10. ✅
- Filters: Customer (single-select, all customers, no Contract Type) → Date Range → Group By (incl. Hour) → Warehouse (dependent, disabled/reset) → Task 7 + Task 9 (`onWarehouseChange(null)` on customer change). ✅
- Hour + 14-day fallback, server-side, non-blocking, inline notice → Task 4 (route logic) + Task 9 (notice banner). ✅
- Data source / column mapping → Task 3 SQL. ✅
- New SQL file, CTE style → Task 3. ✅
- New API routes (timeseries, warehouses) → Tasks 4–5. Customers route (needed by the page's Customer dropdown, implied by "single-select... from `data/customers.json`" + the dependent-Warehouse pattern needing a data source) → Task 6. ✅
- Types (`hour` on `Granularity`, `dates.ts` 4 functions) → Task 1. ✅
- 6 charts + DataTable → Tasks 8–9. ✅
- Error handling: ADC banner (Task 9 `SectionError`), no-Customer/no-Warehouse empty states (Task 9), no-data empty state (Task 9), warehouse-list-fetch-failure disabled+inline-error (Task 7 `warehousesError` prop, Task 9 wiring), Hour+>14-days fallback (Task 4 + Task 9). ✅

**2. Placeholder scan:** No "TBD"/"TODO"/"add appropriate error handling" phrases in any task — every step has literal code. The one deliberate exception is Task 3's SQL, which has no automated test by design (documented why, with a concrete manual-verification step in Task 4).

**3. Type consistency:** `WarehouseAnalysisPoint`, `WarehouseAnalysisResponse`, `WarehouseOption` defined once in Task 1 and referenced identically (same field names) in Tasks 4, 6, 7, 8, 9. `Granularity` union (`'day' | 'week' | 'month' | 'rolling7' | 'hour'`) used consistently across Tasks 1, 4, 7, 9. Route paths (`/api/kwo-snowflake-warehouse-analysis/{customers,warehouses,timeseries}`) match between each route's own task and the page's `fetch` calls in Task 9.

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-20-snowflake-warehouse-analysis.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
