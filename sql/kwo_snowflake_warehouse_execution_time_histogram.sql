-- kwo_snowflake_warehouse_execution_time_histogram.sql
--
-- Parameters:
--   @warehouse_name STRING
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
-- Buckets execution_time (ms) into fixed ranges across the full requested
-- date range (no per-period grouping). Returns one row per non-empty bucket.

WITH base AS (
  SELECT execution_time
  FROM `keebo-portal.k3o_prd_ORGID_000_tf.query_history_view_tf`
  WHERE warehouse_name = @warehouse_name
    AND start_time >= UNIX_MILLIS(TIMESTAMP(@start_date))
    AND start_time <= UNIX_MILLIS(TIMESTAMP(@end_date))
    {{FILTER_CLAUSE}}
),
bucketed AS (
  SELECT
    CASE
      WHEN execution_time < 1000 THEN '<1s'
      WHEN execution_time < 5000 THEN '1-5s'
      WHEN execution_time < 10000 THEN '5-10s'
      WHEN execution_time < 30000 THEN '10-30s'
      WHEN execution_time < 60000 THEN '30-60s'
      WHEN execution_time < 300000 THEN '1-5min'
      WHEN execution_time < 600000 THEN '5-10min'
      ELSE '>10min'
    END AS bucket_label,
    CASE
      WHEN execution_time < 1000 THEN 0
      WHEN execution_time < 5000 THEN 1
      WHEN execution_time < 10000 THEN 2
      WHEN execution_time < 30000 THEN 3
      WHEN execution_time < 60000 THEN 4
      WHEN execution_time < 300000 THEN 5
      WHEN execution_time < 600000 THEN 6
      ELSE 7
    END AS bucket_order
  FROM base
)
SELECT bucket_label, bucket_order, COUNT(*) AS query_count
FROM bucketed
GROUP BY bucket_label, bucket_order
ORDER BY bucket_order
