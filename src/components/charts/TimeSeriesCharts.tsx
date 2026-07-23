'use client'

import { useState } from 'react'
import {
  AreaChart, Area,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  type LegendPayload,
} from 'recharts'
import { TimeSeriesPoint, TimeSeriesRangeTotals } from '@/lib/types'
import { useTheme } from '@/components/layout/ThemeProvider'

interface ChartData {
  label: string
  value: number
}

interface StackedChartData {
  label: string
  actual: number
  paused: number
  saved: number
  saved_neg: number  // negative part (≤ 0), renders below x-axis
  spacer: number     // = -saved_neg, transparent, lifts the stack back to 0
}

interface PeriodMeta {
  period_start: string
  period_label_display: string
}

function buildChartData(points: TimeSeriesPoint[], key: keyof TimeSeriesPoint, allPeriods?: PeriodMeta[]): ChartData[] {
  const byPeriod = new Map<string, { sum: number; label: string }>()
  for (const p of (allPeriods ?? [])) {
    byPeriod.set(p.period_start, { sum: 0, label: p.period_label_display })
  }
  for (const p of points) {
    const existing = byPeriod.get(p.period_start) ?? { sum: 0, label: p.period_label_display }
    existing.sum += Number(p[key])
    byPeriod.set(p.period_start, existing)
  }

  return Array.from(byPeriod.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({ label: v.label, value: v.sum }))
}

function buildStackedSavingsData(points: TimeSeriesPoint[], allPeriods?: PeriodMeta[]): StackedChartData[] {
  const byPeriod = new Map<string, { actual: number; paused: number; saved: number; label: string }>()
  for (const p of (allPeriods ?? [])) {
    byPeriod.set(p.period_start, { actual: 0, paused: 0, saved: 0, label: p.period_label_display })
  }
  for (const p of points) {
    const existing = byPeriod.get(p.period_start) ?? { actual: 0, paused: 0, saved: 0, label: p.period_label_display }
    existing.actual += p.total_spend_dbus - p.paused_spend_dbus
    existing.paused += p.paused_spend_dbus
    existing.saved += p.savings_dbus
    byPeriod.set(p.period_start, existing)
  }

  return Array.from(byPeriod.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({
      label: v.label,
      actual: v.actual,
      paused: v.paused,
      saved: Math.max(0, v.saved),
      saved_neg: Math.min(0, v.saved),
      spacer: -Math.min(0, v.saved),
    }))
}

function buildSavingsPctData(points: TimeSeriesPoint[], allPeriods?: PeriodMeta[]): ChartData[] {
  const byPeriod = new Map<string, { savings: number; optimized: number; label: string }>()
  for (const p of (allPeriods ?? [])) {
    byPeriod.set(p.period_start, { savings: 0, optimized: 0, label: p.period_label_display })
  }
  for (const p of points) {
    const existing = byPeriod.get(p.period_start) ?? { savings: 0, optimized: 0, label: p.period_label_display }
    existing.savings += p.savings_dbus
    existing.optimized += p.total_spend_dbus - p.paused_spend_dbus
    byPeriod.set(p.period_start, existing)
  }

  return Array.from(byPeriod.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => {
      const denom = v.savings + v.optimized
      return { label: v.label, value: denom > 0 ? (v.savings / denom) * 100 : 0 }
    })
}

const fmtDbu = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtInt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const fmtDecimal = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtGB = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Tooltip/table number format: integers get thousand separators only, decimals get 2 fraction digits + separators. */
export function formatMetricNumber(v: number): string {
  return Number.isInteger(v) ? fmtInt.format(v) : fmtDecimal.format(v)
}

/** Always-2-decimal number format (+ thousand separators) — for metrics that are inherently continuous (e.g. ms latencies), even when a value happens to be a whole number. */
export function formatDecimalNumber(v: number): string {
  return fmtDecimal.format(v)
}

/** Converts a byte count to GB (1024-based) formatted with 1 decimal + thousand separators. */
export function formatBytesAsGB(bytes: number): string {
  return fmtGB.format(bytes / 1024 ** 3)
}

// Dark theme constants
export const DARK_GRID = '#0d3344'
export const DARK_AXIS = { fill: '#6b7f8a', fontSize: 11, fontFamily: 'IBM Plex Sans', fontWeight: 400 }
export const DARK_TOOLTIP = {
  contentStyle: { background: '#04202d', border: '1px solid #1a4459', borderRadius: 8 },
  labelStyle: { color: '#6b7f8a', fontSize: 11, fontFamily: 'IBM Plex Sans' },
  itemStyle: { color: '#e8f0f4', fontSize: 12, fontFamily: 'IBM Plex Sans' },
  cursor: { stroke: '#1a4459', strokeWidth: 1 },
}

// Bar-chart hover/selection cursor fill (also used for the Cluster Activity swimlane background)
export const DARK_CURSOR_FILL = '#0d3344'
export const LIGHT_CURSOR_FILL = '#F1F3F5'

// Light theme constants (Figma spec)
export const LIGHT_GRID = '#cdd2da'
export const LIGHT_AXIS = { fill: '#4d565a', fontSize: 12, fontFamily: 'IBM Plex Sans', fontWeight: 400 }
export const LIGHT_TOOLTIP = {
  contentStyle: { background: '#ffffff', border: '1px solid #cdd2da', borderRadius: 8 },
  labelStyle: { color: '#4d565a', fontSize: 11, fontFamily: 'IBM Plex Sans' },
  itemStyle: { color: '#051c27', fontSize: 12, fontFamily: 'IBM Plex Sans' },
}

export function getAreaDotProps(color: string, isLight: boolean) {
  return {
    dot: isLight
      ? { fill: color, stroke: color, strokeWidth: 2, r: 2 }
      : { fill: color, stroke: color, strokeWidth: 0, r: 2 },
    activeDot: isLight
      ? { fill: '#9AC6DA', stroke: '#2A6985', strokeWidth: 2, r: 4 }
      : { fill: color, stroke: color, strokeWidth: 0, r: 4 },
  }
}

export function getChartLegendStyle(isLight: boolean) {
  return {
    fontFamily: 'IBM Plex Sans',
    fontSize: 14,
    color: isLight ? '#4E575B' : '#6b7f8a',
    paddingTop: 12,
    cursor: 'pointer',
  }
}

export interface SeriesLegendItem {
  key: string
  label: string
  color: string
}

interface SeriesLegendProps {
  items: SeriesLegendItem[]
  hidden: Set<string>
  toggle: (key: string) => void
  isLight: boolean
}

export function SeriesLegend({ items, hidden, toggle, isLight }: SeriesLegendProps) {
  const legendStyle = getChartLegendStyle(isLight)
  return (
    <ul style={{
      ...legendStyle,
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 24,
      listStyle: 'none',
      margin: 0,
      padding: 0,
    }}>
      {items.map(({ key, label, color }) => {
        const inactive = hidden.has(key)
        return (
          <li
            key={key}
            onClick={() => toggle(key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              color: inactive ? (isLight ? '#9aa1a6' : '#3e5562') : legendStyle.color,
            }}
          >
            <span style={{ width: 20, height: 20, background: color, display: 'inline-block', opacity: inactive ? 0.4 : 1 }} />
            {label}
          </li>
        )
      })}
    </ul>
  )
}

// Chart colors
export const C_GREEN = '#56bd88'
export const C_NAVY  = '#2a6985'
export const C_TEAL  = '#9ac6da'
export const C_SLATE = '#6c9db3'
export const C_DEEP  = '#08394f'
export const C_ICE   = '#c4e2f4'
export const C_FROST = '#ebf7fe'
export const C_ABYSS = '#00283a'

// Tooltip colors (light/dark pairs)
export const TOOLTIP_BG_LIGHT     = '#ffffff'
export const TOOLTIP_BG_DARK      = '#04202d'
export const TOOLTIP_BORDER_LIGHT = '#cdd2da'
export const TOOLTIP_BORDER_DARK  = '#1a4459'
export const TOOLTIP_MUTED_LIGHT  = '#4d565a'
export const TOOLTIP_MUTED_DARK   = '#6b7f8a'
export const TOOLTIP_TEXT_LIGHT   = '#051c27'
export const TOOLTIP_TEXT_DARK    = '#e8f0f4'

interface UsageTooltipProps {
  active?: boolean
  payload?: { name: string; value: number }[]
  label?: string
  isLight: boolean
}

function UsageTooltip({ active, payload, label, isLight }: UsageTooltipProps) {
  if (!active || !payload?.length) return null

  const byKey = Object.fromEntries(payload.map(p => [p.name, p.value]))
  const optimized   = byKey.actual      ?? 0
  const paused      = byKey.paused ?? 0
  const savings     = (byKey.saved ?? 0) + (byKey.saved_neg ?? 0)
  const total           = optimized + paused
  const optimizedWithoutKeebo = optimized + savings
  const savingsPct      = optimizedWithoutKeebo > 0 ? (savings / optimizedWithoutKeebo) * 100 : 0

  const bg     = isLight ? '#ffffff' : '#04202d'
  const border = isLight ? '#cdd2da' : '#1a4459'
  const muted  = isLight ? '#4d565a' : '#6b7f8a'
  const text   = isLight ? '#051c27' : '#e8f0f4'
  const font   = 'IBM Plex Sans, sans-serif'

  const row = (label: string, value: string, bold = false, color?: string) => (
    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 32, marginBottom: 3 }}>
      <span style={{ color: muted, fontWeight: bold ? 600 : 400 }}>{label}</span>
      <span style={{ color: color ?? text, fontWeight: bold ? 600 : 400, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )

  return (
    <div style={{
      background: bg, border: `1px solid ${border}`, borderRadius: 8,
      padding: '10px 14px', fontFamily: font, fontSize: 12, minWidth: 220,
    }}>
      <div style={{ color: muted, fontSize: 11, marginBottom: 8 }}>{label}</div>
      {row('Optimized spend', fmtDbu.format(optimized))}
      {row('Optimization paused spend', fmtDbu.format(paused))}
      <div style={{ borderTop: `1px solid ${border}`, margin: '6px 0' }} />
      {row('Total spend', fmtDbu.format(total), true)}
      {row('Savings', fmtDbu.format(savings), false, C_GREEN)}
      <div style={{ borderTop: `1px solid ${border}`, margin: '6px 0' }} />
      {row('Optimized spend without Keebo', fmtDbu.format(optimizedWithoutKeebo))}
      {row('Savings %', `${savingsPct.toFixed(1)}%`, false, C_GREEN)}
    </div>
  )
}

interface SeriesTooltipProps {
  active?: boolean
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[]
  label?: string
  isLight: boolean
  formatter?: (v: number) => string
  /** Render series bottom-to-top instead of the payload's default top-to-bottom order. */
  reverse?: boolean
}

/** Generic multi-series tooltip: name/value rows with values right-aligned and vertically stacked in a fixed-width column. */
export function SeriesTooltip({ active, payload, label, isLight, formatter = formatMetricNumber, reverse = false }: SeriesTooltipProps) {
  if (!active || !payload?.length) return null

  const bg     = isLight ? '#ffffff' : '#04202d'
  const border = isLight ? '#cdd2da' : '#1a4459'
  const muted  = isLight ? '#4d565a' : '#6b7f8a'
  const text   = isLight ? '#051c27' : '#e8f0f4'
  const font   = 'IBM Plex Sans, sans-serif'
  const items  = reverse ? [...payload].reverse() : payload

  return (
    <div style={{
      background: bg, border: `1px solid ${border}`, borderRadius: 8,
      padding: '10px 14px', fontFamily: font, fontSize: 12, minWidth: 160,
    }}>
      <div style={{ color: muted, fontSize: 11, marginBottom: 8 }}>{label}</div>
      {items.map((p, i) => (
        <div key={p.dataKey ?? p.name ?? i} style={{ display: 'flex', justifyContent: 'space-between', gap: 32, marginBottom: 3 }}>
          <span style={{ color: muted }}>{p.name}</span>
          <span style={{ color: p.color ?? text, fontVariantNumeric: 'tabular-nums', textAlign: 'right', minWidth: 64 }}>
            {formatter(Number(p.value))}
          </span>
        </div>
      ))}
    </div>
  )
}

interface ChartWrapperProps {
  title: string
  children: React.ReactNode
  isLight: boolean
  height?: number
  totals?: { label: string; value: string }[] | null
  /** When true, replaces the chart body with a skeleton and forces the totals into their loading state. */
  loading?: boolean
  /** Height of the body skeleton shown while loading. Defaults to 220 to match the standard chart height. */
  skeletonHeight?: number
  /** When true, shows a "Filter not applicable" badge next to the title — for charts sourced from tables the custom filter doesn't scope. */
  notApplicable?: boolean
}

function ChartBodySkeleton({ isLight, height = 220 }: { isLight: boolean; height?: number }) {
  return (
    <div
      className="animate-pulse"
      style={{ height, borderRadius: 8, background: isLight ? '#e4f0f7' : '#0d3344' }}
    />
  )
}

export function ChartWrapper({ title, children, isLight, height, totals, loading, skeletonHeight, notApplicable }: ChartWrapperProps) {
  const effectiveTotals = loading ? null : totals
  if (isLight) {
    return (
      <div style={{
        position: 'relative',
        background: '#FFFFFF',
        boxShadow: '0px 5px 10px rgba(0, 0, 0, 0.05)',
        borderRadius: 15,
        padding: '24px 30px',
        ...(height != null ? { height } : {}),
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              fontFamily: 'Exo, sans-serif',
              fontWeight: 500,
              fontSize: 18,
              lineHeight: '24px',
              color: '#051c27',
            }}>{title}</div>
            {notApplicable && (
              <span
                data-testid="chart-not-applicable-badge"
                style={{
                  fontFamily: 'IBM Plex Sans, sans-serif',
                  fontSize: 10,
                  fontWeight: 500,
                  color: 'var(--muted-foreground)',
                  background: 'var(--muted)',
                  borderRadius: 4,
                  padding: '2px 6px',
                }}
              >
                Filter not applicable
              </span>
            )}
          </div>
          {effectiveTotals !== undefined && (
            <div style={{ display: 'flex', gap: 16, flexShrink: 0, marginLeft: 12 }}>
              {effectiveTotals === null ? (
                <div className="animate-pulse" style={{ width: 56, height: 36, background: '#e4f0f7', borderRadius: 4 }} />
              ) : (
                effectiveTotals.map(({ label, value }) => (
                  <div key={label} style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 15, fontWeight: 600, color: '#051c27' }}>{value}</div>
                    <div style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 10, fontWeight: 400, color: '#4a6373', marginTop: 1 }}>{label}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        {loading ? <ChartBodySkeleton isLight={isLight} height={skeletonHeight} /> : children}
      </div>
    )
  }
  return (
    <div style={{
      position: 'relative',
      background: '#00283A',
      boxShadow: '0px 5px 10px rgba(0, 0, 0, 0.1)',
      borderRadius: 15,
      padding: '20px 24px',
      ...(height != null ? { height } : {}),
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            fontFamily: 'Exo, sans-serif',
            fontWeight: 500,
            fontSize: 16,
            lineHeight: '22px',
            color: '#e8f0f4',
          }}>{title}</div>
          {notApplicable && (
            <span
              data-testid="chart-not-applicable-badge"
              style={{
                fontFamily: 'IBM Plex Sans, sans-serif',
                fontSize: 10,
                fontWeight: 500,
                color: 'var(--muted-foreground)',
                background: 'var(--muted)',
                borderRadius: 4,
                padding: '2px 6px',
              }}
            >
              Filter not applicable
            </span>
          )}
        </div>
        {effectiveTotals !== undefined && (
          <div style={{ display: 'flex', gap: 16, flexShrink: 0, marginLeft: 12 }}>
            {effectiveTotals === null ? (
              <div className="animate-pulse" style={{ width: 56, height: 36, background: '#0d3344', borderRadius: 4 }} />
            ) : (
              effectiveTotals.map(({ label, value }) => (
                <div key={label} style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 15, fontWeight: 600, color: '#e8f0f4' }}>{value}</div>
                  <div style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 10, fontWeight: 400, color: '#6b7f8a', marginTop: 1 }}>{label}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      {loading ? <ChartBodySkeleton isLight={isLight} height={skeletonHeight} /> : children}
    </div>
  )
}



let measureCanvas: HTMLCanvasElement | null = null

function getMeasureCtx(font: string): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null
  if (!measureCanvas) measureCanvas = document.createElement('canvas')
  const ctx = measureCanvas.getContext('2d')
  if (ctx) ctx.font = font
  return ctx
}

/** Always keeps the last `tailChars`, fits as many leading chars of the rest as the
 * available pixel width allows, and puts the ellipsis right before the tail. */
function smartTruncateLabel(
  full: string,
  maxWidthPx: number,
  font: { fontSize: number; fontFamily: string; fontWeight: number },
  tailChars = 20
): string {
  const ctx = getMeasureCtx(`${font.fontWeight} ${font.fontSize}px ${font.fontFamily}`)
  if (!ctx) return full
  if (ctx.measureText(full).width <= maxWidthPx) return full

  const ellipsis = '…'
  const tail = full.length > tailChars ? full.slice(full.length - tailChars) : full
  const headPool = full.slice(0, full.length - tail.length)
  const budget = maxWidthPx - ctx.measureText(tail).width - ctx.measureText(ellipsis).width

  if (budget <= 0 || headPool.length === 0) {
    let lo = 0, hi = tail.length
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      const candidate = ellipsis + tail.slice(tail.length - mid)
      if (ctx.measureText(candidate).width <= maxWidthPx) lo = mid; else hi = mid - 1
    }
    return ellipsis + tail.slice(tail.length - lo)
  }

  let lo = 0, hi = headPool.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (ctx.measureText(headPool.slice(0, mid)).width <= budget) lo = mid; else hi = mid - 1
  }
  return headPool.slice(0, lo) + ellipsis + tail
}

export interface SimpleBarChartProps {
  data: { label: string; value: number }[]
  isLight: boolean
  /** 'vertical' = column bars (label on X); 'horizontal' = sideways bars (label on Y) */
  direction?: 'vertical' | 'horizontal'
  formatter?: (v: number) => string
  barColor?: string
  valueName?: string
  yAxisWidth?: number
  height?: number
  barSize?: number
}

const Y_AXIS_LABEL_PADDING = 14

export function SimpleBarChart({
  data,
  isLight,
  direction = 'vertical',
  formatter = formatMetricNumber,
  barColor = C_NAVY,
  valueName,
  yAxisWidth = 160,
  height = 220,
  barSize,
}: SimpleBarChartProps) {
  const GRID = isLight ? LIGHT_GRID : DARK_GRID
  const AXIS = isLight ? LIGHT_AXIS : DARK_AXIS
  const TT   = isLight ? LIGHT_TOOLTIP : DARK_TOOLTIP
  const cursorFill = isLight ? LIGHT_CURSOR_FILL : DARK_CURSOR_FILL

  if (direction === 'horizontal') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 12, bottom: 4, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
          <XAxis
            type="number"
            tick={AXIS}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatter}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={yAxisWidth}
            tick={(props: { x: string | number; y: string | number; payload: { value: string } }) => {
              const full = props.payload.value
              const label = smartTruncateLabel(full, yAxisWidth - Y_AXIS_LABEL_PADDING, AXIS)
              return (
                <g transform={`translate(${props.x},${props.y})`}>
                  <title>{full}</title>
                  <text
                    x={-6} y={0} dy={4}
                    textAnchor="end"
                    fontSize={AXIS.fontSize}
                    fontFamily={AXIS.fontFamily}
                    fontWeight={AXIS.fontWeight}
                    fill={AXIS.fill}
                  >
                    {label}
                  </text>
                </g>
              )
            }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <Tooltip
            contentStyle={TT.contentStyle}
            labelStyle={TT.labelStyle}
            itemStyle={TT.itemStyle}
            cursor={{ fill: cursorFill }}
            formatter={(v) => [formatter(Number(v)), valueName ?? '']}
          />
          <Bar dataKey="value" fill={barColor} radius={[0, 3, 3, 0]} maxBarSize={barSize ?? 28} />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
        barSize={barSize ?? (isLight ? 30 : undefined)}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={formatter} />
        <Tooltip
          contentStyle={TT.contentStyle}
          labelStyle={TT.labelStyle}
          itemStyle={TT.itemStyle}
          cursor={{ fill: cursorFill }}
          formatter={(v) => [formatter(Number(v)), valueName ?? '']}
        />
        <Bar dataKey="value" fill={barColor} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

interface UsageChartPoint {
  period_label_display: string
  credits_used: number
}

interface UsageChartProps {
  points: UsageChartPoint[]
  loading?: boolean
}

export function UsageChart({ points, loading }: UsageChartProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const GRID = isLight ? LIGHT_GRID : DARK_GRID
  const AXIS = isLight ? LIGHT_AXIS : DARK_AXIS
  const TT = isLight ? LIGHT_TOOLTIP : DARK_TOOLTIP
  const cursorFill = isLight ? LIGHT_CURSOR_FILL : DARK_CURSOR_FILL
  const legendStyle = getChartLegendStyle(isLight)
  const staticLegendStyle = { ...legendStyle, cursor: 'default' }

  const totalsUsage = [
    { label: 'Total Credits', value: formatDecimalNumber(points.reduce((sum, p) => sum + p.credits_used, 0)) },
  ]

  return (
    <ChartWrapper title="Usage" isLight={isLight} totals={totalsUsage} loading={loading}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={points} barSize={30}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="period_label_display" tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatDecimalNumber(v)} />
          <Tooltip {...TT} cursor={{ fill: cursorFill }} formatter={(v) => [formatDecimalNumber(Number(v)), 'Credits Used']} />
          <Legend verticalAlign="bottom" iconType="square" iconSize={20} formatter={() => 'Credits Used'} wrapperStyle={staticLegendStyle} />
          <Bar dataKey="credits_used" name="Credits Used" fill={C_NAVY} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartWrapper>
  )
}

interface SpendDistributionPoint {
  warehouse_name: string
  credits_used: number
}

interface SpendDistributionChartProps {
  points: SpendDistributionPoint[]
  loading: boolean
}

const SPEND_ROW_HEIGHT = 32

export function SpendDistributionChart({ points, loading }: SpendDistributionChartProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const sorted = [...points].sort((a, b) => b.credits_used - a.credits_used)
  const data = sorted.map((p) => ({ label: p.warehouse_name, value: p.credits_used }))

  const totalsSpend = [
    { label: 'Total Compute Credits', value: formatDecimalNumber(points.reduce((sum, p) => sum + p.credits_used, 0)) },
  ]

  return (
    <ChartWrapper title="Spend Distribution" isLight={isLight} totals={totalsSpend} loading={loading}>
      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        <SimpleBarChart
          data={data}
          isLight={isLight}
          direction="horizontal"
          formatter={formatDecimalNumber}
          valueName="Credits Used"
          height={Math.max(220, data.length * SPEND_ROW_HEIGHT)}
          yAxisWidth={320}
        />
      </div>
    </ChartWrapper>
  )
}

function makeKMFormatter(data: ChartData[]): (v: number) => string {
  const max = data.length > 0 ? Math.max(...data.map((d) => d.value)) : 0
  if (max >= 1_000_000) return (v) => `${(v / 1_000_000).toFixed(2)}M`
  if (max >= 1_000) return (v) => `${(v / 1_000).toFixed(2)}K`
  return (v) => String(Math.round(v))
}

interface TimeSeriesChartsProps {
  points: TimeSeriesPoint[]
  allPeriods?: PeriodMeta[]
  unit?: string
  queryVolumeEnabled?: boolean
  autoStopLabel?: string
  rangeTotals?: TimeSeriesRangeTotals | null
}

export function TimeSeriesCharts({ points, allPeriods, unit = 'DBUs', queryVolumeEnabled = true, autoStopLabel = 'Auto-stop', rangeTotals }: TimeSeriesChartsProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  function fmtKMSingle(v: number): string {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
    if (v >= 1_000) return `${(v / 1_000).toFixed(2)}K`
    return String(Math.round(v))
  }

  const totalsSavingsPct = rangeTotals
    ? [{ label: 'Avg', value: `${rangeTotals.savings_pct.toFixed(1)}%` }]
    : rangeTotals === null ? null : undefined

  const totalsUsageSavings = rangeTotals
    ? [
        { label: 'Saved', value: fmtDbu.format(rangeTotals.savings_dbus) },
        { label: 'Spent', value: fmtDbu.format(rangeTotals.total_spend_dbus) },
      ]
    : rangeTotals === null ? null : undefined

  const totalsWarehouses = rangeTotals
    ? [{ label: 'Total', value: fmtInt.format(rangeTotals.warehouses) }]
    : rangeTotals === null ? null : undefined

  const totalsQueryVolume = rangeTotals
    ? [{ label: 'Total', value: fmtKMSingle(rangeTotals.query_volume) }]
    : rangeTotals === null ? null : undefined

  const totalsAutoStop = rangeTotals
    ? [{ label: 'Total', value: fmtKMSingle(rangeTotals.auto_stop_events) }]
    : rangeTotals === null ? null : undefined

  const totalsResizing = rangeTotals
    ? [{ label: 'Total', value: fmtKMSingle(rangeTotals.resizing_events) }]
    : rangeTotals === null ? null : undefined

  const [hiddenBars, setHiddenBars] = useState<Set<string>>(new Set())

  const savingsPct    = buildSavingsPctData(points, allPeriods)
  const stackedSavings = buildStackedSavingsData(points, allPeriods)
  const warehouses    = buildChartData(points, 'warehouses', allPeriods)
  const queryVolumeData = buildChartData(points, 'query_volume', allPeriods)
  const autoStopData   = buildChartData(points, 'auto_stop_events', allPeriods)
  const resizingData   = buildChartData(points, 'resizing_events', allPeriods)
  const fmtKM         = makeKMFormatter(queryVolumeData)
  const fmtKMAutoStop = makeKMFormatter(autoStopData)
  const fmtKMResizing = makeKMFormatter(resizingData)

  const GRID   = isLight ? LIGHT_GRID   : DARK_GRID
  const AXIS   = isLight ? LIGHT_AXIS   : DARK_AXIS
  const TT     = isLight ? LIGHT_TOOLTIP : DARK_TOOLTIP

  const legendStyle = getChartLegendStyle(isLight)
  const staticLegendStyle = { ...legendStyle, cursor: 'default' }

  const toggleBar = (data: LegendPayload) => {
    const key = String(data.dataKey)
    setHiddenBars(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartWrapper title="Savings (%)" isLight={isLight} totals={totalsSavingsPct}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={savingsPct}>
            <defs>
              <linearGradient id="fillSavingsPct" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C_GREEN} stopOpacity={isLight ? 1 : 0.35} />
                <stop offset="100%" stopColor={C_GREEN} stopOpacity={isLight ? 0.4 : 0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => `${v.toFixed(1)}%`} />
            <Tooltip {...TT} formatter={(v) => [`${Number(v).toFixed(2)}%`, 'Savings (%)']} />
            <Legend
              verticalAlign="bottom"
              iconType="square"
              iconSize={20}
              formatter={() => 'Savings (%)'}
              wrapperStyle={staticLegendStyle}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={C_GREEN}
              strokeWidth={2}
              fill="url(#fillSavingsPct)"
              dot={isLight
                ? { fill: C_GREEN, stroke: C_GREEN, strokeWidth: 2, r: 2 }
                : { fill: C_GREEN, stroke: C_GREEN, strokeWidth: 0, r: 2 }}
              activeDot={isLight
                ? { fill: '#9AC6DA', stroke: '#2A6985', strokeWidth: 2, r: 4 }
                : { fill: C_GREEN, stroke: C_GREEN, strokeWidth: 0, r: 4 }}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title={`Usage & Savings (${unit})`} isLight={isLight} totals={totalsUsageSavings}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={stackedSavings} barSize={isLight ? 30 : undefined}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => fmtDbu.format(v)} />
            <Tooltip content={<UsageTooltip isLight={isLight} />} cursor={{ fill: isLight ? LIGHT_CURSOR_FILL : DARK_CURSOR_FILL }} />
            <Legend
              verticalAlign="bottom"
              content={() => (
                <SeriesLegend
                  isLight={isLight}
                  hidden={hiddenBars}
                  toggle={(key) => toggleBar({ dataKey: key } as LegendPayload)}
                  items={[
                    { key: 'actual', label: 'Optimized spend', color: C_NAVY },
                    { key: 'paused', label: 'Optimization paused spend', color: C_TEAL },
                    { key: 'saved', label: 'Savings', color: C_GREEN },
                  ]}
                />
              )}
            />
            <Bar dataKey="saved_neg" stackId="s" fill={C_GREEN}       radius={[0, 0, 3, 3]} hide={hiddenBars.has('saved')} />
            <Bar dataKey="spacer"    stackId="s" fill="transparent"  radius={[0, 0, 0, 0]} hide={hiddenBars.has('saved')} isAnimationActive={false} />
            <Bar dataKey="actual"    stackId="s" fill={C_NAVY}       radius={[0, 0, 0, 0]} hide={hiddenBars.has('actual')} />
            <Bar dataKey="paused"    stackId="s" fill={C_TEAL}       radius={[0, 0, 0, 0]} hide={hiddenBars.has('paused')} />
            <Bar dataKey="saved"     stackId="s" fill={C_GREEN}      radius={[3, 3, 0, 0]} hide={hiddenBars.has('saved')} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>


      <ChartWrapper title="Warehouses (#)" isLight={isLight} totals={totalsWarehouses}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={warehouses}>
            <defs>
              <linearGradient id="fillWarehouses" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C_SLATE} stopOpacity={isLight ? 1 : 0.35} />
                <stop offset="100%" stopColor={C_SLATE} stopOpacity={isLight ? 0.4 : 0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} tickFormatter={(v) => fmtInt.format(v)} />
            <Tooltip {...TT} formatter={(v) => [fmtInt.format(Number(v)), 'Warehouses']} />
            <Legend
              verticalAlign="bottom"
              iconType="square"
              iconSize={20}
              formatter={() => 'Warehouses'}
              wrapperStyle={staticLegendStyle}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={isLight ? '#051c27' : C_TEAL}
              strokeWidth={2}
              fill="url(#fillWarehouses)"
              dot={isLight
                ? { fill: C_TEAL, stroke: '#051c27', strokeWidth: 2, r: 2 }
                : { fill: C_TEAL, stroke: C_TEAL, strokeWidth: 0, r: 2 }}
              activeDot={isLight
                ? { fill: '#9AC6DA', stroke: '#2A6985', strokeWidth: 2, r: 4 }
                : { fill: C_TEAL, stroke: C_TEAL, strokeWidth: 0, r: 4 }}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Query Volumes" isLight={isLight} height={queryVolumeEnabled ? undefined : 290} totals={totalsQueryVolume}>
        {queryVolumeEnabled ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={queryVolumeData}>
              <defs>
                <linearGradient id="fillQueryVolume" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C_SLATE} stopOpacity={isLight ? 1 : 0.35} />
                  <stop offset="100%" stopColor={C_SLATE} stopOpacity={isLight ? 0.4 : 0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={fmtKM} />
              <Tooltip {...TT} formatter={(v) => [fmtKM(Number(v)), 'Query Volume']} />
              <Legend
                verticalAlign="bottom"
                iconType="square"
                iconSize={20}
                formatter={() => 'Query Volume'}
                wrapperStyle={staticLegendStyle}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={isLight ? '#051c27' : C_TEAL}
                strokeWidth={2}
                fill="url(#fillQueryVolume)"
                dot={isLight
                  ? { fill: C_TEAL, stroke: '#051c27', strokeWidth: 2, r: 2 }
                  : { fill: C_TEAL, stroke: C_TEAL, strokeWidth: 0, r: 2 }}
                activeDot={isLight
                  ? { fill: '#9AC6DA', stroke: '#2A6985', strokeWidth: 2, r: 4 }
                  : { fill: C_TEAL, stroke: C_TEAL, strokeWidth: 0, r: 4 }}
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{
            height: 220,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isLight ? '#4d565a' : '#6b7f8a',
            fontSize: 13,
            fontFamily: 'IBM Plex Sans, sans-serif',
          }}>
            Configured to not collect this data
          </div>
        )}
      </ChartWrapper>

      <ChartWrapper title={`${autoStopLabel} Optimizations`} isLight={isLight} totals={totalsAutoStop}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={autoStopData}>
            <defs>
              <linearGradient id="fillAutoStop" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C_SLATE} stopOpacity={isLight ? 1 : 0.35} />
                <stop offset="100%" stopColor={C_SLATE} stopOpacity={isLight ? 0.4 : 0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={fmtKMAutoStop} />
            <Tooltip {...TT} formatter={(v) => [fmtKMAutoStop(Number(v)), `${autoStopLabel} Events`]} />
            <Legend
              verticalAlign="bottom"
              iconType="square"
              iconSize={20}
              formatter={() => `${autoStopLabel} Events`}
              wrapperStyle={staticLegendStyle}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={isLight ? '#051c27' : C_TEAL}
              strokeWidth={2}
              fill="url(#fillAutoStop)"
              dot={isLight
                ? { fill: C_TEAL, stroke: '#051c27', strokeWidth: 2, r: 2 }
                : { fill: C_TEAL, stroke: C_TEAL, strokeWidth: 0, r: 2 }}
              activeDot={isLight
                ? { fill: '#9AC6DA', stroke: '#2A6985', strokeWidth: 2, r: 4 }
                : { fill: C_TEAL, stroke: C_TEAL, strokeWidth: 0, r: 4 }}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Resizing Optimizations" isLight={isLight} totals={totalsResizing}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={resizingData}>
            <defs>
              <linearGradient id="fillResizing" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C_SLATE} stopOpacity={isLight ? 1 : 0.35} />
                <stop offset="100%" stopColor={C_SLATE} stopOpacity={isLight ? 0.4 : 0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={fmtKMResizing} />
            <Tooltip {...TT} formatter={(v) => [fmtKMResizing(Number(v)), 'Resizing Events']} />
            <Legend
              verticalAlign="bottom"
              iconType="square"
              iconSize={20}
              formatter={() => 'Resizing Events'}
              wrapperStyle={staticLegendStyle}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={isLight ? '#051c27' : C_TEAL}
              strokeWidth={2}
              fill="url(#fillResizing)"
              dot={isLight
                ? { fill: C_TEAL, stroke: '#051c27', strokeWidth: 2, r: 2 }
                : { fill: C_TEAL, stroke: C_TEAL, strokeWidth: 0, r: 2 }}
              activeDot={isLight
                ? { fill: '#9AC6DA', stroke: '#2A6985', strokeWidth: 2, r: 4 }
                : { fill: C_TEAL, stroke: C_TEAL, strokeWidth: 0, r: 4 }}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartWrapper>
    </div>
  )
}
