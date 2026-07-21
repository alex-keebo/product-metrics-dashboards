import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockQuery = vi.fn()

vi.mock('@google-cloud/bigquery', () => ({
  BigQuery: class {
    query = mockQuery
  },
}))

describe('getWarehousesForOrg', () => {
  beforeEach(() => {
    vi.resetModules()
    mockQuery.mockReset()
  })

  it('returns distinct warehouse_id/warehouse_name rows for the given org', async () => {
    mockQuery.mockResolvedValue([
      [
        { warehouse_id: 'wh1', warehouse_name: 'ANALYTICS_WH' },
        { warehouse_id: 'wh2', warehouse_name: 'ETL_WH' },
      ],
    ])
    const bigquery = await import('../bigquery')

    const result = await bigquery.getWarehousesForOrg('90402')

    expect(result).toEqual([
      { warehouse_id: 'wh1', warehouse_name: 'ANALYTICS_WH' },
      { warehouse_id: 'wh2', warehouse_name: 'ETL_WH' },
    ])
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining('database_warehouses'),
        params: { org_id: '90402' },
      })
    )
  })
})
