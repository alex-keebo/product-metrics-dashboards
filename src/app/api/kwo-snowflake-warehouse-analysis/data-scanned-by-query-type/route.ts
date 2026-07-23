import { createQueryTypeMetricRouteHandler } from '@/lib/queryTypeMetricRoute'

export const POST = createQueryTypeMetricRouteHandler(
  'kwo_snowflake_warehouse_data_scanned_by_query_type.sql',
  'snf-warehouse-data-scanned-by-query-type'
)
