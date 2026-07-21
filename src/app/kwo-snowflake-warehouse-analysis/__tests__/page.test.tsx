import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

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
})
