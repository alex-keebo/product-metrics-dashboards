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
import type { ExecutionTimeHistogramBucket, WarehouseAnalysisPoint } from '@/lib/types'

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

interface WarehouseAnalysisChartsProps {
  points: WarehouseAnalysisPoint[]
  histogramBuckets: ExecutionTimeHistogramBucket[]
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
  spillage: true,
  failedQueries: true,
  failedQueryReasons: true,
}

export function WarehouseAnalysisCharts({ points, histogramBuckets }: WarehouseAnalysisChartsProps) {
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
    () =>
      points.map((p) => ({
        period_label_display: p.period_label_display,
        avg: p.queue_time_avg_ms,
        p95: p.queue_time_p95_ms,
        p99: p.queue_time_p99_ms,
      })),
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
    if (queueTimeData.length === 0) return [{ label: 'Avg (ms)', value: formatDecimalNumber(0) }]
    const avg = queueTimeData.reduce((sum, d) => sum + d.avg, 0) / queueTimeData.length
    return [{ label: 'Avg (ms)', value: formatDecimalNumber(avg) }]
  }, [queueTimeData])

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
      <ChartWrapper title="Warehouse Usage (Credits)" isLight={isLight} totals={SHOW_METRIC.usage ? totalsUsage : undefined}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={usageData} barSize={isLight ? 30 : undefined}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="period_label_display" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} />
            <Tooltip {...TT} cursor={{ fill: cursorFill }} formatter={(v) => [formatDecimalNumber(Number(v)), 'Credits Used']} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Credits Used'} wrapperStyle={legendStyle} />
            <Bar dataKey="credits_used" name="Credits Used" fill={C_NAVY} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Total Queries" isLight={isLight} totals={SHOW_METRIC.totalQueries ? totalsVolume : undefined}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={volumeData} barSize={isLight ? 30 : undefined}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="period_label_display" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} />
            <Tooltip {...TT} cursor={{ fill: cursorFill }} formatter={(v) => [formatMetricNumber(Number(v)), 'Total Queries']} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Total Queries'} wrapperStyle={legendStyle} />
            <Bar dataKey="total_query_count" name="Total Queries" fill={C_NAVY} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Execution Time" isLight={isLight} totals={SHOW_METRIC.executionTime ? totalsExecution : undefined}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={executionData}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="period_label_display" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} />
            <Tooltip content={<SeriesTooltip isLight={isLight} formatter={formatDecimalNumber} reverse />} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} wrapperStyle={legendStyle} />
            <Line type="monotone" dataKey="avg" name="Avg (ms)" stroke={C_DEEP} strokeWidth={2} {...getAreaDotProps(C_DEEP, isLight)} connectNulls />
            <Line type="monotone" dataKey="p95" name="P95 (ms)" stroke={C_NAVY} strokeWidth={2} {...getAreaDotProps(C_NAVY, isLight)} connectNulls />
            <Line type="monotone" dataKey="p99" name="P99 (ms)" stroke={C_TEAL} strokeWidth={2} {...getAreaDotProps(C_TEAL, isLight)} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Execution Time Distribution" isLight={isLight} totals={SHOW_METRIC.executionTimeDistribution ? totalsHistogram : undefined}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={histogramBuckets} barSize={isLight ? 30 : undefined}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="bucket_label" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} />
            <Tooltip {...TT} cursor={{ fill: cursorFill }} formatter={(v) => [formatMetricNumber(Number(v)), 'Queries']} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Queries'} wrapperStyle={legendStyle} />
            <Bar dataKey="query_count" name="Queries" fill={C_NAVY} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Queued Queries" isLight={isLight} totals={SHOW_METRIC.queuedQueries ? totalsQueued : undefined}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={queuedData} barSize={isLight ? 30 : undefined}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="period_label_display" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} />
            <Tooltip {...TT} cursor={{ fill: cursorFill }} formatter={(v) => [formatMetricNumber(Number(v)), 'Queued Queries']} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Queued Queries'} wrapperStyle={legendStyle} />
            <Bar dataKey="queued_query_count" name="Queued Queries" fill={C_NAVY} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Queue Time" isLight={isLight} totals={SHOW_METRIC.queueTime ? totalsQueueTime : undefined}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={queueTimeData}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="period_label_display" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} />
            <Tooltip content={<SeriesTooltip isLight={isLight} formatter={formatDecimalNumber} reverse />} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} wrapperStyle={legendStyle} />
            <Line type="monotone" dataKey="avg" name="Avg (ms)" stroke={C_DEEP} strokeWidth={2} {...getAreaDotProps(C_DEEP, isLight)} connectNulls />
            <Line type="monotone" dataKey="p95" name="P95 (ms)" stroke={C_NAVY} strokeWidth={2} {...getAreaDotProps(C_NAVY, isLight)} connectNulls />
            <Line type="monotone" dataKey="p99" name="P99 (ms)" stroke={C_TEAL} strokeWidth={2} {...getAreaDotProps(C_TEAL, isLight)} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Data Scanned (GB)" isLight={isLight} totals={SHOW_METRIC.dataScanned ? totalsScanned : undefined}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={scannedData} barSize={isLight ? 30 : undefined}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="period_label_display" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${formatBytesAsGB(v)} GB`} />
            <Tooltip {...TT} cursor={{ fill: cursorFill }} formatter={(v) => `${formatBytesAsGB(Number(v))} GB`} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Data Scanned'} wrapperStyle={legendStyle} />
            <Bar dataKey="bytes_scanned" name="Data Scanned" fill={C_NAVY} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Spillage" isLight={isLight} totals={SHOW_METRIC.spillage ? totalsSpillage : undefined}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={spillageData} barSize={isLight ? 30 : undefined}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="period_label_display" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${formatBytesAsGB(v)} GB`} />
            <Tooltip {...TT} cursor={{ fill: cursorFill }} formatter={(v) => `${formatBytesAsGB(Number(v))} GB`} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} wrapperStyle={legendStyle} />
            <Bar dataKey="local" name="Local" stackId="spillage" fill={C_NAVY} />
            <Bar dataKey="remote" name="Remote" stackId="spillage" fill={C_TEAL} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Failed Queries" isLight={isLight} totals={SHOW_METRIC.failedQueries ? totalsFailed : undefined}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={failedData} barSize={isLight ? 30 : undefined}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="period_label_display" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} />
            <Tooltip {...TT} cursor={{ fill: cursorFill }} formatter={(v) => [formatMetricNumber(Number(v)), 'Failed Queries']} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Failed Queries'} wrapperStyle={legendStyle} />
            <Bar dataKey="failed_query_count" name="Failed Queries" fill={C_NAVY} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Failed Query Reasons" isLight={isLight} totals={SHOW_METRIC.failedQueryReasons ? totalsFailedReasons : undefined}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={failedReasonsData} barSize={isLight ? 30 : undefined} margin={{ bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis
              dataKey="error_code"
              tick={{ ...AXIS, angle: -35, textAnchor: 'end' }}
              axisLine={false}
              tickLine={false}
              interval={0}
              height={60}
            />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} />
            <Tooltip {...TT} cursor={{ fill: cursorFill }} formatter={(v) => [formatMetricNumber(Number(v)), 'Failed Queries']} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Failed Queries'} wrapperStyle={legendStyle} />
            <Bar dataKey="error_count" name="Failed Queries" fill={C_NAVY} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>
    </div>
  )
}
