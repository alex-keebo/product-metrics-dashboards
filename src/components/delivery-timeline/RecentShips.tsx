'use client'

import { groupShippedByMonth } from './recent-ships'
import type { PMBoardRow } from '@/app/api/product-planning/pm-board/route'

export function RecentShips({ tickets }: { tickets: PMBoardRow[] }) {
  const groups = groupShippedByMonth(tickets)

  return (
    <div className="rounded-lg border border-border bg-card p-4" data-testid="recent-ships-card">
      <h2 className="text-sm font-semibold text-foreground mb-3">Last 3 Months</h2>
      {groups.length === 0 && <p className="text-sm text-muted-foreground">No ships recorded.</p>}
      {groups.map((g) => (
        <div key={g.monthIndex} className="mb-4" data-testid="recent-month-section">
          <h3 className="text-xs font-medium text-muted-foreground uppercase mb-2">{g.monthLabel}</h3>
          <ul className="flex flex-col gap-1">
            {g.tickets.map((t) => (
              <li key={t.key} className="flex text-sm" data-testid="recent-ticket-item">
                <span className="order-1 text-foreground">{t.summary}</span>
                <a href={t.url} target="_blank" rel="noreferrer" className="order-2 ml-1 text-primary hover:underline">
                  {t.key}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
