-- KWO for Snowflake: Time Series KPIs (daily rows)
--
-- Parameters:
--   @start_date DATE          Start of the date range (inclusive)
--   @end_date   DATE          End of the date range (inclusive)
--   @org_ids    ARRAY<STRING> List of org_ids to include
--
-- Returns one row per (date, org_id). Active/inactive metrics are pre-split
-- so the route does not need to filter by warehouse_id.
-- active_warehouses = peak distinct active warehouse count on that day.
-- Grouping into periods is done in application code.

SELECT
  date,
  org_id,
  SUM(CASE WHEN active THEN actual_credits ELSE 0 END)     AS active_actual_dbus,
  SUM(CASE WHEN active THEN saved_credits  ELSE 0 END)     AS saved_dbus,
  SUM(CASE WHEN NOT active THEN actual_credits ELSE 0 END) AS paused_actual_dbus,
  COUNT(DISTINCT CASE WHEN active THEN warehouse_id END)   AS active_warehouses
FROM (
  SELECT
    DATE(ts_hour)                             AS date,
    org_id,
    warehouse_id,
    (credits_used_compute + credits_used_cloud_services)
                                              AS actual_credits,
    GREATEST(cost_estimated - cost_actual, 0) AS saved_credits,
    (keebo_state = 'WITH_KEEBO')              AS active,
    ROW_NUMBER() OVER (
      PARTITION BY warehouse_id, ts_hour
      ORDER BY begin DESC
    )                                         AS rn
  FROM `keebo-portal.federated_views_tf.sql_estimated_costs`
  WHERE org_id IN UNNEST(@org_ids)
    AND ts_hour >= TIMESTAMP(@start_date)
    AND ts_hour <  TIMESTAMP_ADD(TIMESTAMP(@end_date), INTERVAL 1 DAY)
)
WHERE rn = 1
GROUP BY date, org_id
ORDER BY date, org_id
