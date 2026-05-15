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

WITH resizing_agg AS (
  SELECT
    DATE_TRUNC(DATE(ts), WEEK(SUNDAY)) AS week_start,
    org_id,
    COUNT(*) AS resizing_optimizations
  FROM `keebo-portal.federated_views_tf.alter_size`
  WHERE DATE(ts) BETWEEN @prior_week_start AND @week_end
    AND org_id IN UNNEST(@org_ids)
    AND reason NOT IN ('REINFORCEMENT_LEARNING_FAILOVER', 'CONDITIONAL_UPSIZING', 'CHANGE_DETECTED', 'RL_PAUSED')
  GROUP BY 1, 2
),
auto_stop_agg AS (
  SELECT
    DATE_TRUNC(DATE(ts), WEEK(SUNDAY)) AS week_start,
    org_id,
    COUNT(*) AS auto_stop_optimizations
  FROM `keebo-portal.federated_views_tf.alter_auto_suspend`
  WHERE DATE(ts) BETWEEN @prior_week_start AND @week_end
    AND org_id IN UNNEST(@org_ids)
    AND (state != 'FAILED' OR state IS NULL)
  GROUP BY 1, 2
),
deduped AS (
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
  d.week_start,
  d.org_id,
  SUM(CASE WHEN d.active THEN d.saved_credits  ELSE 0 END) AS savings_dbus,
  SUM(d.actual_credits)                                    AS total_spend_dbus,
  SUM(CASE WHEN NOT d.active THEN d.actual_credits ELSE 0 END) AS paused_spend_dbus,
  SUM(CASE WHEN d.active THEN d.actual_credits ELSE 0 END) AS optimized_actual_dbus,
  COUNT(DISTINCT CASE WHEN d.active THEN d.warehouse_id END) AS warehouses,
  COALESCE(ra.resizing_optimizations, 0)                   AS resizing_optimizations,
  COALESCE(aa.auto_stop_optimizations, 0)                  AS auto_stop_optimizations
FROM deduped d
LEFT JOIN resizing_agg ra ON d.week_start = ra.week_start AND d.org_id = ra.org_id
LEFT JOIN auto_stop_agg aa ON d.week_start = aa.week_start AND d.org_id = aa.org_id
WHERE d.rn = 1
GROUP BY d.week_start, d.org_id, ra.resizing_optimizations, aa.auto_stop_optimizations
ORDER BY d.week_start, d.org_id
