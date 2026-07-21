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
-- cluster_number IS NULL (single-cluster warehouse) is coalesced to 1.
-- Source `timestamp` column is INT64 epoch-milliseconds, not native TIMESTAMP;
-- converted once via TIMESTAMP_MILLIS() in the `events` CTE.
-- event_ts is formatted as a fixed-width ISO string so plain lexical string
-- comparison in TypeScript sorts chronologically without re-parsing dates.
-- event_state = 'STARTED' is the canonical logged row for these event names
-- in this table (COMPLETED is effectively absent for cluster events).
-- The spindown event name is SPINDOWN_CLUSTER, not MULTICLUSTER_SPINDOWN.

WITH events AS (
  SELECT
    IFNULL(cluster_number, 1) AS cluster_number,
    TIMESTAMP_MILLIS(timestamp) AS timestamp,
    CASE
      WHEN event_name IN ('SPINUP_CLUSTER', 'RESUME_CLUSTER') THEN TRUE
      WHEN event_name IN ('SPINDOWN_CLUSTER', 'SUSPEND_CLUSTER') THEN FALSE
    END AS is_start
  FROM `keebo-portal.k3o_prd_ORGID_000_tf.warehouse_events_history_tf`
  WHERE warehouse_name = @warehouse_name
    AND event_state = 'STARTED'
    AND event_name IN ('SPINUP_CLUSTER', 'RESUME_CLUSTER', 'SPINDOWN_CLUSTER', 'SUSPEND_CLUSTER')
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
