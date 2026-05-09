-- KWO for Databricks: Weekly Snapshot KPIs
--
-- Parameters:
--   @week_start      DATE  Start of the target week (Sunday)
--   @week_end        DATE  End of the target week (Saturday)
--   @prior_week_start DATE Start of the prior week (Sunday)
--   @prior_week_end   DATE End of the prior week (Saturday)
--   @org_ids         ARRAY<STRING>  List of org_ids to include
--
-- Returns one row per org_id per week (current + prior) with all KPI components.
-- Avg Across Customers (%) is computed in application code as an unweighted mean
-- of per-org Savings (%), excluding orgs with no active=true rows in the period.

SELECT
  DATE_TRUNC(date, WEEK(SUNDAY))                             AS week_start,
  org_id,
  SUM(CASE WHEN active THEN saved_dbus ELSE 0 END)           AS savings_dbus,
  SUM(actual_dbus)                                           AS total_spend_dbus,
  SUM(CASE WHEN NOT active THEN actual_dbus ELSE 0 END)      AS unoptimized_spend_dbus,
  SUM(CASE WHEN active THEN actual_dbus ELSE 0 END)          AS optimized_actual_dbus,
  COUNT(DISTINCT CASE WHEN active THEN warehouse_id END)     AS warehouses
FROM `keebo-portal.k3o_dbx_gold_tf.savings_history_tf`
WHERE
  date BETWEEN @prior_week_start AND @week_end
  AND org_id IN UNNEST(@org_ids)
GROUP BY 1, 2
ORDER BY 1, 2
