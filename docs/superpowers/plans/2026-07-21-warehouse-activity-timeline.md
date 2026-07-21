# Warehouse Activity Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Warehouse Activity" Gantt-style timeline chart to the Snowflake Warehouse Analysis page, showing every multi-cluster warehouse cluster's start/stop intervals across the selected date range, with fade-edge truncation indicators for clusters already running at range start or still running at range end.

**Architecture:** A new BigQuery-backed API route (`/api/kwo-snowflake-warehouse-analysis/cluster-activity`) runs a two-part SQL query against `warehouse_events_history_tf` and hands raw event rows to a pure TypeScript pairing function (`buildClusterIntervals`) that reconstructs `[start, end]` running intervals per cluster, including truncation flags. The frontend renders those intervals with a new custom SVG component (`WarehouseActivityTimeline`) — no Recharts primitive fits arbitrary interval bars with edge-fade gradients — wired into the existing page via a new fetch effect that mirrors the existing `timeseries` effect but is independent of `granularity`.

**Tech Stack:** Next.js app router API route, `@google-cloud/bigquery` via the existing `runQuery` helper, plain SVG (no charting library) for the new visualization, Vitest + `@testing-library/react` for tests.

## Global Constraints

- No hardcoded hex colors in components — reuse exported tokens (`C_NAVY`, `LIGHT_AXIS`/`DARK_AXIS`, `LIGHT_GRID`/`DARK_GRID`) from `src/components/charts/TimeSeriesCharts.tsx`.
- `org_id` query params must be validated against `ORG_ID_PATTERN = /^[0-9a-f]+$/` before being interpolated into the SQL table name (dataset name embeds org_id, so it cannot be a bound query parameter).
- `AdcAuthError` → HTTP 401 with `{ error, code }`; any other thrown error → HTTP 500 with `{ error }`; log with `console.error('[tag]', err)` — same pattern as every existing route in this app.
- Only `event_state = 'COMPLETED'` rows from `warehouse_events_history_tf` are used; `STARTED` rows are duplicate logging of the same action and must be excluded.
- `cluster_number IS NULL` (single-cluster warehouse) is coalesced to `cluster_number = 1`.
- This chart is independent of the Group By / granularity filter — it must not re-fetch when `granularity` changes, only when `selectedCustomer`, `selectedWarehouse`, `startDate`, or `endDate` change.
- Timestamps returned by the API are fixed-width ISO strings (`yyyy-MM-ddTHH:mm:ss.SSS`) so lexical string comparison is equivalent to chronological comparison — this must be preserved by any code touching these values.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/clusterIntervals.ts` | Pure function: raw event rows → paired `[start, end]` intervals with truncation flags. No I/O, no BigQuery. |
| `src/lib/__tests__/clusterIntervals.test.ts` | Unit tests for the pairing algorithm's edge cases. |
| `src/lib/types.ts` | Add `ClusterInterval` and `ClusterActivityResponse` types (consumed by the route, the pairing function, and the frontend component). |
| `sql/kwo_snowflake_warehouse_cluster_events.sql` | Two-part query: most-recent event per cluster before `start_date`, plus all events within `[start_date, end_date]`. |
| `src/app/api/kwo-snowflake-warehouse-analysis/cluster-activity/route.ts` | Reads the SQL file, runs it, calls `buildClusterIntervals`, returns `ClusterActivityResponse`. |
| `src/app/api/kwo-snowflake-warehouse-analysis/cluster-activity/__tests__/route.test.ts` | Route tests: param validation, empty result, pairing integration, auth error. |
| `src/components/charts/WarehouseActivityTimeline.tsx` | Custom SVG Gantt-style renderer: one row per cluster, fade-gradient bars, hover tooltip. |
| `src/components/charts/__tests__/WarehouseActivityTimeline.test.tsx` | Component render tests: empty state, row count, tooltip content. |
| `src/app/kwo-snowflake-warehouse-analysis/page.tsx` | Modify: add fetch effect + state for cluster activity, render new `ChartWrapper` section between `WarehouseAnalysisCharts` and `DataTable`. |
| `src/app/kwo-snowflake-warehouse-analysis/__tests__/page.test.tsx` | Modify: extend `global.fetch` mock to answer the new endpoint; add one assertion that the new chart section renders. |

---

### Task 1: Types and the pure interval-pairing function

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/clusterIntervals.ts`
- Test: `src/lib/__tests__/clusterIntervals.test.ts`

**Interfaces:**
- Consumes: nothing (pure, no upstream dependencies).
- Produces: `ClusterInterval`, `ClusterActivityResponse` (from `src/lib/types.ts`); `ClusterEventRow` and `buildClusterIntervals(rows: ClusterEventRow[], rangeStart: string, rangeEnd: string): ClusterInterval[]` (from `src/lib/clusterIntervals.ts`) — used by Task 2's API route and referenced by Task 3's frontend types.

- [ ] **Step 1: Add types to `src/lib/types.ts`**

Append to the end of the file:

```ts
export interface ClusterInterval {
  cluster_number: number
  start: string
  end: string
  truncated_start: boolean
  truncated_end: boolean
}

export interface ClusterActivityResponse {
  intervals: ClusterInterval[]
}
```

- [ ] **Step 2: Write the failing tests for `buildClusterIntervals`**

Create `src/lib/__tests__/clusterIntervals.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/__tests__/clusterIntervals.test.ts`
Expected: FAIL with a module-not-found error for `../clusterIntervals`.

- [ ] **Step 4: Implement `buildClusterIntervals`**

Create `src/lib/clusterIntervals.ts`:

```ts
import type { ClusterInterval } from './types'

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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/__tests__/clusterIntervals.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/clusterIntervals.ts src/lib/__tests__/clusterIntervals.test.ts
git commit -m "feat: add cluster interval pairing logic for warehouse activity timeline"
```

---

### Task 2: SQL query and the cluster-activity API route

**Files:**
- Create: `sql/kwo_snowflake_warehouse_cluster_events.sql`
- Create: `src/app/api/kwo-snowflake-warehouse-analysis/cluster-activity/route.ts`
- Test: `src/app/api/kwo-snowflake-warehouse-analysis/cluster-activity/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `runQuery`, `AdcAuthError` from `src/lib/bigquery.ts`; `buildClusterIntervals`, `ClusterEventRow` from `src/lib/clusterIntervals.ts` (Task 1); `ClusterActivityResponse` from `src/lib/types.ts` (Task 1).
- Produces: `GET /api/kwo-snowflake-warehouse-analysis/cluster-activity?org_id&warehouse_name&start_date&end_date` → `ClusterActivityResponse` JSON body — consumed by Task 4's page wiring.

- [ ] **Step 1: Create the SQL file**

Create `sql/kwo_snowflake_warehouse_cluster_events.sql`:

```sql
-- kwo_snowflake_warehouse_cluster_events.sql
--
-- Parameters:
--   @warehouse_name STRING
--   @start_date STRING  (yyyy-MM-dd HH:mm:ss, inclusive lower bound, UTC — parsed via TIMESTAMP())
--   @end_date STRING    (yyyy-MM-dd HH:mm:ss, inclusive upper bound, UTC — parsed via TIMESTAMP())
--
-- Table placeholder `k3o_prd_ORGID_000_tf` is rewritten by the API route to the
-- caller's validated org_id before the query runs.
--
-- Returns two logical row sets, tagged by event_type:
--   'state_as_of_start' — the single most recent event per cluster_number
--                          before @start_date (rn = 1), used to tell whether
--                          the cluster was already running when the visible
--                          range begins.
--   'in_range'           — every matching event between @start_date and @end_date.
--
-- cluster_number IS NULL (single-cluster warehouse) is coalesced to 1.
-- event_ts is formatted as a fixed-width ISO string so plain lexical string
-- comparison in TypeScript sorts chronologically without re-parsing dates.

WITH events AS (
  SELECT
    IFNULL(cluster_number, 1) AS cluster_number,
    timestamp,
    CASE
      WHEN event_name IN ('SPINUP_CLUSTER', 'RESUME_CLUSTER') THEN TRUE
      WHEN event_name IN ('MULTICLUSTER_SPINDOWN', 'SUSPEND_CLUSTER') THEN FALSE
    END AS is_start
  FROM `keebo-portal.k3o_prd_ORGID_000_tf.warehouse_events_history_tf`
  WHERE warehouse_name = @warehouse_name
    AND event_state = 'COMPLETED'
    AND event_name IN ('SPINUP_CLUSTER', 'RESUME_CLUSTER', 'MULTICLUSTER_SPINDOWN', 'SUSPEND_CLUSTER')
),
state_as_of_start_ranked AS (
  SELECT
    cluster_number,
    timestamp,
    is_start,
    ROW_NUMBER() OVER (PARTITION BY cluster_number ORDER BY timestamp DESC) AS rn
  FROM events
  WHERE timestamp < TIMESTAMP(@start_date)
),
in_range AS (
  SELECT cluster_number, timestamp, is_start
  FROM events
  WHERE timestamp BETWEEN TIMESTAMP(@start_date) AND TIMESTAMP(@end_date)
)
SELECT
  'state_as_of_start' AS event_type,
  cluster_number,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E3S', timestamp) AS event_ts,
  is_start
FROM state_as_of_start_ranked
WHERE rn = 1

UNION ALL

SELECT
  'in_range' AS event_type,
  cluster_number,
  FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E3S', timestamp) AS event_ts,
  is_start
FROM in_range

ORDER BY cluster_number, event_ts
```

- [ ] **Step 2: Write the failing route tests**

Create `src/app/api/kwo-snowflake-warehouse-analysis/cluster-activity/__tests__/route.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/app/api/kwo-snowflake-warehouse-analysis/cluster-activity/__tests__/route.test.ts`
Expected: FAIL with a module-not-found error for `../route`.

- [ ] **Step 4: Implement the route**

Create `src/app/api/kwo-snowflake-warehouse-analysis/cluster-activity/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { runQuery, AdcAuthError } from '@/lib/bigquery'
import { buildClusterIntervals, type ClusterEventRow } from '@/lib/clusterIntervals'
import type { ClusterActivityResponse } from '@/lib/types'

const ORG_ID_PATTERN = /^[0-9a-f]+$/

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const orgId = searchParams.get('org_id')
  const warehouseName = searchParams.get('warehouse_name')
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')

  if (!orgId || !warehouseName || !startDate || !endDate) {
    return NextResponse.json(
      { error: 'org_id, warehouse_name, start_date, and end_date are required' },
      { status: 400 }
    )
  }
  if (!ORG_ID_PATTERN.test(orgId)) {
    return NextResponse.json({ error: 'invalid org_id' }, { status: 400 })
  }

  const rangeStart = `${startDate}T00:00:00.000`
  const rangeEnd = `${endDate}T23:59:59.000`

  try {
    const sqlTemplate = fs.readFileSync(
      path.join(process.cwd(), 'sql', 'kwo_snowflake_warehouse_cluster_events.sql'),
      'utf-8'
    )
    const sql = sqlTemplate.replace(/k3o_prd_ORGID_000_tf/g, `k3o_prd_${orgId}_000_tf`)

    const rows = await runQuery<ClusterEventRow>(sql, {
      warehouse_name: warehouseName,
      start_date: `${startDate} 00:00:00`,
      end_date: `${endDate} 23:59:59`,
    })

    const intervals = buildClusterIntervals(rows, rangeStart, rangeEnd)
    const response: ClusterActivityResponse = { intervals }
    return NextResponse.json(response)
  } catch (err) {
    console.error('[snf-warehouse-cluster-activity]', err)
    if (err instanceof AdcAuthError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 401 })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/app/api/kwo-snowflake-warehouse-analysis/cluster-activity/__tests__/route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add sql/kwo_snowflake_warehouse_cluster_events.sql src/app/api/kwo-snowflake-warehouse-analysis/cluster-activity/route.ts src/app/api/kwo-snowflake-warehouse-analysis/cluster-activity/__tests__/route.test.ts
git commit -m "feat: add cluster-activity API route for warehouse activity timeline"
```

---

### Task 3: `WarehouseActivityTimeline` component

**Files:**
- Create: `src/components/charts/WarehouseActivityTimeline.tsx`
- Test: `src/components/charts/__tests__/WarehouseActivityTimeline.test.tsx`

**Interfaces:**
- Consumes: `ClusterInterval` from `src/lib/types.ts` (Task 1); `C_NAVY`, `LIGHT_AXIS`, `DARK_AXIS`, `LIGHT_GRID`, `DARK_GRID` from `src/components/charts/TimeSeriesCharts.tsx`; `useTheme` from `src/components/layout/ThemeProvider`.
- Produces: `WarehouseActivityTimeline({ intervals, rangeStart, rangeEnd }: { intervals: ClusterInterval[]; rangeStart: string; rangeEnd: string })` — a React component consumed by Task 4's page wiring, expected to render inside a `ChartWrapper`.

Note on the fade-edge implementation: the spec describes the fade as "roughly ~24px" as an illustrative magnitude. Since this component has no reliable way to measure its own rendered pixel width without a `ResizeObserver`, the fade is implemented as a fixed 20% of each individual bar's own width using SVG `objectBoundingBox` gradient units — this produces the same "bar continues beyond what's shown" visual signal and scales correctly at any container width, which a fixed-pixel fade would not.

- [ ] **Step 1: Write the failing component tests**

Create `src/components/charts/__tests__/WarehouseActivityTimeline.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/charts/__tests__/WarehouseActivityTimeline.test.tsx`
Expected: FAIL with a module-not-found error for `../WarehouseActivityTimeline`.

- [ ] **Step 3: Implement the component**

Create `src/components/charts/WarehouseActivityTimeline.tsx`:

```tsx
'use client'

import { useMemo, useState } from 'react'
import { useTheme } from '@/components/layout/ThemeProvider'
import { C_NAVY, LIGHT_AXIS, DARK_AXIS, LIGHT_GRID, DARK_GRID } from './TimeSeriesCharts'
import type { ClusterInterval } from '@/lib/types'

const LABEL_WIDTH = 96
const ROW_HEIGHT = 40
const BAR_HEIGHT = 22
const FADE_FRACTION = 0.2
const TICK_COUNT = 5

interface WarehouseActivityTimelineProps {
  intervals: ClusterInterval[]
  rangeStart: string
  rangeEnd: string
}

interface HoverState {
  interval: ClusterInterval
  clientX: number
  clientY: number
}

function toMs(iso: string): number {
  return new Date(iso).getTime()
}

function formatTickLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatDuration(startIso: string, endIso: string): string {
  const totalMinutes = Math.round((toMs(endIso) - toMs(startIso)) / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  return `${hours}h ${minutes}m`
}

export function WarehouseActivityTimeline({ intervals, rangeStart, rangeEnd }: WarehouseActivityTimelineProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const AXIS = isLight ? LIGHT_AXIS : DARK_AXIS
  const GRID = isLight ? LIGHT_GRID : DARK_GRID
  const [hover, setHover] = useState<HoverState | null>(null)

  const rangeStartMs = toMs(rangeStart)
  const rangeEndMs = toMs(rangeEnd)
  const rangeMs = rangeEndMs - rangeStartMs

  const pct = (iso: string) => (rangeMs > 0 ? ((toMs(iso) - rangeStartMs) / rangeMs) * 100 : 0)

  const clusterNumbers = useMemo(
    () => [...new Set(intervals.map((i) => i.cluster_number))].sort((a, b) => a - b),
    [intervals]
  )

  const ticks = useMemo(
    () =>
      Array.from({ length: TICK_COUNT }, (_, i) => {
        const ms = rangeStartMs + (rangeMs * i) / (TICK_COUNT - 1)
        return { pct: (i / (TICK_COUNT - 1)) * 100, label: formatTickLabel(new Date(ms).toISOString()) }
      }),
    [rangeStartMs, rangeMs]
  )

  const bg = isLight ? '#ffffff' : '#04202d'
  const border = isLight ? '#cdd2da' : '#1a4459'
  const muted = isLight ? '#4d565a' : '#6b7f8a'
  const text = isLight ? '#051c27' : '#e8f0f4'
  const font = 'IBM Plex Sans, sans-serif'

  if (clusterNumbers.length === 0) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: muted, fontFamily: font, fontSize: 13 }}>
        No cluster activity for this warehouse in the selected range.
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex' }}>
        <div style={{ width: LABEL_WIDTH, flexShrink: 0 }} />
        <div style={{ flex: 1, position: 'relative', height: 20 }}>
          {ticks.map((tick) => (
            <span
              key={tick.pct}
              style={{
                position: 'absolute',
                left: `${tick.pct}%`,
                transform: tick.pct === 0 ? 'none' : tick.pct === 100 ? 'translateX(-100%)' : 'translateX(-50%)',
                fontFamily: AXIS.fontFamily,
                fontSize: AXIS.fontSize,
                fontWeight: AXIS.fontWeight,
                color: AXIS.fill,
                whiteSpace: 'nowrap',
              }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>

      {clusterNumbers.map((clusterNumber) => {
        const rowIntervals = intervals.filter((i) => i.cluster_number === clusterNumber)
        return (
          <div key={clusterNumber} style={{ display: 'flex', alignItems: 'center', height: ROW_HEIGHT }}>
            <div
              style={{
                width: LABEL_WIDTH,
                flexShrink: 0,
                fontFamily: AXIS.fontFamily,
                fontSize: AXIS.fontSize,
                fontWeight: AXIS.fontWeight,
                color: AXIS.fill,
              }}
            >
              {`Cluster ${clusterNumber}`}
            </div>
            <div style={{ flex: 1, position: 'relative', height: BAR_HEIGHT, borderRadius: 4, background: GRID }}>
              <svg width="100%" height={BAR_HEIGHT} style={{ display: 'block', overflow: 'visible' }}>
                <defs>
                  {rowIntervals.map((interval, idx) => {
                    if (!interval.truncated_start && !interval.truncated_end) return null
                    const gradientId = `cluster-fade-${clusterNumber}-${idx}`
                    const stops: { offset: string; opacity: number }[] = [
                      { offset: '0%', opacity: interval.truncated_start ? 0 : 1 },
                    ]
                    if (interval.truncated_start) stops.push({ offset: `${FADE_FRACTION * 100}%`, opacity: 1 })
                    if (interval.truncated_end) stops.push({ offset: `${(1 - FADE_FRACTION) * 100}%`, opacity: 1 })
                    stops.push({ offset: '100%', opacity: interval.truncated_end ? 0 : 1 })
                    return (
                      <linearGradient key={gradientId} id={gradientId} x1="0" y1="0" x2="1" y2="0">
                        {stops.map((stop, stopIdx) => (
                          <stop key={stopIdx} offset={stop.offset} stopColor={C_NAVY} stopOpacity={stop.opacity} />
                        ))}
                      </linearGradient>
                    )
                  })}
                </defs>
                {rowIntervals.map((interval, idx) => {
                  const x = pct(interval.start)
                  const width = Math.max(pct(interval.end) - x, 0.5)
                  const needsGradient = interval.truncated_start || interval.truncated_end
                  return (
                    <rect
                      key={idx}
                      x={`${x}%`}
                      y={0}
                      width={`${width}%`}
                      height={BAR_HEIGHT}
                      rx={4}
                      fill={needsGradient ? `url(#cluster-fade-${clusterNumber}-${idx})` : C_NAVY}
                      onMouseEnter={(e) => setHover({ interval, clientX: e.clientX, clientY: e.clientY })}
                      onMouseMove={(e) => setHover({ interval, clientX: e.clientX, clientY: e.clientY })}
                      onMouseLeave={() => setHover(null)}
                      style={{ cursor: 'pointer' }}
                    />
                  )
                })}
              </svg>
            </div>
          </div>
        )
      })}

      {hover && (
        <div
          style={{
            position: 'fixed',
            left: hover.clientX + 12,
            top: hover.clientY + 12,
            background: bg,
            border: `1px solid ${border}`,
            borderRadius: 8,
            padding: '10px 14px',
            fontFamily: font,
            fontSize: 12,
            minWidth: 180,
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          <div style={{ color: text, fontWeight: 600, marginBottom: 6 }}>{`Cluster ${hover.interval.cluster_number}`}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: 3 }}>
            <span style={{ color: muted }}>Start</span>
            <span style={{ color: text }}>
              {hover.interval.truncated_start ? 'Running since before selected range' : formatTickLabel(hover.interval.start)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: 3 }}>
            <span style={{ color: muted }}>End</span>
            <span style={{ color: text }}>
              {hover.interval.truncated_end ? 'Still running after selected range' : formatTickLabel(hover.interval.end)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24 }}>
            <span style={{ color: muted }}>Duration</span>
            <span style={{ color: text }}>{formatDuration(hover.interval.start, hover.interval.end)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/charts/__tests__/WarehouseActivityTimeline.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/charts/WarehouseActivityTimeline.tsx src/components/charts/__tests__/WarehouseActivityTimeline.test.tsx
git commit -m "feat: add WarehouseActivityTimeline chart component"
```

---

### Task 4: Wire the timeline into the Warehouse Analysis page

**Files:**
- Modify: `src/app/kwo-snowflake-warehouse-analysis/page.tsx`
- Modify: `src/app/kwo-snowflake-warehouse-analysis/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `WarehouseActivityTimeline` from `src/components/charts/WarehouseActivityTimeline.tsx` (Task 3); `ClusterInterval`, `ClusterActivityResponse` from `src/lib/types.ts` (Task 1); the `GET /api/kwo-snowflake-warehouse-analysis/cluster-activity` route (Task 2); existing `ChartWrapper` from `src/components/charts/TimeSeriesCharts.tsx`; existing `SectionError` and `FetchError` already defined in `page.tsx`.
- Produces: nothing further downstream — this is the final integration point.

- [ ] **Step 1: Read the current page test file's fetch-mock shape**

`src/app/kwo-snowflake-warehouse-analysis/__tests__/page.test.tsx` mocks `global.fetch` by matching on URL substrings. The new endpoint (`/cluster-activity`) must be added to that mock so existing tests don't fail once the page issues a fourth fetch. Locate the existing `global.fetch = vi.fn((url: string) => ...)` implementation in that file before making the edit in Step 4.

- [ ] **Step 2: Write the failing test for the new section**

Add this test to `src/app/kwo-snowflake-warehouse-analysis/__tests__/page.test.tsx` (in the same `describe` block as the existing test, using the same customer/warehouse-selection setup already present in that file — extend the existing `global.fetch` mock's URL-matching chain with a branch for `cluster-activity` that resolves `{ intervals: [] }`, alongside its existing branches for `customers`, `warehouses`, and `timeseries`):

```tsx
it('renders the Warehouse Activity chart section once a warehouse is selected', async () => {
  render(<WarehouseAnalysisPage />)

  // Reuses this file's existing customer + warehouse selection flow.
  await selectCustomerAndWarehouse()

  expect(await screen.findByText('Warehouse Activity')).toBeInTheDocument()
})
```

If this file does not already have a `selectCustomerAndWarehouse()` helper, inline the same `fireEvent.click` / `getByTestId` sequence the file's existing test already uses to reach a selected-warehouse state, rather than introducing a new helper — match whatever pattern is already established in that file.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/app/kwo-snowflake-warehouse-analysis/__tests__/page.test.tsx`
Expected: FAIL — `screen.findByText('Warehouse Activity')` times out (section does not exist yet), and/or the fetch mock throws on an unmatched URL for `cluster-activity`.

- [ ] **Step 4: Wire up the page**

In `src/app/kwo-snowflake-warehouse-analysis/page.tsx`:

Add to the imports:

```tsx
import { WarehouseActivityTimeline } from '@/components/charts/WarehouseActivityTimeline'
import { ChartWrapper } from '@/components/charts/TimeSeriesCharts'
import type { ClusterInterval, ClusterActivityResponse } from '@/lib/types'
```

(Add `ClusterInterval`, `ClusterActivityResponse` to the existing `import type { ... } from '@/lib/types'` line rather than duplicating it.)

Add new state, alongside the existing `points`/`timeseriesError`/`loading` state block:

```tsx
const [clusterIntervals, setClusterIntervals] = useState<ClusterInterval[]>([])
const [clusterActivityError, setClusterActivityError] = useState<FetchError | null>(null)
const [clusterActivityLoading, setClusterActivityLoading] = useState(false)
```

Add a new effect, placed after the existing `timeseries` effect:

```tsx
useEffect(() => {
  if (!selectedCustomer || !selectedWarehouse) {
    setClusterIntervals([])
    return
  }
  const controller = new AbortController()
  setClusterActivityLoading(true)
  setClusterActivityError(null)

  const params = new URLSearchParams({
    org_id: selectedCustomer,
    warehouse_name: selectedWarehouse,
    start_date: startDate,
    end_date: endDate,
  })

  fetch(`/api/kwo-snowflake-warehouse-analysis/cluster-activity?${params}`, { signal: controller.signal })
    .then(async (res) => {
      const body = (await res.json()) as ClusterActivityResponse & { error?: string; code?: string }
      if (!res.ok) throw body
      setClusterIntervals(body.intervals)
    })
    .catch((err) => {
      if (err.name === 'AbortError') return
      setClusterActivityError({ message: err.error ?? String(err), code: err.code })
    })
    .finally(() => setClusterActivityLoading(false))

  return () => controller.abort()
}, [selectedCustomer, selectedWarehouse, startDate, endDate])
```

Add the new section's JSX, between `<WarehouseAnalysisCharts points={points} />` and `<DataTable ...>` inside the existing `{selectedCustomer && selectedWarehouse && !timeseriesError && points.length > 0 && (...)}` block — but rendered independently of `points.length`, since cluster activity has its own empty/error/loading states per the spec. Restructure that block as:

```tsx
{selectedCustomer && selectedWarehouse && !timeseriesError && points.length > 0 && (
  <>
    <WarehouseAnalysisCharts points={points} />

    <ChartWrapper title="Warehouse Activity">
      {clusterActivityError ? (
        <SectionError error={clusterActivityError} />
      ) : !clusterActivityLoading && clusterIntervals.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground text-sm">
          No cluster activity for this warehouse in the selected range.
        </div>
      ) : (
        <WarehouseActivityTimeline
          intervals={clusterIntervals}
          rangeStart={`${startDate}T00:00:00.000`}
          rangeEnd={`${endDate}T23:59:59.000`}
        />
      )}
    </ChartWrapper>

    <DataTable
      columns={tableColumns}
      rows={tableRows as unknown as Record<string, unknown>[]}
      defaultSortKey="period_label"
      defaultSortDir="asc"
      csvFilename="warehouse_analysis.csv"
    />
  </>
)}
```

- [ ] **Step 5: Update the existing fetch mock in the test file**

In `src/app/kwo-snowflake-warehouse-analysis/__tests__/page.test.tsx`, find the existing `global.fetch = vi.fn((url) => ...)` mock and add a branch matching `cluster-activity` that resolves `{ intervals: [] }`, following the same conditional-branching style already used there for `customers`/`warehouses`/`timeseries`.

- [ ] **Step 6: Run the full page test file to verify it passes**

Run: `npx vitest run src/app/kwo-snowflake-warehouse-analysis/__tests__/page.test.tsx`
Expected: PASS (all tests, including the new one from Step 2).

- [ ] **Step 7: Run the full test suite and type check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: All tests PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/kwo-snowflake-warehouse-analysis/page.tsx src/app/kwo-snowflake-warehouse-analysis/__tests__/page.test.tsx
git commit -m "feat: wire Warehouse Activity timeline into Snowflake Warehouse Analysis page"
```
