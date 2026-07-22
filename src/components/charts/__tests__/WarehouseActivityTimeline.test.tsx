import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WarehouseActivityTimeline } from '../WarehouseActivityTimeline'
import type { ClusterInterval } from '@/lib/types'

const RANGE_START = '2026-07-01T00:00:00.000'
const RANGE_END = '2026-07-02T00:00:00.000'

describe('WarehouseActivityTimeline', () => {
  it('shows an empty-state message when there are no intervals', () => {
    render(<WarehouseActivityTimeline intervals={[]} rangeStart={RANGE_START} rangeEnd={RANGE_END} sizeIntervals={[]} />)
    expect(screen.getByText(/No cluster activity/i)).toBeInTheDocument()
  })

  it('renders one row per distinct cluster_number', () => {
    const intervals: ClusterInterval[] = [
      { cluster_number: 1, start: '2026-07-01T01:00:00.000', end: '2026-07-01T02:00:00.000', truncated_start: false, truncated_end: false },
      { cluster_number: 2, start: '2026-07-01T03:00:00.000', end: '2026-07-01T04:00:00.000', truncated_start: false, truncated_end: false },
    ]
    render(<WarehouseActivityTimeline intervals={intervals} rangeStart={RANGE_START} rangeEnd={RANGE_END} sizeIntervals={[]} />)
    expect(screen.getByText('Cluster 1')).toBeInTheDocument()
    expect(screen.getByText('Cluster 2')).toBeInTheDocument()
  })

  it('renders a distinct Warehouse row above cluster rows using the -1 sentinel', () => {
    const intervals: ClusterInterval[] = [
      { cluster_number: 1, start: '2026-07-01T01:00:00.000', end: '2026-07-01T02:00:00.000', truncated_start: false, truncated_end: false },
      { cluster_number: -1, start: '2026-07-01T00:30:00.000', end: '2026-07-01T02:30:00.000', truncated_start: false, truncated_end: false },
    ]
    render(<WarehouseActivityTimeline intervals={intervals} rangeStart={RANGE_START} rangeEnd={RANGE_END} sizeIntervals={[]} />)
    expect(screen.getByText('Warehouse')).toBeInTheDocument()
    expect(screen.getByText('Cluster 1')).toBeInTheDocument()
    expect(screen.queryByText('Cluster -1')).not.toBeInTheDocument()

    const labels = screen.getAllByText(/^(Warehouse|Cluster 1)$/).map((el) => el.textContent)
    expect(labels).toEqual(['Warehouse', 'Cluster 1'])
  })

  it('shows "Warehouse" in the tooltip for the sentinel row instead of "Cluster -1"', () => {
    const intervals: ClusterInterval[] = [
      { cluster_number: -1, start: RANGE_START, end: '2026-07-01T05:00:00.000', truncated_start: true, truncated_end: false },
    ]
    render(<WarehouseActivityTimeline intervals={intervals} rangeStart={RANGE_START} rangeEnd={RANGE_END} sizeIntervals={[]} />)
    const bar = document.querySelector('rect')
    expect(bar).not.toBeNull()
    bar!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: 10, clientY: 10 }))
    expect(screen.getAllByText('Warehouse')).toHaveLength(2)
    expect(screen.queryByText(/Cluster -1/i)).not.toBeInTheDocument()
  })

  it('shows a truncation-aware tooltip on hover', () => {
    const intervals: ClusterInterval[] = [
      { cluster_number: 1, start: RANGE_START, end: '2026-07-01T05:00:00.000', truncated_start: true, truncated_end: false },
    ]
    render(<WarehouseActivityTimeline intervals={intervals} rangeStart={RANGE_START} rangeEnd={RANGE_END} sizeIntervals={[]} />)
    const bar = document.querySelector('rect')
    expect(bar).not.toBeNull()
    bar!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: 10, clientY: 10 }))
    expect(screen.getByText(/Running since before selected range/i)).toBeInTheDocument()
  })
})
