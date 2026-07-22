# Cost per 1000 Queries + Query Concurrency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two charts to the Snowflake Warehouse Analysis page: "Cost per 1000 Queries" (after "Warehouse Usage") and "Query Concurrency" (after "Total Queries").

**Architecture:** "Cost per 1000 Queries" is derived entirely client-side from data already returned by the existing timeseries API (no backend change). "Query Concurrency" requires a new sweep-line SQL computation (max/avg concurrently-running queries per period, based on `end_time`/`execution_time`) added to the existing `kwo_snowflake_warehouse_analysis_timeseries.sql`, two new fields threaded through `WarehouseAnalysisPoint` and the API route, and a new line chart.

**Tech Stack:** Next.js API route (`src/app/api/...`), BigQuery SQL template, React + Recharts (`WarehouseAnalysisCharts.tsx`), Vitest + Testing Library.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-22-cost-per-1000-queries-and-concurrency-design.md` — follow exactly.
- Cost unit is **credits** (no `$`-per-credit rate anywhere in the app) — never introduce one.
- Query Concurrency window: `run_end_ms = end_time`, `run_start_ms = end_time - execution_time` (NOT `start_time + compilation_time + queue_time` — that was an earlier, rejected derivation).
- Chart title is **"Query Concurrency"**, not "queries/min" — the metric is an instantaneous concurrent-count, not a rate.
- BigQuery `NUMERIC`/`BIGNUMERIC` columns come back as non-plain-number wrapper objects — always wrap with `Number(...)` in the API route (per CLAUDE.md Lessons).
- Follow existing file conventions: all warehouse-analysis charts live in one file (`WarehouseAnalysisCharts.tsx`), colors only from `TimeSeriesCharts.tsx` exports (`C_NAVY`, `C_TEAL`, `C_DEEP`), never hardcode hex.
- New chart placement: `Warehouse Usage → Cost per 1000 Queries → Total Queries → Query Concurrency → Execution Time → ...` (existing chart order otherwise unchanged).

---

### Task 1: Cost per 1000 Queries chart (client-side derived, no backend change)

**Files:**
- Modify: `src/components/charts/WarehouseAnalysisCharts.tsx`
- Modify: `src/components/charts/__tests__/WarehouseAnalysisCharts.test.tsx`

**Interfaces:**
- Consumes: existing `WarehouseAnalysisPoint.credits_used` and `WarehouseAnalysisPoint.query_volume_by_type` (already defined in `src/lib/types.ts:127-146`).
- Produces: no new exports — this task only adds a `ChartWrapper` block and its `useMemo` data prep inside `WarehouseAnalysisCharts`.

- [ ] **Step 1: Write the failing test**

Add to `src/components/charts/__tests__/WarehouseAnalysisCharts.test.tsx`, inside the existing `describe('WarehouseAnalysisCharts', ...)` block:

```tsx
  it('renders the Cost per 1000 Queries chart with a derived total', () => {
    render(
      <WarehouseAnalysisCharts
        points={points}
        histogramBuckets={histogramBuckets}
        dataScannedHistogramBuckets={dataScannedHistogramBuckets}
        spillageHistogramBuckets={spillageHistogramBuckets}
      />
    )
    expect(screen.getByText('Cost per 1000 Queries')).toBeInTheDocument()
    // points fixture: credits_used 3.5, query_volume_by_type SELECT 120 + INSERT 30 = 150 queries
    // 3.5 / 150 * 1000 = 23.33
    expect(screen.getByText('23.33')).toBeInTheDocument()
  })

  it('shows 0 for Cost per 1000 Queries when there are no queries in the period', () => {
    const zeroQueryPoints: WarehouseAnalysisPoint[] = [
      { ...points[0], query_volume_by_type: {}, credits_used: 5 },
    ]
    render(
      <WarehouseAnalysisCharts
        points={zeroQueryPoints}
        histogramBuckets={histogramBuckets}
        dataScannedHistogramBuckets={dataScannedHistogramBuckets}
        spillageHistogramBuckets={spillageHistogramBuckets}
      />
    )
    expect(screen.getByText('Cost per 1000 Queries')).toBeInTheDocument()
    expect(screen.getByText('0.00')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/charts/__tests__/WarehouseAnalysisCharts.test.tsx -t "Cost per 1000 Queries"`
Expected: FAIL — `Unable to find an element with the text: Cost per 1000 Queries`

- [ ] **Step 3: Implement the chart**

In `src/components/charts/WarehouseAnalysisCharts.tsx`, add a new `useMemo` immediately after `volumeData` (after line 238, before `totalsUsage`):

```tsx
  const costPer1000Data = useMemo(
    () =>
      points.map((p) => {
        const totalQueries = Object.values(p.query_volume_by_type).reduce((sum, v) => sum + v, 0)
        return {
          period_label_display: p.period_label_display,
          cost_per_1000_queries: totalQueries > 0 ? (p.credits_used / totalQueries) * 1000 : 0,
        }
      }),
    [points]
  )
```

Add `costPer1000Queries: true` to the `SHOW_METRIC` object (line 174-190).

Add a totals `useMemo` next to `totalsVolume` (after line 284):

```tsx
  const totalsCostPer1000 = useMemo(() => {
    const totalCredits = points.reduce((sum, p) => sum + p.credits_used, 0)
    const totalQueries = points.reduce(
      (sum, p) => sum + Object.values(p.query_volume_by_type).reduce((s, v) => s + v, 0),
      0
    )
    return [
      { label: 'Credits / 1000 Queries', value: formatDecimalNumber(totalQueries > 0 ? (totalCredits / totalQueries) * 1000 : 0) },
    ]
  }, [points])
```

Add the `ChartWrapper` in the JSX immediately after the "Warehouse Usage" block and before "Total Queries" (after line 367, before line 369):

```tsx
      <ChartWrapper
        title="Cost per 1000 Queries"
        isLight={isLight}
        totals={SHOW_METRIC.costPer1000Queries ? totalsCostPer1000 : undefined}
        loading={loading}
      >
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={costPer1000Data} barSize={30}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="period_label_display" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatDecimalNumber(v)} />
            <Tooltip {...TT} cursor={{ fill: cursorFill }} formatter={(v) => [formatDecimalNumber(Number(v)), 'Credits / 1000 Queries']} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Credits / 1000 Queries'} wrapperStyle={legendStyle} />
            <Bar dataKey="cost_per_1000_queries" name="Credits / 1000 Queries" fill={C_NAVY} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/charts/__tests__/WarehouseAnalysisCharts.test.tsx`
Expected: PASS (all tests in the file, including the two new ones)

- [ ] **Step 5: Commit**

```bash
git add src/components/charts/WarehouseAnalysisCharts.tsx src/components/charts/__tests__/WarehouseAnalysisCharts.test.tsx
git commit -m "feat: add Cost per 1000 Queries chart to Snowflake Warehouse Analysis"
```

---

### Task 2: Query Concurrency backend — SQL sweep-line, types, API route

**Files:**
- Modify: `sql/kwo_snowflake_warehouse_analysis_timeseries.sql`
- Modify: `src/lib/types.ts`
- Modify: `src/app/api/kwo-snowflake-warehouse-analysis/timeseries/route.ts`
- Modify: `src/app/api/kwo-snowflake-warehouse-analysis/timeseries/__tests__/route.test.ts`
- Modify: `src/components/charts/__tests__/WarehouseAnalysisCharts.test.tsx` (fixture only — new required fields)

**Interfaces:**
- Produces: `WarehouseAnalysisPoint.concurrent_queries_max: number` and `WarehouseAnalysisPoint.concurrent_queries_avg: number` — consumed by Task 3's chart.
- SQL result row gains `concurrent_queries_max` and `concurrent_queries_avg` columns (nullable, zero-filled by the route like every other metric).

- [ ] **Step 1: Write the failing tests**

Add to `src/app/api/kwo-snowflake-warehouse-analysis/timeseries/__tests__/route.test.ts`, inside the existing `describe(...)` block:

```ts
  it('zero-fills concurrent_queries_max/avg for periods with no matching rows', async () => {
    mockRunQuery.mockResolvedValue([])
    const { GET } = await import('../route')
    const res = await GET(
      makeRequest({
        org_id: '90402',
        warehouse_name: 'ANALYTICS_WH',
        start_date: '2026-07-01',
        end_date: '2026-07-01',
        granularity: 'day',
      })
    )
    const body = await res.json()
    expect(body.points[0].concurrent_queries_max).toBe(0)
    expect(body.points[0].concurrent_queries_avg).toBe(0)
  })

  it('passes through concurrent_queries_max/avg from the sweep-line row', async () => {
    mockRunQuery.mockResolvedValue([
      { period_start: '2026-07-01', concurrent_queries_max: 7, concurrent_queries_avg: 2.34 },
    ])
    const { GET } = await import('../route')
    const res = await GET(
      makeRequest({
        org_id: '90402',
        warehouse_name: 'ANALYTICS_WH',
        start_date: '2026-07-01',
        end_date: '2026-07-01',
        granularity: 'day',
      })
    )
    const body = await res.json()
    expect(body.points[0].concurrent_queries_max).toBe(7)
    expect(body.points[0].concurrent_queries_avg).toBe(2.34)
  })

  it('coerces BigQuery NUMERIC-wrapped concurrent_queries_avg to a plain number', async () => {
    const numericWrapper = { toString: () => '2.34000', toJSON: () => '2.34000' }
    mockRunQuery.mockResolvedValue([
      { period_start: '2026-07-01', concurrent_queries_max: 7, concurrent_queries_avg: numericWrapper },
    ])
    const { GET } = await import('../route')
    const res = await GET(
      makeRequest({
        org_id: '90402',
        warehouse_name: 'ANALYTICS_WH',
        start_date: '2026-07-01',
        end_date: '2026-07-01',
        granularity: 'day',
      })
    )
    const body = await res.json()
    expect(body.points[0].concurrent_queries_avg).toBe(2.34)
    expect(typeof body.points[0].concurrent_queries_avg).toBe('number')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/kwo-snowflake-warehouse-analysis/timeseries/__tests__/route.test.ts -t "concurrent_queries"`
Expected: FAIL — `body.points[0].concurrent_queries_max` is `undefined`, not `0`/`7`

- [ ] **Step 3: Add the sweep-line CTEs to the SQL template**

In `sql/kwo_snowflake_warehouse_analysis_timeseries.sql`, add these new CTEs after the `usage` CTE (after line 137, before the final `SELECT` at line 139):

```sql
run_windows_filtered AS (
  SELECT
    q.end_time - q.execution_time AS run_start_ms,
    q.end_time AS run_end_ms
  FROM `keebo-portal.k3o_prd_ORGID_000_tf.query_history_view_tf` q
  WHERE q.warehouse_name = @warehouse_name
    -- overlap filter, not start_time-in-range: a query whose run window
    -- starts just before @start_date but extends into the range must
    -- still count toward concurrency in the periods it overlaps.
    AND q.end_time - q.execution_time <= UNIX_MILLIS(TIMESTAMP(@end_date))
    AND q.end_time >= UNIX_MILLIS(TIMESTAMP(@start_date))
),
concurrency_events AS (
  SELECT run_start_ms AS t, 1 AS delta FROM run_windows_filtered
  UNION ALL
  SELECT run_end_ms AS t, -1 AS delta FROM run_windows_filtered
),
concurrency_sweep AS (
  SELECT
    t,
    SUM(delta) OVER (ORDER BY t, delta ASC) AS running_count,
    LEAD(t) OVER (ORDER BY t, delta ASC) AS next_t
  FROM concurrency_events
),
concurrency_segments AS (
  SELECT t AS seg_start, next_t AS seg_end, running_count
  FROM concurrency_sweep
  WHERE next_t IS NOT NULL
),
concurrency AS (
  SELECT
    p.period_start,
    MAX(s.running_count) AS concurrent_queries_max,
    SUM(s.running_count * (LEAST(s.seg_end, p.period_end_ms) - GREATEST(s.seg_start, p.period_start_ms)))
      / NULLIF(p.period_end_ms - p.period_start_ms, 0) AS concurrent_queries_avg
  FROM periods p
  JOIN concurrency_segments s
    ON s.seg_start < p.period_end_ms AND s.seg_end > p.period_start_ms
  GROUP BY p.period_start, p.period_end_ms, p.period_start_ms
)
```

Update the final `SELECT` (lines 139-163) to add the two new columns and the join:

```sql
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
  q.queue_time_max_ms,
  s.bytes_spilled_local,
  s.bytes_spilled_remote,
  sc.bytes_scanned,
  e.by_error,
  u.credits_used,
  c.concurrent_queries_max,
  c.concurrent_queries_avg
FROM periods p
LEFT JOIN query_volume_agg qv ON qv.period_start = p.period_start
LEFT JOIN latency l ON l.period_start = p.period_start
LEFT JOIN queue q ON q.period_start = p.period_start
LEFT JOIN spillage s ON s.period_start = p.period_start
LEFT JOIN scanned sc ON sc.period_start = p.period_start
LEFT JOIN errors_agg e ON e.period_start = p.period_start
LEFT JOIN usage u ON u.period_start = p.period_start
LEFT JOIN concurrency c ON c.period_start = p.period_start
ORDER BY p.period_start
```

Also update the file's top comment block to document the new params usage is unaffected (no new `@` params needed — reuses `@warehouse_name`, `@start_date`, `@end_date`).

- [ ] **Step 4: Add the new fields to `WarehouseAnalysisPoint`**

In `src/lib/types.ts`, inside the `WarehouseAnalysisPoint` interface (currently `src/lib/types.ts:127-146`), add after `credits_used: number`:

```ts
  concurrent_queries_max: number
  concurrent_queries_avg: number
```

- [ ] **Step 5: Thread the fields through the API route**

In `src/app/api/kwo-snowflake-warehouse-analysis/timeseries/route.ts`, add to the `WarehouseAnalysisRow` interface (after line 27, `credits_used: number | null`):

```ts
  concurrent_queries_max: number | null
  concurrent_queries_avg: number | null
```

In the `points` mapping (after line 133, `credits_used: Number(row?.credits_used ?? 0),`), add:

```ts
        concurrent_queries_max: Number(row?.concurrent_queries_max ?? 0),
        concurrent_queries_avg: Number(row?.concurrent_queries_avg ?? 0),
```

- [ ] **Step 6: Update the existing frontend test fixture so the type-check still passes**

In `src/components/charts/__tests__/WarehouseAnalysisCharts.test.tsx`, add to the `points` fixture object (after line 45, `credits_used: 3.5,`):

```ts
    concurrent_queries_max: 5,
    concurrent_queries_avg: 2.1,
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/app/api/kwo-snowflake-warehouse-analysis/timeseries/__tests__/route.test.ts src/components/charts/__tests__/WarehouseAnalysisCharts.test.tsx`
Expected: PASS (all tests)

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add sql/kwo_snowflake_warehouse_analysis_timeseries.sql src/lib/types.ts src/app/api/kwo-snowflake-warehouse-analysis/timeseries/route.ts src/app/api/kwo-snowflake-warehouse-analysis/timeseries/__tests__/route.test.ts src/components/charts/__tests__/WarehouseAnalysisCharts.test.tsx
git commit -m "feat: compute Query Concurrency (max/avg) via sweep-line SQL, thread through API"
```

---

### Task 3: Query Concurrency chart (frontend)

**Files:**
- Modify: `src/components/charts/WarehouseAnalysisCharts.tsx`
- Modify: `src/components/charts/__tests__/WarehouseAnalysisCharts.test.tsx`

**Interfaces:**
- Consumes: `WarehouseAnalysisPoint.concurrent_queries_max` and `.concurrent_queries_avg` (added in Task 2).
- Produces: nothing new consumed elsewhere — this is the last piece of the feature.

- [ ] **Step 1: Write the failing test**

Add to `src/components/charts/__tests__/WarehouseAnalysisCharts.test.tsx`, inside `describe('WarehouseAnalysisCharts', ...)`:

```tsx
  it('renders the Query Concurrency chart with max/avg totals', () => {
    render(
      <WarehouseAnalysisCharts
        points={points}
        histogramBuckets={histogramBuckets}
        dataScannedHistogramBuckets={dataScannedHistogramBuckets}
        spillageHistogramBuckets={spillageHistogramBuckets}
      />
    )
    expect(screen.getByText('Query Concurrency')).toBeInTheDocument()
    expect(screen.getByText('Max Concurrent')).toBeInTheDocument()
    // points fixture: concurrent_queries_max 5
    expect(screen.getByText('5.00')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/charts/__tests__/WarehouseAnalysisCharts.test.tsx -t "Query Concurrency"`
Expected: FAIL — `Unable to find an element with the text: Query Concurrency`

- [ ] **Step 3: Implement the chart**

In `src/components/charts/WarehouseAnalysisCharts.tsx`, add a new `useMemo` after `executionData` (after line 249):

```tsx
  const concurrencyData = useMemo(
    () =>
      points.map((p) => ({
        period_label_display: p.period_label_display,
        max: p.concurrent_queries_max,
        avg: p.concurrent_queries_avg,
      })),
    [points]
  )
```

Add `queryConcurrency: true` to the `SHOW_METRIC` object.

Add a totals `useMemo` next to `totalsExecution` (after line 290):

```tsx
  const totalsConcurrency = useMemo(() => {
    if (concurrencyData.length === 0) return [{ label: 'Max Concurrent', value: formatDecimalNumber(0) }]
    const max = Math.max(...concurrencyData.map((d) => d.max))
    return [{ label: 'Max Concurrent', value: formatDecimalNumber(max) }]
  }, [concurrencyData])
```

Add the `ChartWrapper` in the JSX immediately after the "Total Queries" block and before "Execution Time" (after the "Total Queries" `ChartWrapper` added by Task 1's placement, before the "Execution Time" `ChartWrapper`):

```tsx
      <ChartWrapper
        title="Query Concurrency"
        isLight={isLight}
        totals={SHOW_METRIC.queryConcurrency ? totalsConcurrency : undefined}
        loading={loading}
      >
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={concurrencyData}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="period_label_display" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatDecimalNumber(v)} />
            <Tooltip content={<SeriesTooltip isLight={isLight} formatter={formatDecimalNumber} reverse />} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} wrapperStyle={legendStyle} />
            <Line type="monotone" dataKey="max" name="Max Concurrent" stroke={C_NAVY} strokeWidth={2} {...getAreaDotProps(C_NAVY, isLight)} connectNulls />
            <Line type="monotone" dataKey="avg" name="Avg Concurrent" stroke={C_DEEP} strokeWidth={2} {...getAreaDotProps(C_DEEP, isLight)} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartWrapper>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/charts/__tests__/WarehouseAnalysisCharts.test.tsx`
Expected: PASS (all tests in the file)

- [ ] **Step 5: Full verification**

Run: `npx vitest run`
Expected: PASS (entire suite)

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npm run lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/components/charts/WarehouseAnalysisCharts.tsx src/components/charts/__tests__/WarehouseAnalysisCharts.test.tsx
git commit -m "feat: add Query Concurrency chart to Snowflake Warehouse Analysis"
```

---

## Manual verification (after all tasks)

- [ ] Run `npm run dev`, open the Snowflake Warehouse Analysis page for a warehouse with real query data.
- [ ] Confirm chart order: Warehouse Usage → Cost per 1000 Queries → Total Queries → Query Concurrency → Execution Time → ...
- [ ] Confirm "Cost per 1000 Queries" values look sane relative to Warehouse Usage/Total Queries for the same periods.
- [ ] Confirm "Query Concurrency" max line is never below the avg line for the same period, and both are 0 in periods with no queries.
- [ ] Switch between hour/day granularity and confirm both new charts re-render without errors.
