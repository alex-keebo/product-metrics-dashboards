import { createHistogramRouteHandler } from '@/lib/histogramRoute'

export const GET = createHistogramRouteHandler(
  'kwo_snowflake_warehouse_spillage_histogram.sql',
  'snf-warehouse-spillage-histogram'
)
