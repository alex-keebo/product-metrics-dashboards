import { createQueryTypeMetricRouteHandler } from '@/lib/queryTypeMetricRoute'

export const POST = createQueryTypeMetricRouteHandler(
  'kwo_snowflake_warehouse_execution_time_by_query_type.sql',
  'snf-warehouse-execution-time-by-query-type'
)
