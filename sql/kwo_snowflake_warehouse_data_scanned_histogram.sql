-- kwo_snowflake_warehouse_data_scanned_histogram.sql
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
-- Buckets bytes_scanned (bytes) into fixed GB ranges across the full requested
-- date range (no per-period grouping). Returns one row per non-empty bucket.

WITH base AS (
  SELECT bytes_scanned
  FROM `keebo-portal.k3o_prd_ORGID_000_tf.query_history_view_tf`
  WHERE warehouse_name = @warehouse_name
    AND start_time >= UNIX_MILLIS(TIMESTAMP(@start_date))
    AND start_time <= UNIX_MILLIS(TIMESTAMP(@end_date))
),
bucketed AS (
  SELECT
    CASE
      WHEN bytes_scanned < 1000000000 THEN '<1 GB'
      WHEN bytes_scanned < 10000000000 THEN '1-10 GB'
      WHEN bytes_scanned < 50000000000 THEN '10-50 GB'
      WHEN bytes_scanned < 100000000000 THEN '50-100 GB'
      WHEN bytes_scanned < 500000000000 THEN '100-500 GB'
      WHEN bytes_scanned < 1000000000000 THEN '500 GB-1 TB'
      ELSE '>1 TB'
    END AS bucket_label,
    CASE
      WHEN bytes_scanned < 1000000000 THEN 0
      WHEN bytes_scanned < 10000000000 THEN 1
      WHEN bytes_scanned < 50000000000 THEN 2
      WHEN bytes_scanned < 100000000000 THEN 3
      WHEN bytes_scanned < 500000000000 THEN 4
      WHEN bytes_scanned < 1000000000000 THEN 5
      ELSE 6
    END AS bucket_order
  FROM base
)
SELECT bucket_label, bucket_order, COUNT(*) AS query_count
FROM bucketed
GROUP BY bucket_label, bucket_order
ORDER BY bucket_order
