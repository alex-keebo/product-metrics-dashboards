# Warehouse Activity Timeline (Snowflake Warehouse Analysis)

**Date:** 2026-07-21
**Status:** Approved

## Overview

Add a "Warehouse Activity" chart to the existing **Snowflake Warehouse Analysis** page (`/kwo-snowflake-warehouse-analysis`), showing every multi-cluster warehouse cluster's start/stop intervals across the selected date range, similar to a Gantt/timeline view: one row per cluster, horizontal bars for each period the cluster was running. Clusters already running at the start of the range, or still running at the end, are shown as bars that fade out at that edge rather than a hard cutoff.

This chart is **independent of the Group By / granularity filter** — it shows raw event-derived intervals over `start_date`–`end_date`, not bucketed periods, and is unaffected by the existing Hour/14-day fallback rule.

## Data Source

`keebo-portal.k3o_prd_<org_id>_000_tf.warehouse_events_history_tf` — export of Snowflake's `WAREHOUSE_EVENTS_HISTORY` account-usage view. Relevant columns: `timestamp`, `warehouse_name`, `cluster_number`, `event_name`, `event_state`.

- **Start events:** `event_name IN ('SPINUP_CLUSTER', 'RESUME_CLUSTER')`
- **Stop events:** `event_name IN ('MULTICLUSTER_SPINDOWN', 'SUSPEND_CLUSTER')`
- Only `event_state = 'COMPLETED'` rows are used (`STARTED` rows are the same action logged a second time and are ignored).
- `cluster_number IS NULL` (single-cluster warehouse) is treated as `cluster_number = 1`.

## Interval-Pairing Logic

Two queries per request, both filtered by `warehouse_name` (and `event_state = 'COMPLETED'`, start/stop `event_name`s):

1. **State as of range start** — per `cluster_number`, the single most recent event with `timestamp < start_date` (`ROW_NUMBER() OVER (PARTITION BY cluster_number ORDER BY timestamp DESC)`, take rank 1). Whether that event is a start- or stop-type event tells us whether the cluster is already running when the visible range begins.
2. **Events within range** — all matching events with `timestamp BETWEEN start_date AND end_date`, ordered by `cluster_number, timestamp`.

Pairing happens in TypeScript, not SQL (simpler to write, test, and reason about than expressing open-interval carry-forward in BigQuery SQL):

- For each `cluster_number`: if "state as of start" was a start-type event (cluster ON), open a synthetic interval at `start_date` with `truncated_start = true`.
- Walk the in-range events chronologically: a start event opens a new interval (if none is open); a stop event closes the currently-open interval with `truncated_start = false`, `truncated_end = false`.
- After the last in-range event, if an interval is still open (either carried in from step 1, or opened by a start event with no matching stop before `end_date`), close it at `end_date` with `truncated_end = true`.
- Consecutive same-type events (e.g. two start events with no stop between) are defensive-coded: a second start event while one is already open is a no-op (keep the original open interval).

## Backend

### New SQL file: `sql/kwo_snowflake_warehouse_cluster_events.sql`

Same `ORGID` placeholder-rewrite pattern as `kwo_snowflake_warehouse_analysis_timeseries.sql` (the API route replaces `k3o_prd_ORGID_000_tf` with the validated `org_id` before running). Returns rows tagged by which of the two logical queries they came from:

```
event_type      STRING   -- 'state_as_of_start' | 'in_range'
cluster_number  INT64    -- NULL coalesced to 1 in TS
event_ts        TIMESTAMP
is_start        BOOL     -- true for SPINUP_CLUSTER/RESUME_CLUSTER, false for stop events
```

Parameters: `@warehouse_name`, `@start_date`, `@end_date` (same format/handling as the existing timeseries query — `TIMESTAMP()`-parsed, compared against the export's timestamp column).

### New API route: `GET /api/kwo-snowflake-warehouse-analysis/cluster-activity`

Query params: `org_id`, `warehouse_name`, `start_date`, `end_date` (same validation as the existing `timeseries` route — `org_id` checked against `ORG_ID_PATTERN`, all four required).

Runs the query, performs the pairing logic above, and returns:

```ts
interface ClusterInterval {
  cluster_number: number
  start: string            // ISO timestamp, clipped to [start_date, end_date]
  end: string               // ISO timestamp, clipped to [start_date, end_date]
  truncated_start: boolean  // true if already running before start_date
  truncated_end: boolean    // true if still running after end_date
}
interface ClusterActivityResponse {
  intervals: ClusterInterval[]
}
```

Reuses `runQuery` / `AdcAuthError` from `src/lib/bigquery.ts`, same error-handling pattern (401 on `AdcAuthError`, 500 otherwise) as the existing `timeseries` route.

### Types

`src/lib/types.ts` — add `ClusterInterval` and `ClusterActivityResponse`.

## Frontend

### New component: `src/components/charts/WarehouseActivityTimeline.tsx`

A custom SVG timeline (not Recharts — Recharts has no clean primitive for drawing arbitrary `[start, end]` bars per categorical row with edge-fade effects). Renders inside the existing `ChartWrapper` (title: "Warehouse Activity"), so it inherits the standard card/border/header chrome used by every other chart on this page.

- One horizontal row per `cluster_number` present in the response (sorted ascending), labeled "Cluster 1", "Cluster 2", etc.
- Time axis mapped linearly across `start_date`–`end_date`, with date/time tick labels along the top, using the same `AXIS`/`GRID` color tokens (`LIGHT_AXIS`/`DARK_AXIS`, `LIGHT_GRID`/`DARK_GRID`) already imported from `TimeSeriesCharts.tsx` elsewhere on this page, for light/dark theme consistency.
- Each interval renders as a `<rect>` filled with `C_NAVY` (the primary bar color already used for Total Queries / Queued Queries on this page).
- `truncated_start` / `truncated_end` intervals get a `<linearGradient>` fading `C_NAVY` → transparent over roughly the last ~24px at that edge, instead of a hard edge — signaling "this bar continues beyond what's shown" without extra iconography.
- Hover tooltip (styled consistently with `SeriesTooltip`/existing tooltip look) shows: cluster label, start time, end time, duration. For a truncated edge, the corresponding timestamp is replaced with "Running since before selected range" / "Still running after selected range".
- No native zoom/pan — the timeline always spans the full selected date range, matching how every other chart on this page behaves.

### Page wiring: `src/app/kwo-snowflake-warehouse-analysis/page.tsx`

- New `useEffect` fetching `/api/kwo-snowflake-warehouse-analysis/cluster-activity` whenever `selectedCustomer` / `selectedWarehouse` / `startDate` / `endDate` change (mirrors the existing `timeseries` fetch effect, but **not** dependent on `granularity`).
- New state: `clusterIntervals`, `clusterActivityError`, `clusterActivityLoading`.
- Rendered as its own full-width `ChartWrapper` section, placed below the existing `<WarehouseAnalysisCharts>` 2-column grid and above the `<DataTable>`.
- Own loading/error/empty states, following the same `SectionError` pattern and empty-state copy style already used on this page (e.g. "No cluster activity for this warehouse in the selected range.").

## Error Handling & Edge Cases

- **ADC auth error**: same `AdcAuthError`/`isAdcAuthError` banner pattern as the rest of the page.
- **No intervals in range**: empty-state text, chart section not rendered (consistent with how the existing charts handle `points.length === 0`).
- **Single-cluster warehouse**: `cluster_number IS NULL` events are coalesced to `cluster_number = 1` — renders as a single "Cluster 1" row.
- **Warehouse never suspended (100% uptime in range)**: "state as of range start" is a start-type event, no stop event in range → single interval spanning the full range, `truncated_start = true`, `truncated_end = true`.
