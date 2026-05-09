SELECT
  DATE(publish_time) AS date,
  org_id,
  COUNT(*) AS event_count
FROM `keebo-portal.k3o_dbx_silver_tf.warehouse_resizing_events_tf`
WHERE
  DATE(publish_time) BETWEEN @start_date AND @end_date
  AND org_id IN UNNEST(@org_ids)
GROUP BY date, org_id
ORDER BY date, org_id
