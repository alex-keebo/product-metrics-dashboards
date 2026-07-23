-- kwo_snowflake_warehouse_analysis_spend_by_warehouse.sql
--
-- Parameters:
--   @warehouse_names ARRAY<STRING>  (empty array = all warehouses, no filter applied)
--   @start_date STRING  (yyyy-MM-dd HH:mm:ss, inclusive lower bound, UTC — parsed via TIMESTAMP())
--   @end_date STRING    (yyyy-MM-dd HH:mm:ss, inclusive upper bound, UTC — parsed via TIMESTAMP())
--
-- Table placeholder `k3o_prd_ORGID_000_tf` is rewritten by the API route to the
-- caller's validated org_id before the query runs (dataset name embeds org_id,
-- so it cannot be passed as a query parameter).
--
-- START_TIME is INT64 epoch milliseconds, compared directly via UNIX_MILLIS(TIMESTAMP(...)).
--
-- Returns: one row per warehouse with total credits used in the date range,
-- ordered by credits_used descending.

SELECT
  m.WAREHOUSE_NAME AS warehouse_name,
  SUM(m.CREDITS_USED_COMPUTE) AS credits_used
FROM `keebo-portal.k3o_prd_ORGID_000_tf.warehouse_metering_history_tf` m
WHERE m.START_TIME >= UNIX_MILLIS(TIMESTAMP(@start_date))
  AND m.START_TIME <= UNIX_MILLIS(TIMESTAMP(@end_date))
  AND (COALESCE(ARRAY_LENGTH(@warehouse_names), 0) = 0 OR m.WAREHOUSE_NAME IN UNNEST(@warehouse_names))
GROUP BY m.WAREHOUSE_NAME
ORDER BY credits_used DESC
