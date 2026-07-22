'use client'

import { useState, useRef, useEffect, useId, useMemo, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown, Check, Search } from 'lucide-react'

export interface DropdownOption {
  value: string
  label: string
  badge?: ReactNode
  meta?: Record<string, unknown>
}

export interface ShowFilterConfig {
  key: string
  trueLabel: string
  falseLabel: string
  predicate: (opt: DropdownOption) => boolean
}

type DropdownModeProps =
  | { mode: 'single'; value: string; onChange: (value: string) => void }
  | { mode: 'multi'; selected: string[]; onChange: (values: string[]) => void }

type DropdownProps = {
  label: string
  options: DropdownOption[]
  disabled?: boolean
  placeholder?: string
  testId?: string
  searchPlaceholder?: string
  showFilter?: ShowFilterConfig
} & DropdownModeProps

const SEARCH_THRESHOLD = 5

export function Dropdown(props: DropdownProps) {
  const { label, options, disabled, placeholder, testId, searchPlaceholder, showFilter } = props
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [showTrue, setShowTrue] = useState(true)
  const [showFalse, setShowFalse] = useState(true)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const triggerId = useId()

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' })
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

  function toggleOpen() {
    setOpen((v) => {
      if (v) setSearch('')
      return !v
    })
  }

  const showFiltered = useMemo(() => {
    if (!showFilter) return options
    return options.filter((opt) => (showFilter.predicate(opt) ? showTrue : showFalse))
  }, [options, showFilter, showTrue, showFalse])

  const showSearch = showFiltered.length > SEARCH_THRESHOLD

  const filtered = useMemo(() => {
    if (!showSearch || !search.trim()) return showFiltered
    const q = search.trim().toLowerCase()
    return showFiltered.filter((opt) => opt.label.toLowerCase().includes(q))
  }, [showFiltered, showSearch, search])

  const allShowChecked = showTrue && showFalse

  function toggleShowAll() {
    const next = !allShowChecked
    setShowTrue(next)
    setShowFalse(next)
  }

  const displayLabel =
    props.mode === 'single'
      ? options.find((o) => o.value === props.value)?.label ?? (props.value ? props.value : placeholder ?? '')
      : (() => {
          const { selected } = props
          const allSelected = options.length > 0 && selected.length === options.length
          if (selected.length === 0) return placeholder ?? 'None selected'
          if (allSelected) return 'All'
          if (selected.length === 1) return options.find((o) => o.value === selected[0])?.label ?? selected[0]
          return `${selected.length} selected`
        })()

  function toggleItemMulti(value: string) {
    if (props.mode !== 'multi') return
    const { selected, onChange } = props
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  }

  function toggleSelectAllMulti() {
    if (props.mode !== 'multi') return
    const { selected, onChange } = props
    const allSelected = options.length > 0 && selected.length === options.length
    onChange(allSelected ? [] : options.map((o) => o.value))
  }

  const allItemsSelected = props.mode === 'multi' && options.length > 0 && props.selected.length === options.length

  return (
    <div className="inline-flex flex-col gap-1" ref={ref}>
      <label htmlFor={triggerId} className="text-xs text-muted-foreground font-medium">{label}</label>
      <div className="relative">
        <button
          id={triggerId}
          type="button"
          disabled={disabled}
          data-testid={testId}
          onClick={toggleOpen}
          className={cn(
            'flex items-center justify-between w-full min-w-[120px] px-3 py-1.5 rounded border text-sm',
            'bg-card border-border text-foreground',
            'hover:border-ring/50 transition-colors',
            disabled && 'opacity-40 cursor-not-allowed'
          )}
        >
          <span className={cn('truncate whitespace-nowrap', props.mode === 'single' && !props.value && placeholder && 'text-muted-foreground')}>
            {displayLabel}
          </span>
          <ChevronDown className="w-3.5 h-3.5 ml-2 shrink-0 text-muted-foreground" />
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-max max-w-[560px] min-w-full bg-popover border border-border rounded shadow-lg">
            {showFilter && (
              <div className="flex items-center gap-3 px-3 py-2 border-b border-border text-xs whitespace-nowrap">
                <span className="text-muted-foreground">Show:</span>
                <ShowCheckbox label={`All (${options.length})`} checked={allShowChecked} onClick={toggleShowAll} />
                <ShowCheckbox label={showFilter.trueLabel} checked={showTrue} onClick={() => setShowTrue((v) => !v)} />
                <ShowCheckbox label={showFilter.falseLabel} checked={showFalse} onClick={() => setShowFalse((v) => !v)} />
              </div>
            )}

            {showSearch && (
              <div className="p-2 border-b border-border">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={searchPlaceholder ?? `Search ${label.toLowerCase()}...`}
                    className="w-full pl-7 pr-2 py-1.5 rounded border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
            )}

            <div className="max-h-64 overflow-y-auto" ref={listRef}>
              {props.mode === 'multi' && filtered.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectAllMulti}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-popover-foreground hover:bg-secondary border-b border-border whitespace-nowrap"
                >
                  <CheckboxSquare checked={allItemsSelected} />
                  Select All
                </button>
              )}

              {filtered.length === 0 && (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">No results</div>
              )}

              {filtered.map((opt) => {
                if (props.mode === 'single') {
                  const selected = opt.value === props.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      data-selected={selected ? 'true' : undefined}
                      onClick={() => { props.onChange(opt.value); setOpen(false); setSearch('') }}
                      className={cn(
                        'flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-popover-foreground hover:bg-secondary whitespace-nowrap overflow-hidden',
                        selected && 'font-medium text-primary bg-secondary/60'
                      )}
                    >
                      <Check className={cn('w-3.5 h-3.5 shrink-0', selected ? 'text-primary' : 'invisible')} />
                      <span className="truncate">{opt.label}</span>
                      {opt.badge && <span className="ml-auto shrink-0">{opt.badge}</span>}
                    </button>
                  )
                }
                const checked = props.selected.includes(opt.value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleItemMulti(opt.value)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-popover-foreground hover:bg-secondary whitespace-nowrap overflow-hidden"
                  >
                    <CheckboxSquare checked={checked} />
                    <span className="truncate">{opt.label}</span>
                    {opt.badge && <span className="ml-2 shrink-0">{opt.badge}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CheckboxSquare({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        'w-4 h-4 border rounded flex items-center justify-center shrink-0',
        checked ? 'bg-[#F5F5F5] border-primary dark:bg-secondary dark:border-secondary' : 'border-border'
      )}
    >
      {checked && <Check className="w-3 h-3 text-primary dark:text-secondary-foreground" />}
    </span>
  )
}

function ShowCheckbox({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-1.5">
      <CheckboxSquare checked={checked} />
      <span className="text-foreground">{label}</span>
    </button>
  )
}
