import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetCustomerNameMap = vi.fn()
const mockGetSnfQueryHistoryDatasets = vi.fn()

vi.mock('@/lib/customers', () => ({
  getCustomerNameMap: mockGetCustomerNameMap,
}))

vi.mock('@/lib/bigquery', async () => {
  const actual = await vi.importActual<typeof import('@/lib/bigquery')>('@/lib/bigquery')
  return {
    ...actual,
    getSnfQueryHistoryDatasets: mockGetSnfQueryHistoryDatasets,
  }
})

describe('GET /api/kwo-snowflake-warehouse-analysis/customers', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetCustomerNameMap.mockReset()
    mockGetSnfQueryHistoryDatasets.mockReset()
  })

  it('returns only customers with an existing query history dataset, sorted by name', async () => {
    mockGetCustomerNameMap.mockReturnValue(
      new Map([
        ['90402', 'Zebra Corp'],
        ['90403', 'Acme Inc'],
        ['90404', 'No Dataset Co'],
      ])
    )
    mockGetSnfQueryHistoryDatasets.mockResolvedValue(['k3o_prd_90402_000_tf', 'k3o_prd_90403_000_tf'])

    const { GET } = await import('../route')
    const res = await GET()
    const body = await res.json()

    expect(mockGetCustomerNameMap).toHaveBeenCalledWith('kwo-snowflake')
    expect(mockGetSnfQueryHistoryDatasets).toHaveBeenCalledWith(
      expect.arrayContaining(['90402', '90403', '90404'])
    )
    expect(body).toEqual([
      { org_id: '90403', name: 'Acme Inc' },
      { org_id: '90402', name: 'Zebra Corp' },
    ])
  })
})
