import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RecentShips } from '../RecentShips'
import type { PMBoardRow } from '@/app/api/product-planning/pm-board/route'

function row(overrides: Partial<PMBoardRow> = {}): PMBoardRow {
  return {
    key: 'PM-1',
    url: 'https://keebo.atlassian.net/browse/PM-1',
    issueType: 'Idea',
    summary: 'Shipped thing',
    status: 'Done',
    statusCategory: 'done',
    priorityOrder: 0,
    roadmap: '26-Q1',
    targetStartDate: null,
    targetDeliveryDate: null,
    actualDeliveryDate: '2026-02-10',
    product: [],
    category: [],
    keyCustomers: [],
    salesforceTotalArr: null,
    salesforceOpportunities: null,
    ...overrides,
  }
}

describe('RecentShips', () => {
  it('shows a generic "Last 3 Months" header', () => {
    render(<RecentShips tickets={[row()]} />)
    expect(screen.getByText('Last 3 Months')).toBeInTheDocument()
  })

  it('renders one month section per shipped month, with ticket title and linked key', () => {
    render(<RecentShips tickets={[row()]} />)
    expect(screen.getByText('February')).toBeInTheDocument()
    expect(screen.getByText('Shipped thing')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'PM-1' })).toHaveAttribute(
      'href',
      'https://keebo.atlassian.net/browse/PM-1'
    )
  })

  it('omits tickets with no actualDeliveryDate', () => {
    render(<RecentShips tickets={[row({ actualDeliveryDate: null })]} />)
    expect(screen.queryByText('Shipped thing')).not.toBeInTheDocument()
    expect(screen.getByText('No ships recorded.')).toBeInTheDocument()
  })

  it('shows a message when nothing shipped', () => {
    render(<RecentShips tickets={[]} />)
    expect(screen.getByText('No ships recorded.')).toBeInTheDocument()
  })
})
