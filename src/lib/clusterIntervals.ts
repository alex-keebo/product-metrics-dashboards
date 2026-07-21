import type { ClusterInterval } from './types'

// Sentinel cluster_number used for warehouse-level RESUME_WAREHOUSE/SUSPEND_WAREHOUSE
// events (see sql/kwo_snowflake_warehouse_cluster_events.sql) so they reuse the same
// interval-building logic as real clusters and surface as a distinct "Warehouse" row.
export const WAREHOUSE_ROW_CLUSTER_NUMBER = -1

export interface ClusterEventRow {
  event_type: 'state_as_of_start' | 'in_range'
  cluster_number: number
  event_ts: string
  is_start: boolean
}

export function buildClusterIntervals(
  rows: ClusterEventRow[],
  rangeStart: string,
  rangeEnd: string
): ClusterInterval[] {
  const byCluster = new Map<number, ClusterEventRow[]>()
  for (const row of rows) {
    const list = byCluster.get(row.cluster_number) ?? []
    list.push(row)
    byCluster.set(row.cluster_number, list)
  }

  const intervals: ClusterInterval[] = []

  for (const [clusterNumber, clusterRows] of byCluster) {
    const stateAsOfStart = clusterRows.find((r) => r.event_type === 'state_as_of_start')
    const inRange = clusterRows
      .filter((r) => r.event_type === 'in_range')
      .sort((a, b) => (a.event_ts < b.event_ts ? -1 : a.event_ts > b.event_ts ? 1 : 0))

    let open = stateAsOfStart?.is_start === true
    let openStart = rangeStart
    let truncatedStart = open

    for (const event of inRange) {
      if (event.is_start) {
        if (!open) {
          open = true
          openStart = event.event_ts
          truncatedStart = false
        }
      } else if (open) {
        intervals.push({
          cluster_number: clusterNumber,
          start: openStart,
          end: event.event_ts,
          truncated_start: truncatedStart,
          truncated_end: false,
        })
        open = false
      }
    }

    if (open) {
      intervals.push({
        cluster_number: clusterNumber,
        start: openStart,
        end: rangeEnd,
        truncated_start: truncatedStart,
        truncated_end: true,
      })
    }
  }

  return intervals.sort(
    (a, b) => a.cluster_number - b.cluster_number || (a.start < b.start ? -1 : a.start > b.start ? 1 : 0)
  )
}
