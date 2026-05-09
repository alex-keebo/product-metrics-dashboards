'use client'

import { cn } from '@/lib/utils'
import { ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { useTheme } from '@/components/layout/ThemeProvider'

interface KPITileProps {
  label: string
  unit: string
  value: number
  delta: number
  format: 'dbu' | 'pct'
  higherIsBetter: boolean
}

function formatValue(v: number, fmt: 'dbu' | 'pct'): string {
  if (fmt === 'pct') return `${v.toFixed(1)}%`
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return v.toFixed(1)
}

export function KPITile({ label, unit, value, delta, format, higherIsBetter }: KPITileProps) {
  const { theme } = useTheme()
  const dark = theme === 'dark'

  const improved = higherIsBetter ? delta > 0 : delta < 0
  const neutral = delta === 0

  const badgeStyle = neutral
    ? dark
      ? { bg: 'bg-[#1a3a4a]', text: 'text-[#9ac6da]' }
      : { bg: 'bg-[#E8EDF0]', text: 'text-[#4E575B]' }
    : improved
    ? { bg: 'bg-[#E3FFEE]', text: 'text-[#055D35]' }
    : { bg: 'bg-[#FFC4C5]', text: 'text-[#86080A]' }

  const DeltaIcon = neutral ? Minus : improved ? ArrowUp : ArrowDown
  const sign = delta > 0 ? '+' : ''

  const cardStyle = dark
    ? { background: '#00283A', boxShadow: '0px 5px 10px rgba(0,0,0,0.1)' }
    : { background: '#FFFFFF', boxShadow: '0px 5px 10px rgba(0,0,0,0.05)' }

  return (
    <div
      className="rounded-[15px] p-[30px] flex flex-col justify-between min-h-[178px]"
      style={cardStyle}
    >
      {/* Title row */}
      <div className={cn(
        'text-[18px] leading-6 font-heading font-normal',
        dark ? 'text-[#F5F5F5]' : 'text-[#0D2839]'
      )}>
        {label}
      </div>

      {/* Bottom row: value+unit left, badge+period right */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className={cn(
            'text-[40px] leading-[53px] font-heading font-semibold tabular-nums',
            dark ? 'text-[#F5F5F5]' : 'text-[#2D2A2A]'
          )}>
            {formatValue(value, format)}
          </div>
          <div className={cn(
            'text-[14px] leading-5',
            dark ? 'text-[#F5F5F5]' : 'text-[#4E575B]'
          )}>
            {unit}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-[5px] text-[14px] font-medium leading-5 tabular-nums',
            badgeStyle.bg,
            badgeStyle.text
          )}>
            <DeltaIcon className="w-3 h-3 shrink-0" />
            {sign}{formatValue(delta, format)}
          </div>
          <div className={cn(
            'text-[14px] leading-5 text-right',
            dark ? 'text-[#F5F5F5]' : 'text-[#4E575B]'
          )}>
            vs Previous Week
          </div>
        </div>
      </div>
    </div>
  )
}
