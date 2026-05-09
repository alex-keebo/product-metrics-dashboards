-- KWO for Databricks: Time Series KPIs
--
-- Parameters:
--   @start_date  DATE          Start of the date range (inclusive, snapped to period boundary by caller)
--   @end_date    DATE          End of the date range (inclusive, snapped to period boundary by caller)
--   @org_ids     ARRAY<STRING> List of org_ids to include
--   @granularity STRING        One of: 'day' | 'week' | 'month' | 'rolling7'
--
-- Grouping by period is handled in application code after fetching daily rows,
-- because rolling-7 intervals and partial-period snapping require date arithmetic
-- that is cleaner in TypeScript than parameterised SQL.
--
-- Returns one row per org_id per day. The application layer aggregates into
-- the requested granularity buckets.

SELECT
  date,
  org_id,
  warehouse_id,
  actual_dbus,
  saved_dbus,
  active
FROM `keebo-portal.k3o_dbx_gold_tf.savings_history_tf`
WHERE
  date BETWEEN @start_date AND @end_date
  AND org_id IN UNNEST(@org_ids)
ORDER BY date, org_id
