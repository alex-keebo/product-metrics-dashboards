import type { PMBoardRow } from '@/app/api/product-planning/pm-board/route'
import { shippedDate } from '@/lib/jira-row-mapper'

export interface RecentMonthGroup {
  monthLabel: string
  monthIndex: number
  tickets: PMBoardRow[]
}

export function groupShippedByMonth(tickets: PMBoardRow[]): RecentMonthGroup[] {
  const groups = new Map<number, RecentMonthGroup>()

  const shipped = tickets
    .map((t) => ({ ticket: t, dateStr: shippedDate(t) }))
    .filter((entry): entry is { ticket: PMBoardRow; dateStr: string } => entry.dateStr !== null)
    .sort((a, b) => (b.ticket.priorityOrder ?? -Infinity) - (a.ticket.priorityOrder ?? -Infinity))

  for (const { ticket, dateStr } of shipped) {
    const date = new Date(`${dateStr}T00:00:00Z`)
    const monthIndex = date.getUTCFullYear() * 12 + date.getUTCMonth()
    if (!groups.has(monthIndex)) {
      groups.set(monthIndex, {
        monthLabel: date.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }),
        monthIndex,
        tickets: [],
      })
    }
    groups.get(monthIndex)!.tickets.push(ticket)
  }

  return [...groups.values()].sort((a, b) => a.monthIndex - b.monthIndex)
}
