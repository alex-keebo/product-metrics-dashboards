'use client'

import { useState } from 'react'
import {
  AreaChart, Area,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  type LegendPayload,
} from 'recharts'
import { TimeSeriesPoint } from '@/lib/types'
import { useTheme } from '@/components/layout/ThemeProvider'

interface ChartData {
  label: string
  value: number
}

interface StackedChartData {
  label: string
  actual: number
  unoptimized: number
  saved: number
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
  const byPeriod = new Map<string, { actual: number; unoptimized: number; saved: number; label: string }>()
  for (const p of (allPeriods ?? [])) {
    byPeriod.set(p.period_start, { actual: 0, unoptimized: 0, saved: 0, label: p.period_label_display })
  }
  for (const p of points) {
    const existing = byPeriod.get(p.period_start) ?? { actual: 0, unoptimized: 0, saved: 0, label: p.period_label_display }
    existing.actual += p.total_spend_dbus - p.unoptimized_spend_dbus
    existing.unoptimized += p.unoptimized_spend_dbus
    existing.saved += p.savings_dbus
    byPeriod.set(p.period_start, existing)
  }

  return Array.from(byPeriod.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({ label: v.label, actual: v.actual, unoptimized: v.unoptimized, saved: v.saved }))
}

function buildSavingsPctData(points: TimeSeriesPoint[], allPeriods?: PeriodMeta[]): ChartData[] {
  const byPeriod = new Map<string, { savings: number; optimized: number; label: string }>()
  for (const p of (allPeriods ?? [])) {
    byPeriod.set(p.period_start, { savings: 0, optimized: 0, label: p.period_label_display })
  }
  for (const p of points) {
    const existing = byPeriod.get(p.period_start) ?? { savings: 0, optimized: 0, label: p.period_label_display }
    existing.savings += p.savings_dbus
    existing.optimized += p.total_spend_dbus - p.unoptimized_spend_dbus
    byPeriod.set(p.period_start, existing)
  }

  return Array.from(byPeriod.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => {
      const denom = v.savings + v.optimized
      return { label: v.label, value: denom > 0 ? (v.savings / denom) * 100 : 0 }
    })
}

const fmtDbu = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmtInt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

// Dark theme constants
const DARK_GRID = '#0d3344'
const DARK_AXIS = { fill: '#6b7f8a', fontSize: 11, fontFamily: 'IBM Plex Sans', fontWeight: 400 }
const DARK_TOOLTIP = {
  contentStyle: { background: '#04202d', border: '1px solid #1a4459', borderRadius: 8 },
  labelStyle: { color: '#6b7f8a', fontSize: 11, fontFamily: 'IBM Plex Sans' },
  itemStyle: { color: '#e8f0f4', fontSize: 12, fontFamily: 'IBM Plex Sans' },
  cursor: { stroke: '#1a4459', strokeWidth: 1 },
}

// Light theme constants (Figma spec)
const LIGHT_GRID = '#cdd2da'
const LIGHT_AXIS = { fill: '#4d565a', fontSize: 12, fontFamily: 'IBM Plex Sans', fontWeight: 400 }
const LIGHT_TOOLTIP = {
  contentStyle: { background: '#ffffff', border: '1px solid #cdd2da', borderRadius: 8 },
  labelStyle: { color: '#4d565a', fontSize: 11, fontFamily: 'IBM Plex Sans' },
  itemStyle: { color: '#051c27', fontSize: 12, fontFamily: 'IBM Plex Sans' },
}

// Chart colors
const C_GREEN = '#56bd88'
const C_NAVY  = '#2a6985'
const C_TEAL  = '#9ac6da'
const C_SLATE = '#6c9db3'

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
  const unoptimized = byKey.unoptimized ?? 0
  const savings     = byKey.saved       ?? 0
  const total           = optimized + unoptimized
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
      {row('Unoptimized spend', fmtDbu.format(unoptimized))}
      <div style={{ borderTop: `1px solid ${border}`, margin: '6px 0' }} />
      {row('Total spend', fmtDbu.format(total), true)}
      {row('Savings', fmtDbu.format(savings), false, C_GREEN)}
      <div style={{ borderTop: `1px solid ${border}`, margin: '6px 0' }} />
      {row('Optimized spend without Keebo', fmtDbu.format(optimizedWithoutKeebo))}
      {row('Savings %', `${savingsPct.toFixed(1)}%`, false, C_GREEN)}
    </div>
  )
}

interface ChartWrapperProps {
  title: string
  children: React.ReactNode
  isLight: boolean
  height?: number
}

function ChartWrapper({ title, children, isLight, height }: ChartWrapperProps) {
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
        <div style={{
          fontFamily: 'Exo, sans-serif',
          fontWeight: 500,
          fontSize: 18,
          lineHeight: '24px',
          color: '#051c27',
          marginBottom: 16,
        }}>{title}</div>
        {children}
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
      <div style={{
        fontFamily: 'Exo, sans-serif',
        fontWeight: 500,
        fontSize: 16,
        lineHeight: '22px',
        color: '#e8f0f4',
        marginBottom: 16,
      }}>{title}</div>
      {children}
    </div>
  )
}

interface QueryVolumePoint {
  period_start: string
  query_count: number
}

function buildQueryVolumeData(queryVolume: QueryVolumePoint[], allPeriods?: PeriodMeta[]): ChartData[] {
  const byPeriod = new Map<string, { sum: number; label: string }>()
  for (const p of (allPeriods ?? [])) {
    byPeriod.set(p.period_start, { sum: 0, label: p.period_label_display })
  }
  for (const qv of queryVolume) {
    const existing = byPeriod.get(qv.period_start)
    if (existing) existing.sum += qv.query_count
  }
  return Array.from(byPeriod.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({ label: v.label, value: v.sum }))
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
  queryVolume?: QueryVolumePoint[]
}

export function TimeSeriesCharts({ points, allPeriods, queryVolume }: TimeSeriesChartsProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const [hiddenBars, setHiddenBars] = useState<Set<string>>(new Set())
  const [savingsPctHidden, setSavingsPctHidden] = useState(false)
  const [warehousesHidden, setWarehousesHidden] = useState(false)
  const [queryVolumeHidden, setQueryVolumeHidden] = useState(false)

  const savingsPct    = buildSavingsPctData(points, allPeriods)
  const stackedSavings = buildStackedSavingsData(points, allPeriods)
  const warehouses    = buildChartData(points, 'warehouses', allPeriods)
  const queryVolumeData = buildQueryVolumeData(queryVolume ?? [], allPeriods)
  const fmtKM = makeKMFormatter(queryVolumeData)

  const GRID   = isLight ? LIGHT_GRID   : DARK_GRID
  const AXIS   = isLight ? LIGHT_AXIS   : DARK_AXIS
  const TT     = isLight ? LIGHT_TOOLTIP : DARK_TOOLTIP

  const legendStyle = {
    fontFamily: 'IBM Plex Sans',
    fontSize: 14,
    color: isLight ? '#4E575B' : '#6b7f8a',
    paddingTop: 12,
    cursor: 'pointer',
  }

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
      <ChartWrapper title="Savings (%)" isLight={isLight}>
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
              wrapperStyle={legendStyle}
              onClick={() => setSavingsPctHidden(h => !h)}
            />
            <Area
              type="monotone"
              dataKey="value"
              hide={savingsPctHidden}
              stroke={C_GREEN}
              strokeWidth={2}
              fill="url(#fillSavingsPct)"
              dot={isLight
                ? { fill: C_GREEN, stroke: C_GREEN, strokeWidth: 2, r: 4 }
                : { fill: C_GREEN, stroke: C_GREEN, strokeWidth: 0, r: 4 }}
              activeDot={isLight
                ? { fill: '#adc5fd', stroke: '#3770f7', strokeWidth: 2, r: 6 }
                : { fill: C_GREEN, stroke: C_GREEN, strokeWidth: 0, r: 6 }}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Usage & Savings (DBUs)" isLight={isLight}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={stackedSavings} barSize={isLight ? 30 : undefined}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => fmtDbu.format(v)} />
            <Tooltip content={<UsageTooltip isLight={isLight} />} cursor={{ fill: isLight ? '#F1F3F5' : '#0d3344' }} />
            <Legend
              verticalAlign="bottom"
              iconType="square"
              iconSize={20}
              formatter={(value) =>
                value === 'actual' ? 'Optimized spend' : value === 'unoptimized' ? 'Unoptimized spend' : 'Savings'
              }
              wrapperStyle={legendStyle}
              onClick={toggleBar}
            />
            <Bar dataKey="actual"      stackId="s" fill={C_NAVY}  radius={[0, 0, 0, 0]} hide={hiddenBars.has('actual')} />
            <Bar dataKey="unoptimized" stackId="s" fill={C_TEAL}  radius={[0, 0, 0, 0]} hide={hiddenBars.has('unoptimized')} />
            <Bar dataKey="saved"       stackId="s" fill={C_GREEN} radius={[3, 3, 0, 0]} hide={hiddenBars.has('saved')} />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrapper>


      <ChartWrapper title="Warehouses (#)" isLight={isLight}>
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
              wrapperStyle={legendStyle}
              onClick={() => setWarehousesHidden(h => !h)}
            />
            <Area
              type="monotone"
              dataKey="value"
              hide={warehousesHidden}
              stroke={isLight ? '#051c27' : C_TEAL}
              strokeWidth={2}
              fill="url(#fillWarehouses)"
              dot={isLight
                ? { fill: C_TEAL, stroke: '#051c27', strokeWidth: 2, r: 4 }
                : { fill: C_TEAL, stroke: C_TEAL, strokeWidth: 0, r: 4 }}
              activeDot={isLight
                ? { fill: '#adc5fd', stroke: '#3770f7', strokeWidth: 2, r: 6 }
                : { fill: C_TEAL, stroke: C_TEAL, strokeWidth: 0, r: 6 }}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <ChartWrapper title="Query Volumes" isLight={isLight}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={queryVolumeData}>
            <defs>
              <linearGradient id="fillQueryVolume" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C_TEAL} stopOpacity={isLight ? 1 : 0.35} />
                <stop offset="100%" stopColor={C_TEAL} stopOpacity={isLight ? 0.4 : 0.03} />
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
              wrapperStyle={legendStyle}
              onClick={() => setQueryVolumeHidden(h => !h)}
            />
            <Area
              type="monotone"
              dataKey="value"
              hide={queryVolumeHidden}
              stroke={isLight ? '#051c27' : C_TEAL}
              strokeWidth={2}
              fill="url(#fillQueryVolume)"
              dot={isLight
                ? { fill: C_TEAL, stroke: '#051c27', strokeWidth: 2, r: 4 }
                : { fill: C_TEAL, stroke: C_TEAL, strokeWidth: 0, r: 4 }}
              activeDot={isLight
                ? { fill: '#adc5fd', stroke: '#3770f7', strokeWidth: 2, r: 6 }
                : { fill: C_TEAL, stroke: C_TEAL, strokeWidth: 0, r: 6 }}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartWrapper>
    </div>
  )
}
