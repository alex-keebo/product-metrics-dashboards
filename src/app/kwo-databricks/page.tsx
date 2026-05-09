'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardFilters } from '@/components/filters/DashboardFilters'
import { KPITile } from '@/components/kpis/KPITile'
import { TimeSeriesCharts } from '@/components/charts/TimeSeriesCharts'
import { DataTable, Column } from '@/components/tables/DataTable'
import { ContractType, Granularity, KPIRow, SnapshotKPIWithDelta, TimeSeriesPoint } from '@/lib/types'
import { defaultTimeSeriesRange, toDateString, formatCompactDateRange } from '@/lib/dates'
import { cn } from '@/lib/utils'

const ALL_CONTRACT_TYPES: ContractType[] = ['consumption', 'subscription', 'trial', 'churn', 'lost_trial']

type Tab = 'snapshot' | 'timeseries'

interface SnapshotResponse {
  kpis: SnapshotKPIWithDelta
  customer_rows: KPIRow[]
  data_as_of: string
  week_start: string
  week_end: string
  prior_week_start: string
  prior_week_end: string
  available_customers: { org_id: string; name: string }[]
}

interface TimeSeriesResponse {
  points: TimeSeriesPoint[]
  data_as_of: string
  available_customers: { org_id: string; name: string }[]
  all_periods: { period_start: string; period_label_display: string }[]
  query_volume_by_period: { period_start: string; query_count: number }[]
}

const fmt1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmt2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function formatDbu(v: unknown): string { return fmt1.format(Number(v)) }
function formatPct(v: unknown): string { return `${fmt1.format(Number(v))}%` }
function formatInt(v: unknown): string { return fmt1.format(Number(v)) }

function formatDbu2(v: unknown): string { return fmt2.format(Number(v)) }
function formatPct2(v: unknown): string { return `${fmt2.format(Number(v))}%` }
function formatInt2(v: unknown): string { return fmt2.format(Number(v)) }

const SNAPSHOT_COLUMNS: Column<Record<string, unknown>>[] = [
  { key: 'name', label: 'Customer' },
  { key: 'contract_type', label: 'Contract Type' },
  { key: 'savings_dbus', label: 'Savings (DBUs)', format: formatDbu, align: 'right' },
  { key: 'savings_pct', label: 'Savings (%)', format: formatPct, align: 'right' },
  { key: 'warehouses', label: 'Warehouses (#)', format: formatInt, align: 'right' },
  { key: 'unoptimized_spend_dbus', label: 'Unoptimized Spend (DBUs)', format: formatDbu, align: 'right' },
  { key: 'total_spend_dbus', label: 'Total Spend (DBUs)', format: formatDbu, align: 'right' },
]

const TIMESERIES_COLUMNS: Column<Record<string, unknown>>[] = [
  { key: 'period_label', label: 'Period' },
  { key: 'name', label: 'Customer' },
  { key: 'contract_type', label: 'Contract Type' },
  { key: 'savings_dbus', label: 'Savings (DBUs)', format: formatDbu2, align: 'right' },
  { key: 'savings_pct', label: 'Savings (%)', format: formatPct2, align: 'right' },
  { key: 'warehouses', label: 'Warehouses (#)', format: formatInt2, align: 'right' },
  { key: 'unoptimized_spend_dbus', label: 'Unoptimized Spend (DBUs)', format: formatDbu2, align: 'right' },
  { key: 'total_spend_dbus', label: 'Total Spend (DBUs)', format: formatDbu2, align: 'right' },
]

function SectionError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      Failed to load: {message}
    </div>
  )
}

function SectionLoader() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 border-2 border-border border-t-foreground/40 rounded-full animate-spin" />
        Loading…
      </div>
    </div>
  )
}

export default function KWODatabricksPage() {
  const [tab, setTab] = useState<Tab>('snapshot')

  // Global filters
  const [contractTypes, setContractTypes] = useState<ContractType[]>(ALL_CONTRACT_TYPES)
  // null = all customers (default); [] = user explicitly deselected all
  const [selectedOrgIds, setSelectedOrgIds] = useState<string[] | null>(null)
  const [granularity, setGranularity] = useState<Granularity>('week')

  // Date range (time series only; initialized to ~13 complete weeks)
  const [startDate, setStartDate] = useState<string>(() => toDateString(defaultTimeSeriesRange().start))
  const [endDate, setEndDate] = useState<string>(() => toDateString(defaultTimeSeriesRange().end))

  // Snapshot state
  const [snapshot, setSnapshot] = useState<SnapshotResponse | null>(null)
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)

  // Time series state
  const [timeseries, setTimeseries] = useState<TimeSeriesResponse | null>(null)
  const [tsLoading, setTsLoading] = useState(false)
  const [tsError, setTsError] = useState<string | null>(null)

  // Available customers derived from contract type selection
  const [availableCustomers, setAvailableCustomers] = useState<{ org_id: string; name: string }[]>([])

  const buildParams = useCallback(() => {
    const params = new URLSearchParams()
    if (contractTypes.length) params.set('contract_types', contractTypes.join(','))
    if (selectedOrgIds !== null && selectedOrgIds.length > 0) params.set('org_ids', selectedOrgIds.join(','))
    return params
  }, [contractTypes, selectedOrgIds])

  const fetchSnapshot = useCallback(async () => {
    if (selectedOrgIds !== null && selectedOrgIds.length === 0) {
      setSnapshot(null)
      return
    }
    setSnapshotLoading(true)
    setSnapshotError(null)
    try {
      const res = await fetch(`/api/kwo-databricks/snapshot?${buildParams()}`)
      if (!res.ok) throw new Error(await res.text())
      setSnapshot(await res.json())
    } catch (e) {
      setSnapshotError(String(e))
    } finally {
      setSnapshotLoading(false)
    }
  }, [buildParams, selectedOrgIds])

  const fetchTimeSeries = useCallback(async () => {
    if (selectedOrgIds !== null && selectedOrgIds.length === 0) {
      setTimeseries(null)
      return
    }
    setTsLoading(true)
    setTsError(null)
    try {
      const params = buildParams()
      params.set('granularity', granularity)
      params.set('start', startDate)
      params.set('end', endDate)
      const res = await fetch(`/api/kwo-databricks/timeseries?${params}`)
      if (!res.ok) throw new Error(await res.text())
      setTimeseries(await res.json())
    } catch (e) {
      setTsError(String(e))
    } finally {
      setTsLoading(false)
    }
  }, [buildParams, selectedOrgIds, granularity, startDate, endDate])

  // Available customers come from the API's contract-type universe, not the
  // filtered result rows — so picking individual customers doesn't shrink the list.
  useEffect(() => {
    if (snapshot?.available_customers) setAvailableCustomers(snapshot.available_customers)
  }, [snapshot?.available_customers])
  useEffect(() => {
    if (timeseries?.available_customers) setAvailableCustomers(timeseries.available_customers)
  }, [timeseries?.available_customers])

  // Fetch on filter change
  useEffect(() => { fetchSnapshot() }, [fetchSnapshot])
  useEffect(() => { if (tab === 'timeseries') fetchTimeSeries() }, [tab, fetchTimeSeries])

  const dataAsOf = snapshot?.data_as_of ?? timeseries?.data_as_of
  const noCustomers = selectedOrgIds !== null && selectedOrgIds.length === 0

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground font-heading">KWO for Databricks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Keebo Warehouse Optimization — Databricks</p>
        </div>
        {dataAsOf && (
          <div className="text-xs text-muted-foreground mt-1">Data as of {dataAsOf}</div>
        )}
      </div>

      {/* Global Filters */}
      <DashboardFilters
        contractTypes={contractTypes}
        onContractTypesChange={(v) => { setContractTypes(v); setSelectedOrgIds(null) }}
        availableCustomers={availableCustomers}
        selectedOrgIds={selectedOrgIds}
        onOrgIdsChange={setSelectedOrgIds}
        granularity={granularity}
        onGranularityChange={setGranularity}
        showGranularity={tab === 'timeseries'}
        startDate={startDate}
        endDate={endDate}
        onRangeChange={(s, e) => { setStartDate(s); setEndDate(e) }}
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(['snapshot', 'timeseries'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t === 'snapshot' ? 'Weekly Snapshot' : 'Time Series'}
          </button>
        ))}
      </div>

      {/* Weekly Snapshot */}
      {tab === 'snapshot' && (
        <div className="flex flex-col gap-6">
          {noCustomers ? (
            <>
              <div className="relative">
                <div className="invisible grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="rounded-[15px] p-[30px] min-h-[178px]" />
                  ))}
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm text-muted-foreground">No customers selected</span>
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-foreground/80 mb-3">Customer Breakdown</div>
                <DataTable columns={SNAPSHOT_COLUMNS} rows={[]} defaultSortKey="savings_dbus" csvFilename="kwo_databricks_snapshot.csv" />
              </div>
            </>
          ) : (
            <>
              {snapshotLoading && <SectionLoader />}
              {snapshotError && <SectionError message={snapshotError} />}
              {!snapshotLoading && !snapshotError && snapshot && (
                <>
                  {snapshot.week_start && (
                    <div className="text-xs text-muted-foreground">
                      {formatCompactDateRange(snapshot.week_start, snapshot.week_end)} vs {formatCompactDateRange(snapshot.prior_week_start, snapshot.prior_week_end)}
                    </div>
                  )}

                  {snapshot.kpis ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <KPITile label="Savings" unit="DBUs" value={snapshot.kpis.savings_dbus} delta={snapshot.kpis.delta_savings_dbus} format="dbu" higherIsBetter={true} />
                      <KPITile label="Savings" unit="%" value={snapshot.kpis.savings_pct} delta={snapshot.kpis.delta_savings_pct} format="pct" higherIsBetter={true} />
                      <KPITile label="Avg Savings Across Customers" unit="%" value={snapshot.kpis.avg_savings_pct} delta={snapshot.kpis.delta_avg_savings_pct} format="pct" higherIsBetter={true} />
                      <KPITile label="Warehouses" unit="Count" value={snapshot.kpis.warehouses} delta={snapshot.kpis.delta_warehouses} format="dbu" higherIsBetter={true} />
                      <KPITile label="Unoptimized Spend" unit="DBUs" value={snapshot.kpis.unoptimized_spend_dbus} delta={snapshot.kpis.delta_unoptimized_spend_dbus} format="dbu" higherIsBetter={false} />
                      <KPITile label="Total Spend" unit="DBUs" value={snapshot.kpis.total_spend_dbus} delta={snapshot.kpis.delta_total_spend_dbus} format="dbu" higherIsBetter={false} />
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground py-4">No data for the selected filters</div>
                  )}

                  <div>
                    <div className="text-sm font-medium text-foreground/80 mb-3">Customer Breakdown</div>
                    <DataTable
                      columns={SNAPSHOT_COLUMNS}
                      rows={(snapshot.customer_rows ?? []) as unknown as Record<string, unknown>[]}
                      defaultSortKey="savings_dbus"
                      csvFilename="kwo_databricks_snapshot.csv"
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Time Series */}
      {tab === 'timeseries' && (
        <div className="flex flex-col gap-6">
          {noCustomers ? (
            <>
              <div className="relative">
                <div className="invisible">
                  <TimeSeriesCharts points={[]} />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm text-muted-foreground">No customers selected</span>
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-foreground/80 mb-3">Data Table</div>
                <DataTable columns={TIMESERIES_COLUMNS} rows={[]} defaultSortKey="period_start" csvFilename="kwo_databricks_timeseries.csv" />
              </div>
            </>
          ) : (
            <>
              {tsLoading && <SectionLoader />}
              {tsError && <SectionError message={tsError} />}
              {!tsLoading && !tsError && timeseries && (
                <>
                  <TimeSeriesCharts points={timeseries.points} allPeriods={timeseries.all_periods} queryVolume={timeseries.query_volume_by_period} />
                  <div>
                    <div className="text-sm font-medium text-foreground/80 mb-3">Data Table</div>
                    <DataTable
                      columns={TIMESERIES_COLUMNS}
                      rows={timeseries.points as unknown as Record<string, unknown>[]}
                      defaultSortKey="period_start"
                      csvFilename="kwo_databricks_timeseries.csv"
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
