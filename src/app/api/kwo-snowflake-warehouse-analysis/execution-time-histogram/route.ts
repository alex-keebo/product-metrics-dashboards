import { createHistogramRouteHandler } from '@/lib/histogramRoute'

export const GET = createHistogramRouteHandler(
  'kwo_snowflake_warehouse_execution_time_histogram.sql',
  'snf-warehouse-execution-time-histogram'
)
