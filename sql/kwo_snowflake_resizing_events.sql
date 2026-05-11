-- KWO for Snowflake: Resizing optimization events
--
-- Parameters:
--   @start_date DATE          Start of the date range (inclusive)
--   @end_date   DATE          End of the date range (inclusive)
--   @org_ids    ARRAY<STRING> List of org_ids to include
--
-- Counts Keebo-driven resizing events per org per day.
-- Excludes non-optimization reasons.

SELECT
  DATE(ts) AS date,
  org_id,
  COUNT(*)         AS event_count
FROM `keebo-portal.federated_views_tf.alter_size`
WHERE DATE(ts) BETWEEN @start_date AND @end_date
  AND org_id IN UNNEST(@org_ids)
  AND reason NOT IN ('REINFORCEMENT_LEARNING_FAILOVER', 'CONDITIONAL_UPSIZING', 'CHANGE_DETECTED', 'RL_PAUSED')
GROUP BY date, org_id
ORDER BY date, org_id
