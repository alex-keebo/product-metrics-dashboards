import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetWarehousesForOrg = vi.fn()

vi.mock('@/lib/bigquery', async () => {
  const actual = await vi.importActual<typeof import('@/lib/bigquery')>('@/lib/bigquery')
  return {
    ...actual,
    getWarehousesForOrg: mockGetWarehousesForOrg,
  }
})

function makeRequest(params: Record<string, string>) {
  const url = new URL('http://localhost/api/kwo-snowflake-warehouse-analysis/warehouses')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

describe('GET /api/kwo-snowflake-warehouse-analysis/warehouses', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetWarehousesForOrg.mockReset()
  })

  it('returns 400 when org_id is missing', async () => {
    const { GET } = await import('../route')
    const res = await GET(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns the warehouse list for a valid org_id', async () => {
    mockGetWarehousesForOrg.mockResolvedValue([{ warehouse_id: 'wh1', warehouse_name: 'ANALYTICS_WH' }])
    const { GET } = await import('../route')
    const res = await GET(makeRequest({ org_id: '90402' }))
    const body = await res.json()
    expect(body).toEqual([{ warehouse_id: 'wh1', warehouse_name: 'ANALYTICS_WH' }])
  })
})
