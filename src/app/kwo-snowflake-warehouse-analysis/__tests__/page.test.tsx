import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('react-day-picker/style.css', () => ({}))

import Page from '../page'

const originalFetch = global.fetch

describe('Snowflake Warehouse Analysis page', () => {
  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('prompts to select a Customer before showing charts', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/customers')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ org_id: '90402', name: 'Acme Corp' }]) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    }) as unknown as typeof fetch

    render(<Page />)
    await waitFor(() => expect(screen.getByText(/select a customer/i)).toBeInTheDocument())
  })

  it('renders the Warehouse Activity chart section once a warehouse is selected', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/customers')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ org_id: '90402', name: 'Acme Corp' }]) })
      }
      if (url.includes('/warehouses')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([{ warehouse_name: 'ANALYTICS_WH' }]) })
      }
      if (url.includes('/cluster-activity')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ intervals: [] }) })
      }
      if (url.includes('/execution-time-histogram')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ buckets: [] }) })
      }
      if (url.includes('/data-scanned-histogram')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ buckets: [] }) })
      }
      if (url.includes('/spillage-histogram')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ buckets: [] }) })
      }
      if (url.includes('/timeseries')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              points: [
                {
                  period_label: '2026-07-15',
                  query_volume_by_type: { SELECT: 10 },
                  failed_query_count_by_error: {},
                  execution_time_avg_ms: 100,
                  execution_time_p95_ms: 100,
                  execution_time_p99_ms: 100,
                  queued_query_count: 0,
                  queue_time_avg_ms: 0,
                  queue_time_p95_ms: 0,
                  queue_time_p99_ms: 0,
                  queue_time_max_ms: 0,
                  bytes_spilled_local: 0,
                  bytes_spilled_remote: 0,
                  bytes_scanned: 0,
                },
              ],
              granularity_used: 'day',
            }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    }) as unknown as typeof fetch

    render(<Page />)

    await selectCustomerAndWarehouse()

    expect(await screen.findByText('Warehouse Activity')).toBeInTheDocument()
  })
})

async function selectCustomerAndWarehouse() {
  await waitFor(() => expect(screen.getByText(/select a customer/i)).toBeInTheDocument())

  fireEvent.click(screen.getByText('Customer'))
  const customerOptions = screen.getAllByText('Acme Corp')
  fireEvent.click(customerOptions[customerOptions.length - 1])

  const warehouseButton = await waitFor(() => {
    const button = screen.getByTestId('warehouse-select-trigger')
    expect(button).not.toBeDisabled()
    return button
  })
  fireEvent.click(warehouseButton)
  const warehouseOptions = await screen.findAllByText('ANALYTICS_WH')
  fireEvent.click(warehouseOptions[warehouseOptions.length - 1])
}
