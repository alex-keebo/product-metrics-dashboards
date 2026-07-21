import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WarehouseAnalysisCharts } from '../WarehouseAnalysisCharts'
import type { WarehouseAnalysisPoint } from '@/lib/types'

const points: WarehouseAnalysisPoint[] = [
  {
    period_label: '2026-07-01',
    period_label_display: 'Jul 1',
    period_start: '2026-07-01',
    period_end: '2026-07-01',
    query_volume_by_type: { SELECT: 120, INSERT: 30 },
    execution_time_avg_ms: 450,
    execution_time_p95_ms: 900,
    execution_time_p99_ms: 1500,
    queued_query_count: 4,
    queue_time_avg_ms: 20,
    queue_time_p95_ms: 60,
    queue_time_p99_ms: 100,
    bytes_spilled_local: 1024,
    bytes_spilled_remote: 0,
    failed_query_count_by_error: { '1234': 2 },
  },
]

describe('WarehouseAnalysisCharts', () => {
  it('renders all six chart titles', () => {
    render(<WarehouseAnalysisCharts points={points} />)
    expect(screen.getByText('Total Queries')).toBeInTheDocument()
    expect(screen.getByText('Execution Time')).toBeInTheDocument()
    expect(screen.getByText('Queued Queries')).toBeInTheDocument()
    expect(screen.getByText('Queue Time')).toBeInTheDocument()
    expect(screen.getByText('Spillage')).toBeInTheDocument()
    expect(screen.getByText('Failed Queries')).toBeInTheDocument()
  })

  it('renders without crashing when points is empty', () => {
    render(<WarehouseAnalysisCharts points={[]} />)
    expect(screen.getByText('Total Queries')).toBeInTheDocument()
  })
})
