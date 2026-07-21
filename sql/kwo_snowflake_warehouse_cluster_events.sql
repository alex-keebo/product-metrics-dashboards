-- kwo_snowflake_warehouse_cluster_events.sql
--
-- Parameters:
--   @warehouse_name STRING
--   @start_date STRING  (yyyy-MM-dd HH:mm:ss, inclusive lower bound, UTC — parsed via TIMESTAMP())
--   @end_date STRING    (yyyy-MM-dd HH:mm:ss, inclusive upper bound, UTC — parsed via TIMESTAMP())
--
-- Table placeholder `k3o_prd_ORGID_000_tf` is rewritten by the API route to the
-- caller's validated org_id before the query runs.
--
-- Returns two logical row sets, tagged by event_type:
--   'state_as_of_start' — the single most recent event per cluster_number
--                          before @start_date (rn = 1), used to tell whether
--                          the cluster was already running when the visible
--                          range begins.
--   'in_range'           — every matching event between @start_date and @end_date.
--
-- Only RESUME_CLUSTER / SUSPEND_CLUSTER are used for cluster lifecycle: they
-- always carry the correct cluster_number and are perfectly paired per cluster.
-- SPINUP_CLUSTER / SPINDOWN_CLUSTER are deliberately excluded — they always
-- log with a NULL cluster_number and are not reliably paired (they are a
-- separate, unattributable signal), so coalescing them onto cluster 1 used to
-- inject spurious start/end events into cluster 1's timeline, fragmenting its
-- real resume/suspend interval.
-- Source `timestamp` column is INT64 epoch-milliseconds, not native TIMESTAMP;
-- converted once via TIMESTAMP_MILLIS() in the `events` CTE.
-- event_ts is formatted as a fixed-width ISO string so plain lexical string
-- comparison in TypeScript sorts chronologically without re-parsing dates.
-- event_state = 'STARTED' is the canonical logged row for these event names
-- in this table (COMPLETED is effectively absent for cluster events).
--
-- Warehouse-level resume/suspend events (RESUME_WAREHOUSE / SUSPEND_WAREHOUSE)
-- are tagged with the sentinel cluster_number = -1 (WAREHOUSE_ROW_CLUSTER_NUMBER
-- in src/lib/clusterIntervals.ts) so they flow through the same interval-building
-- logic as cluster events and surface as a distinct "Warehouse" swimlane row.

WITH events AS (
  SELECT
    cluster_number,
    TIMESTAMP_MILLIS(timestamp) AS timestamp,
    CASE
      WHEN event_name = 'RESUME_CLUSTER' THEN TRUE
      WHEN event_name = 'SUSPEND_CLUSTER' THEN FALSE
    END AS is_start
  FROM `keebo-portal.k3o_prd_ORGID_000_tf.warehouse_events_history_tf`
  WHERE warehouse_name = @warehouse_name
    AND event_state = 'STARTED'
    AND event_name IN ('RESUME_CLUSTER', 'SUSPEND_CLUSTER')

  UNION ALL

  SELECT
    -1 AS cluster_number,
    TIMESTAMP_MILLIS(timestamp) AS timestamp,
    CASE
      WHEN event_name = 'RESUME_WAREHOUSE' THEN TRUE
      WHEN event_name = 'SUSPEND_WAREHOUSE' THEN FALSE
    END AS is_start
  FROM `keebo-portal.k3o_prd_ORGID_000_tf.warehouse_events_history_tf`
  WHERE warehouse_name = @warehouse_name
    AND event_state = 'STARTED'
    AND event_name IN ('RESUME_WAREHOUSE', 'SUSPEND_WAREHOUSE')
),
state_as_of_start_ranked AS (
  SELECT
    cluster_number,
    timestamp,
    is_start,
    ROW_NUMBER() OVER (PARTITION BY cluster_number ORDER BY timestamp DESC) AS rn
  FROM events
  WHERE timestamp < TIMESTAMP(@start_date)
),
in_range AS (
  SELECT cluster_number, timestamp, is_start
  FROM events
  WHERE timestamp BETWEEN TIMESTAMP(@start_date) AND TIMESTAMP(@end_date)
)
SELECT
  'state_as_of_start' AS event_type,
  cluster_number,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E3S', timestamp) AS event_ts,
  is_start
FROM state_as_of_start_ranked
WHERE rn = 1

UNION ALL

SELECT
  'in_range' AS event_type,
  cluster_number,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E3S', timestamp) AS event_ts,
  is_start
FROM in_range

ORDER BY cluster_number, event_ts
