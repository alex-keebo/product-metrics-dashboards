-- kwo_snowflake_warehouse_spillage_histogram.sql
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
-- Buckets total spilled bytes (local + remote) into fixed GB ranges across the
-- full requested date range (no per-period grouping). Returns one row per
-- non-empty bucket. Queries with zero spillage get their own bucket since
-- spillage is expected to be zero for the majority of queries.

WITH base AS (
  SELECT
    IFNULL(bytes_spilled_to_local_storage, 0) + IFNULL(bytes_spilled_to_remote_storage, 0) AS bytes_spilled
  FROM `keebo-portal.k3o_prd_ORGID_000_tf.query_history_view_tf`
  WHERE warehouse_name = @warehouse_name
    AND start_time >= UNIX_MILLIS(TIMESTAMP(@start_date))
    AND start_time <= UNIX_MILLIS(TIMESTAMP(@end_date))
),
bucketed AS (
  SELECT
    CASE
      WHEN bytes_spilled = 0 THEN 'No Spillage'
      WHEN bytes_spilled < 1000000000 THEN '<1 GB'
      WHEN bytes_spilled < 10000000000 THEN '1-10 GB'
      WHEN bytes_spilled < 50000000000 THEN '10-50 GB'
      WHEN bytes_spilled < 100000000000 THEN '50-100 GB'
      ELSE '>100 GB'
    END AS bucket_label,
    CASE
      WHEN bytes_spilled = 0 THEN 0
      WHEN bytes_spilled < 1000000000 THEN 1
      WHEN bytes_spilled < 10000000000 THEN 2
      WHEN bytes_spilled < 50000000000 THEN 3
      WHEN bytes_spilled < 100000000000 THEN 4
      ELSE 5
    END AS bucket_order
  FROM base
)
SELECT bucket_label, bucket_order, COUNT(*) AS query_count
FROM bucketed
GROUP BY bucket_label, bucket_order
ORDER BY bucket_order
