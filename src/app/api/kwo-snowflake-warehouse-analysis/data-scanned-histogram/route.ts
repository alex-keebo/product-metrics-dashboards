import { createHistogramRouteHandler } from '@/lib/histogramRoute'

export const POST = createHistogramRouteHandler(
  'kwo_snowflake_warehouse_data_scanned_histogram.sql',
  'snf-warehouse-data-scanned-histogram'
)
