-- KWO for Snowflake: Weekly Snapshot KPIs
--
-- Parameters:
--   @prior_week_start DATE          Start of the prior week (Sunday)
--   @week_end         DATE          End of the current week (Saturday)
--   @org_ids          ARRAY<STRING> List of org_ids to include
--
-- Returns one row per org_id per week (current + prior) with all KPI components.
-- Deduplicates hourly rows: keeps the latest row per (warehouse_id, ts_hour).
-- active = keebo_state = 'WITH_KEEBO'

WITH deduped AS (
  SELECT
    org_id,
    warehouse_id,
    DATE(ts_hour)                             AS date,
    DATE_TRUNC(DATE(ts_hour), WEEK(SUNDAY))   AS week_start,
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
    AND DATE(ts_hour) BETWEEN @prior_week_start AND @week_end
)

SELECT
  week_start,
  org_id,
  SUM(CASE WHEN active THEN saved_credits  ELSE 0 END) AS savings_dbus,
  SUM(actual_credits)                                  AS total_spend_dbus,
  SUM(CASE WHEN NOT active THEN actual_credits ELSE 0 END) AS paused_spend_dbus,
  SUM(CASE WHEN active THEN actual_credits ELSE 0 END) AS optimized_actual_dbus,
  COUNT(DISTINCT CASE WHEN active THEN warehouse_id END) AS warehouses
FROM deduped
WHERE rn = 1
GROUP BY week_start, org_id
ORDER BY week_start, org_id
