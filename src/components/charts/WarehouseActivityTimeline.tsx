'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useTheme } from '@/components/layout/ThemeProvider'
import {
  C_NAVY, C_DEEP, LIGHT_AXIS, DARK_AXIS, LIGHT_GRID, DARK_GRID,
  TOOLTIP_BG_LIGHT, TOOLTIP_BG_DARK,
  TOOLTIP_BORDER_LIGHT, TOOLTIP_BORDER_DARK,
  TOOLTIP_MUTED_LIGHT, TOOLTIP_MUTED_DARK,
  TOOLTIP_TEXT_LIGHT, TOOLTIP_TEXT_DARK,
} from './TimeSeriesCharts'
import type { ClusterInterval } from '@/lib/types'
import { WAREHOUSE_ROW_CLUSTER_NUMBER } from '@/lib/clusterIntervals'

const LABEL_WIDTH = 96
const ROW_HEIGHT = 40
const BAR_HEIGHT = 22
const FADE_FRACTION = 0.2
const TICK_COUNT = 5
const MIN_GAP_PCT = 0.15

interface WarehouseActivityTimelineProps {
  intervals: ClusterInterval[]
  rangeStart: string
  rangeEnd: string
}

interface HoverState {
  interval: ClusterInterval
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

interface IntervalRectProps {
  interval: ClusterInterval
  x: number
  width: number
  fill: string
  onHover: (state: HoverState | null) => void
}

// Native mouseenter/mousemove/mouseleave listeners (attached directly to the
// rect via a ref) are used instead of React's onMouseEnter/onMouseMove/onMouseLeave
// props: real mouseenter/mouseleave events don't bubble, so a listener bound
// directly to the target is the reliable way to catch them. The state update is
// wrapped in flushSync so the tooltip commits synchronously with the triggering
// event rather than on a later, batched tick.
function IntervalRect({ interval, x, width, fill, onHover }: IntervalRectProps) {
  const ref = useRef<SVGRectElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const handleEnter = (e: MouseEvent) => {
      flushSync(() => onHover({ interval, clientX: e.clientX, clientY: e.clientY }))
    }
    const handleMove = (e: MouseEvent) => {
      flushSync(() => onHover({ interval, clientX: e.clientX, clientY: e.clientY }))
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

export function WarehouseActivityTimeline({ intervals, rangeStart, rangeEnd }: WarehouseActivityTimelineProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const AXIS = isLight ? LIGHT_AXIS : DARK_AXIS
  const GRID = isLight ? LIGHT_GRID : DARK_GRID
  const [hover, setHover] = useState<HoverState | null>(null)

  const rangeStartMs = toMs(rangeStart)
  const rangeEndMs = toMs(rangeEnd)
  const rangeMs = rangeEndMs - rangeStartMs

  const pct = (iso: string) => (rangeMs > 0 ? ((toMs(iso) - rangeStartMs) / rangeMs) * 100 : 0)

  const warehouseIntervals = useMemo(
    () => intervals.filter((i) => i.cluster_number === WAREHOUSE_ROW_CLUSTER_NUMBER),
    [intervals]
  )

  const clusterNumbers = useMemo(
    () =>
      [...new Set(intervals.map((i) => i.cluster_number))]
        .filter((n) => n !== WAREHOUSE_ROW_CLUSTER_NUMBER)
        .sort((a, b) => a - b),
    [intervals]
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

  if (clusterNumbers.length === 0 && warehouseIntervals.length === 0) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: muted, fontFamily: font, fontSize: 13 }}>
        No cluster activity for this warehouse in the selected range.
      </div>
    )
  }

  const renderRow = (rowKey: string | number, label: string, rowIntervals: ClusterInterval[], fill: string) => (
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
      <div style={{ flex: 1, position: 'relative', height: BAR_HEIGHT, borderRadius: 4, background: GRID }}>
        <svg width="100%" height={BAR_HEIGHT} style={{ display: 'block', overflow: 'visible' }}>
          <defs>
            {rowIntervals.map((interval, idx) => {
              if (!interval.truncated_start && !interval.truncated_end) return null
              const gradientId = `row-fade-${rowKey}-${idx}`
              const stops: { offset: string; opacity: number }[] = [
                { offset: '0%', opacity: interval.truncated_start ? 0 : 1 },
              ]
              if (interval.truncated_start) stops.push({ offset: `${FADE_FRACTION * 100}%`, opacity: 1 })
              if (interval.truncated_end) stops.push({ offset: `${(1 - FADE_FRACTION) * 100}%`, opacity: 1 })
              stops.push({ offset: '100%', opacity: interval.truncated_end ? 0 : 1 })
              return (
                <linearGradient key={gradientId} id={gradientId} x1="0" y1="0" x2="1" y2="0">
                  {stops.map((stop, stopIdx) => (
                    <stop key={stopIdx} offset={stop.offset} stopColor={fill} stopOpacity={stop.opacity} />
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
            return (
              <IntervalRect
                key={idx}
                interval={interval}
                x={x}
                width={width}
                fill={needsGradient ? `url(#row-fade-${rowKey}-${idx})` : fill}
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

      {warehouseIntervals.length > 0 && (
        <>
          {renderRow('warehouse', 'Warehouse', warehouseIntervals, C_DEEP)}
          <div style={{ height: 1, background: GRID, margin: '4px 0' }} />
        </>
      )}

      {clusterNumbers.map((clusterNumber) =>
        renderRow(
          clusterNumber,
          `Cluster ${clusterNumber}`,
          intervals.filter((i) => i.cluster_number === clusterNumber),
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
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24 }}>
            <span style={{ color: muted }}>Duration</span>
            <span style={{ color: text }}>{formatDuration(hover.interval.start, hover.interval.end)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
