'use client'

import { useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
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
  SeriesLegend,
  SeriesTooltip,
  getChartLegendStyle,
  getAreaDotProps,
  formatMetricNumber,
  formatDecimalNumber,
  formatBytesAsGB,
  C_NAVY,
  C_TEAL,
  C_SLATE,
  C_DEEP,
  C_ICE,
  DARK_GRID,
  LIGHT_GRID,
  DARK_AXIS,
  LIGHT_AXIS,
  DARK_TOOLTIP,
  LIGHT_TOOLTIP,
} from './TimeSeriesCharts'
import type { WarehouseAnalysisPoint } from '@/lib/types'

const SERIES_COLORS = [C_DEEP, C_NAVY, C_SLATE, C_TEAL, C_ICE]

export function collectKeys(points: WarehouseAnalysisPoint[], field: 'query_volume_by_type' | 'failed_query_count_by_error'): string[] {
  const keys = new Set<string>()
  for (const p of points) {
    for (const key of Object.keys(p[field])) keys.add(key)
  }
  return [...keys]
}

function useHiddenSeries() {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  return { hidden, toggle }
}

interface WarehouseAnalysisChartsProps {
  points: WarehouseAnalysisPoint[]
}

export function WarehouseAnalysisCharts({ points }: WarehouseAnalysisChartsProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const GRID = isLight ? LIGHT_GRID : DARK_GRID
  const AXIS = isLight ? LIGHT_AXIS : DARK_AXIS
  const TT = isLight ? LIGHT_TOOLTIP : DARK_TOOLTIP
  const legendStyle = getChartLegendStyle(isLight)
  const cursorFill = isLight ? '#F1F3F5' : '#0d3344'

  const errorCodes = useMemo(() => collectKeys(points, 'failed_query_count_by_error'), [points])

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

  const spillageData = useMemo(
    () =>
      points.map((p) => ({
        period_label_display: p.period_label_display,
        local: p.bytes_spilled_local,
        remote: p.bytes_spilled_remote,
      })),
    [points]
  )

  const errorData = useMemo(
    () =>
      points.map((p) => ({
        period_label_display: p.period_label_display,
        ...Object.fromEntries(errorCodes.map((e) => [e, p.failed_query_count_by_error[e] ?? 0])),
      })),
    [points, errorCodes]
  )

  const errorLegend = useHiddenSeries()

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartWrapper title="Warehouse Usage (Credits)" isLight={isLight}>
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

      <ChartWrapper title="Total Queries" isLight={isLight}>
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

      <ChartWrapper title="Execution Time" isLight={isLight}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={executionData}>
            <defs>
              <linearGradient id="execAvg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C_DEEP} stopOpacity={isLight ? 1 : 0.35} />
                <stop offset="100%" stopColor={C_DEEP} stopOpacity={isLight ? 0.4 : 0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="period_label_display" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} />
            <Tooltip content={<SeriesTooltip isLight={isLight} formatter={formatDecimalNumber} reverse />} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} wrapperStyle={legendStyle} />
            <Area type="monotone" dataKey="avg" name="Avg (ms)" stroke={C_DEEP} strokeWidth={2} fill="url(#execAvg)" {...getAreaDotProps(C_DEEP, isLight)} connectNulls={false} />
            <Area type="monotone" dataKey="p95" name="P95 (ms)" stroke={C_NAVY} strokeWidth={2} fillOpacity={0} {...getAreaDotProps(C_NAVY, isLight)} connectNulls={false} />
            <Area type="monotone" dataKey="p99" name="P99 (ms)" stroke={C_TEAL} strokeWidth={2} fillOpacity={0} {...getAreaDotProps(C_TEAL, isLight)} connectNulls={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Queued Queries" isLight={isLight}>
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

      <ChartWrapper title="Queue Time" isLight={isLight}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={queueTimeData}>
            <defs>
              <linearGradient id="queueAvg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C_DEEP} stopOpacity={isLight ? 1 : 0.35} />
                <stop offset="100%" stopColor={C_DEEP} stopOpacity={isLight ? 0.4 : 0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="period_label_display" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} />
            <Tooltip content={<SeriesTooltip isLight={isLight} formatter={formatDecimalNumber} reverse />} />
            <Legend verticalAlign="bottom" iconType="square" iconSize={20} wrapperStyle={legendStyle} />
            <Area type="monotone" dataKey="avg" name="Avg (ms)" stroke={C_DEEP} strokeWidth={2} fill="url(#queueAvg)" {...getAreaDotProps(C_DEEP, isLight)} connectNulls={false} />
            <Area type="monotone" dataKey="p95" name="P95 (ms)" stroke={C_NAVY} strokeWidth={2} fillOpacity={0} {...getAreaDotProps(C_NAVY, isLight)} connectNulls={false} />
            <Area type="monotone" dataKey="p99" name="P99 (ms)" stroke={C_TEAL} strokeWidth={2} fillOpacity={0} {...getAreaDotProps(C_TEAL, isLight)} connectNulls={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Spillage" isLight={isLight}>
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

      <ChartWrapper title="Failed Queries" isLight={isLight}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={errorData} barSize={isLight ? 30 : undefined}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="period_label_display" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} />
            <Tooltip content={<SeriesTooltip isLight={isLight} formatter={formatMetricNumber} />} cursor={{ fill: cursorFill }} />
            <Legend
              verticalAlign="bottom"
              content={() => (
                <SeriesLegend
                  isLight={isLight}
                  hidden={errorLegend.hidden}
                  toggle={errorLegend.toggle}
                  items={errorCodes.map((code, i) => ({ key: code, label: code, color: SERIES_COLORS[i % SERIES_COLORS.length] }))}
                />
              )}
            />
            {errorCodes.map((code, i) => (
              <Bar
                key={code}
                dataKey={code}
                stackId="errors"
                fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                hide={errorLegend.hidden.has(code)}
                radius={[0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>
    </div>
  )
}
