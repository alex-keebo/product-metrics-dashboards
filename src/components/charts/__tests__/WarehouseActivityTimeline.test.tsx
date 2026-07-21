import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WarehouseActivityTimeline } from '../WarehouseActivityTimeline'
import type { ClusterInterval } from '@/lib/types'

const RANGE_START = '2026-07-01T00:00:00.000'
const RANGE_END = '2026-07-02T00:00:00.000'

describe('WarehouseActivityTimeline', () => {
  it('shows an empty-state message when there are no intervals', () => {
    render(<WarehouseActivityTimeline intervals={[]} rangeStart={RANGE_START} rangeEnd={RANGE_END} />)
    expect(screen.getByText(/No cluster activity/i)).toBeInTheDocument()
  })

  it('renders one row per distinct cluster_number', () => {
    const intervals: ClusterInterval[] = [
      { cluster_number: 1, start: '2026-07-01T01:00:00.000', end: '2026-07-01T02:00:00.000', truncated_start: false, truncated_end: false },
      { cluster_number: 2, start: '2026-07-01T03:00:00.000', end: '2026-07-01T04:00:00.000', truncated_start: false, truncated_end: false },
    ]
    render(<WarehouseActivityTimeline intervals={intervals} rangeStart={RANGE_START} rangeEnd={RANGE_END} />)
    expect(screen.getByText('Cluster 1')).toBeInTheDocument()
    expect(screen.getByText('Cluster 2')).toBeInTheDocument()
  })

  it('shows a truncation-aware tooltip on hover', () => {
    const intervals: ClusterInterval[] = [
      { cluster_number: 1, start: RANGE_START, end: '2026-07-01T05:00:00.000', truncated_start: true, truncated_end: false },
    ]
    render(<WarehouseActivityTimeline intervals={intervals} rangeStart={RANGE_START} rangeEnd={RANGE_END} />)
    const bar = document.querySelector('rect')
    expect(bar).not.toBeNull()
    bar!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: 10, clientY: 10 }))
    expect(screen.getByText(/Running since before selected range/i)).toBeInTheDocument()
  })
})
