-- kwo_snowflake_warehouse_analysis_timeseries.sql
--
-- Parameters:
--   @warehouse_name STRING
--   @start_date STRING  (yyyy-MM-dd HH:mm:ss, inclusive lower bound, UTC — parsed via TIMESTAMP())
--   @end_date STRING    (yyyy-MM-dd HH:mm:ss, inclusive upper bound, UTC — parsed via TIMESTAMP())
--   @period_starts ARRAY<STRING>        (period labels, used only as the group-by key returned to the caller)
--   @period_start_bounds ARRAY<STRING>  (full timestamp lower bound per period, same order as @period_starts)
--   @period_end_bounds ARRAY<STRING>    (full timestamp upper bound per period, same order as @period_starts)
--
-- Table placeholder `k3o_prd_ORGID_000_tf` is rewritten by the API route to the
-- caller's validated org_id before the query runs (dataset name embeds org_id,
-- so it cannot be passed as a query parameter).
--
-- query_history_view_tf.start_time is INT64 epoch milliseconds, not a TIMESTAMP
-- column. Period/range boundaries are converted to epoch millis via
-- UNIX_MILLIS(TIMESTAMP(...)) and compared directly against the bare INT64
-- column — this keeps start_time unwrapped on both sides of the comparison
-- so any partition/cluster pruning on that column still applies.
--
-- Returns: one row per period_start, left-joined across all metric CTEs so
-- periods with no matching queries still appear with zero/empty aggregates.

WITH periods AS (
  SELECT
    period_start,
    UNIX_MILLIS(TIMESTAMP(period_start_bound)) AS period_start_ms,
    UNIX_MILLIS(TIMESTAMP(period_end_bound)) AS period_end_ms
  FROM UNNEST(@period_starts) AS period_start WITH OFFSET idx0
  JOIN UNNEST(@period_start_bounds) AS period_start_bound WITH OFFSET idx1 ON idx0 = idx1
  JOIN UNNEST(@period_end_bounds) AS period_end_bound WITH OFFSET idx2 ON idx0 = idx2
),
base AS (
  SELECT
    q.query_type,
    q.execution_time,
    (IFNULL(q.queued_provisioning_time, 0) + IFNULL(q.queued_repair_time, 0) + IFNULL(q.queued_overload_time, 0)) AS queue_time,
    q.bytes_spilled_to_local_storage,
    q.bytes_spilled_to_remote_storage,
    q.bytes_scanned,
    q.execution_status,
    q.error_code,
    p.period_start
  FROM `keebo-portal.k3o_prd_ORGID_000_tf.query_history_view_tf` q
  JOIN periods p
    ON q.start_time >= p.period_start_ms
   AND q.start_time <= p.period_end_ms
  WHERE q.warehouse_name = @warehouse_name
    AND q.start_time >= UNIX_MILLIS(TIMESTAMP(@start_date))
    AND q.start_time <= UNIX_MILLIS(TIMESTAMP(@end_date))
    {{FILTER_CLAUSE}}
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
    APPROX_QUANTILES(queue_time, 100)[OFFSET(99)] AS queue_time_p99_ms,
    MAX(queue_time) AS queue_time_max_ms
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
scanned AS (
  SELECT
    period_start,
    SUM(IFNULL(bytes_scanned, 0)) AS bytes_scanned
  FROM base
  GROUP BY period_start
),
errors_raw AS (
  SELECT period_start, error_code, COUNT(*) AS error_count
  FROM base
  WHERE execution_status = 'FAIL'
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
),
usage AS (
  SELECT p.period_start, SUM(m.CREDITS_USED_COMPUTE) AS credits_used
  FROM `keebo-portal.k3o_prd_ORGID_000_tf.warehouse_metering_history_tf` m
  JOIN periods p
    ON m.START_TIME >= p.period_start_ms
   AND m.START_TIME <= p.period_end_ms
  WHERE m.WAREHOUSE_NAME = @warehouse_name
    AND m.START_TIME >= UNIX_MILLIS(TIMESTAMP(@start_date))
    AND m.START_TIME <= UNIX_MILLIS(TIMESTAMP(@end_date))
  GROUP BY p.period_start
),
-- Unfiltered execution_time total per period across ALL queries (no {{FILTER_CLAUSE}}).
-- This is the reconciliation denominator: with no custom filter applied, filtered_exec
-- below equals this total exactly, so the allocated credits_used sums to the real
-- warehouse_metering_history_tf total for the range.
period_exec_totals AS (
  SELECT p.period_start, SUM(IFNULL(q.execution_time, 0)) AS total_execution_time_ms
  FROM `keebo-portal.k3o_prd_ORGID_000_tf.query_history_view_tf` q
  JOIN periods p
    ON q.start_time >= p.period_start_ms
   AND q.start_time <= p.period_end_ms
  WHERE q.warehouse_name = @warehouse_name
    AND q.start_time >= UNIX_MILLIS(TIMESTAMP(@start_date))
    AND q.start_time <= UNIX_MILLIS(TIMESTAMP(@end_date))
  GROUP BY p.period_start
),
-- Filtered execution_time total per period (respects {{FILTER_CLAUSE}} via `base`), used
-- as the numerator share for allocating each period's credits down to the filtered queries.
filtered_exec AS (
  SELECT period_start, SUM(IFNULL(execution_time, 0)) AS filtered_execution_time_ms
  FROM base
  GROUP BY period_start
),
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
    {{FILTER_CLAUSE}}
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
  SAFE_DIVIDE(u.credits_used * fe.filtered_execution_time_ms, pet.total_execution_time_ms) AS credits_used,
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
LEFT JOIN period_exec_totals pet ON pet.period_start = p.period_start
LEFT JOIN filtered_exec fe ON fe.period_start = p.period_start
LEFT JOIN concurrency c ON c.period_start = p.period_start
ORDER BY p.period_start
