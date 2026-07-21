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
} from './TimeSeriesCharts'
import type {
  DataScannedHistogramBucket,
  ExecutionTimeHistogramBucket,
  SpillageHistogramBucket,
  WarehouseAnalysisPoint,
} from '@/lib/types'

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

interface DistributionBucket {
  bucket_label: string
  query_count: number
}

interface DistributionTooltipProps {
  active?: boolean
  payload?: { value?: number }[]
  label?: string
  isLight: boolean
  buckets: DistributionBucket[]
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

  const bg = isLight ? '#ffffff' : '#04202d'
  const border = isLight ? '#cdd2da' : '#1a4459'
  const muted = isLight ? '#4d565a' : '#6b7f8a'
  const text = isLight ? '#051c27' : '#e8f0f4'
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
        border: `1px solid ${border}`,
        borderRadius: 8,
        padding: '10px 14px',
        fontFamily: font,
        fontSize: 12,
        minWidth: 220,
      }}
    >
      <div style={{ color: muted, fontSize: 11, marginBottom: 8 }}>{label}</div>
      {row('Queries in this bucket', current, true)}
      <div style={{ borderTop: `1px solid ${border}`, margin: '6px 0' }} />
      {row('Total below this bucket', below)}
      {row('Total above this bucket', above)}
    </div>
  )
}

interface WarehouseAnalysisChartsProps {
  points: WarehouseAnalysisPoint[]
  histogramBuckets: ExecutionTimeHistogramBucket[]
  dataScannedHistogramBuckets: DataScannedHistogramBucket[]
  spillageHistogramBuckets: SpillageHistogramBucket[]
  /** Timeseries-driven charts (usage, volume, execution/queue time, scanned/spillage totals, failed queries). */
  loading?: boolean
  histogramLoading?: boolean
  dataScannedHistogramLoading?: boolean
  spillageHistogramLoading?: boolean
}

// Code-only toggles for the overall-metric shown top-right on each chart. Not user-facing.
const SHOW_METRIC = {
  usage: true,
  totalQueries: true,
  executionTime: true,
  executionTimeDistribution: true,
  queuedQueries: true,
  queueTime: true,
  dataScanned: true,
  dataScannedDistribution: true,
  spillage: true,
  spillageDistribution: true,
  failedQueries: true,
  failedQueryReasons: true,
}

export function WarehouseAnalysisCharts({
  points,
  histogramBuckets,
  dataScannedHistogramBuckets,
  spillageHistogramBuckets,
  loading,
  histogramLoading,
  dataScannedHistogramLoading,
  spillageHistogramLoading,
}: WarehouseAnalysisChartsProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const GRID = isLight ? LIGHT_GRID : DARK_GRID
  const AXIS = isLight ? LIGHT_AXIS : DARK_AXIS
  const TT = isLight ? LIGHT_TOOLTIP : DARK_TOOLTIP
  const legendStyle = getChartLegendStyle(isLight)
  const cursorFill = isLight ? '#F1F3F5' : '#0d3344'

  const failedData = useMemo(
    () =>
      points.map((p) => ({
        period_label_display: p.period_label_display,
        failed_query_count: Object.values(p.failed_query_count_by_error).reduce((sum, v) => sum + v, 0),
      })),
    [points]
  )

  const failedReasonsData = useMemo(() => aggregateFailedReasons(points), [points])

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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartWrapper title="Warehouse Usage" isLight={isLight} totals={SHOW_METRIC.usage ? totalsUsage : undefined} loading={loading}>
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

      <ChartWrapper title="Total Queries" isLight={isLight} totals={SHOW_METRIC.totalQueries ? totalsVolume : undefined} loading={loading}>
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

      <ChartWrapper title="Execution Time" isLight={isLight} totals={SHOW_METRIC.executionTime ? totalsExecution : undefined} loading={loading}>
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

      <ChartWrapper title="Execution Time Distribution" isLight={isLight} totals={SHOW_METRIC.executionTimeDistribution ? totalsHistogram : undefined} loading={histogramLoading}>
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

      <ChartWrapper title="Queued Queries" isLight={isLight} totals={SHOW_METRIC.queuedQueries ? totalsQueued : undefined} loading={loading}>
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

      <ChartWrapper title="Queue Time" isLight={isLight} totals={SHOW_METRIC.queueTime ? totalsQueueTime : undefined} loading={loading}>
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

      <ChartWrapper title="Data Scanned" isLight={isLight} totals={SHOW_METRIC.dataScanned ? totalsScanned : undefined} loading={loading}>
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
        totals={SHOW_METRIC.dataScannedDistribution ? totalsDataScannedHistogram : undefined}
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

      <ChartWrapper title="Spillage" isLight={isLight} totals={SHOW_METRIC.spillage ? totalsSpillage : undefined} loading={loading}>
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
        totals={SHOW_METRIC.spillageDistribution ? totalsSpillageHistogram : undefined}
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

      <ChartWrapper title="Failed Queries" isLight={isLight} totals={SHOW_METRIC.failedQueries ? totalsFailed : undefined} loading={loading}>
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
        totals={SHOW_METRIC.failedQueryReasons ? totalsFailedReasons : undefined}
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
    </div>
  )
}
