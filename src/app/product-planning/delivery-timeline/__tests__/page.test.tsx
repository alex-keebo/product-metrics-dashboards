import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import DeliveryTimelinePage from '../page'

vi.mock('@/lib/fiscal-quarter', () => ({
  currentFiscalQuarterLabel: () => '26-Q2',
  nextFiscalQuarterLabel: () => '26-Q3',
}))

function jsonResponse(rows: unknown[]) {
  return { ok: true, status: 200, json: async () => ({ rows }) } as Response
}

describe('DeliveryTimelinePage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('quarter=26-Q2')) {
          return Promise.resolve(
            jsonResponse([
              {
                key: 'PM-1',
                url: 'https://keebo.atlassian.net/browse/PM-1',
                issueType: 'Idea',
                summary: 'Current ticket',
                status: 'In Progress',
                statusCategory: 'indeterminate',
                priorityOrder: 1,
                roadmap: '26-Q2',
                targetStartDate: '2026-05-05',
                targetCompletionDate: '2026-05-20',
                actualCompletionDate: null,
                featureReleaseDate: null,
                product: [],
                category: [],
                keyCustomers: [],
                salesforceTotalArr: null,
                salesforceOpportunities: null,
              },
            ])
          )
        }
        if (url.includes('quarter=26-Q3')) {
          return Promise.resolve(
            jsonResponse([
              {
                key: 'PM-2',
                url: 'https://keebo.atlassian.net/browse/PM-2',
                issueType: 'Idea',
                summary: 'Next ticket',
                status: 'To Do',
                statusCategory: 'new',
                priorityOrder: 1,
                roadmap: '26-Q3',
                targetStartDate: '2026-08-05',
                targetCompletionDate: '2026-08-20',
                actualCompletionDate: null,
                featureReleaseDate: null,
                product: [],
                category: [],
                keyCustomers: [],
                salesforceTotalArr: null,
                salesforceOpportunities: null,
              },
            ])
          )
        }
        if (url.includes('/api/product-planning/recent-ships')) {
          return Promise.resolve(
            jsonResponse([
              {
                key: 'PM-3',
                url: 'https://keebo.atlassian.net/browse/PM-3',
                issueType: 'Idea',
                summary: 'Shipped ticket',
                status: 'Done',
                statusCategory: 'done',
                priorityOrder: 1,
                roadmap: '26-Q1',
                targetStartDate: '2026-01-05',
                targetCompletionDate: '2026-01-20',
                actualCompletionDate: '2026-01-18',
                featureReleaseDate: null,
                product: [],
                category: [],
                keyCustomers: [],
                salesforceTotalArr: null,
                salesforceOpportunities: null,
              },
            ])
          )
        }
        return Promise.resolve(jsonResponse([]))
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches both quarters and recent ships, and shows the Current Projects tab by default', async () => {
    render(<DeliveryTimelinePage />)
    await waitFor(() => expect(screen.getByText('Current ticket')).toBeInTheDocument())

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/product-planning/delivery-timeline?quarter=26-Q2'
    )
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/product-planning/delivery-timeline?quarter=26-Q3&mode=date'
    )
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/product-planning/recent-ships')
  })

  it('switches to the What\'s Next tab and shows its tickets', async () => {
    render(<DeliveryTimelinePage />)
    await waitFor(() => expect(screen.getByText('Current ticket')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: "What's Next" }))
    expect(screen.getByText('Next ticket')).toBeInTheDocument()
    expect(screen.queryByText('Current ticket')).not.toBeInTheDocument()
  })

  it('switches to the Recent Ships tab and shows its tickets', async () => {
    render(<DeliveryTimelinePage />)
    await waitFor(() => expect(screen.getByText('Current ticket')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Recent Ships' }))
    expect(screen.getByText('Shipped ticket')).toBeInTheDocument()
  })
})
