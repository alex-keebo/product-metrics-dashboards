export type ContractType = 'trial' | 'lost_trial' | 'subscription' | 'consumption' | 'churn' | 'internal'

export type Module = 'kwo-databricks' | 'kwo-snowflake' | 'kwi-snowflake'

export type Granularity = 'day' | 'week' | 'month' | 'rolling7' | 'hour'

export interface Customer {
  org_id: string
  name: string
  module: Module
  valid_from: string   // YYYY-MM-DD
  valid_to: string | null
  contract_type: ContractType
  source?: string
}

export interface CustomerPeriod {
  org_id: string
  name: string
  contract_type: ContractType
  period_start: string
  period_end: string
}

export interface KPIRow {
  org_id: string
  name: string
  contract_type: ContractType
  savings_dbus: number
  savings_pct: number
  total_spend_dbus: number
  paused_spend_dbus: number
  warehouses: number
  resizing_optimizations: number
  auto_stop_optimizations: number
}

export interface KPISnapshot {
  current: KPIRow[]
  prior: KPIRow[]
  data_as_of: string
}

export interface TimeSeriesPoint {
  period_label: string         // ISO format — used by data table
  period_label_display: string // compact human-readable — used by charts
  period_start: string
  period_end: string
  org_id: string
  name: string
  contract_type: ContractType
  savings_dbus: number
  savings_pct: number
  total_spend_dbus: number
  paused_spend_dbus: number
  warehouses: number
  query_volume: number
  auto_stop_events: number
  resizing_events: number
}

export interface TimeSeriesRangeTotals {
  savings_dbus: number
  savings_pct: number
  total_spend_dbus: number
  paused_spend_dbus: number
  warehouses: number
  query_volume: number
  auto_stop_events: number
  resizing_events: number
}

export interface TimeSeriesResponse {
  points: TimeSeriesPoint[]
  data_as_of: string
  range_totals: TimeSeriesRangeTotals
}

export interface AggregatedKPIs {
  savings_dbus: number
  savings_pct: number
  avg_savings_pct: number
  total_spend_dbus: number
  paused_spend_dbus: number
  warehouses: number
  resizing_optimizations: number
  auto_stop_optimizations: number
}

export interface SnapshotKPIWithDelta extends AggregatedKPIs {
  delta_savings_dbus: number | null
  delta_savings_pct: number | null
  delta_avg_savings_pct: number | null
  delta_total_spend_dbus: number | null
  delta_paused_spend_dbus: number | null
  delta_warehouses: number | null
  delta_resizing_optimizations: number | null
  delta_auto_stop_optimizations: number | null
  abs_delta_savings_dbus: number
  abs_delta_savings_pct: number
  abs_delta_avg_savings_pct: number
  abs_delta_total_spend_dbus: number
  abs_delta_paused_spend_dbus: number
  abs_delta_warehouses: number
  abs_delta_resizing_optimizations: number
  abs_delta_auto_stop_optimizations: number
}

export interface ClusterInterval {
  cluster_number: number
  start: string
  end: string
  truncated_start: boolean
  truncated_end: boolean
}

export interface ClusterActivityResponse {
  intervals: ClusterInterval[]
}

export interface WarehouseOption {
  warehouse_id: string
  warehouse_name: string
}

export interface WarehouseAnalysisPoint {
  period_label: string
  period_label_display: string
  period_start: string
  period_end: string
  query_volume_by_type: Record<string, number>
  execution_time_avg_ms: number
  execution_time_p95_ms: number
  execution_time_p99_ms: number
  queued_query_count: number
  queue_time_avg_ms: number
  queue_time_p95_ms: number
  queue_time_p99_ms: number
  bytes_spilled_local: number
  bytes_spilled_remote: number
  failed_query_count_by_error: Record<string, number>
}

export interface WarehouseAnalysisResponse {
  granularity_used: Granularity
  points: WarehouseAnalysisPoint[]
}
