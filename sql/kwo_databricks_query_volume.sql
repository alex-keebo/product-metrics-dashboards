SELECT
  date,
  org_id,
  COUNT(*) AS query_count
FROM `keebo-portal.k3o_dbx_bronze_tf.query_history_tf`
WHERE
  date BETWEEN @start_date AND @end_date
  AND org_id IN UNNEST(@org_ids)
GROUP BY date, org_id
ORDER BY date, org_id
