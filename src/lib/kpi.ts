import { KPIRow, AggregatedKPIs, SnapshotKPIWithDelta } from './types'

interface RawRow {
  org_id: string
  savings_dbus: number
  total_spend_dbus: number
  paused_spend_dbus: number
  optimized_actual_dbus: number
  warehouses: number
  resizing_optimizations?: number
  auto_stop_optimizations?: number
}

export function computeKPIRows(
  rawRows: RawRow[],
  nameMap: Map<string, string>,
  contractTypeMap: Map<string, string>
): KPIRow[] {
  return rawRows.map((r) => {
    const grossSpend = r.optimized_actual_dbus + r.savings_dbus
    const savings_pct = grossSpend > 0 ? (r.savings_dbus / grossSpend) * 100 : 0
    return {
      org_id: r.org_id,
      name: nameMap.get(r.org_id) ?? 'Unknown',
      contract_type: (contractTypeMap.get(r.org_id) ?? 'consumption') as KPIRow['contract_type'],
      savings_dbus: r.savings_dbus,
      savings_pct,
      total_spend_dbus: r.total_spend_dbus,
      paused_spend_dbus: r.paused_spend_dbus,
      warehouses: r.warehouses,
      resizing_optimizations: r.resizing_optimizations ?? 0,
      auto_stop_optimizations: r.auto_stop_optimizations ?? 0,
    }
  })
}

export function aggregateKPIRows(rows: KPIRow[]): AggregatedKPIs {
  const savings_dbus = rows.reduce((s, r) => s + r.savings_dbus, 0)
  const total_spend_dbus = rows.reduce((s, r) => s + r.total_spend_dbus, 0)
  const paused_spend_dbus = rows.reduce((s, r) => s + r.paused_spend_dbus, 0)
  const warehouses = rows.reduce((s, r) => s + r.warehouses, 0)
  const resizing_optimizations = rows.reduce((s, r) => s + (r.resizing_optimizations ?? 0), 0)
  const auto_stop_optimizations = rows.reduce((s, r) => s + (r.auto_stop_optimizations ?? 0), 0)

  const optimizedRows = rows.filter((r) => r.savings_dbus > 0 || r.warehouses > 0)
  const grossSpend = rows.reduce((s, r) => {
    const gross = r.savings_dbus + (r.total_spend_dbus - r.paused_spend_dbus)
    return s + gross
  }, 0)
  const savings_pct = grossSpend > 0 ? (savings_dbus / grossSpend) * 100 : 0

  const avg_savings_pct =
    optimizedRows.length > 0
      ? optimizedRows.reduce((s, r) => s + r.savings_pct, 0) / optimizedRows.length
      : 0

  return { savings_dbus, savings_pct, avg_savings_pct, total_spend_dbus, paused_spend_dbus, warehouses, resizing_optimizations, auto_stop_optimizations }
}

function pctChange(current: number, prior: number): number | null {
  if (prior === 0) return null
  return ((current - prior) / prior) * 100
}

export function computeDeltas(
  current: AggregatedKPIs,
  prior: AggregatedKPIs
): SnapshotKPIWithDelta {
  return {
    ...current,
    delta_savings_dbus: pctChange(current.savings_dbus, prior.savings_dbus),
    delta_savings_pct: pctChange(current.savings_pct, prior.savings_pct),
    delta_avg_savings_pct: pctChange(current.avg_savings_pct, prior.avg_savings_pct),
    delta_total_spend_dbus: pctChange(current.total_spend_dbus, prior.total_spend_dbus),
    delta_paused_spend_dbus: pctChange(current.paused_spend_dbus, prior.paused_spend_dbus),
    delta_warehouses: pctChange(current.warehouses, prior.warehouses),
    delta_resizing_optimizations: pctChange(current.resizing_optimizations, prior.resizing_optimizations),
    delta_auto_stop_optimizations: pctChange(current.auto_stop_optimizations, prior.auto_stop_optimizations),
    abs_delta_savings_dbus: current.savings_dbus - prior.savings_dbus,
    abs_delta_savings_pct: current.savings_pct - prior.savings_pct,
    abs_delta_avg_savings_pct: current.avg_savings_pct - prior.avg_savings_pct,
    abs_delta_total_spend_dbus: current.total_spend_dbus - prior.total_spend_dbus,
    abs_delta_paused_spend_dbus: current.paused_spend_dbus - prior.paused_spend_dbus,
    abs_delta_warehouses: current.warehouses - prior.warehouses,
    abs_delta_resizing_optimizations: current.resizing_optimizations - prior.resizing_optimizations,
    abs_delta_auto_stop_optimizations: current.auto_stop_optimizations - prior.auto_stop_optimizations,
  }
}
