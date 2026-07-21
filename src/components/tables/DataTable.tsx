'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { ChevronUp, ChevronDown, Download } from 'lucide-react'

export interface Column<T> {
  key: keyof T
  label: string
  format?: (v: unknown) => string
  align?: 'left' | 'right'
  nowrap?: boolean
}

interface DataTableProps<T extends Record<string, unknown>> {
  columns: Column<T>[]
  rows: T[]
  defaultSortKey: keyof T
  defaultSortDir?: 'asc' | 'desc'
  csvFilename?: string
}

const PAGE_SIZES = [10, 20, 100]

function formatCell(v: unknown, fmt?: (v: unknown) => string): string {
  if (fmt) return fmt(v)
  if (v === null || v === undefined) return '—'
  return String(v)
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  defaultSortKey,
  defaultSortDir = 'desc',
  csvFilename = 'export.csv',
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<keyof T>(defaultSortKey)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultSortDir)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)

  function toggleSort(key: keyof T) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
    setPage(0)
  }

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av ?? '').localeCompare(String(bv ?? ''))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, sortKey, sortDir])

  const totalPages = Math.ceil(sorted.length / pageSize)
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize)

  function downloadCSV() {
    const header = columns.map((c) => c.label).join(',')
    const body = rows.map((r) =>
      columns.map((c) => {
        const v = formatCell(r[c.key], c.format)
        return `"${v.replace(/"/g, '""')}"`
      }).join(',')
    )
    const csv = [header, ...body].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = csvFilename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="group/tile bg-white dark:bg-card rounded-[20px] shadow-[0px_5px_15px_rgba(0,0,0,0.05)] p-[30px] flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-[15px] text-muted-foreground">{rows.length} rows</div>
        <button
          onClick={downloadCSV}
          className="flex items-center gap-1.5 text-[15px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <Download className="w-3.5 h-3.5 opacity-0 group-hover/tile:opacity-100 transition-opacity" />
          <span className="opacity-0 group-hover/tile:opacity-100 transition-opacity">Download CSV</span>
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-y-0">
          <thead>
            <tr style={{ height: 70 }}>
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  onClick={() => toggleSort(col.key)}
                  className={cn(
                    'px-3 py-2 font-medium cursor-pointer select-none align-middle',
                    'text-[15px] leading-5 text-[#1C2225] dark:text-foreground hover:text-accent transition-colors',
                    col.align === 'right' ? 'text-right' : 'text-left'
                  )}
                >
                  <span className="inline-flex items-start gap-1">
                    <span className="break-words">{col.label}</span>
                    {sortKey === col.key
                      ? sortDir === 'asc'
                        ? <ChevronUp className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        : <ChevronDown className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      : <ChevronDown className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-20" />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && (
              <tr style={{ height: 60 }}>
                <td colSpan={columns.length} className="px-3 text-center text-muted-foreground text-[15px]">
                  No data for the selected filters
                </td>
              </tr>
            )}
            {paged.map((row, i) => (
              <tr
                key={i}
                style={{ height: 60, borderRadius: 5 }}
                className={cn(
                  'transition-colors',
                  i % 2 === 0
                    ? 'bg-[#F5F5F5] dark:bg-secondary'
                    : 'bg-white dark:bg-transparent hover:bg-[#F5F5F5]/60 dark:hover:bg-secondary/50'
                )}
              >
                {columns.map((col, ci) => (
                  <td
                    key={String(col.key)}
                    className={cn(
                      'px-3 text-[15px] leading-5 font-normal text-[#4E575B] dark:text-foreground tabular-nums',
                      col.align === 'right' ? 'text-right' : 'text-left',
                      col.nowrap ? 'whitespace-nowrap' : '',
                      ci === 0 ? 'rounded-l-[5px]' : '',
                      ci === columns.length - 1 ? 'rounded-r-[5px]' : ''
                    )}
                  >
                    {formatCell(row[col.key], col.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-[15px] text-muted-foreground mt-1">
        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          {PAGE_SIZES.map((size) => (
            <button
              key={size}
              onClick={() => { setPageSize(size); setPage(0) }}
              className={cn(
                'px-2 py-0.5 rounded text-[13px] transition-colors',
                pageSize === size
                  ? 'bg-[#F5F5F5] dark:bg-secondary text-[#1C2225] dark:text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {size}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, sorted.length)} of {sorted.length}</span>
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="disabled:opacity-30 hover:text-foreground transition-colors"
          >
            ‹
          </button>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="disabled:opacity-30 hover:text-foreground transition-colors"
          >
            ›
          </button>
        </div>
      </div>
    </div>
  )
}
