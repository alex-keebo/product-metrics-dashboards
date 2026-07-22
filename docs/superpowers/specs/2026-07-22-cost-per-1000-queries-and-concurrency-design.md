# Cost per 1000 Queries + Query Concurrency charts — design

Date: 2026-07-22
Page: `src/app/kwo-snowflake-warehouse-analysis/page.tsx` ("Snowflake Warehouse Analysis")
Component: `src/components/charts/WarehouseAnalysisCharts.tsx`

## Goal

Add two new charts to the Snowflake Warehouse Analysis grid:

1. **Cost per 1000 Queries** — placed immediately after "Warehouse Usage".
2. **Query Concurrency** — placed immediately after "Total Queries".

Both use the existing period-bucketed grid (`grid grid-cols-1 lg:grid-cols-2`), so new order becomes:
Warehouse Usage → **Cost per 1000 Queries** → Total Queries → **Query Concurrency** → Execution Time → ...

## 1. Cost per 1000 Queries

- **Unit:** credits (no `$`-per-credit rate exists anywhere in the app; all cost is tracked in Snowflake credits).
- **Computation:** fully client-side, no SQL/API change. Both `credits_used` and per-period query count already exist on `WarehouseAnalysisPoint`.
  - `cost_per_1000_queries = total_query_count > 0 ? (credits_used / total_query_count) * 1000 : 0`
- **Chart:** `BarChart`, single series, styled identically to "Warehouse Usage" (`C_NAVY` fill, same axis/grid/tooltip/legend conventions). Tooltip/legend label: "Credits / 1000 Queries".
- **Data prep:** new `useMemo` in `WarehouseAnalysisCharts.tsx` alongside `usageData`/`volumeData`.
- **Totals badge:** top-right total = overall `credits_used / total_query_count * 1000` across the full range (not sum of per-period ratios), consistent with how other ratio-based totals would be computed if any existed. Follows `SHOW_METRIC` toggle pattern (add `costPer1000Queries: true`).

## 2. Query Concurrency

- **Definition (from user):** a query's active/"running in a warehouse" window is:
  - `run_start_ms = start_time + compilation_time + queue_time`
    - `queue_time = queued_provisioning_time + queued_repair_time + queued_overload_time` (matches the existing `queue_time` computed in `base` CTE of `kwo_snowflake_warehouse_analysis_timeseries.sql`)
  - `run_end_ms = run_start_ms + execution_time`
  - Concurrency at any instant = count of queries (same warehouse) whose `[run_start_ms, run_end_ms]` windows contain that instant.
- **Metric is an unitless instantaneous count** (how many queries overlap at once), not a queries-per-minute rate. Chart title: **"Query Concurrency"** (not "queries/min").
- **Per period bucket, compute:**
  - `concurrent_queries_max` — the highest concurrent count observed at any instant during the period.
  - `concurrent_queries_avg` — the time-weighted average concurrent count over the period (integral of the concurrency step function over the period, divided by period duration) — a real average, not `query_count / period_length`.

### SQL approach (sweep-line), added to `kwo_snowflake_warehouse_analysis_timeseries.sql`

New CTEs, added alongside the existing `base`/`usage` CTEs, joined into the final `SELECT` like all other metrics:

```
run_windows AS (
  SELECT
    q.start_time + q.compilation_time
      + IFNULL(q.queued_provisioning_time,0) + IFNULL(q.queued_repair_time,0) + IFNULL(q.queued_overload_time,0)
      AS run_start_ms,
    q.start_time + q.compilation_time
      + IFNULL(q.queued_provisioning_time,0) + IFNULL(q.queued_repair_time,0) + IFNULL(q.queued_overload_time,0)
      + q.execution_time AS run_end_ms
  FROM `keebo-portal.k3o_prd_ORGID_000_tf.query_history_view_tf` q
  WHERE q.warehouse_name = @warehouse_name
    -- overlap filter, not start_time-in-range: a query whose run window
    -- starts just before @start_date but extends into the range must
    -- still count toward concurrency in the periods it overlaps.
    q.start_time BETWEEN
      UNIX_MILLIS(TIMESTAMP(@start_date)) - 86400000  -- 24h lookback pad: bound worst-case
      AND UNIX_MILLIS(TIMESTAMP(@end_date))           -- compile+queue+execution skew
),
run_windows_filtered AS (
  SELECT * FROM run_windows
  WHERE run_start_ms <= UNIX_MILLIS(TIMESTAMP(@end_date))
    AND run_end_ms >= UNIX_MILLIS(TIMESTAMP(@start_date))
),
events AS (
  SELECT run_start_ms AS t, 1 AS delta FROM run_windows_filtered
  UNION ALL
  SELECT run_end_ms AS t, -1 AS delta FROM run_windows_filtered
),
sweep AS (
  SELECT
    t,
    SUM(delta) OVER (ORDER BY t, delta ASC) AS running_count,  -- ends processed before starts at same instant
    LEAD(t) OVER (ORDER BY t, delta ASC) AS next_t
  FROM events
),
segments AS (
  SELECT t AS seg_start, next_t AS seg_end, running_count
  FROM sweep
  WHERE next_t IS NOT NULL
),
concurrency_by_period AS (
  SELECT
    p.period_start,
    MAX(s.running_count) AS concurrent_queries_max,
    SUM(s.running_count * (LEAST(s.seg_end, p.period_end_ms) - GREATEST(s.seg_start, p.period_start_ms)))
      / NULLIF(p.period_end_ms - p.period_start_ms, 0) AS concurrent_queries_avg
  FROM periods p
  JOIN segments s
    ON s.seg_start < p.period_end_ms AND s.seg_end > p.period_start_ms  -- overlap
  GROUP BY p.period_start, p.period_end_ms, p.period_start_ms
)
```

- `concurrency_by_period` LEFT JOINed into the final `SELECT` like every other metric CTE; periods with no overlapping queries get `NULL` → coalesced to `0` in the API route (matches existing zero-fill convention).
- Note on tie-break at equal timestamps: ends are applied before starts (`ORDER BY t, delta ASC` puts `-1` before `+1`), so a query ending at the exact millisecond another starts is not counted as briefly overlapping. Minor edge case, doesn't affect correctness at the precision this data is used for.

### API / types

- `src/lib/types.ts`: add `concurrent_queries_max: number` and `concurrent_queries_avg: number` to `WarehouseAnalysisPoint`.
- `src/app/api/kwo-snowflake-warehouse-analysis/timeseries/route.ts`: map the two new columns through like other numeric fields (apply the `Number(...)` BigQuery NUMERIC-wrapper guard from CLAUDE.md Lessons if these come back as `NUMERIC`/wrapper types — `running_count`/`SUM(...)` results should be checked with `bq show` or by inspecting a sample response before assuming plain numbers).

### Chart (frontend)

- `LineChart`, two lines: "Max Concurrent" (`C_NAVY`) and "Avg Concurrent" (`C_DEEP`), same conventions as the existing "Execution Time" chart (`SeriesTooltip`, `connectNulls`, `getAreaDotProps`).
- Y-axis formatted with `formatDecimalNumber` (avg is fractional; max is integer but shares the axis).
- Totals badge: top-right shows overall max across all periods (`SHOW_METRIC.queryConcurrency` toggle).

## Out of scope

- No `$`-cost conversion (credits only).
- No literal per-minute query-start-rate metric (explicitly rejected in favor of concurrent-count).
- No changes to `WarehouseActivityTimeline`/cluster swimlane — this is a separate, query-level concurrency metric, unrelated to cluster count.
