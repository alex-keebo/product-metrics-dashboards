'use client'

import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { FilterSortTable, type FilterSortColumn } from '@/components/tables/FilterSortTable'
import { textCell, numberCell, dateCell, multiCell } from '@/lib/table-filter'
import type { PMBoardRow } from '@/app/api/product-planning/pm-board/route'

function formatShortDate(value: string | null | undefined): string {
  if (!value) return '—'
  return format(parseISO(value), 'MMM d')
}

interface FetchError {
  message: string
}

function SectionError({ error, onRetry }: { error: FetchError; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between gap-4 flex-wrap">
      <span>Failed to load: {error.message}</span>
      <button
        onClick={onRetry}
        className="rounded-md border border-destructive/40 bg-destructive/10 hover:bg-destructive/20 px-3 py-1 text-xs font-medium"
      >
        Retry
      </button>
    </div>
  )
}

function SectionLoader() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 border-2 border-border border-t-foreground/40 rounded-full animate-spin" />
        Loading…
      </div>
    </div>
  )
}

const COLUMNS: FilterSortColumn<PMBoardRow>[] = [
  {
    key: 'key',
    label: 'Key',
    type: 'text',
    getCell: (r) => textCell(r.key),
    render: (r) => (
      <a href={r.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
        {r.key}
      </a>
    ),
  },
  { key: 'summary', label: 'Summary', type: 'text', getCell: (r) => textCell(r.summary), render: (r) => r.summary || '—' },
  { key: 'status', label: 'Status', type: 'text', getCell: (r) => textCell(r.status), render: (r) => r.status || '—' },
  { key: 'priorityOrder', label: 'Priority order', type: 'number', getCell: (r) => numberCell(r.priorityOrder), render: (r) => (r.priorityOrder ?? '—').toString() },
  { key: 'roadmap', label: 'Roadmap', type: 'text', getCell: (r) => textCell(r.roadmap), render: (r) => r.roadmap ?? '—' },
  { key: 'targetStartDate', label: 'Target start date', type: 'date', getCell: (r) => dateCell(r.targetStartDate), render: (r) => formatShortDate(r.targetStartDate) },
  { key: 'targetCompletionDate', label: 'Target completion date', type: 'date', getCell: (r) => dateCell(r.targetCompletionDate), render: (r) => formatShortDate(r.targetCompletionDate) },
  { key: 'actualCompletionDate', label: 'Actual completion date', type: 'date', getCell: (r) => dateCell(r.actualCompletionDate), render: (r) => formatShortDate(r.actualCompletionDate) },
  { key: 'product', label: 'Product', type: 'multi', getCell: (r) => multiCell(r.product), render: (r) => r.product.join(', ') || '—' },
  { key: 'category', label: 'Category', type: 'multi', getCell: (r) => multiCell(r.category), render: (r) => r.category.join(', ') || '—' },
  { key: 'keyCustomers', label: 'Key customers', type: 'multi', getCell: (r) => multiCell(r.keyCustomers), render: (r) => r.keyCustomers.join(', ') || '—' },
  { key: 'salesforceTotalArr', label: 'Salesforce: Total ARR', type: 'number', getCell: (r) => numberCell(r.salesforceTotalArr), render: (r) => (r.salesforceTotalArr ?? '—').toString() },
  { key: 'salesforceOpportunities', label: 'Salesforce: Opportunities', type: 'text', getCell: (r) => textCell(r.salesforceOpportunities), render: (r) => r.salesforceOpportunities ?? '—' },
]

export default function PMBoardPage() {
  const [rows, setRows] = useState<PMBoardRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<FetchError | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/product-planning/pm-board')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
      setRows(body.rows as PMBoardRow[])
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : String(err) })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="flex flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">PM Board</h1>
        <button
          onClick={load}
          className="rounded-md border border-border bg-background hover:bg-muted px-3 py-1.5 text-sm font-medium text-foreground transition-colors"
        >
          Refresh
        </button>
      </div>

      {error && <SectionError error={error} onRetry={load} />}
      {loading && !rows && <SectionLoader />}
      {rows && <FilterSortTable columns={COLUMNS} rows={rows} rowKey={(r) => r.key} />}
    </div>
  )
}
