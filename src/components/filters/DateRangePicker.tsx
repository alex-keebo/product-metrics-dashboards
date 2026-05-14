'use client'

import { useState, useRef, useEffect } from 'react'
import { DayPicker, type DateRange, type MonthCaptionProps, useDayPicker } from 'react-day-picker'
import 'react-day-picker/style.css'
import { format, subDays, subMonths, startOfYear, parseISO, isBefore, isSameDay } from 'date-fns'
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DateRangePickerProps {
  startDate: string
  endDate: string
  onRangeChange: (start: string, end: string) => void
}

// Computed once at load; page refresh resets it naturally
const YESTERDAY = subDays(new Date(), 1)

const PRESETS: { label: string; getRange: () => DateRange }[] = [
  { label: 'Last 7 days',    getRange: () => ({ from: subDays(YESTERDAY, 6),     to: YESTERDAY }) },
  { label: 'Last 30 days',   getRange: () => ({ from: subDays(YESTERDAY, 29),    to: YESTERDAY }) },
  { label: 'Last 90 days',   getRange: () => ({ from: subDays(YESTERDAY, 89),    to: YESTERDAY }) },
  { label: 'Year to date',   getRange: () => ({ from: startOfYear(new Date()),   to: YESTERDAY }) },
  { label: 'Last 12 months', getRange: () => ({ from: subMonths(YESTERDAY, 12),  to: YESTERDAY }) },
]

// Override react-day-picker CSS variables to match project theme
const RDP_VARS = {
  '--rdp-accent-color':                      'var(--primary)',
  '--rdp-accent-background-color':           'color-mix(in srgb, var(--primary) 15%, transparent)',
  '--rdp-range_middle-background-color':     'var(--secondary)',
  '--rdp-range_middle-color':                'var(--muted-foreground)',
  '--rdp-range_start-color':                 'var(--muted-foreground)',
  '--rdp-range_end-color':                   'var(--muted-foreground)',
  '--rdp-range_start-date-background-color': 'var(--primary)',
  '--rdp-range_end-date-background-color':   'var(--primary)',
  '--rdp-today-color':                       'var(--primary)',
  '--rdp-day-height':                        '36px',
  '--rdp-day-width':                         '36px',
  '--rdp-day_button-height':                 '34px',
  '--rdp-day_button-width':                  '34px',
  '--rdp-day_button-border-radius':          'var(--radius)',
  '--rdp-months-gap':                        '1rem',
  '--rdp-disabled-opacity':                  '0.3',
}

function CustomMonthCaption({ calendarMonth, displayIndex }: MonthCaptionProps) {
  const { goToMonth, previousMonth, nextMonth } = useDayPicker()
  const label = format(calendarMonth.date, 'MMMM yyyy')
  const isFirst = displayIndex === 0

  return (
    <div className="flex items-center justify-between pb-1">
      {/* Left slot: prev arrow on first month, fixed-size spacer on second */}
      {isFirst ? (
        <button
          type="button"
          aria-label="Go to previous month"
          disabled={!previousMonth}
          onClick={() => previousMonth && goToMonth(previousMonth)}
          className="flex items-center justify-center w-7 h-7 rounded hover:bg-secondary disabled:opacity-30 transition-colors shrink-0"
        >
          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
        </button>
      ) : (
        <span className="w-7 h-7 shrink-0" />
      )}

      <span className="text-sm font-medium text-muted-foreground">{label}</span>

      {/* Right slot: next arrow on second month, fixed-size spacer on first */}
      {!isFirst ? (
        <button
          type="button"
          aria-label="Go to next month"
          disabled={!nextMonth}
          onClick={() => nextMonth && goToMonth(nextMonth)}
          className="flex items-center justify-center w-7 h-7 rounded hover:bg-secondary disabled:opacity-30 transition-colors shrink-0"
        >
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      ) : (
        <span className="w-7 h-7 shrink-0" />
      )}
    </div>
  )
}

export function DateRangePicker({ startDate, endDate, onRangeChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  // selectionStart tracks the first clicked date while waiting for the second click
  const [selectionStart, setSelectionStart] = useState<Date | undefined>()
  const containerRef = useRef<HTMLDivElement>(null)

  const committed: DateRange = { from: parseISO(startDate), to: parseISO(endDate) }
  // While waiting for second click, show only the start so the calendar renders hover previews
  const selected: DateRange = selectionStart ? { from: selectionStart, to: undefined } : committed

  useEffect(() => {
    if (!open) return
    function onOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSelectionStart(undefined)
      }
    }
    document.addEventListener('mousedown', onOutsideClick)
    return () => document.removeEventListener('mousedown', onOutsideClick)
  }, [open])

  // Use selectedDay (the actual clicked date) rather than the processed range,
  // because react-day-picker auto-swaps from/to when clicking before the start.
  function handleSelect(_range: DateRange | undefined, selectedDay: Date) {
    if (!selectionStart) {
      // First click: set start, stay open
      setSelectionStart(selectedDay)
    } else if (isSameDay(selectedDay, selectionStart)) {
      // Clicked the same day again: keep waiting for second click
    } else if (isBefore(selectedDay, selectionStart)) {
      // Clicked before start: replace start, stay open
      setSelectionStart(selectedDay)
    } else {
      // Clicked after start: commit range, close
      onRangeChange(format(selectionStart, 'yyyy-MM-dd'), format(selectedDay, 'yyyy-MM-dd'))
      setSelectionStart(undefined)
      setOpen(false)
    }
  }

  function applyPreset(getRange: () => DateRange) {
    const { from, to } = getRange()
    if (from && to) {
      onRangeChange(format(from, 'yyyy-MM-dd'), format(to, 'yyyy-MM-dd'))
      setSelectionStart(undefined)
      setOpen(false)
    }
  }

  const triggerLabel = `${format(parseISO(startDate), 'MMM d, yyyy')} – ${format(parseISO(endDate), 'MMM d, yyyy')}`

  return (
    <div className="relative flex flex-col gap-1" ref={containerRef}>
      <label className="text-xs text-muted-foreground font-medium">Date Range</label>

      <button
        onClick={() => { setOpen((v) => !v); if (open) setSelectionStart(undefined) }}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded border text-sm whitespace-nowrap',
          'bg-card border-border text-foreground',
          'hover:border-ring/50 transition-colors',
          open && 'border-ring/50'
        )}
      >
        <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        {triggerLabel}
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 flex rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
          {/* Preset sidebar */}
          <div className="flex flex-col gap-0.5 border-r border-border p-2 w-36 shrink-0">
            <div className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Quick select
            </div>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.getRange)}
                className="rounded px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Two-month calendar side by side */}
          <div className="keebo-rdp p-4" style={{ fontFamily: 'IBM Plex Sans, var(--font-sans)' }}>
            <DayPicker
              mode="range"
              numberOfMonths={2}
              selected={selected}
              onSelect={handleSelect}
              disabled={{ after: YESTERDAY }}
              defaultMonth={subMonths(parseISO(endDate), 1)}
              hideNavigation
              components={{ MonthCaption: CustomMonthCaption }}
              style={RDP_VARS as React.CSSProperties}
              styles={{ months: { flexDirection: 'row', alignItems: 'flex-start' } }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
