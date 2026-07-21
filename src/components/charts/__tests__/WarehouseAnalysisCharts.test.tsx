import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WarehouseAnalysisCharts, DistributionTooltip } from '../WarehouseAnalysisCharts'
import type {
  DataScannedHistogramBucket,
  ExecutionTimeHistogramBucket,
  SpillageHistogramBucket,
  WarehouseAnalysisPoint,
} from '@/lib/types'

const histogramBuckets: ExecutionTimeHistogramBucket[] = [
  { bucket_label: '<1s', query_count: 100 },
  { bucket_label: '1-5s', query_count: 40 },
]

const dataScannedHistogramBuckets: DataScannedHistogramBucket[] = [
  { bucket_label: '<1 GB', query_count: 80 },
  { bucket_label: '1-10 GB', query_count: 20 },
]

const spillageHistogramBuckets: SpillageHistogramBucket[] = [
  { bucket_label: 'No Spillage', query_count: 90 },
  { bucket_label: '<1 GB', query_count: 10 },
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
    queue_time_max_ms: 150,
    bytes_spilled_local: 1024,
    bytes_spilled_remote: 0,
    bytes_scanned: 2048,
    failed_query_count_by_error: { '1234': 2 },
    credits_used: 3.5,
  },
]

describe('WarehouseAnalysisCharts', () => {
  it('renders all chart titles', () => {
    render(
      <WarehouseAnalysisCharts
        points={points}
        histogramBuckets={histogramBuckets}
        dataScannedHistogramBuckets={dataScannedHistogramBuckets}
        spillageHistogramBuckets={spillageHistogramBuckets}
      />
    )
    expect(screen.getByText('Warehouse Usage')).toBeInTheDocument()
    expect(screen.getAllByText('Total Queries').length).toBeGreaterThan(0)
    expect(screen.getByText('Execution Time')).toBeInTheDocument()
    expect(screen.getByText('Execution Time Distribution')).toBeInTheDocument()
    expect(screen.getByText('Queued Queries')).toBeInTheDocument()
    expect(screen.getByText('Queue Time')).toBeInTheDocument()
    expect(screen.getByText('Data Scanned')).toBeInTheDocument()
    expect(screen.getByText('Data Scanned Distribution')).toBeInTheDocument()
    expect(screen.getByText('Spillage')).toBeInTheDocument()
    expect(screen.getByText('Spillage Distribution')).toBeInTheDocument()
    expect(screen.getAllByText('Failed Queries').length).toBeGreaterThan(0)
    expect(screen.getByText('Failed Query Reasons')).toBeInTheDocument()
  })

  it('renders without crashing when points and histogramBuckets are empty', () => {
    render(
      <WarehouseAnalysisCharts
        points={[]}
        histogramBuckets={[]}
        dataScannedHistogramBuckets={[]}
        spillageHistogramBuckets={[]}
      />
    )
    expect(screen.getAllByText('Total Queries').length).toBeGreaterThan(0)
  })

  it('shows overall metric totals for each chart', () => {
    render(
      <WarehouseAnalysisCharts
        points={points}
        histogramBuckets={histogramBuckets}
        dataScannedHistogramBuckets={dataScannedHistogramBuckets}
        spillageHistogramBuckets={spillageHistogramBuckets}
      />
    )
    expect(screen.getByText('Total Credits')).toBeInTheDocument()
    expect(screen.getByText('3.50')).toBeInTheDocument()
    expect(screen.getAllByText('Avg (ms)')).toHaveLength(1)
    expect(screen.getByText('Max (ms)')).toBeInTheDocument()
    expect(screen.getByText('Total Queued')).toBeInTheDocument()
    expect(screen.getAllByText('Total GB')).toHaveLength(2)
    expect(screen.getAllByText('Total Failed')).toHaveLength(2)
  })
})

describe('DistributionTooltip', () => {
  const buckets = [
    { bucket_label: '<10s', query_count: 50 },
    { bucket_label: '10-30s', query_count: 20 },
    { bucket_label: '30-60s', query_count: 10 },
    { bucket_label: '>60s', query_count: 5 },
  ]

  it('shows the hovered bucket count plus cumulative totals below and above it', () => {
    render(
      <DistributionTooltip
        active
        payload={[{ value: 20 }]}
        label="10-30s"
        isLight
        buckets={buckets}
      />
    )
    expect(screen.getByText('10-30s')).toBeInTheDocument()
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByText('50')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
  })

  it('renders nothing when inactive', () => {
    const { container } = render(
      <DistributionTooltip payload={[{ value: 20 }]} label="10-30s" isLight buckets={buckets} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows N/A for total below on the left-most bucket', () => {
    render(<DistributionTooltip active payload={[{ value: 50 }]} label="<10s" isLight buckets={buckets} />)
    expect(screen.getByText('N/A')).toBeInTheDocument()
    expect(screen.getByText('35')).toBeInTheDocument()
  })

  it('shows N/A for total above on the right-most bucket', () => {
    render(<DistributionTooltip active payload={[{ value: 5 }]} label=">60s" isLight buckets={buckets} />)
    expect(screen.getByText('N/A')).toBeInTheDocument()
    expect(screen.getByText('80')).toBeInTheDocument()
  })
})
