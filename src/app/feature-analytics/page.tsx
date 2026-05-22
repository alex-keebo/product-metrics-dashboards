'use client'

import { useState, useEffect, useCallback } from 'react'
import { subDays, addDays, format, parseISO } from 'date-fns'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
  AreaChart,
  Area,
  ResponsiveContainer,
} from 'recharts'
import { ChartWrapper } from '@/components/charts/TimeSeriesCharts'
import { MODULE_ACTIONS } from '@/lib/feature-action-defs'
import { DateRangePicker } from '@/components/filters/DateRangePicker'
import { useTheme } from '@/components/layout/ThemeProvider'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type Project = 'portal' | 'integration'
type UserType = 'external' | 'internal' | 'all'

interface PageRow {
  page_name: string
  count: number
}

interface VisitedPagesResponse {
  pages: PageRow[]
  period: { start: string; end: string }
}

interface DauDataPoint {
  date: string
  dau: number
}

interface DauSeries {
  page: string
  data: DauDataPoint[]
}

interface PageTrendsResponse {
  series: DauSeries[]
  period: { start: string; end: string }
}

interface ActionDataPoint {
  date: string
  count: number
}

interface ActionSeries {
  key: string
  label: string
  data: ActionDataPoint[]
}

interface ActionTrendsResponse {
  series: ActionSeries[]
  period: { start: string; end: string }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MODULE_DEFS = [
  { slug: 'platform', label: 'Platform', prefix: 'Platform' },
  { slug: 'warehouse-optimization', label: 'KWO for Snowflake', prefix: 'KWO-SF' },
  { slug: 'databricks-warehouse-optimization', label: 'KWO for Databricks', prefix: 'KWO-DBX' },
  { slug: 'workload-iq', label: 'KWI for Snowflake', prefix: 'KWI-SF' },
] as const

type ModuleSlug = (typeof MODULE_DEFS)[number]['slug']
type ActiveTab = 'most-used-features' | ModuleSlug

const TAB_DEFS: { id: ActiveTab; label: string }[] = [
  { id: 'most-used-features', label: 'Most Used Features' },
  { id: 'platform', label: 'Platform' },
  { id: 'warehouse-optimization', label: 'KWO for Snowflake' },
  { id: 'databricks-warehouse-optimization', label: 'KWO for Databricks' },
  { id: 'workload-iq', label: 'KWI for Snowflake' },
]

const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
const sevenDaysAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd')

const LABEL_MAX = 40
const BAR_HEIGHT = 28
const MODULE_BAR_Y_AXIS_WIDTH = 200
const MODULE_BAR_MAX_HEIGHT = 400

// Chart theme constants — mirrors TimeSeriesCharts.tsx
const DARK_GRID = '#0d3344'
const LIGHT_GRID = '#cdd2da'
const DARK_AXIS  = { fill: '#6b7f8a', fontSize: 11, fontFamily: 'IBM Plex Sans', fontWeight: 400 }
const LIGHT_AXIS = { fill: '#4d565a', fontSize: 12, fontFamily: 'IBM Plex Sans', fontWeight: 400 }
const DARK_TOOLTIP = {
  contentStyle: { background: '#04202d', border: '1px solid #1a4459', borderRadius: 8 },
  labelStyle:   { color: '#6b7f8a', fontSize: 11, fontFamily: 'IBM Plex Sans' },
  itemStyle:    { color: '#e8f0f4', fontSize: 12, fontFamily: 'IBM Plex Sans' },
  cursor:       { stroke: '#1a4459', strokeWidth: 1 },
}
const LIGHT_TOOLTIP = {
  contentStyle: { background: '#ffffff', border: '1px solid #cdd2da', borderRadius: 8 },
  labelStyle:   { color: '#4d565a', fontSize: 11, fontFamily: 'IBM Plex Sans' },
  itemStyle:    { color: '#051c27', fontSize: 12, fontFamily: 'IBM Plex Sans' },
  cursor:       { stroke: '#bdd4e0', strokeWidth: 1 },
}
const C_NAVY  = '#2a6985'
const fmtInt  = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripModulePrefix(pageName: string): string {
  const idx = pageName.indexOf(': ')
  return idx >= 0 ? pageName.slice(idx + 2) : pageName
}


function padDateRange(data: DauDataPoint[], start: string, end: string): DauDataPoint[] {
  const map = new Map(data.map((d) => [d.date, d.dau]))
  const result: DauDataPoint[] = []
  let cur = parseISO(start)
  const last = parseISO(end)
  while (cur <= last) {
    const dateStr = format(cur, 'yyyy-MM-dd')
    result.push({ date: dateStr, dau: map.get(dateStr) ?? 0 })
    cur = addDays(cur, 1)
  }
  return result
}

function padActionRange(data: ActionDataPoint[], start: string, end: string): ActionDataPoint[] {
  const map = new Map(data.map((d) => [d.date, d.count]))
  const result: ActionDataPoint[] = []
  let cur = parseISO(start)
  const last = parseISO(end)
  while (cur <= last) {
    const dateStr = format(cur, 'yyyy-MM-dd')
    result.push({ date: dateStr, count: map.get(dateStr) ?? 0 })
    cur = addDays(cur, 1)
  }
  return result
}

// ─── Shared sub-components ────────────────────────────────────────────────────

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

function CardLoader() {
  return (
    <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
      <div className="w-3 h-3 border-2 border-border border-t-foreground/40 rounded-full animate-spin" />
    </div>
  )
}

function ProjectToggle({ value, onChange }: { value: Project; onChange: (v: Project) => void }) {
  const options: { value: Project; label: string }[] = [
    { value: 'portal', label: 'Portal' },
    { value: 'integration', label: 'Integration' },
  ]
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground font-medium">Project</label>
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

// ─── Most Used Features tab (per-module bar charts in 2×2 grid) ───────────────

function ModuleYAxisTick({
  x,
  y,
  payload,
}: {
  x?: number
  y?: number
  payload?: { value: string }
}) {
  if (x == null || y == null || !payload) return null
  const full = payload.value
  const label = full.length > LABEL_MAX ? full.slice(0, LABEL_MAX) + '…' : full
  return (
    <g transform={`translate(${x},${y})`}>
      <title>{full}</title>
      <text x={-6} y={0} dy={4} textAnchor="end" fontSize={11} className="fill-muted-foreground">
        {label}
      </text>
    </g>
  )
}

function ModuleChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: { page_name: string; count: number } }>
}) {
  if (!active || !payload?.length) return null
  const { page_name, count } = payload[0].payload
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-sm shadow-md max-w-xs">
      <p className="font-medium text-foreground mb-1">{page_name}</p>
      <p className="text-muted-foreground">{count.toLocaleString()} pageviews</p>
    </div>
  )
}

function ModulePagesCard({
  label,
  prefix,
  data,
  loading,
  error,
}: {
  label: string
  prefix: string
  data: PageRow[] | null
  loading: boolean
  error: string | null
}) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const cursorFill = isLight ? '#F1F3F5' : '#0d3344'

  const stripped = (data ?? []).map((r) => ({
    page_name: stripModulePrefix(r.page_name),
    count: r.count,
  }))

  const chartHeight = Math.max(stripped.length * BAR_HEIGHT + 20, 80)
  const containerHeight = Math.min(chartHeight, MODULE_BAR_MAX_HEIGHT)
  const scrollable = chartHeight > MODULE_BAR_MAX_HEIGHT

  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-heading font-semibold text-foreground">{label}</h3>
        <span className="text-xs text-muted-foreground font-mono">{prefix}</span>
      </div>
      {loading ? (
        <CardLoader />
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : stripped.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No data in selected period</p>
      ) : (
        <div style={{ height: containerHeight, overflowY: scrollable ? 'auto' : 'visible' }}>
          <BarChart
            width={undefined as unknown as number}
            height={chartHeight}
            data={stripped}
            layout="vertical"
            margin={{ top: 4, right: 48, bottom: 4, left: MODULE_BAR_Y_AXIS_WIDTH }}
            style={{ width: '100%' }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
            <XAxis
              type="number"
              tickFormatter={(v) => v.toLocaleString()}
              tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
              axisLine={false}
              tickLine={false}
              domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.2)]}
            />
            <YAxis
              type="category"
              dataKey="page_name"
              width={MODULE_BAR_Y_AXIS_WIDTH}
              tick={ModuleYAxisTick as unknown as React.ReactElement}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <Tooltip content={<ModuleChartTooltip />} cursor={{ fill: cursorFill }} />
            <Bar dataKey="count" radius={[0, 3, 3, 0]} maxBarSize={18}>
              {stripped.map((_, i) => (
                <Cell key={i} fill="#2a6985" />
              ))}
              <LabelList
                dataKey="count"
                position="right"
                formatter={(v: unknown) => Number(v).toLocaleString()}
                style={{ fontSize: 10, fill: '#4a6373' }}
              />
            </Bar>
          </BarChart>
        </div>
      )}
    </div>
  )
}

function MostUsedFeaturesTab({
  modulePages,
  loading,
  error,
}: {
  modulePages: Record<string, PageRow[] | null>
  loading: boolean
  error: string | null
}) {
  if (error) return <SectionError message={error} />
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {MODULE_DEFS.map((m) => (
        <ModulePagesCard
          key={m.slug}
          label={m.label}
          prefix={m.prefix}
          data={modulePages[m.slug] ?? null}
          loading={loading}
          error={null}
        />
      ))}
    </div>
  )
}

// ─── Per-product DAU tab ──────────────────────────────────────────────────────

function PageDauCard({ series, start, end }: { series: DauSeries; start: string; end: string }) {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const title = stripModulePrefix(series.page)
  const padded = padDateRange(series.data, start, end)
  const gradientId = `dau-fill-${series.page.replace(/[^a-zA-Z0-9]/g, '-')}`

  const GRID = isLight ? LIGHT_GRID : DARK_GRID
  const AXIS = isLight ? LIGHT_AXIS : DARK_AXIS
  const TT   = isLight ? LIGHT_TOOLTIP : DARK_TOOLTIP

  const dot = isLight
    ? { fill: C_NAVY, stroke: C_NAVY, strokeWidth: 2, r: 4 }
    : { fill: C_NAVY, stroke: C_NAVY, strokeWidth: 0, r: 4 }
  const activeDot = isLight
    ? { fill: '#daeaf4', stroke: C_NAVY, strokeWidth: 2, r: 6 }
    : { fill: C_NAVY, stroke: C_NAVY, strokeWidth: 0, r: 6 }

  return (
    <ChartWrapper title={title} isLight={isLight}>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={padded} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C_NAVY} stopOpacity={isLight ? 1 : 0.35} />
              <stop offset="100%" stopColor={C_NAVY} stopOpacity={isLight ? 0.4 : 0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="date"
            tick={AXIS}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => { try { return format(parseISO(v), 'M/d') } catch { return v } }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={AXIS}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            tickFormatter={(v) => fmtInt.format(v)}
          />
          <Tooltip
            {...TT}
            labelFormatter={(v) => { try { return format(parseISO(String(v)), 'MMM d, yyyy') } catch { return v } }}
            formatter={(v) => [fmtInt.format(Number(v)), 'DAU']}
          />
          <Area
            type="monotone"
            dataKey="dau"
            stroke={C_NAVY}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={dot}
            activeDot={activeDot}
            connectNulls={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartWrapper>
  )
}

function ActionTrendCard({ series, start, end }: { series: ActionSeries; start: string; end: string }) {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const padded = padActionRange(series.data, start, end)
  const gradientId = `action-fill-${series.key.replace(/[^a-zA-Z0-9]/g, '-')}`

  const GRID = isLight ? LIGHT_GRID : DARK_GRID
  const AXIS = isLight ? LIGHT_AXIS : DARK_AXIS
  const TT   = isLight ? LIGHT_TOOLTIP : DARK_TOOLTIP

  const dot = isLight
    ? { fill: C_NAVY, stroke: C_NAVY, strokeWidth: 2, r: 4 }
    : { fill: C_NAVY, stroke: C_NAVY, strokeWidth: 0, r: 4 }
  const activeDot = isLight
    ? { fill: '#daeaf4', stroke: C_NAVY, strokeWidth: 2, r: 6 }
    : { fill: C_NAVY, stroke: C_NAVY, strokeWidth: 0, r: 6 }

  return (
    <ChartWrapper title={series.label} isLight={isLight}>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={padded} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C_NAVY} stopOpacity={isLight ? 1 : 0.35} />
              <stop offset="100%" stopColor={C_NAVY} stopOpacity={isLight ? 0.4 : 0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="date"
            tick={AXIS}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => { try { return format(parseISO(v), 'M/d') } catch { return v } }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={AXIS}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            tickFormatter={(v) => fmtInt.format(v)}
          />
          <Tooltip
            {...TT}
            labelFormatter={(v) => { try { return format(parseISO(String(v)), 'MMM d, yyyy') } catch { return v } }}
            formatter={(v) => [fmtInt.format(Number(v)), 'Clicks']}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke={C_NAVY}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={dot}
            activeDot={activeDot}
            connectNulls={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartWrapper>
  )
}

function DetailTab({
  series,
  loading,
  error,
  start,
  end,
  actionSeries,
  actionLoading,
  actionError,
}: {
  series: DauSeries[] | null
  loading: boolean
  error: string | null
  start: string
  end: string
  actionSeries: ActionSeries[] | null
  actionLoading: boolean
  actionError: string | null
}) {
  if (loading) return <SectionLoader />
  if (error) return <SectionError message={error} />
  return (
    <div className="flex flex-col gap-6">
      {(!series || series.length === 0) ? (
        <p className="text-sm text-muted-foreground py-10 text-center">No data in selected period</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {series.map((s) => (
            <PageDauCard key={s.page} series={s} start={start} end={end} />
          ))}
        </div>
      )}

      {(actionLoading || (actionSeries && actionSeries.length > 0) || actionError) && (
        <div className="flex flex-col gap-3">
          <hr className="border-border" />
          <h3 className="text-sm font-semibold text-foreground">User Actions</h3>
          {actionLoading ? (
            <SectionLoader />
          ) : actionError ? (
            <SectionError message={actionError} />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {(actionSeries ?? []).map((s) => (
                <ActionTrendCard key={s.key} series={s} start={start} end={end} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FeatureAnalyticsPage() {
  const [startDate, setStartDate] = useState(sevenDaysAgo)
  const [endDate, setEndDate] = useState(yesterday)
  const [userType, setUserType] = useState<UserType>('external')
  const [project, setProject] = useState<Project>('portal')
  const [activeTab, setActiveTab] = useState<ActiveTab>('most-used-features')

  // Per-module bar charts (Most Used Features tab)
  const [modulePages, setModulePages] = useState<Record<string, PageRow[] | null>>({})
  const [modulePagesLoading, setModulePagesLoading] = useState(false)
  const [modulePagesError, setModulePagesError] = useState<string | null>(null)

  // Per-module DAU series for product tabs (top 12 pages per module)
  const [dauTrends, setDauTrends] = useState<Record<string, DauSeries[] | null>>({})
  const [dauTrendsLoading, setDauTrendsLoading] = useState(false)
  const [dauTrendsError, setDauTrendsError] = useState<string | null>(null)

  const [actionTrends, setActionTrends]               = useState<Record<string, ActionSeries[] | null>>({})
  const [actionTrendsLoading, setActionTrendsLoading] = useState(false)
  const [actionTrendsError, setActionTrendsError]     = useState<string | null>(null)

  const buildCommonParams = useCallback(() => {
    const p = new URLSearchParams()
    p.set('start', startDate)
    p.set('end', endDate)
    p.set('user_type', userType)
    p.set('project', project)
    return p
  }, [startDate, endDate, userType, project])

  const fetchModulePages = useCallback(async () => {
    setModulePagesLoading(true)
    setModulePagesError(null)
    try {
      const results = await Promise.all(
        MODULE_DEFS.map(async (m) => {
          const p = buildCommonParams()
          p.set('modules', m.slug)
          p.set('limit', '20')
          const res = await fetch(`/api/feature-analytics/visited-pages?${p}`)
          const data: VisitedPagesResponse = await res.json()
          if (!res.ok) throw new Error((data as unknown as { error: string }).error ?? 'Unknown error')
          return { slug: m.slug, pages: data.pages }
        })
      )
      const map: Record<string, PageRow[]> = {}
      for (const { slug, pages } of results) map[slug] = pages
      setModulePages(map)
    } catch (e) {
      setModulePagesError(e instanceof Error ? e.message : String(e))
    } finally {
      setModulePagesLoading(false)
    }
  }, [buildCommonParams])

  const fetchDauTrends = useCallback(async () => {
    setDauTrendsLoading(true)
    setDauTrendsError(null)
    try {
      const results = await Promise.all(
        MODULE_DEFS.map(async (m) => {
          const p = buildCommonParams()
          p.set('module', m.slug)
          p.set('limit', '12')
          const res = await fetch(`/api/feature-analytics/page-trends?${p}`)
          const data: PageTrendsResponse = await res.json()
          if (!res.ok) throw new Error((data as unknown as { error: string }).error ?? 'Unknown error')
          return { slug: m.slug, series: data.series }
        })
      )
      const map: Record<string, DauSeries[]> = {}
      for (const { slug, series } of results) map[slug] = series
      setDauTrends(map)
    } catch (e) {
      setDauTrendsError(e instanceof Error ? e.message : String(e))
    } finally {
      setDauTrendsLoading(false)
    }
  }, [buildCommonParams])

  const fetchActionTrends = useCallback(async () => {
    setActionTrendsLoading(true)
    setActionTrendsError(null)
    try {
      const results = await Promise.all(
        MODULE_DEFS
          .filter((m) => (MODULE_ACTIONS[m.slug]?.length ?? 0) > 0)
          .map(async (m) => {
            const p = buildCommonParams()
            p.set('module', m.slug)
            const res = await fetch(`/api/feature-analytics/action-trends?${p}`)
            const data: ActionTrendsResponse = await res.json()
            if (!res.ok) throw new Error((data as unknown as { error: string }).error ?? 'Unknown error')
            return { slug: m.slug, series: data.series }
          })
      )
      const map: Record<string, ActionSeries[]> = {}
      for (const { slug, series } of results) map[slug] = series
      setActionTrends(map)
    } catch (e) {
      setActionTrendsError(e instanceof Error ? e.message : String(e))
    } finally {
      setActionTrendsLoading(false)
    }
  }, [buildCommonParams])

  useEffect(() => {
    fetchModulePages()
    fetchDauTrends()
    fetchActionTrends()
  }, [fetchModulePages, fetchDauTrends, fetchActionTrends])

  return (
    <div className="flex flex-col gap-8 p-8">
      <h1 className="text-2xl font-heading font-semibold text-foreground">Feature Analytics</h1>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4">
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onRangeChange={(s, e) => { setStartDate(s); setEndDate(e) }}
        />
        <UserTypeToggle value={userType} onChange={setUserType} />
        <ProjectToggle value={project} onChange={setProject} />
      </div>

      {/* Tabbed content */}
      <div className="flex flex-col gap-0">
        {/* Tab bar */}
        <div className="border-b border-border mb-4">
          <div className="flex gap-0">
            {TAB_DEFS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  'px-4 py-2.5 text-sm font-medium transition-colors relative',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                  activeTab === t.id
                    ? 'text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        {activeTab === 'most-used-features' ? (
          <MostUsedFeaturesTab
            modulePages={modulePages}
            loading={modulePagesLoading}
            error={modulePagesError}
          />
        ) : (
          <DetailTab
            series={dauTrends[activeTab] ?? null}
            loading={dauTrendsLoading}
            error={dauTrendsError}
            start={startDate}
            end={endDate}
            actionSeries={actionTrends[activeTab] ?? null}
            actionLoading={actionTrendsLoading && (MODULE_ACTIONS[activeTab]?.length ?? 0) > 0}
            actionError={actionTrendsError}
          />
        )}
      </div>
    </div>
  )
}
