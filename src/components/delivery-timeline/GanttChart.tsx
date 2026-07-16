'use client'

import {
  computeAxis,
  axisMonths,
  barPosition,
  dividerLeftPct,
  sortTickets,
  statusPillInfo,
  resolveTicketBar,
  effectiveCompletionDate,
  formatShortDate,
  parseISODate,
} from './gantt'
import { nextFiscalQuarterLabel } from '@/lib/fiscal-quarter'
import type { PMBoardRow } from '@/app/api/product-planning/pm-board/route'

function barColorClasses(statusCategory: string, isTbd: boolean, status: string): string {
  if (isTbd) return 'border-dashed border-muted-foreground bg-muted'
  if (status.toLowerCase() === 'released (in-progress)') return 'border-success-light bg-success-light/10'
  if (status.toLowerCase() === 'paused') return 'border-muted-foreground bg-muted'
  if (statusCategory === 'done') return 'border-success bg-success/10'
  if (statusCategory === 'new') return 'border-border bg-chart-6'
  return 'border-chart-4 bg-chart-4/30'
}

export function GanttChart({
  quarterLabel,
  tickets,
  allowSpillover,
}: {
  quarterLabel: string
  tickets: PMBoardRow[]
  allowSpillover: boolean
}) {
  const { axisStart, axisEnd, quarterEnd } = computeAxis(quarterLabel, tickets, allowSpillover)
  const months = axisMonths(axisStart, axisEnd, quarterEnd)
  const divider = dividerLeftPct(axisStart, axisEnd, quarterEnd)
  const sorted = sortTickets(tickets, axisStart)
  const spilloverLabel = divider !== null ? nextFiscalQuarterLabel(quarterLabel) : null

  const today = new Date()
  const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const showToday = allowSpillover && todayUTC >= axisStart && todayUTC <= axisEnd
  const todayPct = showToday ? barPosition(axisStart, axisEnd, todayUTC, todayUTC).leftPct : null
  const todayLabel = todayUTC.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

  return (
    <div className="relative rounded-lg border border-border bg-card overflow-hidden" data-testid="gantt-chart">
      <div className="relative h-[34px] border-b border-border bg-muted">
        {divider !== null && (
          <div
            className="absolute inset-y-0 bg-muted-foreground/10"
            style={{ left: `${divider}%`, width: `${100 - divider}%` }}
          />
        )}
        {months.map((m) => (
          <div
            key={`${m.label}-${m.leftPct}`}
            className={`absolute top-0 h-full border-l border-border pl-1.5 pt-0.5 text-[9px] ${
              m.isSpillover ? 'text-muted-foreground/60' : 'text-muted-foreground'
            }`}
            style={{ left: `${m.leftPct}%`, width: `${m.widthPct}%` }}
          >
            {m.label}
          </div>
        ))}
        <div className="absolute top-[17px] left-0 pl-1.5 text-[9px] font-semibold tracking-wide text-primary">
          {quarterLabel} ({allowSpillover ? 'current' : 'next'})
        </div>
        {divider !== null && spilloverLabel && (
          <div
            className="absolute top-[17px] pl-1.5 text-[9px] font-semibold tracking-wide text-muted-foreground"
            style={{ left: `${divider}%` }}
          >
            {spilloverLabel} — spillover from tickets below
          </div>
        )}
      </div>

      <div className="relative py-1">
        {divider !== null && (
          <div
            className="absolute inset-y-0 bg-muted-foreground/10"
            style={{ left: `${divider}%`, width: `${100 - divider}%` }}
          />
        )}
        {sorted.map((t) => {
          const pill = statusPillInfo(t.statusCategory, t.status)
          const startedBefore = t.targetStartDate !== null && parseISODate(t.targetStartDate) < axisStart
          const bar = resolveTicketBar(t, axisStart, axisEnd)
          const pos = barPosition(axisStart, axisEnd, bar.start, bar.end)

          return (
            <div key={t.key} className="relative h-8" data-testid="gantt-row">
              <div
                className={`absolute top-0.5 h-7 min-w-[70px] overflow-hidden rounded-md border px-2 py-1 flex flex-col justify-center ${barColorClasses(
                  t.statusCategory,
                  bar.isTbd,
                  t.status
                )} ${startedBefore ? 'rounded-l-none border-l-2 [border-left-style:dashed] border-l-primary' : ''}`}
                style={{ left: `${pos.leftPct}%`, width: `${pos.widthPct}%` }}
              >
                <div className="flex items-baseline justify-between gap-1 min-w-0 leading-none">
                  {startedBefore && <span className="shrink-0 text-xs font-bold text-primary">{'‹'}</span>}
                  <span className="truncate text-xs font-medium text-foreground">{t.summary}</span>
                  <a
                    href={t.url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto shrink-0 text-[10px] text-primary hover:underline"
                  >
                    {t.key}
                  </a>
                </div>
                <div className="flex items-center justify-between gap-1 min-w-0 leading-none">
                  <span className="truncate text-[10px] text-muted-foreground">
                    {bar.isTbd
                      ? 'Dates TBD'
                      : `${formatShortDate(t.targetStartDate as string)} – ${formatShortDate(
                          effectiveCompletionDate(t) as string
                        )}`}
                  </span>
                  <span className={`shrink-0 rounded px-1 text-[9px] font-semibold ${pill.className}`}>
                    {pill.label}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {divider !== null && (
        <div className="absolute inset-y-0 border-l border-dashed border-border" style={{ left: `${divider}%` }} />
      )}

      {showToday && todayPct !== null && (
        <div className="absolute inset-y-0 z-10 border-l-2 border-primary" style={{ left: `${todayPct}%` }}>
          <div className="absolute -top-0.5 left-1 whitespace-nowrap rounded bg-primary px-1.5 py-0.5 text-[9px] font-semibold text-primary-foreground">
            Today · {todayLabel}
          </div>
        </div>
      )}
    </div>
  )
}
