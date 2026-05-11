-- KWO for Snowflake: Time Series KPIs (daily rows)
--
-- Parameters:
--   @start_date DATE          Start of the date range (inclusive)
--   @end_date   DATE          End of the date range (inclusive)
--   @org_ids    ARRAY<STRING> List of org_ids to include
--
-- Returns one row per (date, org_id, warehouse_id) after hourly dedup.
-- Grouping into periods is done in application code.
-- active = keebo_state = 'WITH_KEEBO'

SELECT
  date,
  org_id,
  warehouse_id,
  SUM(actual_credits)   AS actual_dbus,
  SUM(saved_credits)    AS saved_dbus,
  LOGICAL_OR(active)    AS active
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
    AND DATE(ts_hour) BETWEEN @start_date AND @end_date
)
WHERE rn = 1
GROUP BY date, org_id, warehouse_id
ORDER BY date, org_id
