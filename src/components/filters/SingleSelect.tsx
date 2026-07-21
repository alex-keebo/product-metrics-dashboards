'use client'

import { useState, useRef, useEffect, useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'

interface Option {
  value: string
  label: string
  badge?: ReactNode
}

interface SingleSelectProps {
  label: string
  options: Option[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  testId?: string
  placeholder?: string
}

export function SingleSelect({ label, options, value, onChange, disabled, testId, placeholder }: SingleSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerId = useId()

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const displayLabel = options.find((o) => o.value === value)?.label ?? (value ? value : placeholder ?? '')

  return (
    <div className="inline-flex flex-col gap-1" ref={ref}>
      <label htmlFor={triggerId} className="text-xs text-muted-foreground font-medium">{label}</label>
      <div className="relative">
        <button
          id={triggerId}
          type="button"
          disabled={disabled}
          data-testid={testId}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'flex items-center justify-between w-full min-w-[120px] px-3 py-1.5 rounded border text-sm',
            'bg-card border-border text-foreground',
            'hover:border-ring/50 transition-colors',
            disabled && 'opacity-40 cursor-not-allowed'
          )}
        >
          <span className={cn('truncate whitespace-nowrap', !value && placeholder && 'text-muted-foreground')}>{displayLabel}</span>
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
                  {opt.badge && <span className="ml-2 shrink-0">{opt.badge}</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
