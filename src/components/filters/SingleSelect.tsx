'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'

interface Option {
  value: string
  label: string
}

interface SingleSelectProps {
  label: string
  options: Option[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function SingleSelect({ label, options, value, onChange, disabled }: SingleSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const displayLabel = options.find((o) => o.value === value)?.label ?? value

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
          <span className="truncate whitespace-nowrap">{displayLabel}</span>
          <ChevronDown className="w-3.5 h-3.5 ml-2 shrink-0 text-muted-foreground" />
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-max max-w-[560px] min-w-full bg-popover border border-border rounded shadow-lg max-h-64 overflow-y-auto">
            {options.map((opt) => {
              const selected = opt.value === value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false) }}
                  className={cn(
                    'flex items-center w-full px-3 py-2 text-sm text-left text-popover-foreground hover:bg-secondary whitespace-nowrap overflow-hidden',
                    selected && 'font-medium text-primary'
                  )}
                >
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
