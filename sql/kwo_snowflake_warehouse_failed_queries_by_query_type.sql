-- kwo_snowflake_warehouse_failed_queries_by_query_type.sql
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
-- Count of failed queries (execution_status = 'FAIL') per query_type across
-- the full requested date range. Ranking/top-10+Other collapsing happens in
-- the API route.

SELECT
  query_type,
  COUNT(*) AS metric_value
FROM `keebo-portal.k3o_prd_ORGID_000_tf.query_history_view_tf`
WHERE warehouse_name IN UNNEST(@warehouse_names)
  AND start_time >= UNIX_MILLIS(TIMESTAMP(@start_date))
  AND start_time <= UNIX_MILLIS(TIMESTAMP(@end_date))
  AND execution_status = 'FAIL'
  {{FILTER_CLAUSE}}
GROUP BY query_type
ORDER BY metric_value DESC
