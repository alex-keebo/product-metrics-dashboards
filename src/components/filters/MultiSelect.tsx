'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown, Check } from 'lucide-react'

interface Option {
  value: string
  label: string
}

interface MultiSelectProps {
  label: string
  options: Option[]
  selected: string[]
  onChange: (values: string[]) => void
  disabled?: boolean
  placeholder?: string
}

export function MultiSelect({ label, options, selected, onChange, disabled, placeholder }: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const allSelected = options.length > 0 && selected.length === options.length

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function toggleSelectAll() {
    if (allSelected) {
      onChange([])
    } else {
      onChange(options.map((o) => o.value))
    }
  }

  function toggleItem(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value))
    } else {
      onChange([...selected, value])
    }
  }

  const displayText =
    selected.length === 0
      ? placeholder ?? 'None selected'
      : allSelected
      ? 'All'
      : selected.length === 1
      ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
      : `${selected.length} selected`

  return (
    <div className="inline-flex flex-col gap-1" ref={ref}>
      <label className="text-xs text-muted-foreground font-medium">{label}</label>
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'flex items-center justify-between w-full min-w-[120px] px-3 py-1.5 rounded border text-sm',
            'bg-card border-border text-foreground',
            'hover:border-ring/50 transition-colors',
            disabled && 'opacity-40 cursor-not-allowed'
          )}
        >
          <span className="truncate whitespace-nowrap">{displayText}</span>
          <ChevronDown className="w-3.5 h-3.5 ml-2 shrink-0 text-muted-foreground" />
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-max max-w-[560px] min-w-full bg-popover border border-border rounded shadow-lg max-h-64 overflow-y-auto">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-popover-foreground hover:bg-secondary border-b border-border whitespace-nowrap"
            >
              <span className={cn('w-4 h-4 border rounded flex items-center justify-center shrink-0',
                allSelected ? 'bg-[#F5F5F5] border-primary dark:bg-secondary dark:border-secondary' : 'border-border'
              )}>
                {allSelected && <Check className="w-3 h-3 text-primary dark:text-secondary-foreground" />}
              </span>
              Select All
            </button>
            {options.map((opt) => {
              const checked = selected.includes(opt.value)
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleItem(opt.value)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-popover-foreground hover:bg-secondary whitespace-nowrap overflow-hidden"
                >
                  <span className={cn('w-4 h-4 border rounded flex items-center justify-center shrink-0',
                    checked ? 'bg-[#F5F5F5] border-primary dark:bg-secondary dark:border-secondary' : 'border-border'
                  )}>
                    {checked && <Check className="w-3 h-3 text-primary dark:text-secondary-foreground" />}
                  </span>
                  <span className="truncate">{opt.label}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
