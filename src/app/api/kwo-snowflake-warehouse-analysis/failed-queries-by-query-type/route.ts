import { createQueryTypeMetricRouteHandler } from '@/lib/queryTypeMetricRoute'

export const POST = createQueryTypeMetricRouteHandler(
  'kwo_snowflake_warehouse_failed_queries_by_query_type.sql',
  'snf-warehouse-failed-queries-by-query-type'
)
