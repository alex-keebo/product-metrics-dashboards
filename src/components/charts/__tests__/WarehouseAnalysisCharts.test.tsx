import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WarehouseAnalysisCharts } from '../WarehouseAnalysisCharts'
import type { ExecutionTimeHistogramBucket, WarehouseAnalysisPoint } from '@/lib/types'

const histogramBuckets: ExecutionTimeHistogramBucket[] = [
  { bucket_label: '<1s', query_count: 100 },
  { bucket_label: '1-5s', query_count: 40 },
]

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
    bytes_scanned: 2048,
    failed_query_count_by_error: { '1234': 2 },
    credits_used: 3.5,
  },
]

describe('WarehouseAnalysisCharts', () => {
  it('renders all chart titles', () => {
    render(<WarehouseAnalysisCharts points={points} histogramBuckets={histogramBuckets} />)
    expect(screen.getByText('Warehouse Usage (Credits)')).toBeInTheDocument()
    expect(screen.getAllByText('Total Queries').length).toBeGreaterThan(0)
    expect(screen.getByText('Execution Time')).toBeInTheDocument()
    expect(screen.getByText('Execution Time Distribution')).toBeInTheDocument()
    expect(screen.getByText('Queued Queries')).toBeInTheDocument()
    expect(screen.getByText('Queue Time')).toBeInTheDocument()
    expect(screen.getByText('Data Scanned (GB)')).toBeInTheDocument()
    expect(screen.getByText('Spillage')).toBeInTheDocument()
    expect(screen.getAllByText('Failed Queries').length).toBeGreaterThan(0)
    expect(screen.getByText('Failed Query Reasons')).toBeInTheDocument()
  })

  it('renders without crashing when points and histogramBuckets are empty', () => {
    render(<WarehouseAnalysisCharts points={[]} histogramBuckets={[]} />)
    expect(screen.getAllByText('Total Queries').length).toBeGreaterThan(0)
  })

  it('shows overall metric totals for each chart', () => {
    render(<WarehouseAnalysisCharts points={points} histogramBuckets={histogramBuckets} />)
    expect(screen.getByText('Total Credits')).toBeInTheDocument()
    expect(screen.getByText('3.50')).toBeInTheDocument()
    expect(screen.getAllByText('Avg (ms)')).toHaveLength(2)
    expect(screen.getByText('Total Queued')).toBeInTheDocument()
    expect(screen.getAllByText('Total GB')).toHaveLength(2)
    expect(screen.getAllByText('Total Failed')).toHaveLength(2)
  })
})
