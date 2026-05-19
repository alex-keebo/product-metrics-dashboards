-- KWO for Databricks: Snapshot KPIs for an arbitrary date range
--
-- Parameters:
--   @start   DATE          Start of the period (inclusive)
--   @end     DATE          End of the period (inclusive)
--   @org_ids ARRAY<STRING> List of org_ids to include
--
-- Returns one row per org_id aggregated across the full date range.
-- Avg Across Customers (%) is computed in application code as an unweighted mean
-- of per-org Savings (%), excluding orgs with no active=true rows in the period.
--
-- Only warehouses registered in connected_warehouse_versions on a given day are
-- included (most recent event with valid_from <= date has is_deleted = false).
-- Warehouses present in savings_history_tf but never registered are excluded.

WITH resizing_agg AS (
  SELECT
    org_id,
    COUNT(*) AS resizing_optimizations
  FROM `keebo-portal.k3o_dbx_silver_tf.warehouse_resizing_events_tf`
  WHERE DATE(publish_time) BETWEEN @start AND @end
    AND org_id IN UNNEST(@org_ids)
  GROUP BY 1
),
auto_stop_agg AS (
  SELECT
    org_id,
    COUNT(*) AS auto_stop_optimizations
  FROM `keebo-portal.k3o_dbx_silver_tf.warehouse_auto_stop_events_tf`
  WHERE DATE(publish_time) BETWEEN @start AND @end
    AND org_id IN UNNEST(@org_ids)
  GROUP BY 1
),
deduped_versions AS (
  -- One row per (warehouse_id, calendar date): keep the latest event on each date.
  SELECT
    org_id,
    warehouse_id,
    is_deleted,
    DATE(valid_from) AS valid_from_date,
    ROW_NUMBER() OVER (
      PARTITION BY warehouse_id, DATE(valid_from)
      ORDER BY valid_from DESC
    ) AS rn
  FROM `keebo-portal.k3o_dbx_gold_tf.connected_warehouse_versions`
  WHERE org_id IN UNNEST(@org_ids)
),
version_ranges AS (
  -- Derive valid_to as the next event's date (exclusive upper bound).
  SELECT
    org_id,
    warehouse_id,
    is_deleted,
    valid_from_date,
    COALESCE(
      LEAD(valid_from_date) OVER (PARTITION BY warehouse_id ORDER BY valid_from_date),
      DATE('9999-12-31')
    ) AS valid_to_date
  FROM deduped_versions
  WHERE rn = 1
)

SELECT
  sh.org_id,
  SUM(CASE WHEN sh.active THEN sh.saved_dbus ELSE 0 END)       AS savings_dbus,
  SUM(sh.actual_dbus)                                          AS total_spend_dbus,
  SUM(CASE WHEN NOT sh.active THEN sh.actual_dbus ELSE 0 END)  AS paused_spend_dbus,
  SUM(CASE WHEN sh.active THEN sh.actual_dbus ELSE 0 END)      AS optimized_actual_dbus,
  COUNT(DISTINCT CASE WHEN sh.active THEN sh.warehouse_id END) AS warehouses,
  COALESCE(ra.resizing_optimizations, 0)                       AS resizing_optimizations,
  COALESCE(aa.auto_stop_optimizations, 0)                      AS auto_stop_optimizations
FROM `keebo-portal.k3o_dbx_gold_tf.savings_history_tf` sh
JOIN version_ranges vr
  ON  sh.warehouse_id    = vr.warehouse_id
  AND sh.org_id          = vr.org_id
  AND sh.date           >= vr.valid_from_date
  AND sh.date            < vr.valid_to_date
LEFT JOIN resizing_agg ra  ON sh.org_id = ra.org_id
LEFT JOIN auto_stop_agg aa ON sh.org_id = aa.org_id
WHERE vr.is_deleted = false
  AND sh.date BETWEEN @start AND @end
  AND sh.org_id IN UNNEST(@org_ids)
GROUP BY sh.org_id, ra.resizing_optimizations, aa.auto_stop_optimizations
ORDER BY sh.org_id
