'use client'

import { useMemo, useRef, useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Filter } from 'lucide-react'
import { ColumnFilterMenu } from './ColumnFilterMenu'
import {
  type CellData,
  type ColumnFilter,
  type ColumnType,
  type SortState,
  matchesCondition,
  matchesValueFilter,
  compareCells,
} from '@/lib/table-filter'

export interface FilterSortColumn<T> {
  key: string
  label: string
  type: ColumnType
  getCell: (row: T) => CellData
  render: (row: T) => React.ReactNode
}

export interface FilterSortTableProps<T> {
  columns: FilterSortColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
}

const PAGE_SIZES = [10, 20, 100]
const TOOLTIP_DELAY_MS = 150

function TruncatedCell({ text, children }: { text: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleEnter() {
    if (!text) return
    timeoutRef.current = setTimeout(() => setVisible(true), TOOLTIP_DELAY_MS)
  }

  function handleLeave() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setVisible(false)
  }

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [])

  return (
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <div className="block max-w-[40ch] truncate">{children}</div>
      {visible && (
        <div className="absolute left-0 top-full z-50 mt-1 max-w-xs rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground shadow-md whitespace-normal break-words">
          {text}
        </div>
      )}
    </div>
  )
}

export function FilterSortTable<T>({ columns, rows, rowKey }: FilterSortTableProps<T>) {
  const [filters, setFilters] = useState<Record<string, ColumnFilter>>({})
  const [sort, setSort] = useState<SortState | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setPage(0)
  }, [filters, sort])

  useEffect(() => {
    if (!openMenu) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [openMenu])

  const uniqueValuesByColumn = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const col of columns) {
      const set = new Set<string>()
      for (const row of rows) {
        const cell = col.getCell(row)
        for (const v of cell.values.length ? cell.values : cell.isEmpty ? [] : [cell.text]) {
          set.add(v)
        }
      }
      map[col.key] = Array.from(set).sort((a, b) => a.localeCompare(b))
    }
    return map
  }, [columns, rows])

  const processed = useMemo(() => {
    let result = rows.filter((row) =>
      columns.every((col) => {
        const filter = filters[col.key]
        if (!filter) return true
        const cell = col.getCell(row)
        const conditionOk = filter.condition ? matchesCondition(cell, filter.condition) : true
        const valuesOk = matchesValueFilter(cell, filter.values)
        return conditionOk && valuesOk
      })
    )
    if (sort) {
      const col = columns.find((c) => c.key === sort.columnKey)
      if (col) {
        result = [...result].sort((a, b) => {
          const cmp = compareCells(col.type, col.getCell(a), col.getCell(b))
          return sort.direction === 'asc' ? cmp : -cmp
        })
      }
    }
    return result
  }, [rows, columns, filters, sort])

  const totalPages = Math.max(1, Math.ceil(processed.length / pageSize))
  const paged = processed.slice(page * pageSize, (page + 1) * pageSize)

  function isColumnActive(key: string): boolean {
    const filter = filters[key]
    const hasCondition = Boolean(filter?.condition && filter.condition.type !== 'none')
    const hasValues = filter?.values !== undefined
    return hasCondition || hasValues || sort?.columnKey === key
  }

  return (
    <div className="group/tile bg-white dark:bg-card rounded-[20px] shadow-[0px_5px_15px_rgba(0,0,0,0.05)] p-[30px] flex flex-col gap-3">
      <div className="text-[15px] text-muted-foreground">{processed.length} rows</div>

      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-y-0">
          <thead>
            <tr style={{ height: 50 }}>
              {columns.map((col) => (
                <th key={col.key} className="relative px-3 py-2 text-left align-middle text-[15px] font-medium text-foreground whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <span>{col.label}</span>
                    <button
                      data-testid={`fst-filter-btn-${col.key}`}
                      onClick={() => setOpenMenu((prev) => (prev === col.key ? null : col.key))}
                      className={cn(
                        'rounded p-0.5 transition-colors',
                        isColumnActive(col.key)
                          ? 'text-primary'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Filter className="w-3.5 h-3.5" fill={isColumnActive(col.key) ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                  {openMenu === col.key && (
                    <div ref={menuRef} className="absolute left-0 top-full z-50 mt-1">
                      <ColumnFilterMenu
                        columnType={col.type}
                        uniqueValues={uniqueValuesByColumn[col.key]}
                        filter={filters[col.key] ?? {}}
                        sortDirection={sort?.columnKey === col.key ? sort.direction : null}
                        onApply={(filter) =>
                          setFilters((prev) => ({ ...prev, [col.key]: filter }))
                        }
                        onSort={(direction) => {
                          setSort({ columnKey: col.key, direction })
                          setOpenMenu(null)
                        }}
                        onClose={() => setOpenMenu(null)}
                      />
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && (
              <tr style={{ height: 60 }}>
                <td colSpan={columns.length} className="px-3 text-center text-muted-foreground text-[15px]">
                  No data for the current filters
                </td>
              </tr>
            )}
            {paged.map((row, i) => (
              <tr
                key={rowKey(row)}
                data-testid="fst-row"
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
                    key={col.key}
                    className={cn(
                      'px-3 text-[15px] leading-5 font-normal text-foreground whitespace-nowrap',
                      ci === 0 ? 'rounded-l-[5px]' : '',
                      ci === columns.length - 1 ? 'rounded-r-[5px]' : ''
                    )}
                  >
                    <TruncatedCell text={col.getCell(row).text}>
                      {col.render(row)}
                    </TruncatedCell>
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
                  ? 'bg-[#F5F5F5] dark:bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {size}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span>{processed.length === 0 ? 0 : page * pageSize + 1}–{Math.min((page + 1) * pageSize, processed.length)} of {processed.length}</span>
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="disabled:opacity-30 hover:text-foreground transition-colors">‹</button>
          <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)} className="disabled:opacity-30 hover:text-foreground transition-colors">›</button>
        </div>
      </div>
    </div>
  )
}
