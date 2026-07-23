import { createQueryTypeMetricRouteHandler } from '@/lib/queryTypeMetricRoute'

export const POST = createQueryTypeMetricRouteHandler(
  'kwo_snowflake_warehouse_spillage_by_query_type.sql',
  'snf-warehouse-spillage-by-query-type'
)
