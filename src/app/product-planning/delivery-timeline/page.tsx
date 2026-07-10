'use client'

import { useCallback, useEffect, useState } from 'react'
import { currentFiscalQuarterLabel, nextFiscalQuarterLabel } from '@/lib/fiscal-quarter'
import { GanttChart } from '@/components/delivery-timeline/GanttChart'
import { RecentShips } from '@/components/delivery-timeline/RecentShips'
import type { PMBoardRow } from '@/app/api/product-planning/pm-board/route'

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

type TabKey = 'current' | 'next' | 'recent'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'current', label: 'Current Projects' },
  { key: 'next', label: "What's Next" },
  { key: 'recent', label: 'Recent Ships' },
]

async function fetchQuarter(quarter: string): Promise<PMBoardRow[]> {
  const res = await fetch(`/api/product-planning/delivery-timeline?quarter=${quarter}`)
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body.rows as PMBoardRow[]
}

async function fetchRecentShips(): Promise<PMBoardRow[]> {
  const res = await fetch('/api/product-planning/recent-ships')
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body.rows as PMBoardRow[]
}

export default function DeliveryTimelinePage() {
  const [tab, setTab] = useState<TabKey>('current')
  const [current, setCurrent] = useState<PMBoardRow[] | null>(null)
  const [next, setNext] = useState<PMBoardRow[] | null>(null)
  const [recentShips, setRecentShips] = useState<PMBoardRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<FetchError | null>(null)

  const currentLabel = currentFiscalQuarterLabel()
  const nextLabel = nextFiscalQuarterLabel(currentLabel)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [c, n, r] = await Promise.all([
        fetchQuarter(currentLabel),
        fetchQuarter(nextLabel),
        fetchRecentShips(),
      ])
      setCurrent(c)
      setNext(n)
      setRecentShips(r)
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : String(err) })
    } finally {
      setLoading(false)
    }
  }, [currentLabel, nextLabel])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="flex flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Delivery Timeline</h1>
        <button
          onClick={load}
          className="rounded-md border border-border bg-background hover:bg-muted px-3 py-1.5 text-sm font-medium text-foreground transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <SectionError error={error} onRetry={load} />}
      {loading && !current && !next && !recentShips && <SectionLoader />}

      {tab === 'current' && current && <GanttChart quarterLabel={currentLabel} tickets={current} allowSpillover />}
      {tab === 'next' && next && <GanttChart quarterLabel={nextLabel} tickets={next} allowSpillover={false} />}
      {tab === 'recent' && recentShips && <RecentShips tickets={recentShips} />}
    </div>
  )
}
