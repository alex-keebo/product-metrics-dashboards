'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useTheme } from '@/components/layout/ThemeProvider'
import {
  C_NAVY, C_DEEP, C_TEAL, C_SLATE, C_ICE, C_FROST, C_ABYSS,
  LIGHT_AXIS, DARK_AXIS, LIGHT_GRID, DARK_GRID,
  LIGHT_CURSOR_FILL, DARK_CURSOR_FILL,
  TOOLTIP_BG_LIGHT, TOOLTIP_BG_DARK,
  TOOLTIP_BORDER_LIGHT, TOOLTIP_BORDER_DARK,
  TOOLTIP_MUTED_LIGHT, TOOLTIP_MUTED_DARK,
  TOOLTIP_TEXT_LIGHT, TOOLTIP_TEXT_DARK,
  SeriesLegend,
} from './TimeSeriesCharts'
import type { ClusterInterval, WarehouseSizeInterval } from '@/lib/types'
import { WAREHOUSE_ROW_CLUSTER_NUMBER } from '@/lib/clusterIntervals'

const LABEL_WIDTH = 96
const ROW_HEIGHT = 40
const BAR_HEIGHT = 22
const FADE_FRACTION = 0.2
const TICK_COUNT = 5
const MIN_GAP_PCT = 0.15
const NO_DATA_FILL = 'var(--muted-foreground)'
const NO_DATA_KEY = 'nodata'

const SIZE_RANK_COLORS = [C_FROST, C_ICE, C_TEAL, C_SLATE, C_NAVY, C_DEEP, C_ABYSS, C_ABYSS, C_ABYSS, C_ABYSS]
const SIZE_RANK_LABELS = [
  'X-Small', 'Small', 'Medium', 'Large', 'X-Large',
  '2X-Large', '3X-Large', '4X-Large', '5X-Large', '6X-Large',
]

function colorForRank(rank: number | null): string {
  if (rank === null || rank === undefined) return NO_DATA_FILL
  return SIZE_RANK_COLORS[rank] ?? C_ABYSS
}

interface WarehouseActivityTimelineProps {
  intervals: ClusterInterval[]
  sizeIntervals: WarehouseSizeInterval[]
  rangeStart: string
  rangeEnd: string
}

// Rendered timeline segment. Cluster rows map 1:1 from ClusterInterval
// (size_rank absent). Warehouse-row segments come from clipping sizeIntervals
// against activity intervals — resume/suspend events stay the source of truth
// for *when* the row is active; size_rank only supplies color within that span.
interface TimelineSegment {
  cluster_number: number
  start: string
  end: string
  truncated_start: boolean
  truncated_end: boolean
  size_rank?: number | null
}

interface HoverState {
  interval: TimelineSegment
  clientX: number
  clientY: number
}

function toMs(iso: string): number {
  return new Date(iso).getTime()
}

function formatTickLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatDuration(startIso: string, endIso: string): string {
  const totalSeconds = Math.round((toMs(endIso) - toMs(startIso)) / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  return `${minutes}m ${seconds}s`
}

// Clips sizeIntervals against each warehouse activity interval, producing
// colored sub-segments. Gaps within an active interval with no matching size
// data (warehouse active, no query has run yet) become size_rank: null
// segments rendered with a neutral fill.
function buildWarehouseSegments(
  activity: ClusterInterval[],
  sizes: WarehouseSizeInterval[]
): TimelineSegment[] {
  const sortedSizes = [...sizes].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
  const result: TimelineSegment[] = []

  for (const a of activity) {
    const aStartMs = toMs(a.start)
    const aEndMs = toMs(a.end)
    const overlapping = sortedSizes.filter((s) => toMs(s.end) > aStartMs && toMs(s.start) < aEndMs)
    const local: { start: string; end: string; size_rank: number | null }[] = []
    let cursor = a.start

    for (const s of overlapping) {
      const segStart = toMs(s.start) > aStartMs ? s.start : a.start
      const segEnd = toMs(s.end) < aEndMs ? s.end : a.end
      if (toMs(cursor) < toMs(segStart)) {
        local.push({ start: cursor, end: segStart, size_rank: null })
      }
      local.push({ start: segStart, end: segEnd, size_rank: s.size_rank })
      cursor = segEnd
    }
    if (toMs(cursor) < aEndMs) {
      local.push({ start: cursor, end: a.end, size_rank: null })
    }
    if (local.length === 0) {
      local.push({ start: a.start, end: a.end, size_rank: null })
    }

    local.forEach((seg, idx) => {
      result.push({
        cluster_number: WAREHOUSE_ROW_CLUSTER_NUMBER,
        start: seg.start,
        end: seg.end,
        size_rank: seg.size_rank,
        truncated_start: idx === 0 && a.truncated_start,
        truncated_end: idx === local.length - 1 && a.truncated_end,
      })
    })
  }

  return result
}

interface IntervalRectProps {
  interval: TimelineSegment
  x: number
  width: number
  fill: string
  onHover: (state: HoverState | null) => void
}

// Native mouseenter/mousemove/mouseleave listeners (attached directly to the
// rect via a ref) are used instead of React's onMouseEnter/onMouseMove/onMouseLeave
// props: real mouseenter/mouseleave events don't bubble, so a listener bound
// directly to the target is the reliable way to catch them. Only enter/leave are
// wrapped in flushSync (so the tooltip mounts/unmounts synchronously with the
// triggering event) — mousemove fires far more often and can batch normally.
function IntervalRect({ interval, x, width, fill, onHover }: IntervalRectProps) {
  const ref = useRef<SVGRectElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const handleEnter = (e: MouseEvent) => {
      flushSync(() => onHover({ interval, clientX: e.clientX, clientY: e.clientY }))
    }
    const handleMove = (e: MouseEvent) => {
      onHover({ interval, clientX: e.clientX, clientY: e.clientY })
    }
    const handleLeave = () => {
      flushSync(() => onHover(null))
    }

    el.addEventListener('mouseenter', handleEnter)
    el.addEventListener('mousemove', handleMove)
    el.addEventListener('mouseleave', handleLeave)
    return () => {
      el.removeEventListener('mouseenter', handleEnter)
      el.removeEventListener('mousemove', handleMove)
      el.removeEventListener('mouseleave', handleLeave)
    }
  }, [interval, onHover])

  return (
    <rect
      ref={ref}
      x={`${x}%`}
      y={0}
      width={`${width}%`}
      height={BAR_HEIGHT}
      rx={4}
      fill={fill}
      style={{ cursor: 'pointer' }}
    />
  )
}

export function WarehouseActivityTimeline({ intervals, sizeIntervals, rangeStart, rangeEnd }: WarehouseActivityTimelineProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const AXIS = isLight ? LIGHT_AXIS : DARK_AXIS
  const GRID = isLight ? LIGHT_GRID : DARK_GRID
  const CURSOR_FILL = isLight ? LIGHT_CURSOR_FILL : DARK_CURSOR_FILL
  const [hover, setHover] = useState<HoverState | null>(null)
  const [hiddenSizes, setHiddenSizes] = useState<Set<string>>(new Set())

  function toggleSize(key: string) {
    setHiddenSizes((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const rangeStartMs = toMs(rangeStart)
  const rangeEndMs = toMs(rangeEnd)
  const rangeMs = rangeEndMs - rangeStartMs

  const pct = (iso: string) => (rangeMs > 0 ? ((toMs(iso) - rangeStartMs) / rangeMs) * 100 : 0)

  const warehouseActivity = useMemo(
    () => intervals.filter((i) => i.cluster_number === WAREHOUSE_ROW_CLUSTER_NUMBER),
    [intervals]
  )

  const warehouseSegments = useMemo(
    () => buildWarehouseSegments(warehouseActivity, sizeIntervals),
    [warehouseActivity, sizeIntervals]
  )

  const legendItems = useMemo(() => {
    const ranksPresent = new Set<number>()
    let hasNoData = false
    for (const seg of warehouseSegments) {
      if (seg.size_rank === null || seg.size_rank === undefined) hasNoData = true
      else ranksPresent.add(seg.size_rank)
    }
    const items = [...ranksPresent]
      .sort((a, b) => a - b)
      .map((rank) => ({ key: String(rank), color: colorForRank(rank), label: SIZE_RANK_LABELS[rank] ?? `Rank ${rank}` }))
    if (hasNoData) items.push({ key: NO_DATA_KEY, color: NO_DATA_FILL, label: 'No data' })
    return items
  }, [warehouseSegments])

  const visibleWarehouseSegments = useMemo(
    () =>
      warehouseSegments.filter((seg) => {
        const key = seg.size_rank === null || seg.size_rank === undefined ? NO_DATA_KEY : String(seg.size_rank)
        return !hiddenSizes.has(key)
      }),
    [warehouseSegments, hiddenSizes]
  )

  const intervalsByCluster = useMemo(() => {
    const map = new Map<number, ClusterInterval[]>()
    for (const interval of intervals) {
      if (interval.cluster_number === WAREHOUSE_ROW_CLUSTER_NUMBER) continue
      const bucket = map.get(interval.cluster_number)
      if (bucket) bucket.push(interval)
      else map.set(interval.cluster_number, [interval])
    }
    return map
  }, [intervals])

  const clusterNumbers = useMemo(
    () => [...intervalsByCluster.keys()].sort((a, b) => a - b),
    [intervalsByCluster]
  )

  const ticks = useMemo(
    () =>
      Array.from({ length: TICK_COUNT }, (_, i) => {
        const ms = rangeStartMs + (rangeMs * i) / (TICK_COUNT - 1)
        return { pct: (i / (TICK_COUNT - 1)) * 100, label: formatTickLabel(new Date(ms).toISOString()) }
      }),
    [rangeStartMs, rangeMs]
  )

  const bg = isLight ? TOOLTIP_BG_LIGHT : TOOLTIP_BG_DARK
  const border = isLight ? TOOLTIP_BORDER_LIGHT : TOOLTIP_BORDER_DARK
  const muted = isLight ? TOOLTIP_MUTED_LIGHT : TOOLTIP_MUTED_DARK
  const text = isLight ? TOOLTIP_TEXT_LIGHT : TOOLTIP_TEXT_DARK
  const font = 'IBM Plex Sans, sans-serif'

  if (clusterNumbers.length === 0 && warehouseSegments.length === 0) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: muted, fontFamily: font, fontSize: 13 }}>
        No cluster activity for this warehouse in the selected range.
      </div>
    )
  }

  const renderRow = (
    rowKey: string | number,
    label: string,
    rowIntervals: TimelineSegment[],
    fill: string | ((interval: TimelineSegment, idx: number) => string)
  ) => (
    <div key={rowKey} style={{ display: 'flex', alignItems: 'center', height: ROW_HEIGHT }}>
      <div
        style={{
          width: LABEL_WIDTH,
          flexShrink: 0,
          fontFamily: AXIS.fontFamily,
          fontSize: AXIS.fontSize,
          fontWeight: AXIS.fontWeight,
          color: AXIS.fill,
        }}
      >
        {label}
      </div>
      <div style={{ flex: 1, position: 'relative', height: BAR_HEIGHT, borderRadius: 4, background: CURSOR_FILL }}>
        <svg width="100%" height={BAR_HEIGHT} style={{ display: 'block', overflow: 'visible' }}>
          <defs>
            {rowIntervals.map((interval, idx) => {
              if (!interval.truncated_start && !interval.truncated_end) return null
              const gradientId = `row-fade-${rowKey}-${idx}`
              const segFill = typeof fill === 'function' ? fill(interval, idx) : fill
              const stops: { offset: string; opacity: number }[] = [
                { offset: '0%', opacity: interval.truncated_start ? 0 : 1 },
              ]
              if (interval.truncated_start) stops.push({ offset: `${FADE_FRACTION * 100}%`, opacity: 1 })
              if (interval.truncated_end) stops.push({ offset: `${(1 - FADE_FRACTION) * 100}%`, opacity: 1 })
              stops.push({ offset: '100%', opacity: interval.truncated_end ? 0 : 1 })
              return (
                <linearGradient key={gradientId} id={gradientId} x1="0" y1="0" x2="1" y2="0">
                  {stops.map((stop, stopIdx) => (
                    <stop key={stopIdx} offset={stop.offset} stopColor={segFill} stopOpacity={stop.opacity} />
                  ))}
                </linearGradient>
              )
            })}
          </defs>
          {rowIntervals.map((interval, idx) => {
            const x = pct(interval.start)
            let width = Math.max(pct(interval.end) - x, 0.5)
            const next = rowIntervals[idx + 1]
            if (next) {
              const rawEndPct = pct(interval.end)
              const nextX = pct(next.start)
              if (rawEndPct < nextX) {
                width = Math.min(width, Math.max(nextX - x - MIN_GAP_PCT, 0.5))
              }
            }
            const needsGradient = interval.truncated_start || interval.truncated_end
            const segFill = typeof fill === 'function' ? fill(interval, idx) : fill
            return (
              <IntervalRect
                key={idx}
                interval={interval}
                x={x}
                width={width}
                fill={needsGradient ? `url(#row-fade-${rowKey}-${idx})` : segFill}
                onHover={setHover}
              />
            )
          })}
        </svg>
      </div>
    </div>
  )

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex' }}>
        <div style={{ width: LABEL_WIDTH, flexShrink: 0 }} />
        <div style={{ flex: 1, position: 'relative', height: 20 }}>
          {ticks.map((tick) => (
            <span
              key={tick.pct}
              style={{
                position: 'absolute',
                left: `${tick.pct}%`,
                transform: tick.pct === 0 ? 'none' : tick.pct === 100 ? 'translateX(-100%)' : 'translateX(-50%)',
                fontFamily: AXIS.fontFamily,
                fontSize: AXIS.fontSize,
                fontWeight: AXIS.fontWeight,
                color: AXIS.fill,
                whiteSpace: 'nowrap',
              }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>

      {warehouseSegments.length > 0 && (
        <>
          {renderRow('warehouse', 'Warehouse', visibleWarehouseSegments, (seg) => colorForRank(seg.size_rank ?? null))}
          {legendItems.length > 0 && (
            <div style={{ margin: '4px 0 8px' }}>
              <SeriesLegend items={legendItems} hidden={hiddenSizes} toggle={toggleSize} isLight={isLight} />
            </div>
          )}
          <div style={{ height: 1, background: GRID, margin: '4px 0' }} />
        </>
      )}

      {clusterNumbers.map((clusterNumber) =>
        renderRow(
          clusterNumber,
          `Cluster ${clusterNumber}`,
          (intervalsByCluster.get(clusterNumber) ?? []).map((i) => ({ ...i })),
          C_NAVY
        )
      )}

      {hover && (
        <div
          style={{
            position: 'fixed',
            left: hover.clientX + 12,
            top: hover.clientY + 12,
            background: bg,
            border: `1px solid ${border}`,
            borderRadius: 8,
            padding: '10px 14px',
            fontFamily: font,
            fontSize: 12,
            minWidth: 180,
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          <div style={{ color: text, fontWeight: 600, marginBottom: 6 }}>
            {hover.interval.cluster_number === WAREHOUSE_ROW_CLUSTER_NUMBER
              ? 'Warehouse'
              : `Cluster ${hover.interval.cluster_number}`}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: 3 }}>
            <span style={{ color: muted }}>Start</span>
            <span style={{ color: text }}>
              {hover.interval.truncated_start ? 'Running since before selected range' : formatTickLabel(hover.interval.start)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: 3 }}>
            <span style={{ color: muted }}>End</span>
            <span style={{ color: text }}>
              {hover.interval.truncated_end ? 'Still running after selected range' : formatTickLabel(hover.interval.end)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: hover.interval.size_rank !== undefined ? 3 : 0 }}>
            <span style={{ color: muted }}>Duration</span>
            <span style={{ color: text }}>{formatDuration(hover.interval.start, hover.interval.end)}</span>
          </div>
          {hover.interval.size_rank !== undefined && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24 }}>
              <span style={{ color: muted }}>Size</span>
              <span style={{ color: text }}>
                {hover.interval.size_rank === null ? 'No data' : SIZE_RANK_LABELS[hover.interval.size_rank] ?? '—'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
