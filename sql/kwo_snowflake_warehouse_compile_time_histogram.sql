-- kwo_snowflake_warehouse_compile_time_histogram.sql
--
-- Parameters:
--   @warehouse_names ARRAY<STRING>
--   @start_date STRING  (yyyy-MM-dd HH:mm:ss, inclusive lower bound, UTC — parsed via TIMESTAMP())
--   @end_date STRING    (yyyy-MM-dd HH:mm:ss, inclusive upper bound, UTC — parsed via TIMESTAMP())
--
-- Table placeholder `k3o_prd_ORGID_000_tf` is rewritten by the API route to the
-- caller's validated org_id before the query runs (dataset name embeds org_id,
-- so it cannot be passed as a query parameter).
--
-- query_history_view_tf.start_time is INT64 epoch milliseconds, not a TIMESTAMP
-- column. Range boundaries are converted to epoch millis via
-- UNIX_MILLIS(TIMESTAMP(...)) and compared directly against the bare INT64
-- column — this keeps start_time unwrapped so any partition/cluster pruning
-- on that column still applies.
--
-- Buckets compilation_time (ms) into fixed ranges across the full requested
-- date range (no per-period grouping). Returns one row per non-empty bucket.
-- Compile time is typically sub-second, so buckets are much finer-grained
-- than the execution-time histogram.

WITH base AS (
  SELECT compilation_time
  FROM `keebo-portal.k3o_prd_ORGID_000_tf.query_history_view_tf`
  WHERE warehouse_name IN UNNEST(@warehouse_names)
    AND start_time >= UNIX_MILLIS(TIMESTAMP(@start_date))
    AND start_time <= UNIX_MILLIS(TIMESTAMP(@end_date))
    {{FILTER_CLAUSE}}
),
bucketed AS (
  SELECT
    CASE
      WHEN compilation_time < 100 THEN '<100ms'
      WHEN compilation_time < 250 THEN '100-250ms'
      WHEN compilation_time < 500 THEN '250-500ms'
      WHEN compilation_time < 1000 THEN '500ms-1s'
      WHEN compilation_time < 2000 THEN '1-2s'
      WHEN compilation_time < 5000 THEN '2-5s'
      WHEN compilation_time < 10000 THEN '5-10s'
      ELSE '>10s'
    END AS bucket_label,
    CASE
      WHEN compilation_time < 100 THEN 0
      WHEN compilation_time < 250 THEN 1
      WHEN compilation_time < 500 THEN 2
      WHEN compilation_time < 1000 THEN 3
      WHEN compilation_time < 2000 THEN 4
      WHEN compilation_time < 5000 THEN 5
      WHEN compilation_time < 10000 THEN 6
      ELSE 7
    END AS bucket_order
  FROM base
)
SELECT bucket_label, bucket_order, COUNT(*) AS query_count
FROM bucketed
GROUP BY bucket_label, bucket_order
ORDER BY bucket_order
