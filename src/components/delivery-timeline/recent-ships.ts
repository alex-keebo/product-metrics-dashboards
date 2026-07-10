import type { PMBoardRow } from '@/app/api/product-planning/pm-board/route'

export interface RecentMonthGroup {
  monthLabel: string
  monthIndex: number
  tickets: PMBoardRow[]
}

export function groupShippedByMonth(tickets: PMBoardRow[]): RecentMonthGroup[] {
  const groups = new Map<number, RecentMonthGroup>()

  const shipped = tickets
    .filter((t) => t.statusCategory === 'done' && t.actualDeliveryDate !== null)
    .sort((a, b) => (b.priorityOrder ?? -Infinity) - (a.priorityOrder ?? -Infinity))

  for (const ticket of shipped) {
    const date = new Date(`${ticket.actualDeliveryDate}T00:00:00Z`)
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
