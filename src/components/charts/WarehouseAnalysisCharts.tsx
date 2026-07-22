'use client'

import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useTheme } from '@/components/layout/ThemeProvider'
import {
  ChartWrapper,
  SeriesTooltip,
  getChartLegendStyle,
  getAreaDotProps,
  formatMetricNumber,
  formatDecimalNumber,
  formatBytesAsGB,
  C_NAVY,
  C_TEAL,
  C_DEEP,
  DARK_GRID,
  LIGHT_GRID,
  DARK_AXIS,
  LIGHT_AXIS,
  DARK_TOOLTIP,
  LIGHT_TOOLTIP,
  LIGHT_CURSOR_FILL,
  DARK_CURSOR_FILL,
} from './TimeSeriesCharts'
import type { HistogramBucket, WarehouseAnalysisPoint } from '@/lib/types'

export function collectKeys(points: WarehouseAnalysisPoint[], field: 'query_volume_by_type' | 'failed_query_count_by_error'): string[] {
  const keys = new Set<string>()
  for (const p of points) {
    for (const key of Object.keys(p[field])) keys.add(key)
  }
  return [...keys]
}

function aggregateFailedReasons(points: WarehouseAnalysisPoint[]): { error_code: string; error_count: number }[] {
  const totals = new Map<string, number>()
  for (const p of points) {
    for (const [errorCode, count] of Object.entries(p.failed_query_count_by_error)) {
      totals.set(errorCode, (totals.get(errorCode) ?? 0) + count)
    }
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])
  const top = sorted.slice(0, 10)
  const rest = sorted.slice(10)
  const result = top.map(([error_code, error_count]) => ({ error_code, error_count }))
  const otherCount = rest.reduce((sum, [, count]) => sum + count, 0)
  if (otherCount > 0) result.push({ error_code: 'Other', error_count: otherCount })

  return result
}

function aggregateQueryTypes(points: WarehouseAnalysisPoint[]): { query_type: string; query_count: number }[] {
  const totals = new Map<string, number>()
  for (const p of points) {
    for (const [queryType, count] of Object.entries(p.query_volume_by_type)) {
      totals.set(queryType, (totals.get(queryType) ?? 0) + count)
    }
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1])
  const top = sorted.slice(0, 10)
  const rest = sorted.slice(10)
  const result = top.map(([query_type, query_count]) => ({ query_type, query_count }))
  const otherCount = rest.reduce((sum, [, count]) => sum + count, 0)
  if (otherCount > 0) result.push({ query_type: 'Other', query_count: otherCount })

  return result
}

interface DistributionTooltipProps {
  active?: boolean
  payload?: { value?: number }[]
  label?: string
  isLight: boolean
  buckets: HistogramBucket[]
}

/** Distribution chart tooltip: shows the hovered bucket's count alongside cumulative totals for buckets below and above it. */
export function DistributionTooltip({ active, payload, label, isLight, buckets }: DistributionTooltipProps) {
  if (!active || !payload?.length || label === undefined) return null

  const index = buckets.findIndex((b) => b.bucket_label === label)
  if (index === -1) return null

  const current = buckets[index].query_count
  const below: number | null = index === 0 ? null : buckets.slice(0, index).reduce((sum, b) => sum + b.query_count, 0)
  const above: number | null =
    index === buckets.length - 1 ? null : buckets.slice(index + 1).reduce((sum, b) => sum + b.query_count, 0)
  const total = buckets.reduce((sum, b) => sum + b.query_count, 0)
  const pct = (value: number | null) => (value === null || total === 0 ? null : (value / total) * 100)

  const TT = isLight ? LIGHT_TOOLTIP : DARK_TOOLTIP
  const bg = TT.contentStyle.background
  const border = TT.contentStyle.border
  const muted = TT.labelStyle.color
  const text = TT.itemStyle.color
  const font = 'IBM Plex Sans, sans-serif'

  const row = (rowLabel: string, value: number | null, emphasize = false) => (
    <div key={rowLabel} style={{ display: 'flex', justifyContent: 'space-between', gap: 32, marginBottom: 3 }}>
      <span style={{ color: muted }}>{rowLabel}</span>
      <span
        style={{
          color: emphasize ? text : muted,
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'right',
          minWidth: 64,
          fontWeight: emphasize ? 600 : 400,
        }}
      >
        {value === null ? 'N/A' : `${formatMetricNumber(value)} (${(pct(value) ?? 0).toFixed(1)}%)`}
      </span>
    </div>
  )

  return (
    <div
      style={{
        background: bg,
        border,
        borderRadius: 8,
        padding: '10px 14px',
        fontFamily: font,
        fontSize: 12,
        minWidth: 220,
      }}
    >
      <div style={{ color: muted, fontSize: 11, marginBottom: 8 }}>{label}</div>
      {row('Queries in this bucket', current, true)}
      <div style={{ borderTop: border, margin: '6px 0' }} />
      {row('Total below this bucket', below)}
      {row('Total above this bucket', above)}
    </div>
  )
}

interface WarehouseAnalysisChartsProps {
  points: WarehouseAnalysisPoint[]
  histogramBuckets: HistogramBucket[]
  dataScannedHistogramBuckets: HistogramBucket[]
  spillageHistogramBuckets: HistogramBucket[]
  compileTimeHistogramBuckets?: HistogramBucket[]
  /** Timeseries-driven charts (usage, volume, execution/queue time, scanned/spillage totals, failed queries). */
  loading?: boolean
  histogramLoading?: boolean
  dataScannedHistogramLoading?: boolean
  spillageHistogramLoading?: boolean
  compileTimeHistogramLoading?: boolean
}


export function WarehouseAnalysisCharts({
  points,
  histogramBuckets,
  dataScannedHistogramBuckets,
  spillageHistogramBuckets,
  compileTimeHistogramBuckets = [],
  loading,
  histogramLoading,
  dataScannedHistogramLoading,
  spillageHistogramLoading,
  compileTimeHistogramLoading,
}: WarehouseAnalysisChartsProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const GRID = isLight ? LIGHT_GRID : DARK_GRID
  const AXIS = isLight ? LIGHT_AXIS : DARK_AXIS
  const TT = isLight ? LIGHT_TOOLTIP : DARK_TOOLTIP
  const legendStyle = getChartLegendStyle(isLight)
  const cursorFill = isLight ? LIGHT_CURSOR_FILL : DARK_CURSOR_FILL

  const failedData = useMemo(
    () =>
      points.map((p) => ({
        period_label_display: p.period_label_display,
        failed_query_count: Object.values(p.failed_query_count_by_error).reduce((sum, v) => sum + v, 0),
      })),
    [points]
  )

  const failedReasonsData = useMemo(() => aggregateFailedReasons(points), [points])

  const queryTypesData = useMemo(() => aggregateQueryTypes(points), [points])

  const usageData = useMemo(
    () => points.map((p) => ({ period_label_display: p.period_label_display, credits_used: p.credits_used })),
    [points]
  )

  const volumeData = useMemo(
    () =>
      points.map((p) => ({
        period_label_display: p.period_label_display,
        total_query_count: Object.values(p.query_volume_by_type).reduce((sum, v) => sum + v, 0),
      })),
    [points]
  )

  const costPer1000Data = useMemo(
    () =>
      points.map((p) => {
        const totalQueries = Object.values(p.query_volume_by_type).reduce((sum, v) => sum + v, 0)
        return {
          period_label_display: p.period_label_display,
          cost_per_1000_queries: totalQueries > 0 ? (p.credits_used / totalQueries) * 1000 : 0,
        }
      }),
    [points]
  )

  const executionData = useMemo(
    () =>
      points.map((p) => ({
        period_label_display: p.period_label_display,
        avg: p.execution_time_avg_ms,
        p95: p.execution_time_p95_ms,
        p99: p.execution_time_p99_ms,
      })),
    [points]
  )

  const concurrencyData = useMemo(
    () =>
      points.map((p) => ({
        period_label_display: p.period_label_display,
        max: p.concurrent_queries_max,
        avg: p.concurrent_queries_avg,
      })),
    [points]
  )

  const queuedData = useMemo(
    () => points.map((p) => ({ period_label_display: p.period_label_display, queued_query_count: p.queued_query_count })),
    [points]
  )

  const queueTimeData = useMemo(
    () => points.map((p) => ({ period_label_display: p.period_label_display, max: p.queue_time_max_ms / 1000 })),
    [points]
  )

  const scannedData = useMemo(
    () => points.map((p) => ({ period_label_display: p.period_label_display, bytes_scanned: p.bytes_scanned })),
    [points]
  )

  const spillageData = useMemo(
    () =>
      points.map((p) => ({
        period_label_display: p.period_label_display,
        local: p.bytes_spilled_local,
        remote: p.bytes_spilled_remote,
      })),
    [points]
  )

  const totalsUsage = useMemo(
    () => [{ label: 'Total Credits', value: formatDecimalNumber(usageData.reduce((sum, d) => sum + d.credits_used, 0)) }],
    [usageData]
  )

  const totalsVolume = useMemo(
    () => [{ label: 'Total Queries', value: formatMetricNumber(volumeData.reduce((sum, d) => sum + d.total_query_count, 0)) }],
    [volumeData]
  )

  const totalsCostPer1000 = useMemo(() => {
    const totalCredits = points.reduce((sum, p) => sum + p.credits_used, 0)
    const totalQueries = points.reduce(
      (sum, p) => sum + Object.values(p.query_volume_by_type).reduce((s, v) => s + v, 0),
      0
    )
    return [
      { label: 'Credits / 1000 Queries', value: formatDecimalNumber(totalQueries > 0 ? (totalCredits / totalQueries) * 1000 : 0) },
    ]
  }, [points])

  const totalsConcurrency = useMemo(() => {
    if (concurrencyData.length === 0) return [{ label: 'Max Concurrent', value: formatDecimalNumber(0) }]
    const max = Math.max(...concurrencyData.map((d) => d.max))
    return [{ label: 'Max Concurrent', value: formatDecimalNumber(max) }]
  }, [concurrencyData])

  const totalsExecution = useMemo(() => {
    if (executionData.length === 0) return [{ label: 'Avg (ms)', value: formatDecimalNumber(0) }]
    const avg = executionData.reduce((sum, d) => sum + d.avg, 0) / executionData.length
    return [{ label: 'Avg (ms)', value: formatDecimalNumber(avg) }]
  }, [executionData])

  const totalsHistogram = useMemo(
    () => [{ label: 'Total Queries', value: formatMetricNumber(histogramBuckets.reduce((sum, b) => sum + b.query_count, 0)) }],
    [histogramBuckets]
  )

  const totalsQueued = useMemo(
    () => [{ label: 'Total Queued', value: formatMetricNumber(queuedData.reduce((sum, d) => sum + d.queued_query_count, 0)) }],
    [queuedData]
  )

  const totalsQueueTime = useMemo(() => {
    if (queueTimeData.length === 0) return [{ label: 'Max (s)', value: formatDecimalNumber(0) }]
    const max = Math.max(...queueTimeData.map((d) => d.max))
    return [{ label: 'Max (s)', value: formatDecimalNumber(max) }]
  }, [queueTimeData])

  const totalsDataScannedHistogram = useMemo(
    () => [
      { label: 'Total Queries', value: formatMetricNumber(dataScannedHistogramBuckets.reduce((sum, b) => sum + b.query_count, 0)) },
    ],
    [dataScannedHistogramBuckets]
  )

  const totalsSpillageHistogram = useMemo(
    () => [
      { label: 'Total Queries', value: formatMetricNumber(spillageHistogramBuckets.reduce((sum, b) => sum + b.query_count, 0)) },
    ],
    [spillageHistogramBuckets]
  )

  const totalsScanned = useMemo(
    () => [{ label: 'Total GB', value: `${formatBytesAsGB(scannedData.reduce((sum, d) => sum + d.bytes_scanned, 0))} GB` }],
    [scannedData]
  )

  const totalsSpillage = useMemo(
    () => [{ label: 'Total GB', value: `${formatBytesAsGB(spillageData.reduce((sum, d) => sum + d.local + d.remote, 0))} GB` }],
    [spillageData]
  )

  const totalsFailed = useMemo(
    () => [{ label: 'Total Failed', value: formatMetricNumber(failedData.reduce((sum, d) => sum + d.failed_query_count, 0)) }],
    [failedData]
  )

  const totalsFailedReasons = useMemo(
    () => [{ label: 'Total Failed', value: formatMetricNumber(failedReasonsData.reduce((sum, d) => sum + d.error_count, 0)) }],
    [failedReasonsData]
  )

  const totalsQueryTypes = useMemo(
    () => [{ label: 'Total Queries', value: formatMetricNumber(queryTypesData.reduce((sum, d) => sum + d.query_count, 0)) }],
    [queryTypesData]
  )

  const totalsCompileTimeHistogram = useMemo(
    () => [
      { label: 'Total Queries', value: formatMetricNumber(compileTimeHistogramBuckets.reduce((sum, b) => sum + b.query_count, 0)) },
    ],
    [compileTimeHistogramBuckets]
  )

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartWrapper title="Usage" isLight={isLight} totals={totalsUsage} loading={loading}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={usageData} barSize={30}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="period_label_display" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatDecimalNumber(v)} />
            <Tooltip {...TT} cursor={{ fill: cursorFill }} formatter={(v) => [formatDecimalNumber(Number(v)), 'Credits Used']} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Credits Used'} wrapperStyle={legendStyle} />
            <Bar dataKey="credits_used" name="Credits Used" fill={C_NAVY} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper
        title="Cost per 1000 Queries"
        isLight={isLight}
        totals={totalsCostPer1000}
        loading={loading}
      >
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={costPer1000Data} barSize={30}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="period_label_display" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatDecimalNumber(v)} />
            <Tooltip {...TT} cursor={{ fill: cursorFill }} formatter={(v) => [formatDecimalNumber(Number(v)), 'Credits / 1000 Queries']} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Credits / 1000 Queries'} wrapperStyle={legendStyle} />
            <Bar dataKey="cost_per_1000_queries" name="Credits / 1000 Queries" fill={C_NAVY} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Total Queries" isLight={isLight} totals={totalsVolume} loading={loading}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={volumeData} barSize={30}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="period_label_display" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatMetricNumber(v)} />
            <Tooltip {...TT} cursor={{ fill: cursorFill }} formatter={(v) => [formatMetricNumber(Number(v)), 'Total Queries']} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Total Queries'} wrapperStyle={legendStyle} />
            <Bar dataKey="total_query_count" name="Total Queries" fill={C_NAVY} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper
        title="Query Concurrency"
        isLight={isLight}
        totals={totalsConcurrency}
        loading={loading}
      >
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={concurrencyData}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="period_label_display" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatDecimalNumber(v)} />
            <Tooltip content={<SeriesTooltip isLight={isLight} formatter={formatDecimalNumber} reverse />} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} wrapperStyle={legendStyle} />
            <Line type="monotone" dataKey="max" name="Max Concurrent" stroke={C_NAVY} strokeWidth={2} {...getAreaDotProps(C_NAVY, isLight)} connectNulls />
            <Line type="monotone" dataKey="avg" name="Avg Concurrent" stroke={C_DEEP} strokeWidth={2} {...getAreaDotProps(C_DEEP, isLight)} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Execution Time" isLight={isLight} totals={totalsExecution} loading={loading}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={executionData}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="period_label_display" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatDecimalNumber(v)} />
            <Tooltip content={<SeriesTooltip isLight={isLight} formatter={formatDecimalNumber} reverse />} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} wrapperStyle={legendStyle} />
            <Line type="monotone" dataKey="avg" name="Avg (ms)" stroke={C_DEEP} strokeWidth={2} {...getAreaDotProps(C_DEEP, isLight)} connectNulls />
            <Line type="monotone" dataKey="p95" name="P95 (ms)" stroke={C_NAVY} strokeWidth={2} {...getAreaDotProps(C_NAVY, isLight)} connectNulls />
            <Line type="monotone" dataKey="p99" name="P99 (ms)" stroke={C_TEAL} strokeWidth={2} {...getAreaDotProps(C_TEAL, isLight)} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Execution Time Distribution" isLight={isLight} totals={totalsHistogram} loading={histogramLoading}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={histogramBuckets} barSize={30}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="bucket_label" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatMetricNumber(v)} />
            <Tooltip cursor={{ fill: cursorFill }} content={<DistributionTooltip isLight={isLight} buckets={histogramBuckets} />} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Queries'} wrapperStyle={legendStyle} />
            <Bar dataKey="query_count" name="Queries" fill={C_NAVY} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Queued Queries" isLight={isLight} totals={totalsQueued} loading={loading}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={queuedData} barSize={30}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="period_label_display" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatMetricNumber(v)} />
            <Tooltip {...TT} cursor={{ fill: cursorFill }} formatter={(v) => [formatMetricNumber(Number(v)), 'Queued Queries']} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Queued Queries'} wrapperStyle={legendStyle} />
            <Bar dataKey="queued_query_count" name="Queued Queries" fill={C_NAVY} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Queue Time" isLight={isLight} totals={totalsQueueTime} loading={loading}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={queueTimeData} barSize={30}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="period_label_display" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatDecimalNumber(v)} />
            <Tooltip {...TT} cursor={{ fill: cursorFill }} formatter={(v) => [formatDecimalNumber(Number(v)), 'Max (s)']} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Max (s)'} wrapperStyle={legendStyle} />
            <Bar dataKey="max" name="Max (s)" fill={C_NAVY} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Data Scanned" isLight={isLight} totals={totalsScanned} loading={loading}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={scannedData} barSize={30}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="period_label_display" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatBytesAsGB(v)} />
            <Tooltip {...TT} cursor={{ fill: cursorFill }} formatter={(v) => `${formatBytesAsGB(Number(v))} GB`} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Data Scanned'} wrapperStyle={legendStyle} />
            <Bar dataKey="bytes_scanned" name="Data Scanned" fill={C_NAVY} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper
        title="Data Scanned Distribution"
        isLight={isLight}
        totals={totalsDataScannedHistogram}
        loading={dataScannedHistogramLoading}
      >
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={dataScannedHistogramBuckets} barSize={30}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="bucket_label" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatMetricNumber(v)} />
            <Tooltip cursor={{ fill: cursorFill }} content={<DistributionTooltip isLight={isLight} buckets={dataScannedHistogramBuckets} />} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Queries'} wrapperStyle={legendStyle} />
            <Bar dataKey="query_count" name="Queries" fill={C_NAVY} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Spillage" isLight={isLight} totals={totalsSpillage} loading={loading}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={spillageData} barSize={30}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="period_label_display" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatBytesAsGB(v)} />
            <Tooltip {...TT} cursor={{ fill: cursorFill }} formatter={(v) => `${formatBytesAsGB(Number(v))} GB`} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} wrapperStyle={legendStyle} />
            <Bar dataKey="local" name="Local" stackId="spillage" fill={C_NAVY} />
            <Bar dataKey="remote" name="Remote" stackId="spillage" fill={C_TEAL} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper
        title="Spillage Distribution"
        isLight={isLight}
        totals={totalsSpillageHistogram}
        loading={spillageHistogramLoading}
      >
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={spillageHistogramBuckets} barSize={30}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="bucket_label" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatMetricNumber(v)} />
            <Tooltip cursor={{ fill: cursorFill }} content={<DistributionTooltip isLight={isLight} buckets={spillageHistogramBuckets} />} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Queries'} wrapperStyle={legendStyle} />
            <Bar dataKey="query_count" name="Queries" fill={C_NAVY} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Failed Queries" isLight={isLight} totals={totalsFailed} loading={loading}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={failedData} barSize={30}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="period_label_display" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatMetricNumber(v)} />
            <Tooltip {...TT} cursor={{ fill: cursorFill }} formatter={(v) => [formatMetricNumber(Number(v)), 'Failed Queries']} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Failed Queries'} wrapperStyle={legendStyle} />
            <Bar dataKey="failed_query_count" name="Failed Queries" fill={C_NAVY} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper
        title="Failed Query Reasons"
        isLight={isLight}
        totals={totalsFailedReasons}
        loading={loading}
      >
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={failedReasonsData} barSize={30}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="error_code" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatMetricNumber(v)} />
            <Tooltip {...TT} cursor={{ fill: cursorFill }} formatter={(v) => [formatMetricNumber(Number(v)), 'Failed Queries']} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Failed Queries'} wrapperStyle={legendStyle} />
            <Bar dataKey="error_count" name="Failed Queries" fill={C_NAVY} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Query Types" isLight={isLight} totals={totalsQueryTypes} loading={loading}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={queryTypesData} barSize={30}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="query_type" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatMetricNumber(v)} />
            <Tooltip {...TT} cursor={{ fill: cursorFill }} formatter={(v) => [formatMetricNumber(Number(v)), 'Queries']} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Queries'} wrapperStyle={legendStyle} />
            <Bar dataKey="query_count" name="Queries" fill={C_NAVY} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper
        title="Query Compile Time Distribution"
        isLight={isLight}
        totals={totalsCompileTimeHistogram}
        loading={compileTimeHistogramLoading}
      >
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={compileTimeHistogramBuckets} barSize={30}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="bucket_label" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatMetricNumber(v)} />
            <Tooltip cursor={{ fill: cursorFill }} content={<DistributionTooltip isLight={isLight} buckets={compileTimeHistogramBuckets} />} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Queries'} wrapperStyle={legendStyle} />
            <Bar dataKey="query_count" name="Queries" fill={C_NAVY} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>
    </div>
  )
}
