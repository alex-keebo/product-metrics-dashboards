import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockRunQuery = vi.fn()

vi.mock('@/lib/bigquery', async () => {
  const actual = await vi.importActual<typeof import('@/lib/bigquery')>('@/lib/bigquery')
  return {
    ...actual,
    runQuery: mockRunQuery,
  }
})

function makeRequest(params: Record<string, string>) {
  const url = new URL('http://localhost/api/kwo-snowflake-warehouse-analysis/timeseries')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

describe('GET /api/kwo-snowflake-warehouse-analysis/timeseries', () => {
  beforeEach(() => {
    vi.resetModules()
    mockRunQuery.mockReset()
  })

  it('returns 400 when required params are missing', async () => {
    const { GET } = await import('../route')
    const res = await GET(makeRequest({ org_id: '90402' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for a non-numeric org_id', async () => {
    const { GET } = await import('../route')
    const res = await GET(
      makeRequest({
        org_id: '90402; DROP TABLE x',
        warehouse_name: 'ANALYTICS_WH',
        start_date: '2026-07-01',
        end_date: '2026-07-07',
        granularity: 'day',
      })
    )
    expect(res.status).toBe(400)
  })

  it('falls back to day granularity when hour range exceeds 14 days', async () => {
    mockRunQuery.mockResolvedValue([])
    const { GET } = await import('../route')
    const res = await GET(
      makeRequest({
        org_id: '90402',
        warehouse_name: 'ANALYTICS_WH',
        start_date: '2026-06-01',
        end_date: '2026-07-01',
        granularity: 'hour',
      })
    )
    const body = await res.json()
    expect(body.granularity_used).toBe('day')
  })

  it('returns points with zero-filled aggregates for periods with no matching rows', async () => {
    mockRunQuery.mockResolvedValue([])
    const { GET } = await import('../route')
    const res = await GET(
      makeRequest({
        org_id: '90402',
        warehouse_name: 'ANALYTICS_WH',
        start_date: '2026-07-01',
        end_date: '2026-07-02',
        granularity: 'day',
      })
    )
    const body = await res.json()
    expect(body.granularity_used).toBe('day')
    expect(body.points).toHaveLength(2)
    expect(body.points[0].execution_time_avg_ms).toBe(0)
    expect(body.points[0].query_volume_by_type).toEqual({})
  })
})
