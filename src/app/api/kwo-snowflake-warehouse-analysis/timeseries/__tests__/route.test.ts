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
    expect(body.points[0].credits_used).toBe(0)
  })

  it('passes through credits_used from the metering history row', async () => {
    mockRunQuery.mockResolvedValue([{ period_start: '2026-07-01', credits_used: 12.5 }])
    const { GET } = await import('../route')
    const res = await GET(
      makeRequest({
        org_id: '90402',
        warehouse_name: 'ANALYTICS_WH',
        start_date: '2026-07-01',
        end_date: '2026-07-01',
        granularity: 'day',
      })
    )
    const body = await res.json()
    expect(body.points[0].credits_used).toBe(12.5)
  })

  it('passes through bytes_scanned from the query history row', async () => {
    mockRunQuery.mockResolvedValue([{ period_start: '2026-07-01', bytes_scanned: 104857600 }])
    const { GET } = await import('../route')
    const res = await GET(
      makeRequest({
        org_id: '90402',
        warehouse_name: 'ANALYTICS_WH',
        start_date: '2026-07-01',
        end_date: '2026-07-01',
        granularity: 'day',
      })
    )
    const body = await res.json()
    expect(body.points[0].bytes_scanned).toBe(104857600)
  })

  it('coerces BigQuery NUMERIC-wrapped credits_used to a plain number', async () => {
    // The @google-cloud/bigquery client returns NUMERIC/BIGNUMERIC columns as
    // wrapper objects (not plain JS numbers) with toString()/toJSON() returning
    // the decimal string. Without Number(...) coercion these serialize as
    // strings, which silently break downstream arithmetic (e.g. NaN totals).
    const numericWrapper = {
      toString: () => '12.50000',
      toJSON: () => '12.50000',
    }
    mockRunQuery.mockResolvedValue([{ period_start: '2026-07-01', credits_used: numericWrapper }])
    const { GET } = await import('../route')
    const res = await GET(
      makeRequest({
        org_id: '90402',
        warehouse_name: 'ANALYTICS_WH',
        start_date: '2026-07-01',
        end_date: '2026-07-01',
        granularity: 'day',
      })
    )
    const body = await res.json()
    expect(body.points[0].credits_used).toBe(12.5)
    expect(typeof body.points[0].credits_used).toBe('number')
  })

  it('zero-fills concurrent_queries_max/avg for periods with no matching rows', async () => {
    mockRunQuery.mockResolvedValue([])
    const { GET } = await import('../route')
    const res = await GET(
      makeRequest({
        org_id: '90402',
        warehouse_name: 'ANALYTICS_WH',
        start_date: '2026-07-01',
        end_date: '2026-07-01',
        granularity: 'day',
      })
    )
    const body = await res.json()
    expect(body.points[0].concurrent_queries_max).toBe(0)
    expect(body.points[0].concurrent_queries_avg).toBe(0)
  })

  it('passes through concurrent_queries_max/avg from the sweep-line row', async () => {
    mockRunQuery.mockResolvedValue([
      { period_start: '2026-07-01', concurrent_queries_max: 7, concurrent_queries_avg: 2.34 },
    ])
    const { GET } = await import('../route')
    const res = await GET(
      makeRequest({
        org_id: '90402',
        warehouse_name: 'ANALYTICS_WH',
        start_date: '2026-07-01',
        end_date: '2026-07-01',
        granularity: 'day',
      })
    )
    const body = await res.json()
    expect(body.points[0].concurrent_queries_max).toBe(7)
    expect(body.points[0].concurrent_queries_avg).toBe(2.34)
  })

  it('coerces BigQuery NUMERIC-wrapped concurrent_queries_avg to a plain number', async () => {
    const numericWrapper = { toString: () => '2.34000', toJSON: () => '2.34000' }
    mockRunQuery.mockResolvedValue([
      { period_start: '2026-07-01', concurrent_queries_max: 7, concurrent_queries_avg: numericWrapper },
    ])
    const { GET } = await import('../route')
    const res = await GET(
      makeRequest({
        org_id: '90402',
        warehouse_name: 'ANALYTICS_WH',
        start_date: '2026-07-01',
        end_date: '2026-07-01',
        granularity: 'day',
      })
    )
    const body = await res.json()
    expect(body.points[0].concurrent_queries_avg).toBe(2.34)
    expect(typeof body.points[0].concurrent_queries_avg).toBe('number')
  })
})
