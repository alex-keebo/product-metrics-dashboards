'use client'

import { useState, useEffect, useCallback } from 'react'
import { subDays, parseISO, format } from 'date-fns'
import { DateRangePicker } from '@/components/filters/DateRangePicker'
import { MultiSelect } from '@/components/filters/MultiSelect'
import { KPITile } from '@/components/kpis/KPITile'
import { DataTable, Column } from '@/components/tables/DataTable'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

type UserType = 'external' | 'internal' | 'all'

interface KPIValue {
  current: number
  previous: number
  delta: number
}

interface KPIsResponse {
  total_customers: KPIValue
  avg_daily_customers: KPIValue
  total_users: KPIValue
  avg_daily_users: KPIValue
  period: { start: string; end: string }
  prev_period: { start: string; end: string }
}

interface ModuleRow {
  module_slug: string
  module_name: string
  count: number
  prev_count: number
  delta: number
}

interface ActiveCustomerRow {
  name: string
  pageviews: number
  prev_pageviews: number
  delta: number
  active_days: number
  modules: string
}

interface ActiveUserRow {
  display_name: string
  user_id: string
  pageviews: number
  prev_pageviews: number
  delta: number
  active_days: number
  modules: string
}

interface TablesResponse {
  customers_per_module: ModuleRow[]
  users_per_module: ModuleRow[]
  most_active_customers: ActiveCustomerRow[]
  most_active_users: ActiveUserRow[]
  period: { start: string; end: string }
  prev_period: { start: string; end: string }
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MODULE_OPTIONS = [
  { value: 'databricks-warehouse-optimization', label: 'KWO for Databricks' },
  { value: 'warehouse-optimization', label: 'KWO for Snowflake' },
  { value: 'workload-iq', label: 'KWI for Snowflake' },
]
const ALL_MODULE_SLUGS = MODULE_OPTIONS.map((m) => m.value)

const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
const sevenDaysAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd')

// ─── Column definitions ───────────────────────────────────────────────────────

const fmtInt = (v: unknown) => Number(v).toLocaleString()
const fmtDelta = (v: unknown) => {
  const n = Number(v)
  return n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString()
}

const MODULE_COLS: Column<Record<string, unknown>>[] = [
  { key: 'module_name', label: 'Module' },
  { key: 'count', label: 'Count', format: fmtInt, align: 'right' },
  { key: 'delta', label: 'Δ vs Prev Period', format: fmtDelta, align: 'right' },
]

const CUSTOMER_COLS: Column<Record<string, unknown>>[] = [
  { key: 'name', label: 'Customer' },
  { key: 'pageviews', label: 'Pageviews', format: fmtInt, align: 'right' },
  { key: 'delta', label: 'Δ vs Prev Period', format: fmtDelta, align: 'right' },
  { key: 'active_days', label: 'Active Days', format: fmtInt, align: 'right' },
  { key: 'modules', label: 'Modules Used' },
]

const USER_COLS: Column<Record<string, unknown>>[] = [
  { key: 'display_name', label: 'User' },
  { key: 'pageviews', label: 'Pageviews', format: fmtInt, align: 'right' },
  { key: 'delta', label: 'Δ vs Prev Period', format: fmtDelta, align: 'right' },
  { key: 'active_days', label: 'Active Days', format: fmtInt, align: 'right' },
  { key: 'modules', label: 'Modules Used' },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function SectionError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      Failed to load: {message}
    </div>
  )
}

function UserTypeToggle({ value, onChange }: { value: UserType; onChange: (v: UserType) => void }) {
  const options: { value: UserType; label: string }[] = [
    { value: 'external', label: 'External' },
    { value: 'internal', label: 'Internal' },
    { value: 'all', label: 'All' },
  ]
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground font-medium">Users</label>
      <div className="flex rounded border border-border overflow-hidden text-sm">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'px-3 py-1.5 transition-colors',
              value === opt.value
                ? 'bg-[#F5F5F5] text-primary font-semibold dark:bg-secondary dark:text-secondary-foreground'
                : 'bg-card text-foreground hover:bg-secondary'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PlatformUsagePage() {
  const [startDate, setStartDate] = useState(sevenDaysAgo)
  const [endDate, setEndDate] = useState(yesterday)
  const [selectedModules, setSelectedModules] = useState<string[]>(ALL_MODULE_SLUGS)
  const [userType, setUserType] = useState<UserType>('external')

  const [kpis, setKpis] = useState<KPIsResponse | null>(null)
  const [kpisLoading, setKpisLoading] = useState(false)
  const [kpisError, setKpisError] = useState<string | null>(null)

  const [tables, setTables] = useState<TablesResponse | null>(null)
  const [tablesLoading, setTablesLoading] = useState(false)
  const [tablesError, setTablesError] = useState<string | null>(null)

  const buildParams = useCallback(() => {
    const p = new URLSearchParams()
    p.set('start', startDate)
    p.set('end', endDate)
    p.set('modules', (selectedModules.length ? selectedModules : ALL_MODULE_SLUGS).join(','))
    p.set('user_type', userType)
    return p
  }, [startDate, endDate, selectedModules, userType])

  const fetchKpis = useCallback(async () => {
    setKpisLoading(true)
    setKpisError(null)
    try {
      const res = await fetch(`/api/platform-usage/kpis?${buildParams()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Unknown error')
      setKpis(data)
    } catch (e) {
      setKpisError(e instanceof Error ? e.message : String(e))
    } finally {
      setKpisLoading(false)
    }
  }, [buildParams])

  const fetchTables = useCallback(async () => {
    setTablesLoading(true)
    setTablesError(null)
    try {
      const res = await fetch(`/api/platform-usage/tables?${buildParams()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Unknown error')
      setTables(data)
    } catch (e) {
      setTablesError(e instanceof Error ? e.message : String(e))
    } finally {
      setTablesLoading(false)
    }
  }, [buildParams])

  useEffect(() => {
    fetchKpis()
    fetchTables()
  }, [fetchKpis, fetchTables])

  // Build a human-readable label for the previous period
  const periodLabel = kpis
    ? `vs ${format(parseISO(kpis.prev_period.start), 'MMM d')} – ${format(parseISO(kpis.prev_period.end), 'MMM d')}`
    : 'vs previous period'

  return (
    <div className="flex flex-col gap-8 p-8">
      {/* Page title */}
      <h1 className="text-2xl font-heading font-semibold text-foreground">Platform Usage</h1>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onRangeChange={(s, e) => { setStartDate(s); setEndDate(e) }}
        />
        <MultiSelect
          label="Module"
          options={MODULE_OPTIONS}
          selected={selectedModules}
          onChange={setSelectedModules}
        />
        <UserTypeToggle value={userType} onChange={setUserType} />
      </div>

      {/* KPI cards */}
      {kpisLoading ? (
        <SectionLoader />
      ) : kpisError ? (
        <SectionError message={kpisError} />
      ) : kpis ? (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KPITile
            label="Total Active Customers"
            unit="customers"
            value={kpis.total_customers.current}
            delta={kpis.total_customers.delta}
            format="count"
            higherIsBetter={true}
            periodLabel={periodLabel}
          />
          <KPITile
            label="Avg Daily Active Customers"
            unit="customers / day"
            value={kpis.avg_daily_customers.current}
            delta={kpis.avg_daily_customers.delta}
            format="count"
            higherIsBetter={true}
            periodLabel={periodLabel}
            decimals={1}
          />
          <KPITile
            label="Total Active Users"
            unit="users"
            value={kpis.total_users.current}
            delta={kpis.total_users.delta}
            format="count"
            higherIsBetter={true}
            periodLabel={periodLabel}
          />
          <KPITile
            label="Avg Daily Active Users"
            unit="users / day"
            value={kpis.avg_daily_users.current}
            delta={kpis.avg_daily_users.delta}
            format="count"
            higherIsBetter={true}
            periodLabel={periodLabel}
            decimals={1}
          />
        </div>
      ) : null}

      {/* Per-module tables */}
      {tablesLoading ? (
        <SectionLoader />
      ) : tablesError ? (
        <SectionError message={tablesError} />
      ) : tables ? (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="flex flex-col gap-3">
              <h2 className="text-base font-heading font-semibold text-foreground">
                Active Customers Per Module
              </h2>
              <DataTable
                columns={MODULE_COLS}
                rows={tables.customers_per_module as unknown as Record<string, unknown>[]}
                defaultSortKey="count"
                defaultSortDir="desc"
                csvFilename="active-customers-per-module.csv"
              />
            </div>
            <div className="flex flex-col gap-3">
              <h2 className="text-base font-heading font-semibold text-foreground">
                Active Users Per Module
              </h2>
              <DataTable
                columns={MODULE_COLS}
                rows={tables.users_per_module as unknown as Record<string, unknown>[]}
                defaultSortKey="count"
                defaultSortDir="desc"
                csvFilename="active-users-per-module.csv"
              />
            </div>
          </div>

          {/* Most active tables */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="flex flex-col gap-3">
              <h2 className="text-base font-heading font-semibold text-foreground">
                Most Active Customers
              </h2>
              <DataTable
                columns={CUSTOMER_COLS}
                rows={tables.most_active_customers as unknown as Record<string, unknown>[]}
                defaultSortKey="pageviews"
                defaultSortDir="desc"
                csvFilename="most-active-customers.csv"
              />
            </div>
            <div className="flex flex-col gap-3">
              <h2 className="text-base font-heading font-semibold text-foreground">
                Most Active Users
              </h2>
              <DataTable
                columns={USER_COLS}
                rows={tables.most_active_users as unknown as Record<string, unknown>[]}
                defaultSortKey="pageviews"
                defaultSortDir="desc"
                csvFilename="most-active-users.csv"
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
