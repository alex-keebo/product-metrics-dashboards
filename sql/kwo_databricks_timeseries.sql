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
--
-- Warehouses registered in connected_warehouse_versions with is_deleted = false
-- on a given day are included. Warehouses with no version history at all are
-- also included (e.g. newly onboarded customers whose registration events have
-- not yet propagated). Warehouses explicitly marked is_deleted = true are excluded.

WITH deduped_versions AS (
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
  sh.date,
  sh.org_id,
  sh.warehouse_id,
  sh.actual_dbus,
  sh.saved_dbus,
  sh.active
FROM `keebo-portal.k3o_dbx_gold_tf.savings_history_tf` sh
LEFT JOIN version_ranges vr
  ON  sh.warehouse_id    = vr.warehouse_id
  AND sh.org_id          = vr.org_id
  AND sh.date           >= vr.valid_from_date
  AND sh.date            < vr.valid_to_date
WHERE (vr.is_deleted = false OR vr.warehouse_id IS NULL)
  AND sh.date BETWEEN @start_date AND @end_date
  AND sh.org_id IN UNNEST(@org_ids)
ORDER BY sh.date, sh.org_id
