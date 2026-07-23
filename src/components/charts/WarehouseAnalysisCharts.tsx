'use client'

import { useMemo, useState } from 'react'
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
  UsageChart,
  SeriesTooltip,
  SeriesLegend,
  SimpleBarChart,
  getChartLegendStyle,
  getAreaDotProps,
  formatMetricNumber,
  formatDecimalNumber,
  formatBytesAsGB,
  C_NAVY,
  C_TEAL,
  C_DEEP,
  C_ICE,
  DARK_GRID,
  LIGHT_GRID,
  DARK_AXIS,
  LIGHT_AXIS,
  DARK_TOOLTIP,
  LIGHT_TOOLTIP,
  LIGHT_CURSOR_FILL,
  DARK_CURSOR_FILL,
} from './TimeSeriesCharts'
import type { HistogramBucket, QueryTypeMetricRow, WarehouseAnalysisPoint } from '@/lib/types'

const QUERY_TYPE_ROW_HEIGHT = 32

function sortedQueryTypeData(rows: QueryTypeMetricRow[]): { label: string; value: number }[] {
  return [...rows].sort((a, b) => b.value - a.value).map((r) => ({ label: r.query_type, value: r.value }))
}

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
  latencyHistogramBuckets?: HistogramBucket[]
  compileTimeHistogramBuckets?: HistogramBucket[]
  executionTimeByTypeRows?: QueryTypeMetricRow[]
  dataScannedByTypeRows?: QueryTypeMetricRow[]
  spillageByTypeRows?: QueryTypeMetricRow[]
  failedQueriesByTypeRows?: QueryTypeMetricRow[]
  /** Timeseries-driven charts (usage, volume, execution/queue time, scanned/spillage totals, failed queries). */
  loading?: boolean
  histogramLoading?: boolean
  dataScannedHistogramLoading?: boolean
  spillageHistogramLoading?: boolean
  latencyHistogramLoading?: boolean
  compileTimeHistogramLoading?: boolean
  executionTimeByTypeLoading?: boolean
  dataScannedByTypeLoading?: boolean
  spillageByTypeLoading?: boolean
  failedQueriesByTypeLoading?: boolean
}


export function WarehouseAnalysisCharts({
  points,
  histogramBuckets,
  dataScannedHistogramBuckets,
  spillageHistogramBuckets,
  latencyHistogramBuckets = [],
  compileTimeHistogramBuckets = [],
  executionTimeByTypeRows = [],
  dataScannedByTypeRows = [],
  spillageByTypeRows = [],
  failedQueriesByTypeRows = [],
  loading,
  histogramLoading,
  dataScannedHistogramLoading,
  spillageHistogramLoading,
  latencyHistogramLoading,
  compileTimeHistogramLoading,
  executionTimeByTypeLoading,
  dataScannedByTypeLoading,
  spillageByTypeLoading,
  failedQueriesByTypeLoading,
}: WarehouseAnalysisChartsProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const GRID = isLight ? LIGHT_GRID : DARK_GRID
  const AXIS = isLight ? LIGHT_AXIS : DARK_AXIS
  const TT = isLight ? LIGHT_TOOLTIP : DARK_TOOLTIP
  const legendStyle = getChartLegendStyle(isLight)
  const staticLegendStyle = { ...legendStyle, cursor: 'default' }
  const cursorFill = isLight ? LIGHT_CURSOR_FILL : DARK_CURSOR_FILL

  const [hiddenConcurrency, setHiddenConcurrency] = useState<Set<string>>(new Set())
  const [hiddenExecution, setHiddenExecution] = useState<Set<string>>(new Set())
  const [hiddenLatency, setHiddenLatency] = useState<Set<string>>(new Set())
  const [hiddenQueueTime, setHiddenQueueTime] = useState<Set<string>>(new Set())
  const [hiddenSpillage, setHiddenSpillage] = useState<Set<string>>(new Set())

  function makeToggle(setter: (fn: (prev: Set<string>) => Set<string>) => void) {
    return (key: string) => setter(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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
        avg: p.execution_time_avg_ms / 1000,
        p95: p.execution_time_p95_ms / 1000,
        p99: p.execution_time_p99_ms / 1000,
        max: p.execution_time_max_ms / 1000,
      })),
    [points]
  )

  const latencyData = useMemo(
    () =>
      points.map((p) => ({
        period_label_display: p.period_label_display,
        avg: p.latency_avg_ms / 1000,
        p95: p.latency_p95_ms / 1000,
        p99: p.latency_p99_ms / 1000,
        max: p.latency_max_ms / 1000,
      })),
    [points]
  )

  const concurrencyData = useMemo(
    () =>
      points.map((p) => ({
        period_label_display: p.period_label_display,
        max: p.concurrent_queries_max,
        perCluster: p.concurrent_queries_per_cluster_max,
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
        avg: p.queue_time_avg_ms / 1000,
        max: p.queue_time_max_ms / 1000,
        total: p.queue_time_total_ms / 1000,
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
      { label: 'Compute credits / 1000 Queries', value: formatDecimalNumber(totalQueries > 0 ? (totalCredits / totalQueries) * 1000 : 0) },
    ]
  }, [points])

  const totalsConcurrency = useMemo(() => {
    if (concurrencyData.length === 0) {
      return [
        { label: 'Max Concurrent', value: formatDecimalNumber(0) },
        { label: 'Max Concurrent per Cluster', value: formatDecimalNumber(0) },
      ]
    }
    const max = Math.max(...concurrencyData.map((d) => d.max))
    const perClusterMax = Math.max(...concurrencyData.map((d) => d.perCluster))
    return [
      { label: 'Max Concurrent', value: formatDecimalNumber(max) },
      { label: 'Max Concurrent per Cluster', value: formatDecimalNumber(perClusterMax) },
    ]
  }, [concurrencyData])

  const totalsExecution = useMemo(() => {
    if (executionData.length === 0) return [{ label: 'Avg (s)', value: formatDecimalNumber(0) }]
    const avg = executionData.reduce((sum, d) => sum + d.avg, 0) / executionData.length
    return [{ label: 'Avg (s)', value: formatDecimalNumber(avg) }]
  }, [executionData])

  const totalsLatency = useMemo(() => {
    if (latencyData.length === 0) return [{ label: 'Avg (s)', value: formatDecimalNumber(0) }]
    const avg = latencyData.reduce((sum, d) => sum + d.avg, 0) / latencyData.length
    return [{ label: 'Avg (s)', value: formatDecimalNumber(avg) }]
  }, [latencyData])

  const totalsLatencyHistogram = useMemo(
    () => [{ label: 'Total Queries', value: formatMetricNumber(latencyHistogramBuckets.reduce((sum, b) => sum + b.query_count, 0)) }],
    [latencyHistogramBuckets]
  )

  const totalsHistogram = useMemo(
    () => [{ label: 'Total Queries', value: formatMetricNumber(histogramBuckets.reduce((sum, b) => sum + b.query_count, 0)) }],
    [histogramBuckets]
  )

  const totalsQueued = useMemo(
    () => [{ label: 'Total Queued', value: formatMetricNumber(queuedData.reduce((sum, d) => sum + d.queued_query_count, 0)) }],
    [queuedData]
  )

  const totalsQueueTime = useMemo(() => {
    if (queueTimeData.length === 0) {
      return [
        { label: 'Max (s)', value: formatDecimalNumber(0) },
        { label: 'Avg (s)', value: formatDecimalNumber(0) },
        { label: 'Total (s)', value: formatDecimalNumber(0) },
      ]
    }
    const max = Math.max(...queueTimeData.map((d) => d.max))
    const avg = queueTimeData.reduce((sum, d) => sum + d.avg, 0) / queueTimeData.length
    const total = queueTimeData.reduce((sum, d) => sum + d.total, 0)
    return [
      { label: 'Max (s)', value: formatDecimalNumber(max) },
      { label: 'Avg (s)', value: formatDecimalNumber(avg) },
      { label: 'Total (s)', value: formatDecimalNumber(total) },
    ]
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

  const executionTimeByTypeData = useMemo(
    () => sortedQueryTypeData(executionTimeByTypeRows).map((d) => ({ ...d, value: d.value / 1000 })),
    [executionTimeByTypeRows]
  )
  const totalsExecutionTimeByType = useMemo(
    () => [{ label: 'Total Execution Time (s)', value: formatDecimalNumber(executionTimeByTypeData.reduce((sum, d) => sum + d.value, 0)) }],
    [executionTimeByTypeData]
  )

  const dataScannedByTypeData = useMemo(() => sortedQueryTypeData(dataScannedByTypeRows), [dataScannedByTypeRows])
  const totalsDataScannedByType = useMemo(
    () => [{ label: 'Total GB', value: `${formatBytesAsGB(dataScannedByTypeData.reduce((sum, d) => sum + d.value, 0))} GB` }],
    [dataScannedByTypeData]
  )

  const spillageByTypeData = useMemo(() => sortedQueryTypeData(spillageByTypeRows), [spillageByTypeRows])
  const totalsSpillageByType = useMemo(
    () => [{ label: 'Total GB', value: `${formatBytesAsGB(spillageByTypeData.reduce((sum, d) => sum + d.value, 0))} GB` }],
    [spillageByTypeData]
  )

  const failedQueriesByTypeData = useMemo(() => sortedQueryTypeData(failedQueriesByTypeRows), [failedQueriesByTypeRows])
  const totalsFailedQueriesByType = useMemo(
    () => [{ label: 'Total Failed', value: formatMetricNumber(failedQueriesByTypeData.reduce((sum, d) => sum + d.value, 0)) }],
    [failedQueriesByTypeData]
  )

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <UsageChart points={points} loading={loading} />

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
            <Tooltip {...TT} cursor={{ fill: cursorFill }} formatter={(v) => [formatDecimalNumber(Number(v)), 'Compute credits / 1000 Queries']} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Compute credits / 1000 Queries'} wrapperStyle={staticLegendStyle} />
            <Bar dataKey="cost_per_1000_queries" name="Compute credits / 1000 Queries" fill={C_NAVY} radius={[3, 3, 0, 0]} />
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
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Total Queries'} wrapperStyle={staticLegendStyle} />
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
            <Legend
              verticalAlign="bottom"
              content={() => (
                <SeriesLegend
                  isLight={isLight}
                  hidden={hiddenConcurrency}
                  toggle={makeToggle(setHiddenConcurrency)}
                  items={[
                    { key: 'max', label: 'Max Concurrent', color: C_NAVY },
                    { key: 'perCluster', label: 'Max Concurrent per Cluster', color: C_DEEP },
                  ]}
                />
              )}
            />
            <Line type="monotone" dataKey="max" name="Max Concurrent" stroke={C_NAVY} strokeWidth={2} hide={hiddenConcurrency.has('max')} {...getAreaDotProps(C_NAVY, isLight)} connectNulls />
            <Line type="monotone" dataKey="perCluster" name="Max Concurrent per Cluster" stroke={C_DEEP} strokeWidth={2} hide={hiddenConcurrency.has('perCluster')} {...getAreaDotProps(C_DEEP, isLight)} connectNulls />
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
            <Legend
              verticalAlign="bottom"
              content={() => (
                <SeriesLegend
                  isLight={isLight}
                  hidden={hiddenExecution}
                  toggle={makeToggle(setHiddenExecution)}
                  items={[
                    { key: 'avg', label: 'Avg (s)', color: C_DEEP },
                    { key: 'p95', label: 'P95 (s)', color: C_NAVY },
                    { key: 'p99', label: 'P99 (s)', color: C_TEAL },
                    { key: 'max', label: 'Max (s)', color: C_ICE },
                  ]}
                />
              )}
            />
            <Line type="monotone" dataKey="avg" name="Avg (s)" stroke={C_DEEP} strokeWidth={2} hide={hiddenExecution.has('avg')} {...getAreaDotProps(C_DEEP, isLight)} connectNulls />
            <Line type="monotone" dataKey="p95" name="P95 (s)" stroke={C_NAVY} strokeWidth={2} hide={hiddenExecution.has('p95')} {...getAreaDotProps(C_NAVY, isLight)} connectNulls />
            <Line type="monotone" dataKey="p99" name="P99 (s)" stroke={C_TEAL} strokeWidth={2} hide={hiddenExecution.has('p99')} {...getAreaDotProps(C_TEAL, isLight)} connectNulls />
            <Line type="monotone" dataKey="max" name="Max (s)" stroke={C_ICE} strokeWidth={2} hide={hiddenExecution.has('max')} {...getAreaDotProps(C_ICE, isLight)} connectNulls />
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
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Queries'} wrapperStyle={staticLegendStyle} />
            <Bar dataKey="query_count" name="Queries" fill={C_NAVY} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Latency" isLight={isLight} totals={totalsLatency} loading={loading}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={latencyData}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="period_label_display" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatDecimalNumber(v)} />
            <Tooltip content={<SeriesTooltip isLight={isLight} formatter={formatDecimalNumber} reverse />} />
            <Legend
              verticalAlign="bottom"
              content={() => (
                <SeriesLegend
                  isLight={isLight}
                  hidden={hiddenLatency}
                  toggle={makeToggle(setHiddenLatency)}
                  items={[
                    { key: 'avg', label: 'Avg (s)', color: C_DEEP },
                    { key: 'p95', label: 'P95 (s)', color: C_NAVY },
                    { key: 'p99', label: 'P99 (s)', color: C_TEAL },
                    { key: 'max', label: 'Max (s)', color: C_ICE },
                  ]}
                />
              )}
            />
            <Line type="monotone" dataKey="avg" name="Avg (s)" stroke={C_DEEP} strokeWidth={2} hide={hiddenLatency.has('avg')} {...getAreaDotProps(C_DEEP, isLight)} connectNulls />
            <Line type="monotone" dataKey="p95" name="P95 (s)" stroke={C_NAVY} strokeWidth={2} hide={hiddenLatency.has('p95')} {...getAreaDotProps(C_NAVY, isLight)} connectNulls />
            <Line type="monotone" dataKey="p99" name="P99 (s)" stroke={C_TEAL} strokeWidth={2} hide={hiddenLatency.has('p99')} {...getAreaDotProps(C_TEAL, isLight)} connectNulls />
            <Line type="monotone" dataKey="max" name="Max (s)" stroke={C_ICE} strokeWidth={2} hide={hiddenLatency.has('max')} {...getAreaDotProps(C_ICE, isLight)} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Latency Distribution" isLight={isLight} totals={totalsLatencyHistogram} loading={latencyHistogramLoading}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={latencyHistogramBuckets} barSize={30}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="bucket_label" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatMetricNumber(v)} />
            <Tooltip cursor={{ fill: cursorFill }} content={<DistributionTooltip isLight={isLight} buckets={latencyHistogramBuckets} />} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Queries'} wrapperStyle={staticLegendStyle} />
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
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Queued Queries'} wrapperStyle={staticLegendStyle} />
            <Bar dataKey="queued_query_count" name="Queued Queries" fill={C_NAVY} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Queue Time" isLight={isLight} totals={totalsQueueTime} loading={loading}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={queueTimeData}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="period_label_display" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatDecimalNumber(v)} />
            <Tooltip content={<SeriesTooltip isLight={isLight} formatter={formatDecimalNumber} reverse />} />
            <Legend
              verticalAlign="bottom"
              content={() => (
                <SeriesLegend
                  isLight={isLight}
                  hidden={hiddenQueueTime}
                  toggle={makeToggle(setHiddenQueueTime)}
                  items={[
                    { key: 'avg', label: 'Avg (s)', color: C_DEEP },
                    { key: 'max', label: 'Max (s)', color: C_ICE },
                    { key: 'total', label: 'Total (s)', color: C_NAVY },
                  ]}
                />
              )}
            />
            <Line type="monotone" dataKey="avg" name="Avg (s)" stroke={C_DEEP} strokeWidth={2} hide={hiddenQueueTime.has('avg')} {...getAreaDotProps(C_DEEP, isLight)} connectNulls />
            <Line type="monotone" dataKey="max" name="Max (s)" stroke={C_ICE} strokeWidth={2} hide={hiddenQueueTime.has('max')} {...getAreaDotProps(C_ICE, isLight)} connectNulls />
            <Line type="monotone" dataKey="total" name="Total (s)" stroke={C_NAVY} strokeWidth={2} hide={hiddenQueueTime.has('total')} {...getAreaDotProps(C_NAVY, isLight)} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Data Scanned" isLight={isLight} totals={totalsScanned} loading={loading}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={scannedData} barSize={30}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="period_label_display" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatBytesAsGB(v)} />
            <Tooltip {...TT} cursor={{ fill: cursorFill }} formatter={(v) => `${formatBytesAsGB(Number(v))} GB`} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Data Scanned'} wrapperStyle={staticLegendStyle} />
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
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Queries'} wrapperStyle={staticLegendStyle} />
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
            <Legend
              verticalAlign="bottom"
              content={() => (
                <SeriesLegend
                  isLight={isLight}
                  hidden={hiddenSpillage}
                  toggle={makeToggle(setHiddenSpillage)}
                  items={[
                    { key: 'local', label: 'Local', color: C_NAVY },
                    { key: 'remote', label: 'Remote', color: C_TEAL },
                  ]}
                />
              )}
            />
            <Bar dataKey="local" name="Local" stackId="spillage" fill={C_NAVY} hide={hiddenSpillage.has('local')} />
            <Bar dataKey="remote" name="Remote" stackId="spillage" fill={C_TEAL} radius={[3, 3, 0, 0]} hide={hiddenSpillage.has('remote')} />
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
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Queries'} wrapperStyle={staticLegendStyle} />
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
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Failed Queries'} wrapperStyle={staticLegendStyle} />
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
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Failed Queries'} wrapperStyle={staticLegendStyle} />
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
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Queries'} wrapperStyle={staticLegendStyle} />
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
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Queries'} wrapperStyle={staticLegendStyle} />
            <Bar dataKey="query_count" name="Queries" fill={C_NAVY} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Execution Time by Query Type" isLight={isLight} totals={totalsExecutionTimeByType} loading={executionTimeByTypeLoading}>
        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
          <SimpleBarChart
            data={executionTimeByTypeData}
            isLight={isLight}
            direction="horizontal"
            formatter={formatDecimalNumber}
            valueName="Execution Time (s)"
            barColor={C_NAVY}
            height={Math.max(220, executionTimeByTypeData.length * QUERY_TYPE_ROW_HEIGHT)}
            yAxisWidth={320}
          />
        </div>
      </ChartWrapper>

      <ChartWrapper title="Data Scanned by Query Type" isLight={isLight} totals={totalsDataScannedByType} loading={dataScannedByTypeLoading}>
        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
          <SimpleBarChart
            data={dataScannedByTypeData}
            isLight={isLight}
            direction="horizontal"
            formatter={(v: number) => `${formatBytesAsGB(v)} GB`}
            valueName="Data Scanned (GB)"
            barColor={C_NAVY}
            height={Math.max(220, dataScannedByTypeData.length * QUERY_TYPE_ROW_HEIGHT)}
            yAxisWidth={320}
          />
        </div>
      </ChartWrapper>

      <ChartWrapper title="Spillage by Query Type" isLight={isLight} totals={totalsSpillageByType} loading={spillageByTypeLoading}>
        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
          <SimpleBarChart
            data={spillageByTypeData}
            isLight={isLight}
            direction="horizontal"
            formatter={(v: number) => `${formatBytesAsGB(v)} GB`}
            valueName="Spillage (GB)"
            barColor={C_NAVY}
            height={Math.max(220, spillageByTypeData.length * QUERY_TYPE_ROW_HEIGHT)}
            yAxisWidth={320}
          />
        </div>
      </ChartWrapper>

      <ChartWrapper title="Failed Queries by Query Type" isLight={isLight} totals={totalsFailedQueriesByType} loading={failedQueriesByTypeLoading}>
        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
          <SimpleBarChart
            data={failedQueriesByTypeData}
            isLight={isLight}
            direction="horizontal"
            formatter={formatMetricNumber}
            valueName="Failed Queries"
            barColor={C_NAVY}
            height={Math.max(220, failedQueriesByTypeData.length * QUERY_TYPE_ROW_HEIGHT)}
            yAxisWidth={320}
          />
        </div>
      </ChartWrapper>
    </div>
  )
}
