import { describe, it, expect } from 'vitest'
import { buildClusterIntervals, type ClusterEventRow } from '../clusterIntervals'

const RANGE_START = '2026-07-01T00:00:00.000'
const RANGE_END = '2026-07-02T00:00:00.000'

describe('buildClusterIntervals', () => {
  it('opens a truncated-start interval when the cluster was already running at range start', () => {
    const rows: ClusterEventRow[] = [
      { event_type: 'state_as_of_start', cluster_number: 1, event_ts: '2026-06-30T20:00:00.000', is_start: true },
      { event_type: 'in_range', cluster_number: 1, event_ts: '2026-07-01T05:00:00.000', is_start: false },
    ]
    const result = buildClusterIntervals(rows, RANGE_START, RANGE_END)
    expect(result).toEqual([
      { cluster_number: 1, start: RANGE_START, end: '2026-07-01T05:00:00.000', truncated_start: true, truncated_end: false },
    ])
  })

  it('closes a truncated-end interval when the cluster starts mid-range and never stops', () => {
    const rows: ClusterEventRow[] = [
      { event_type: 'in_range', cluster_number: 1, event_ts: '2026-07-01T10:00:00.000', is_start: true },
    ]
    const result = buildClusterIntervals(rows, RANGE_START, RANGE_END)
    expect(result).toEqual([
      { cluster_number: 1, start: '2026-07-01T10:00:00.000', end: RANGE_END, truncated_start: false, truncated_end: true },
    ])
  })

  it('spans the full range when the cluster runs the entire selected window', () => {
    const rows: ClusterEventRow[] = [
      { event_type: 'state_as_of_start', cluster_number: 1, event_ts: '2026-06-30T20:00:00.000', is_start: true },
    ]
    const result = buildClusterIntervals(rows, RANGE_START, RANGE_END)
    expect(result).toEqual([
      { cluster_number: 1, start: RANGE_START, end: RANGE_END, truncated_start: true, truncated_end: true },
    ])
  })

  it('produces independent intervals per cluster_number', () => {
    const rows: ClusterEventRow[] = [
      { event_type: 'in_range', cluster_number: 1, event_ts: '2026-07-01T01:00:00.000', is_start: true },
      { event_type: 'in_range', cluster_number: 1, event_ts: '2026-07-01T02:00:00.000', is_start: false },
      { event_type: 'in_range', cluster_number: 2, event_ts: '2026-07-01T03:00:00.000', is_start: true },
      { event_type: 'in_range', cluster_number: 2, event_ts: '2026-07-01T04:00:00.000', is_start: false },
    ]
    const result = buildClusterIntervals(rows, RANGE_START, RANGE_END)
    expect(result).toEqual([
      { cluster_number: 1, start: '2026-07-01T01:00:00.000', end: '2026-07-01T02:00:00.000', truncated_start: false, truncated_end: false },
      { cluster_number: 2, start: '2026-07-01T03:00:00.000', end: '2026-07-01T04:00:00.000', truncated_start: false, truncated_end: false },
    ])
  })

  it('ignores a second start event while an interval is already open', () => {
    const rows: ClusterEventRow[] = [
      { event_type: 'in_range', cluster_number: 1, event_ts: '2026-07-01T01:00:00.000', is_start: true },
      { event_type: 'in_range', cluster_number: 1, event_ts: '2026-07-01T02:00:00.000', is_start: true },
      { event_type: 'in_range', cluster_number: 1, event_ts: '2026-07-01T03:00:00.000', is_start: false },
    ]
    const result = buildClusterIntervals(rows, RANGE_START, RANGE_END)
    expect(result).toEqual([
      { cluster_number: 1, start: '2026-07-01T01:00:00.000', end: '2026-07-01T03:00:00.000', truncated_start: false, truncated_end: false },
    ])
  })

  it('ignores a stray stop event with no open interval', () => {
    const rows: ClusterEventRow[] = [
      { event_type: 'in_range', cluster_number: 1, event_ts: '2026-07-01T01:00:00.000', is_start: false },
      { event_type: 'in_range', cluster_number: 1, event_ts: '2026-07-01T02:00:00.000', is_start: true },
      { event_type: 'in_range', cluster_number: 1, event_ts: '2026-07-01T03:00:00.000', is_start: false },
    ]
    const result = buildClusterIntervals(rows, RANGE_START, RANGE_END)
    expect(result).toEqual([
      { cluster_number: 1, start: '2026-07-01T02:00:00.000', end: '2026-07-01T03:00:00.000', truncated_start: false, truncated_end: false },
    ])
  })

  it('returns an empty array when there are no rows', () => {
    expect(buildClusterIntervals([], RANGE_START, RANGE_END)).toEqual([])
  })
})
