import { createHistogramRouteHandler } from '@/lib/histogramRoute'

export const POST = createHistogramRouteHandler(
  'kwo_snowflake_warehouse_latency_histogram.sql',
  'snf-warehouse-latency-histogram'
)
