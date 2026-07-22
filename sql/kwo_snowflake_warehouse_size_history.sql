-- kwo_snowflake_warehouse_size_history.sql
--
-- Parameters:
--   @warehouse_name STRING
--   @start_date STRING  (yyyy-MM-dd HH:mm:ss, inclusive lower bound, UTC — parsed via TIMESTAMP())
--   @end_date STRING    (yyyy-MM-dd HH:mm:ss, inclusive upper bound, UTC — parsed via TIMESTAMP())
--
-- Table placeholder `k3o_prd_ORGID_000_tf` is rewritten by the API route to the
-- caller's validated org_id before the query runs.
--
-- warehouse_events_history_tf.SIZE is NULL on every row for every event type
-- (confirmed against live data) — Snowflake never populates it in this
-- ingestion — so it cannot be used to know what size a RESIZE_WAREHOUSE event
-- resized to. query_history_view_tf.warehouse_size is the only populated size
-- signal: it reflects the warehouse size in effect when each query started.
-- This makes the size timeline a derived approximation (only known while
-- queries are running), not an event-sourced fact like the cluster
-- resume/suspend intervals.
--
-- query_history_view_tf.start_time is INT64 epoch milliseconds, not TIMESTAMP
-- (same convention as the histogram queries) — range boundaries are converted
-- via UNIX_MILLIS(TIMESTAMP(...)) and compared against the bare INT64 column.
--
-- Rows are bucketed into 1-minute chunks; when multiple differently-sized
-- queries start within the same chunk (e.g. a resize is in flight), the
-- chunk takes the largest size (MAX(size_rank)) per product request.
--
-- The "prior state" lookback window is bounded to 7 days before @start_date
-- (rather than unbounded full-history, unlike the cluster-events query) to
-- avoid scanning a query_history table that can span years.
--
-- Returns two logical row sets, tagged by event_type, mirroring
-- kwo_snowflake_warehouse_cluster_events.sql's shape:
--   'state_as_of_start' — the single most recent chunk before @start_date,
--                          i.e. the size in effect when the visible range
--                          begins.
--   'in_range'           — chunks between @start_date and @end_date whose
--                           size_rank differs from the immediately preceding
--                           chunk (actual transition points only).

WITH sized AS (
  SELECT
    TIMESTAMP_MILLIS(start_time) AS start_time,
    CASE warehouse_size
      WHEN 'X-Small' THEN 0
      WHEN 'Small' THEN 1
      WHEN 'Medium' THEN 2
      WHEN 'Large' THEN 3
      WHEN 'X-Large' THEN 4
      WHEN '2X-Large' THEN 5
      WHEN '3X-Large' THEN 6
      WHEN '4X-Large' THEN 7
      WHEN '5X-Large' THEN 8
      WHEN '6X-Large' THEN 9
    END AS size_rank
  FROM `keebo-portal.k3o_prd_ORGID_000_tf.query_history_view_tf`
  WHERE warehouse_name = @warehouse_name
    AND warehouse_size IS NOT NULL
    AND start_time >= UNIX_MILLIS(TIMESTAMP_SUB(TIMESTAMP(@start_date), INTERVAL 7 DAY))
    AND start_time <= UNIX_MILLIS(TIMESTAMP(@end_date))
),
chunked AS (
  SELECT
    TIMESTAMP_TRUNC(start_time, MINUTE) AS chunk_ts,
    MAX(size_rank) AS size_rank
  FROM sized
  WHERE size_rank IS NOT NULL
  GROUP BY chunk_ts
),
transitions AS (
  SELECT
    chunk_ts,
    size_rank,
    LAG(size_rank) OVER (ORDER BY chunk_ts) AS prev_rank
  FROM chunked
),
state_as_of_start_ranked AS (
  SELECT
    chunk_ts,
    size_rank,
    ROW_NUMBER() OVER (ORDER BY chunk_ts DESC) AS rn
  FROM chunked
  WHERE chunk_ts < TIMESTAMP(@start_date)
)
SELECT
  'state_as_of_start' AS event_type,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E3S', chunk_ts) AS chunk_ts,
  size_rank
FROM state_as_of_start_ranked
WHERE rn = 1

UNION ALL

SELECT
  'in_range' AS event_type,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E3S', chunk_ts) AS chunk_ts,
  size_rank
FROM transitions
WHERE chunk_ts BETWEEN TIMESTAMP(@start_date) AND TIMESTAMP(@end_date)
  AND (prev_rank IS NULL OR size_rank != prev_rank)

ORDER BY chunk_ts
