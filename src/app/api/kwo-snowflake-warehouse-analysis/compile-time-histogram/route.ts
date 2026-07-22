import { createHistogramRouteHandler } from '@/lib/histogramRoute'

export const GET = createHistogramRouteHandler(
  'kwo_snowflake_warehouse_compile_time_histogram.sql',
  'snf-warehouse-compile-time-histogram'
)
