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
  const url = new URL('http://localhost/api/kwo-snowflake-warehouse-analysis/cluster-activity')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

describe('GET /api/kwo-snowflake-warehouse-analysis/cluster-activity', () => {
  beforeEach(() => {
    vi.resetModules()
    mockRunQuery.mockReset()
  })

  it('returns 400 when required params are missing', async () => {
    const { GET } = await import('../route')
    const res = await GET(makeRequest({ org_id: '90402' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for a non-hex org_id', async () => {
    const { GET } = await import('../route')
    const res = await GET(
      makeRequest({
        org_id: '90402; DROP TABLE x',
        warehouse_name: 'ANALYTICS_WH',
        start_date: '2026-07-01',
        end_date: '2026-07-02',
      })
    )
    expect(res.status).toBe(400)
  })

  it('returns an empty intervals array when there are no matching events', async () => {
    mockRunQuery.mockResolvedValue([])
    const { GET } = await import('../route')
    const res = await GET(
      makeRequest({
        org_id: '90402',
        warehouse_name: 'ANALYTICS_WH',
        start_date: '2026-07-01',
        end_date: '2026-07-02',
      })
    )
    const body = await res.json()
    expect(body.intervals).toEqual([])
  })

  it('pairs a state_as_of_start row with an in_range stop into a truncated-start interval', async () => {
    mockRunQuery.mockResolvedValue([
      { event_type: 'state_as_of_start', cluster_number: 1, event_ts: '2026-06-30T20:00:00.000', is_start: true },
      { event_type: 'in_range', cluster_number: 1, event_ts: '2026-07-01T05:00:00.000', is_start: false },
    ])
    const { GET } = await import('../route')
    const res = await GET(
      makeRequest({
        org_id: '90402',
        warehouse_name: 'ANALYTICS_WH',
        start_date: '2026-07-01',
        end_date: '2026-07-02',
      })
    )
    const body = await res.json()
    expect(body.intervals).toEqual([
      {
        cluster_number: 1,
        start: '2026-07-01T00:00:00.000',
        end: '2026-07-01T05:00:00.000',
        truncated_start: true,
        truncated_end: false,
      },
    ])
  })

  it('returns 401 with ADC_UNAUTHENTICATED code on an ADC auth error', async () => {
    const { AdcAuthError } = await import('@/lib/bigquery')
    mockRunQuery.mockRejectedValue(new AdcAuthError('no credentials'))
    const { GET } = await import('../route')
    const res = await GET(
      makeRequest({
        org_id: '90402',
        warehouse_name: 'ANALYTICS_WH',
        start_date: '2026-07-01',
        end_date: '2026-07-02',
      })
    )
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe('ADC_UNAUTHENTICATED')
  })
})
