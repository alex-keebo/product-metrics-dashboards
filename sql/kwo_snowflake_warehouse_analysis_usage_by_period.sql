-- kwo_snowflake_warehouse_analysis_usage_by_period.sql
--
-- Parameters:
--   @warehouse_names ARRAY<STRING>  (empty array = all warehouses, no filter applied)
--   @start_date STRING  (yyyy-MM-dd HH:mm:ss, inclusive lower bound, UTC — parsed via TIMESTAMP())
--   @end_date STRING    (yyyy-MM-dd HH:mm:ss, inclusive upper bound, UTC — parsed via TIMESTAMP())
--   @period_starts ARRAY<STRING>        (period labels, used only as the group-by key returned to the caller)
--   @period_start_bounds ARRAY<STRING>  (full timestamp lower bound per period, same order as @period_starts)
--   @period_end_bounds ARRAY<STRING>    (full timestamp upper bound per period, same order as @period_starts)
--
-- Table placeholder `k3o_prd_ORGID_000_tf` is rewritten by the API route to the
-- caller's validated org_id before the query runs (dataset name embeds org_id,
-- so it cannot be passed as a query parameter).
--
-- Deliberately reads only warehouse_metering_history_tf (no query_history_view_tf join,
-- no window functions) so it stays cheap when @warehouse_names spans an entire org's
-- warehouses — unlike kwo_snowflake_warehouse_analysis_timeseries.sql, which is scoped
-- for single/few-warehouse deep-dives and runs OOM sort operations for its concurrency/
-- percentile CTEs when passed a whole org's warehouse list.
--
-- Returns: one row per period_start with total credits used, ordered by period_start.

WITH periods AS (
  SELECT
    period_start,
    UNIX_MILLIS(TIMESTAMP(period_start_bound)) AS period_start_ms,
    UNIX_MILLIS(TIMESTAMP(period_end_bound)) AS period_end_ms
  FROM UNNEST(@period_starts) AS period_start WITH OFFSET idx0
  JOIN UNNEST(@period_start_bounds) AS period_start_bound WITH OFFSET idx1 ON idx0 = idx1
  JOIN UNNEST(@period_end_bounds) AS period_end_bound WITH OFFSET idx2 ON idx0 = idx2
)
SELECT
  p.period_start,
  SUM(m.CREDITS_USED_COMPUTE) AS credits_used
FROM periods p
JOIN `keebo-portal.k3o_prd_ORGID_000_tf.warehouse_metering_history_tf` m
  ON m.START_TIME >= p.period_start_ms
 AND m.START_TIME <= p.period_end_ms
WHERE (COALESCE(ARRAY_LENGTH(@warehouse_names), 0) = 0 OR m.WAREHOUSE_NAME IN UNNEST(@warehouse_names))
  AND m.START_TIME >= UNIX_MILLIS(TIMESTAMP(@start_date))
  AND m.START_TIME <= UNIX_MILLIS(TIMESTAMP(@end_date))
GROUP BY p.period_start
ORDER BY p.period_start
