'use client'

import { useState, useEffect, useCallback } from 'react'
import { subDays, format } from 'date-fns'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
} from 'recharts'
import { DateRangePicker } from '@/components/filters/DateRangePicker'
import { MultiSelect } from '@/components/filters/MultiSelect'
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

// ─── Constants ────────────────────────────────────────────────────────────────

const MODULE_OPTIONS = [
  { value: 'databricks-warehouse-optimization', label: 'KWO for Databricks' },
  { value: 'warehouse-optimization', label: 'KWO for Snowflake' },
  { value: 'workload-iq', label: 'KWI for Snowflake' },
  { value: 'platform', label: 'Platform' },
]
const ALL_MODULE_SLUGS = MODULE_OPTIONS.map((m) => m.value)

const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
const sevenDaysAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd')

const LABEL_MAX = 40
const BAR_HEIGHT = 28
const BAR_CHART_MAX_HEIGHT = 600
const Y_AXIS_WIDTH = 220

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

// Custom Y-axis tick: truncates label, shows full name via SVG <title> (native browser tooltip)
function YAxisTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  if (x == null || y == null || !payload) return null
  const full = payload.value
  const label = full.length > LABEL_MAX ? full.slice(0, LABEL_MAX) + '…' : full
  return (
    <g transform={`translate(${x},${y})`}>
      <title>{full}</title>
      <text
        x={-6}
        y={0}
        dy={4}
        textAnchor="end"
        fontSize={11}
        className="fill-muted-foreground"
      >
        {label}
      </text>
    </g>
  )
}

// Custom tooltip showing full page name + count
function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: PageRow }>
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

function VisitedPagesChart({ data }: { data: PageRow[] }) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const cursorFill = isLight ? '#F1F3F5' : '#0d3344'
  const chartHeight = Math.max(data.length * BAR_HEIGHT + 20, 80)
  const containerHeight = Math.min(chartHeight, BAR_CHART_MAX_HEIGHT)
  const scrollable = chartHeight > BAR_CHART_MAX_HEIGHT

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-heading font-semibold text-foreground">Visited Pages</h2>
        <span className="text-xs text-muted-foreground">Top 100 by pageviews</span>
      </div>
      <div
        className="rounded-lg border border-border bg-card p-4"
        style={{ height: containerHeight, overflowY: scrollable ? 'auto' : 'visible' }}
      >
        <BarChart
          width={undefined as unknown as number}
          height={chartHeight}
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 56, bottom: 4, left: Y_AXIS_WIDTH }}
          style={{ width: '100%' }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
          <XAxis
            type="number"
            tickFormatter={(v) => v.toLocaleString()}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            axisLine={false}
            tickLine={false}
            domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.2)]}
          />
          <YAxis
            type="category"
            dataKey="page_name"
            width={Y_AXIS_WIDTH}
            tick={YAxisTick as unknown as React.ReactElement}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: cursorFill }} />
          <Bar dataKey="count" radius={[0, 3, 3, 0]} maxBarSize={20}>
            {data.map((_, i) => (
              <Cell key={i} fill="#2a6985" />
            ))}
            <LabelList
              dataKey="count"
              position="right"
              formatter={(v: unknown) => Number(v).toLocaleString()}
              style={{ fontSize: 11, fill: '#4a6373' }}
            />
          </Bar>
        </BarChart>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FeatureAnalyticsPage() {
  const [startDate, setStartDate] = useState(sevenDaysAgo)
  const [endDate, setEndDate] = useState(yesterday)
  const [selectedModules, setSelectedModules] = useState<string[]>(ALL_MODULE_SLUGS)
  const [userType, setUserType] = useState<UserType>('external')
  const [project, setProject] = useState<Project>('portal')

  const [pages, setPages] = useState<PageRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const buildParams = useCallback(() => {
    const p = new URLSearchParams()
    p.set('start', startDate)
    p.set('end', endDate)
    p.set('modules', (selectedModules.length ? selectedModules : ALL_MODULE_SLUGS).join(','))
    p.set('user_type', userType)
    p.set('project', project)
    return p
  }, [startDate, endDate, selectedModules, userType, project])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/feature-analytics/visited-pages?${buildParams()}`)
      const data: VisitedPagesResponse = await res.json()
      if (!res.ok) throw new Error((data as unknown as { error: string }).error ?? 'Unknown error')
      setPages(data.pages)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [buildParams])

  useEffect(() => {
    fetchData()
  }, [fetchData])

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
        <MultiSelect
          label="Module"
          options={MODULE_OPTIONS}
          selected={selectedModules}
          onChange={setSelectedModules}
        />
        <UserTypeToggle value={userType} onChange={setUserType} />
        <ProjectToggle value={project} onChange={setProject} />
      </div>

      {/* Visited Pages chart */}
      {loading ? (
        <SectionLoader />
      ) : error ? (
        <SectionError message={error} />
      ) : pages ? (
        <VisitedPagesChart data={pages} />
      ) : null}
    </div>
  )
}
