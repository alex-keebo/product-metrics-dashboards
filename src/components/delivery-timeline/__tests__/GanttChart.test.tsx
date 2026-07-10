import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GanttChart } from '../GanttChart'
import type { PMBoardRow } from '@/app/api/product-planning/pm-board/route'

function row(overrides: Partial<PMBoardRow> = {}): PMBoardRow {
  return {
    key: 'PM-1',
    url: 'https://keebo.atlassian.net/browse/PM-1',
    issueType: 'Idea',
    summary: 'Ticket one',
    status: 'In Progress',
    statusCategory: 'indeterminate',
    priorityOrder: 0,
    roadmap: '26-Q2',
    targetStartDate: '2026-05-05',
    targetDeliveryDate: '2026-05-20',
    actualDeliveryDate: null,
    product: [],
    category: [],
    keyCustomers: [],
    salesforceTotalArr: null,
    salesforceOpportunities: null,
    ...overrides,
  }
}

describe('GanttChart', () => {
  it('renders one row per ticket with title, key link, and status pill', () => {
    render(<GanttChart quarterLabel="26-Q2" tickets={[row()]} allowSpillover={false} />)
    expect(screen.getByText('Ticket one')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'PM-1' })).toHaveAttribute(
      'href',
      'https://keebo.atlassian.net/browse/PM-1'
    )
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('2026-05-05 – 2026-05-20')).toBeInTheDocument()
  })

  it('renders a "Dates TBD" row for a ticket missing dates', () => {
    render(
      <GanttChart
        quarterLabel="26-Q2"
        tickets={[row({ targetStartDate: null, targetDeliveryDate: null })]}
        allowSpillover={false}
      />
    )
    expect(screen.getByText('Dates TBD')).toBeInTheDocument()
  })

  it('prefixes a started-before ticket title with the "‹" marker', () => {
    render(
      <GanttChart
        quarterLabel="26-Q2"
        tickets={[row({ targetStartDate: '2026-04-01' })]}
        allowSpillover={false}
      />
    )
    expect(screen.getByText('‹')).toBeInTheDocument()
  })

  it('renders month headers for the axis, marking spillover months', () => {
    render(
      <GanttChart
        quarterLabel="26-Q2"
        tickets={[row({ targetDeliveryDate: '2026-08-15' })]}
        allowSpillover
      />
    )
    expect(screen.getAllByText('May')).toHaveLength(1)
    expect(screen.getAllByText('August')).toHaveLength(1)
  })

  it('sorts started-before tickets to the top', () => {
    render(
      <GanttChart
        quarterLabel="26-Q2"
        tickets={[
          row({ key: 'PM-2', summary: 'Later', targetStartDate: '2026-05-10', priorityOrder: 100 }),
          row({ key: 'PM-1', summary: 'Started before', targetStartDate: '2026-04-01', priorityOrder: 1 }),
        ]}
        allowSpillover={false}
      />
    )
    const rows = screen.getAllByTestId('gantt-row')
    expect(rows[0]).toHaveTextContent('Started before')
    expect(rows[1]).toHaveTextContent('Later')
  })

  it('shows "Dates TBD" and the "‹" marker together for a ticket with a real start before the axis but a missing delivery date', () => {
    render(
      <GanttChart
        quarterLabel="26-Q2"
        tickets={[row({ targetStartDate: '2026-04-01', targetDeliveryDate: null })]}
        allowSpillover={false}
      />
    )
    expect(screen.getByText('Dates TBD')).toBeInTheDocument()
    expect(screen.getByText('‹')).toBeInTheDocument()
  })
})
