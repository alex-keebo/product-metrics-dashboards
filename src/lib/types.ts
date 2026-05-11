export type ContractType = 'trial' | 'lost_trial' | 'subscription' | 'consumption' | 'churn'

export type Module = 'kwo-databricks' | 'kwo-snowflake' | 'kwi-snowflake'

export type Granularity = 'day' | 'week' | 'month' | 'rolling7'

export interface Customer {
  org_id: string
  name: string
  module: Module
  valid_from: string   // YYYY-MM-DD
  valid_to: string | null
  contract_type: ContractType
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

export interface TimeSeriesResponse {
  points: TimeSeriesPoint[]
  data_as_of: string
}

export interface AggregatedKPIs {
  savings_dbus: number
  savings_pct: number
  avg_savings_pct: number
  total_spend_dbus: number
  paused_spend_dbus: number
  warehouses: number
}

export interface SnapshotKPIWithDelta extends AggregatedKPIs {
  delta_savings_dbus: number
  delta_savings_pct: number
  delta_avg_savings_pct: number
  delta_total_spend_dbus: number
  delta_paused_spend_dbus: number
  delta_warehouses: number
}
