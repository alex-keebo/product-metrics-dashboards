# Delivery Timeline Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Delivery Timeline" page below "PM Board" showing three tabs — Current Projects (Gantt), What's Next (Gantt), Recent Ships (monthly lists) — built from the existing PM Board Jira data source.

**Architecture:** Extract the existing Jira→row mapping out of `pm-board/route.ts` into a shared `src/lib/jira-row-mapper.ts` module so both the existing PM Board route and a new single-quarter `delivery-timeline` route can use it without duplication. Add a `previousFiscalQuarterLabel` helper to `fiscal-quarter.ts`. Build pure, fully-tested date/layout math in two new lib-style modules (`gantt.ts`, `recent-ships.ts`) co-located with the feature's components, then thin React components (`GanttChart`, `RecentShips`) that call that math and render it. Wire it all together in a new client page that fetches all three quarters in parallel and switches between tabs with local state.

**Tech Stack:** Next.js (App Router) route handlers, React client components, Vitest + @testing-library/react for tests, Tailwind v4 semantic tokens for styling.

## Global Constraints

- Colors: only Tailwind semantic tokens (`bg-primary`, `text-muted-foreground`, `border-border`, `bg-success`, `bg-destructive`, etc.) — never hardcode hex values in component files. No `--warning` token exists.
- No new Jira custom fields — reuse the fields already mapped in `pm-board/route.ts` (`customfield_10049/10062/10063/10892/10383`, `status`, `status.statusCategory.key`).
- New API route: `GET /api/product-planning/delivery-timeline?quarter=<label>` with JQL `project = PM AND "cf[10049]" = "<quarter>" ORDER BY "cf[10383]" DESC`.
- Response shape mirrors `PMBoardRow` — do not define a second row type.
- Status pill mapping: `new` → "To Do", `indeterminate` → "In Progress", `done` → "Done" — derived from `statusCategory`, never raw `status` text.
- Fiscal quarter → calendar months: Q1 = Feb–Apr, Q2 = May–Jul, Q3 = Aug–Oct, Q4 = Nov–Jan (fiscal year starts Feb 1).
- Tickets missing `targetStartDate` or `targetDeliveryDate` render as a full-width "Dates TBD" bar and sort by `priorityOrder` only (in the non-"started-before" bucket).
- Sort order within a tab: "started before" tickets first (by `priorityOrder` descending among themselves), then everything else (by `priorityOrder` descending).
- Current Projects tab axis extends ("spillover") to cover any ticket's `targetDeliveryDate` past the quarter's end, rounded up to end-of-month; What's Next tab axis is always fixed to its own quarter, no spillover.
- "Started before" = `targetStartDate` precedes the 1st of the tab's first displayed month; applies to both Gantt tabs, not to Recent Ships.
- Recent Ships shows only previous-quarter tickets with non-null `actualDeliveryDate`, grouped by calendar month of that date, sorted within month by `priorityOrder` descending; no "started before" concept.
- Route: `/product-planning/delivery-timeline`. Nav entry added to the `'Product Planning'` group in `src/components/layout/Sidebar.tsx`, after "PM Board".
- Test runner: `npm test` (`vitest run --passWithNoTests`). Vitest globals are enabled (no need to import `describe`/`it`/`expect` — but this repo's existing tests import them explicitly from `'vitest'`; follow that convention).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/fiscal-quarter.ts` (modify) | Add `previousFiscalQuarterLabel` |
| `src/lib/jira-row-mapper.ts` (create) | Shared `PMBoardRow` type + `toRow`/`intervalStart`, extracted out of `pm-board/route.ts` |
| `src/app/api/product-planning/pm-board/route.ts` (modify) | Import mapper from the shared module instead of defining it locally; re-export `PMBoardRow` for backward compatibility |
| `src/app/api/product-planning/delivery-timeline/route.ts` (create) | New single-quarter GET route |
| `src/components/delivery-timeline/gantt.ts` (create) | Pure axis/bar-position/sort/status-pill math for both Gantt tabs |
| `src/components/delivery-timeline/recent-ships.ts` (create) | Pure month-grouping math for Recent Ships |
| `src/components/delivery-timeline/GanttChart.tsx` (create) | Renders one Gantt tab from `gantt.ts` output |
| `src/components/delivery-timeline/RecentShips.tsx` (create) | Renders the Recent Ships card from `recent-ships.ts` output |
| `src/app/product-planning/delivery-timeline/page.tsx` (create) | Fetches previous/current/next quarter rows, renders the 3-tab UI |
| `src/components/layout/Sidebar.tsx` (modify) | Add nav entry |

---

### Task 1: Add `previousFiscalQuarterLabel`

**Files:**
- Modify: `src/lib/fiscal-quarter.ts`
- Test: `src/lib/__tests__/fiscal-quarter.test.ts`

**Interfaces:**
- Consumes: nothing new (uses the existing module-local `LABEL_RE` regex already defined at the top of `fiscal-quarter.ts`)
- Produces: `previousFiscalQuarterLabel(label: string): string`, consumed by Task 9 (page.tsx)

- [ ] **Step 1: Write the failing tests**

Add this `describe` block to the end of `src/lib/__tests__/fiscal-quarter.test.ts` (the file currently ends at line 48 with a closing `})` for `quarterWindow`; append after it):

```ts
describe('previousFiscalQuarterLabel', () => {
  it('rolls Q2 -> Q1 within the same fiscal year', () => {
    expect(previousFiscalQuarterLabel('26-Q2')).toBe('26-Q1')
  })

  it('rolls Q1 -> previous fiscal year Q4', () => {
    expect(previousFiscalQuarterLabel('26-Q1')).toBe('25-Q4')
  })

  it('throws on a malformed label', () => {
    expect(() => previousFiscalQuarterLabel('Future')).toThrow()
  })
})
```

Also update the top import line (line 2) to add the new name:

```ts
import { currentFiscalQuarterLabel, nextFiscalQuarterLabel, previousFiscalQuarterLabel, quarterWindow } from '../fiscal-quarter'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- fiscal-quarter`
Expected: FAIL — `previousFiscalQuarterLabel is not a function` (or a TS error that it doesn't exist on the module)

- [ ] **Step 3: Implement**

Append to `src/lib/fiscal-quarter.ts` (after the existing `quarterWindow` function, keeping the trailing blank line):

```ts

/** Rolls a fiscal-quarter label backward by one quarter, e.g. "26-Q1" -> "25-Q4". */
export function previousFiscalQuarterLabel(label: string): string {
  const match = LABEL_RE.exec(label)
  if (!match) throw new Error(`Invalid fiscal quarter label: ${label}`)
  const year = Number(match[1])
  const quarter = Number(match[2])
  if (quarter === 1) return `${String((year - 1 + 100) % 100).padStart(2, '0')}-Q4`
  return `${String(year).padStart(2, '0')}-Q${quarter - 1}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- fiscal-quarter`
Expected: PASS (all `previousFiscalQuarterLabel` + pre-existing tests green)

- [ ] **Step 5: Commit**

```bash
git add src/lib/fiscal-quarter.ts src/lib/__tests__/fiscal-quarter.test.ts
git commit -m "feat: add previousFiscalQuarterLabel to fiscal-quarter"
```

---

### Task 2: Extract shared Jira row mapper

**Files:**
- Create: `src/lib/jira-row-mapper.ts`
- Test: `src/lib/__tests__/jira-row-mapper.test.ts`
- Modify: `src/app/api/product-planning/pm-board/route.ts`

**Interfaces:**
- Consumes: `jiraBrowseUrl`, `type JiraIssue` from `@/lib/jira` (already exist, see `src/lib/jira.ts`)
- Produces: `export interface PMBoardRow { key, url, issueType, summary, status, statusCategory, priorityOrder, roadmap, targetStartDate, targetDeliveryDate, actualDeliveryDate, product, category, keyCustomers, salesforceTotalArr, salesforceOpportunities }`, `export function intervalStart(raw: string | null): string | null`, `export function toRow(issue: JiraIssue): PMBoardRow` — consumed by Task 3 (`delivery-timeline/route.ts`) and by the refactored `pm-board/route.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/jira-row-mapper.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toRow, intervalStart } from '../jira-row-mapper'
import type { JiraIssue } from '@/lib/jira'

function baseIssue(overrides: Partial<JiraIssue['fields']> = {}): JiraIssue {
  return {
    id: '1',
    key: 'PM-585',
    fields: {
      issuetype: { name: 'Idea' },
      summary: 'Do the thing',
      status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
      customfield_10383: 420,
      customfield_10049: { value: '26-Q2' },
      customfield_10062: '{"start":"2026-07-01","end":"2026-07-15"}',
      customfield_10063: '{"start":"2026-08-01","end":"2026-08-15"}',
      customfield_10892: null,
      customfield_10064: [{ value: 'KWO for Databricks' }, { value: 'KWO for Snowflake' }],
      customfield_10048: [{ value: 'Platform' }],
      customfield_10059: null,
      customfield_10925: 120000,
      customfield_10926: 'OPP-1234',
      ...overrides,
    },
  }
}

describe('intervalStart', () => {
  it('extracts the start date from a JSON interval string', () => {
    expect(intervalStart('{"start":"2026-07-01","end":"2026-07-15"}')).toBe('2026-07-01')
  })

  it('returns null for null input', () => {
    expect(intervalStart(null)).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(intervalStart('not json')).toBeNull()
  })
})

describe('toRow', () => {
  it('maps a full issue to a PMBoardRow', () => {
    expect(toRow(baseIssue())).toEqual({
      key: 'PM-585',
      url: 'https://keebo.atlassian.net/browse/PM-585',
      issueType: 'Idea',
      summary: 'Do the thing',
      status: 'In Progress',
      statusCategory: 'indeterminate',
      priorityOrder: 420,
      roadmap: '26-Q2',
      targetStartDate: '2026-07-01',
      targetDeliveryDate: '2026-08-01',
      actualDeliveryDate: null,
      product: ['KWO for Databricks', 'KWO for Snowflake'],
      category: ['Platform'],
      keyCustomers: [],
      salesforceTotalArr: 120000,
      salesforceOpportunities: 'OPP-1234',
    })
  })

  it('defaults missing scalar fields to empty string/null', () => {
    const row = toRow(baseIssue({ issuetype: null, status: null, customfield_10383: null, customfield_10049: null }))
    expect(row).toMatchObject({
      issueType: '',
      status: '',
      statusCategory: '',
      priorityOrder: null,
      roadmap: null,
    })
  })
})
```

This test mocks nothing — it calls the real `jiraBrowseUrl`, which requires `JIRA_BASE_URL` to be set. Add a `vi.mock` for `@/lib/jira` at the top instead, mirroring the existing `pm-board` route test convention. Replace the test file's imports and add the mock:

```ts
import { describe, it, expect, vi } from 'vitest'
import type { JiraIssue } from '@/lib/jira'

vi.mock('@/lib/jira', () => ({
  jiraBrowseUrl: (key: string) => `https://keebo.atlassian.net/browse/${key}`,
}))

const { toRow, intervalStart } = await import('../jira-row-mapper')
```

Remove the earlier plain `import { toRow, intervalStart } from '../jira-row-mapper'` line — the dynamic import above (after the mock is registered) replaces it. The full corrected top of the file:

```ts
import { describe, it, expect, vi } from 'vitest'
import type { JiraIssue } from '@/lib/jira'

vi.mock('@/lib/jira', () => ({
  jiraBrowseUrl: (key: string) => `https://keebo.atlassian.net/browse/${key}`,
}))

const { toRow, intervalStart } = await import('../jira-row-mapper')

function baseIssue(overrides: Partial<JiraIssue['fields']> = {}): JiraIssue {
  return {
    id: '1',
    key: 'PM-585',
    fields: {
      issuetype: { name: 'Idea' },
      summary: 'Do the thing',
      status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
      customfield_10383: 420,
      customfield_10049: { value: '26-Q2' },
      customfield_10062: '{"start":"2026-07-01","end":"2026-07-15"}',
      customfield_10063: '{"start":"2026-08-01","end":"2026-08-15"}',
      customfield_10892: null,
      customfield_10064: [{ value: 'KWO for Databricks' }, { value: 'KWO for Snowflake' }],
      customfield_10048: [{ value: 'Platform' }],
      customfield_10059: null,
      customfield_10925: 120000,
      customfield_10926: 'OPP-1234',
      ...overrides,
    },
  }
}
```

(Keep the two `describe` blocks below it exactly as written above.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- jira-row-mapper`
Expected: FAIL — `Failed to resolve import "../jira-row-mapper"`

- [ ] **Step 3: Implement**

Create `src/lib/jira-row-mapper.ts`:

```ts
import { jiraBrowseUrl, type JiraIssue } from '@/lib/jira'

export interface PMBoardRow {
  key: string
  url: string
  issueType: string
  summary: string
  status: string
  statusCategory: string
  priorityOrder: number | null
  roadmap: string | null
  targetStartDate: string | null
  targetDeliveryDate: string | null
  actualDeliveryDate: string | null
  product: string[]
  category: string[]
  keyCustomers: string[]
  salesforceTotalArr: number | null
  salesforceOpportunities: string | null
}

export function intervalStart(raw: string | null): string | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { start?: string }
    return parsed.start ?? null
  } catch {
    return null
  }
}

export function toRow(issue: JiraIssue): PMBoardRow {
  const f = issue.fields
  return {
    key: issue.key,
    url: jiraBrowseUrl(issue.key),
    issueType: f.issuetype?.name ?? '',
    summary: f.summary ?? '',
    status: f.status?.name ?? '',
    statusCategory: f.status?.statusCategory?.key ?? '',
    priorityOrder: f.customfield_10383 ?? null,
    roadmap: f.customfield_10049?.value ?? null,
    targetStartDate: intervalStart(f.customfield_10062),
    targetDeliveryDate: intervalStart(f.customfield_10063),
    actualDeliveryDate: intervalStart(f.customfield_10892),
    product: (f.customfield_10064 ?? []).map((v) => v.value),
    category: (f.customfield_10048 ?? []).map((v) => v.value),
    keyCustomers: (f.customfield_10059 ?? []).map((v) => v.value),
    salesforceTotalArr: f.customfield_10925 ?? null,
    salesforceOpportunities: f.customfield_10926 ?? null,
  }
}
```

Now refactor `src/app/api/product-planning/pm-board/route.ts` to use it. Replace the entire file content with:

```ts
import { NextResponse } from 'next/server'
import { searchIssues } from '@/lib/jira'
import { quarterWindow } from '@/lib/fiscal-quarter'
import { toRow } from '@/lib/jira-row-mapper'

export type { PMBoardRow } from '@/lib/jira-row-mapper'

export async function GET(): Promise<NextResponse> {
  try {
    const quarters = quarterWindow()
    const jql = `project = PM AND "cf[10049]" IN (${quarters.join(', ')}) ORDER BY "cf[10049]" ASC, "cf[10383]" DESC`
    const issues = await searchIssues(jql)
    return NextResponse.json({ rows: issues.map(toRow) })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- jira-row-mapper pm-board`
Expected: PASS — both the new `jira-row-mapper.test.ts` and the pre-existing `pm-board/__tests__/route.test.ts` (unchanged, still mocking `@/lib/jira` and `@/lib/fiscal-quarter`) pass without modification.

- [ ] **Step 5: Commit**

```bash
git add src/lib/jira-row-mapper.ts src/lib/__tests__/jira-row-mapper.test.ts src/app/api/product-planning/pm-board/route.ts
git commit -m "refactor: extract shared Jira row mapper out of pm-board route"
```

---

### Task 3: Delivery Timeline API route

**Files:**
- Create: `src/app/api/product-planning/delivery-timeline/route.ts`
- Test: `src/app/api/product-planning/delivery-timeline/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `searchIssues` from `@/lib/jira`; `toRow`, `type PMBoardRow` from `@/lib/jira-row-mapper` (Task 2)
- Produces: `GET(req: NextRequest): Promise<NextResponse>` handling `?quarter=<label>`, consumed by the page (Task 9) via `fetch('/api/product-planning/delivery-timeline?quarter=...')`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/product-planning/delivery-timeline/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { JiraIssue } from '@/lib/jira'

vi.mock('@/lib/jira', () => ({
  searchIssues: vi.fn(),
  jiraBrowseUrl: (key: string) => `https://keebo.atlassian.net/browse/${key}`,
}))

function baseIssue(overrides: Partial<JiraIssue['fields']> = {}): JiraIssue {
  return {
    id: '1',
    key: 'PM-585',
    fields: {
      issuetype: { name: 'Idea' },
      summary: 'Do the thing',
      status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
      customfield_10383: 420,
      customfield_10049: { value: '26-Q2' },
      customfield_10062: '{"start":"2026-07-01","end":"2026-07-15"}',
      customfield_10063: '{"start":"2026-08-01","end":"2026-08-15"}',
      customfield_10892: null,
      customfield_10064: [],
      customfield_10048: [],
      customfield_10059: [],
      customfield_10925: null,
      customfield_10926: null,
      ...overrides,
    },
  }
}

function makeRequest(url: string) {
  return { nextUrl: new URL(url) } as unknown as Parameters<typeof import('../route').GET>[0]
}

describe('GET /api/product-planning/delivery-timeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds the single-quarter JQL and returns flattened rows', async () => {
    const { searchIssues } = await import('@/lib/jira')
    vi.mocked(searchIssues).mockResolvedValue([baseIssue()])

    const { GET } = await import('../route')
    const res = await GET(makeRequest('http://localhost/api/product-planning/delivery-timeline?quarter=26-Q2'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(vi.mocked(searchIssues)).toHaveBeenCalledWith(
      'project = PM AND "cf[10049]" = "26-Q2" ORDER BY "cf[10383]" DESC'
    )
    expect(body.rows).toEqual([
      {
        key: 'PM-585',
        url: 'https://keebo.atlassian.net/browse/PM-585',
        issueType: 'Idea',
        summary: 'Do the thing',
        status: 'In Progress',
        statusCategory: 'indeterminate',
        priorityOrder: 420,
        roadmap: '26-Q2',
        targetStartDate: '2026-07-01',
        targetDeliveryDate: '2026-08-01',
        actualDeliveryDate: null,
        product: [],
        category: [],
        keyCustomers: [],
        salesforceTotalArr: null,
        salesforceOpportunities: null,
      },
    ])
  })

  it('returns 400 when the quarter param is missing', async () => {
    const { GET } = await import('../route')
    const res = await GET(makeRequest('http://localhost/api/product-planning/delivery-timeline'))
    expect(res.status).toBe(400)
  })

  it('returns 400 when the quarter param is malformed', async () => {
    const { GET } = await import('../route')
    const res = await GET(makeRequest('http://localhost/api/product-planning/delivery-timeline?quarter=not-a-quarter'))
    expect(res.status).toBe(400)
  })

  it('returns a 502 with the error message when searchIssues throws', async () => {
    const { searchIssues } = await import('@/lib/jira')
    vi.mocked(searchIssues).mockRejectedValue(new Error('Jira API 401 at /search/jql: Unauthorized'))

    const { GET } = await import('../route')
    const res = await GET(makeRequest('http://localhost/api/product-planning/delivery-timeline?quarter=26-Q2'))
    const body = await res.json()

    expect(res.status).toBe(502)
    expect(body.error).toContain('401')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- delivery-timeline`
Expected: FAIL — `Failed to resolve import "../route"`

- [ ] **Step 3: Implement**

Create `src/app/api/product-planning/delivery-timeline/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { searchIssues } from '@/lib/jira'
import { toRow } from '@/lib/jira-row-mapper'

const QUARTER_RE = /^\d{2}-Q[1-4]$/

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl
  const quarter = searchParams.get('quarter')
  if (!quarter || !QUARTER_RE.test(quarter)) {
    return NextResponse.json({ error: 'Missing or invalid "quarter" query param' }, { status: 400 })
  }

  try {
    const jql = `project = PM AND "cf[10049]" = "${quarter}" ORDER BY "cf[10383]" DESC`
    const issues = await searchIssues(jql)
    return NextResponse.json({ rows: issues.map(toRow) })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- delivery-timeline`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/product-planning/delivery-timeline/route.ts src/app/api/product-planning/delivery-timeline/__tests__/route.test.ts
git commit -m "feat: add delivery-timeline single-quarter API route"
```

---

### Task 4: Gantt pure logic module

**Files:**
- Create: `src/components/delivery-timeline/gantt.ts`
- Test: `src/components/delivery-timeline/__tests__/gantt.test.ts`

**Interfaces:**
- Consumes: `type PMBoardRow` from `@/app/api/product-planning/pm-board/route` (re-exported from `@/lib/jira-row-mapper` per Task 2)
- Produces:
  - `quarterMonthRange(label: string): { start: Date; end: Date }`
  - `computeAxis(quarterLabel: string, tickets: PMBoardRow[], allowSpillover: boolean): { axisStart: Date; axisEnd: Date; quarterEnd: Date }`
  - `barPosition(axisStart: Date, axisEnd: Date, ticketStart: Date, ticketEnd: Date): { leftPct: number; widthPct: number }`
  - `axisMonths(axisStart: Date, axisEnd: Date, quarterEnd: Date): { label: string; leftPct: number; widthPct: number; isSpillover: boolean }[]`
  - `dividerLeftPct(axisStart: Date, axisEnd: Date, quarterEnd: Date): number | null`
  - `sortTickets(tickets: PMBoardRow[], axisStart: Date): PMBoardRow[]`
  - `statusPillInfo(statusCategory: string): { label: string; className: string }`
  - `parseISODate(value: string): Date`
  - `resolveTicketBar(ticket: PMBoardRow, axisStart: Date, axisEnd: Date): { start: Date; end: Date; isTbd: boolean }`

  All consumed by Task 6 (`GanttChart.tsx`).

  **Missing-date bar resolution (`resolveTicketBar`):** a missing date is an
  open boundary at the axis edge on that side, not always a full-width bar:
  - Missing `targetStartDate` only: `start = axisStart`, `end =
    parseISODate(targetDeliveryDate)`, `isTbd = true`.
  - Missing `targetDeliveryDate` only: `start = parseISODate(targetStartDate)`,
    `end = axisEnd`, `isTbd = true`.
  - Both missing: `start = axisStart`, `end = axisEnd`, `isTbd = true`.
  - Neither missing: `start = parseISODate(targetStartDate)`, `end =
    parseISODate(targetDeliveryDate)`, `isTbd = false`.

  The caller (Task 6) passes `resolveTicketBar`'s `start`/`end` straight into
  `barPosition` (which already clamps to the axis) and uses `isTbd` for the
  `.ticket-bar.tbd` styling and the "Dates TBD" text — regardless of which
  date (or both) is missing, the visual treatment is identical.

  **`isStartedBefore`/sort interaction:** the existing `isStartedBefore` (only
  checks `targetStartDate !== null`, ignores `targetDeliveryDate` entirely) is
  already correct under this rule — a ticket with a real `targetStartDate`
  before axis start is "started before" even when its `targetDeliveryDate` is
  missing. No code change needed there; add regression tests (Step 1) that
  lock this in given the earlier reviewer finding that this interaction was
  unverified.

- [ ] **Step 1: Write the failing tests**

Create `src/components/delivery-timeline/__tests__/gantt.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  quarterMonthRange,
  computeAxis,
  barPosition,
  axisMonths,
  dividerLeftPct,
  sortTickets,
  statusPillInfo,
  parseISODate,
  resolveTicketBar,
} from '../gantt'
import type { PMBoardRow } from '@/app/api/product-planning/pm-board/route'

function row(overrides: Partial<PMBoardRow> = {}): PMBoardRow {
  return {
    key: 'PM-1',
    url: 'https://keebo.atlassian.net/browse/PM-1',
    issueType: 'Idea',
    summary: 'Ticket',
    status: 'In Progress',
    statusCategory: 'indeterminate',
    priorityOrder: 0,
    roadmap: '26-Q2',
    targetStartDate: null,
    targetDeliveryDate: null,
    actualDeliveryDate: null,
    product: [],
    category: [],
    keyCustomers: [],
    salesforceTotalArr: null,
    salesforceOpportunities: null,
    ...overrides,
  }
}

describe('parseISODate', () => {
  it('parses a YYYY-MM-DD string as UTC midnight', () => {
    const d = parseISODate('2026-05-01')
    expect(d.getUTCFullYear()).toBe(2026)
    expect(d.getUTCMonth()).toBe(4)
    expect(d.getUTCDate()).toBe(1)
  })
})

describe('quarterMonthRange', () => {
  it('26-Q2 -> May 1 - Jul 31, 2026', () => {
    const { start, end } = quarterMonthRange('26-Q2')
    expect(start.toISOString().slice(0, 10)).toBe('2026-05-01')
    expect(end.toISOString().slice(0, 10)).toBe('2026-07-31')
  })

  it('26-Q4 -> Nov 1, 2026 - Jan 31, 2027 (rolls into next calendar year)', () => {
    const { start, end } = quarterMonthRange('26-Q4')
    expect(start.toISOString().slice(0, 10)).toBe('2026-11-01')
    expect(end.toISOString().slice(0, 10)).toBe('2027-01-31')
  })

  it('26-Q1 -> Feb 1 - Apr 30, 2026', () => {
    const { start, end } = quarterMonthRange('26-Q1')
    expect(start.toISOString().slice(0, 10)).toBe('2026-02-01')
    expect(end.toISOString().slice(0, 10)).toBe('2026-04-30')
  })
})

describe('computeAxis', () => {
  it('with allowSpillover=false, axis is fixed to the quarter regardless of ticket dates', () => {
    const tickets = [row({ targetDeliveryDate: '2026-09-04' })]
    const { axisStart, axisEnd, quarterEnd } = computeAxis('26-Q2', tickets, false)
    expect(axisStart.toISOString().slice(0, 10)).toBe('2026-05-01')
    expect(axisEnd.toISOString().slice(0, 10)).toBe('2026-07-31')
    expect(quarterEnd.toISOString().slice(0, 10)).toBe('2026-07-31')
  })

  it('with allowSpillover=true, extends axisEnd to end-of-month of the latest targetDeliveryDate past quarter end', () => {
    const tickets = [row({ targetDeliveryDate: '2026-08-15' }), row({ targetDeliveryDate: '2026-07-20' })]
    const { axisStart, axisEnd, quarterEnd } = computeAxis('26-Q2', tickets, true)
    expect(axisStart.toISOString().slice(0, 10)).toBe('2026-05-01')
    expect(axisEnd.toISOString().slice(0, 10)).toBe('2026-08-31')
    expect(quarterEnd.toISOString().slice(0, 10)).toBe('2026-07-31')
  })

  it('with allowSpillover=true and no ticket past quarter end, axis stays at the quarter end', () => {
    const tickets = [row({ targetDeliveryDate: '2026-07-01' })]
    const { axisEnd } = computeAxis('26-Q2', tickets, true)
    expect(axisEnd.toISOString().slice(0, 10)).toBe('2026-07-31')
  })

  it('ignores tickets with no targetDeliveryDate', () => {
    const tickets = [row({ targetDeliveryDate: null })]
    const { axisEnd } = computeAxis('26-Q2', tickets, true)
    expect(axisEnd.toISOString().slice(0, 10)).toBe('2026-07-31')
  })
})

describe('barPosition', () => {
  it('places a bar spanning the full 31-day axis at 0%/100%', () => {
    const axisStart = parseISODate('2026-05-01')
    const axisEnd = parseISODate('2026-05-31')
    const pos = barPosition(axisStart, axisEnd, parseISODate('2026-05-01'), parseISODate('2026-05-31'))
    expect(pos.leftPct).toBeCloseTo(0, 5)
    expect(pos.widthPct).toBeCloseTo(100, 5)
  })

  it('places a bar starting midway through a 31-day axis', () => {
    const axisStart = parseISODate('2026-05-01')
    const axisEnd = parseISODate('2026-05-31')
    const pos = barPosition(axisStart, axisEnd, parseISODate('2026-05-16'), parseISODate('2026-05-31'))
    expect(pos.leftPct).toBeCloseTo((15 / 31) * 100, 5)
    expect(pos.widthPct).toBeCloseTo((16 / 31) * 100, 5)
  })

  it('clamps a ticket that starts before the axis to the axis start', () => {
    const axisStart = parseISODate('2026-05-01')
    const axisEnd = parseISODate('2026-05-31')
    const pos = barPosition(axisStart, axisEnd, parseISODate('2026-04-01'), parseISODate('2026-05-16'))
    expect(pos.leftPct).toBeCloseTo(0, 5)
    expect(pos.widthPct).toBeCloseTo((16 / 31) * 100, 5)
  })
})

describe('axisMonths', () => {
  it('splits a May 1 - Aug 31 axis (with Jul 31 quarter end) into 4 months, marking Aug as spillover', () => {
    const axisStart = parseISODate('2026-05-01')
    const axisEnd = parseISODate('2026-08-31')
    const quarterEnd = parseISODate('2026-07-31')
    const months = axisMonths(axisStart, axisEnd, quarterEnd)

    expect(months.map((m) => m.label)).toEqual(['May', 'June', 'July', 'August'])
    expect(months.map((m) => m.isSpillover)).toEqual([false, false, false, true])

    expect(months[0].leftPct).toBeCloseTo(0, 2)
    expect(months[0].widthPct).toBeCloseTo((31 / 123) * 100, 2)
    expect(months[1].leftPct).toBeCloseTo((31 / 123) * 100, 2)
    expect(months[1].widthPct).toBeCloseTo((30 / 123) * 100, 2)
    expect(months[2].leftPct).toBeCloseTo((61 / 123) * 100, 2)
    expect(months[2].widthPct).toBeCloseTo((31 / 123) * 100, 2)
    expect(months[3].leftPct).toBeCloseTo((92 / 123) * 100, 2)
    expect(months[3].widthPct).toBeCloseTo((31 / 123) * 100, 2)
  })
})

describe('dividerLeftPct', () => {
  it('returns the boundary position when the axis extends past the quarter end', () => {
    const axisStart = parseISODate('2026-05-01')
    const axisEnd = parseISODate('2026-08-31')
    const quarterEnd = parseISODate('2026-07-31')
    expect(dividerLeftPct(axisStart, axisEnd, quarterEnd)).toBeCloseTo((92 / 123) * 100, 2)
  })

  it('returns null when the axis does not extend past the quarter end', () => {
    const axisStart = parseISODate('2026-05-01')
    const axisEnd = parseISODate('2026-07-31')
    expect(dividerLeftPct(axisStart, axisEnd, axisEnd)).toBeNull()
  })
})

describe('sortTickets', () => {
  it('sorts started-before tickets first by priorityOrder desc, then the rest by priorityOrder desc', () => {
    const axisStart = parseISODate('2026-05-01')
    const a = row({ key: 'A', targetStartDate: '2026-04-01', priorityOrder: 10 })
    const b = row({ key: 'B', targetStartDate: '2026-05-05', priorityOrder: 50 })
    const c = row({ key: 'C', targetStartDate: null, priorityOrder: 100 })
    const d = row({ key: 'D', targetStartDate: '2026-04-15', priorityOrder: 5 })

    const sorted = sortTickets([a, b, c, d], axisStart)
    expect(sorted.map((t) => t.key)).toEqual(['A', 'D', 'C', 'B'])
  })
})

describe('statusPillInfo', () => {
  it('maps new -> To Do', () => {
    expect(statusPillInfo('new').label).toBe('To Do')
  })

  it('maps indeterminate -> In Progress', () => {
    expect(statusPillInfo('indeterminate').label).toBe('In Progress')
  })

  it('maps done -> Done', () => {
    expect(statusPillInfo('done').label).toBe('Done')
  })
})

describe('resolveTicketBar', () => {
  const axisStart = parseISODate('2026-05-01')
  const axisEnd = parseISODate('2026-07-31')

  it('both dates present: uses the real dates and isTbd is false', () => {
    const t = row({ targetStartDate: '2026-05-10', targetDeliveryDate: '2026-06-01' })
    const bar = resolveTicketBar(t, axisStart, axisEnd)
    expect(bar.start.toISOString().slice(0, 10)).toBe('2026-05-10')
    expect(bar.end.toISOString().slice(0, 10)).toBe('2026-06-01')
    expect(bar.isTbd).toBe(false)
  })

  it('missing targetStartDate only: bar opens at axisStart, isTbd is true', () => {
    const t = row({ targetStartDate: null, targetDeliveryDate: '2026-06-01' })
    const bar = resolveTicketBar(t, axisStart, axisEnd)
    expect(bar.start.toISOString().slice(0, 10)).toBe('2026-05-01')
    expect(bar.end.toISOString().slice(0, 10)).toBe('2026-06-01')
    expect(bar.isTbd).toBe(true)
  })

  it('missing targetDeliveryDate only: bar extends to axisEnd, isTbd is true', () => {
    const t = row({ targetStartDate: '2026-05-10', targetDeliveryDate: null })
    const bar = resolveTicketBar(t, axisStart, axisEnd)
    expect(bar.start.toISOString().slice(0, 10)).toBe('2026-05-10')
    expect(bar.end.toISOString().slice(0, 10)).toBe('2026-07-31')
    expect(bar.isTbd).toBe(true)
  })

  it('both missing: bar spans the full axis, isTbd is true', () => {
    const t = row({ targetStartDate: null, targetDeliveryDate: null })
    const bar = resolveTicketBar(t, axisStart, axisEnd)
    expect(bar.start.toISOString().slice(0, 10)).toBe('2026-05-01')
    expect(bar.end.toISOString().slice(0, 10)).toBe('2026-07-31')
    expect(bar.isTbd).toBe(true)
  })
})

describe('sortTickets with a mixed started-before + TBD delivery ticket', () => {
  it('a ticket with a real targetStartDate before axisStart sorts as started-before even when targetDeliveryDate is missing', () => {
    const axisStart = parseISODate('2026-05-01')
    const a = row({ key: 'A', targetStartDate: '2026-04-01', targetDeliveryDate: null, priorityOrder: 1 })
    const b = row({ key: 'B', targetStartDate: '2026-05-10', targetDeliveryDate: '2026-05-20', priorityOrder: 100 })
    const sorted = sortTickets([b, a], axisStart)
    expect(sorted.map((t) => t.key)).toEqual(['A', 'B'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- gantt`
Expected: FAIL — `Failed to resolve import "../gantt"`

- [ ] **Step 3: Implement**

Create `src/components/delivery-timeline/gantt.ts`:

```ts
import type { PMBoardRow } from '@/app/api/product-planning/pm-board/route'

const QUARTER_START_MONTH: Record<number, number> = { 1: 1, 2: 4, 3: 7, 4: 10 }

export function parseISODate(value: string): Date {
  return new Date(`${value}T00:00:00Z`)
}

function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

function diffDaysInclusive(a: Date, b: Date): number {
  return diffDays(a, b) + 1
}

export function quarterMonthRange(label: string): { start: Date; end: Date } {
  const match = /^(\d{2})-Q([1-4])$/.exec(label)
  if (!match) throw new Error(`Invalid fiscal quarter label: ${label}`)
  const year = 2000 + Number(match[1])
  const quarter = Number(match[2])
  const startMonth = QUARTER_START_MONTH[quarter]
  const start = new Date(Date.UTC(year, startMonth, 1))
  const end = new Date(Date.UTC(year, startMonth + 3, 0))
  return { start, end }
}

export function computeAxis(
  quarterLabel: string,
  tickets: PMBoardRow[],
  allowSpillover: boolean
): { axisStart: Date; axisEnd: Date; quarterEnd: Date } {
  const { start, end } = quarterMonthRange(quarterLabel)
  if (!allowSpillover) return { axisStart: start, axisEnd: end, quarterEnd: end }

  let axisEnd = end
  for (const ticket of tickets) {
    if (!ticket.targetDeliveryDate) continue
    const delivery = parseISODate(ticket.targetDeliveryDate)
    if (delivery > axisEnd) {
      const extended = endOfMonth(delivery)
      if (extended > axisEnd) axisEnd = extended
    }
  }
  return { axisStart: start, axisEnd, quarterEnd: end }
}

export function barPosition(
  axisStart: Date,
  axisEnd: Date,
  ticketStart: Date,
  ticketEnd: Date
): { leftPct: number; widthPct: number } {
  const totalDays = diffDaysInclusive(axisStart, axisEnd)
  const clampedStart = ticketStart < axisStart ? axisStart : ticketStart
  const clampedEnd = ticketEnd > axisEnd ? axisEnd : ticketEnd
  const startOffsetDays = diffDays(axisStart, clampedStart)
  const durationDays = diffDaysInclusive(clampedStart, clampedEnd)
  return {
    leftPct: (startOffsetDays / totalDays) * 100,
    widthPct: (durationDays / totalDays) * 100,
  }
}

export interface AxisMonth {
  label: string
  leftPct: number
  widthPct: number
  isSpillover: boolean
}

export function axisMonths(axisStart: Date, axisEnd: Date, quarterEnd: Date): AxisMonth[] {
  const totalDays = diffDaysInclusive(axisStart, axisEnd)
  const months: AxisMonth[] = []
  let cursor = new Date(Date.UTC(axisStart.getUTCFullYear(), axisStart.getUTCMonth(), 1))

  while (cursor <= axisEnd) {
    const monthStart = cursor < axisStart ? axisStart : cursor
    const monthEndRaw = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0))
    const monthEnd = monthEndRaw > axisEnd ? axisEnd : monthEndRaw
    months.push({
      label: monthStart.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }),
      leftPct: (diffDays(axisStart, monthStart) / totalDays) * 100,
      widthPct: (diffDaysInclusive(monthStart, monthEnd) / totalDays) * 100,
      isSpillover: monthStart > quarterEnd,
    })
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
  }

  return months
}

export function dividerLeftPct(axisStart: Date, axisEnd: Date, quarterEnd: Date): number | null {
  if (quarterEnd >= axisEnd) return null
  const totalDays = diffDaysInclusive(axisStart, axisEnd)
  return ((diffDays(axisStart, quarterEnd) + 1) / totalDays) * 100
}

function isStartedBefore(ticket: PMBoardRow, axisStart: Date): boolean {
  return ticket.targetStartDate !== null && parseISODate(ticket.targetStartDate) < axisStart
}

export function sortTickets(tickets: PMBoardRow[], axisStart: Date): PMBoardRow[] {
  const priority = (t: PMBoardRow) => t.priorityOrder ?? -Infinity
  return [...tickets].sort((a, b) => {
    const aBefore = isStartedBefore(a, axisStart)
    const bBefore = isStartedBefore(b, axisStart)
    if (aBefore !== bBefore) return aBefore ? -1 : 1
    return priority(b) - priority(a)
  })
}

export function statusPillInfo(statusCategory: string): { label: string; className: string } {
  switch (statusCategory) {
    case 'new':
      return { label: 'To Do', className: 'border border-border text-muted-foreground' }
    case 'indeterminate':
      return { label: 'In Progress', className: 'bg-primary text-primary-foreground' }
    case 'done':
      return { label: 'Done', className: 'bg-success text-success-foreground' }
    default:
      return { label: statusCategory || 'Unknown', className: 'bg-muted text-muted-foreground' }
  }
}

export function resolveTicketBar(
  ticket: PMBoardRow,
  axisStart: Date,
  axisEnd: Date
): { start: Date; end: Date; isTbd: boolean } {
  const start = ticket.targetStartDate ? parseISODate(ticket.targetStartDate) : axisStart
  const end = ticket.targetDeliveryDate ? parseISODate(ticket.targetDeliveryDate) : axisEnd
  const isTbd = ticket.targetStartDate === null || ticket.targetDeliveryDate === null
  return { start, end, isTbd }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- gantt`
Expected: PASS (all `describe` blocks green)

- [ ] **Step 5: Commit**

```bash
git add src/components/delivery-timeline/gantt.ts src/components/delivery-timeline/__tests__/gantt.test.ts
git commit -m "feat: add pure Gantt axis/bar/sort/status math module"
```

---

### Task 5: Recent Ships pure logic module

**Files:**
- Create: `src/components/delivery-timeline/recent-ships.ts`
- Test: `src/components/delivery-timeline/__tests__/recent-ships.test.ts`

**Interfaces:**
- Consumes: `type PMBoardRow` from `@/app/api/product-planning/pm-board/route`
- Produces: `export interface RecentMonthGroup { monthLabel: string; monthIndex: number; tickets: PMBoardRow[] }`, `export function groupShippedByMonth(tickets: PMBoardRow[]): RecentMonthGroup[]` — consumed by Task 7 (`RecentShips.tsx`)

- [ ] **Step 1: Write the failing test**

Create `src/components/delivery-timeline/__tests__/recent-ships.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { groupShippedByMonth } from '../recent-ships'
import type { PMBoardRow } from '@/app/api/product-planning/pm-board/route'

function row(overrides: Partial<PMBoardRow> = {}): PMBoardRow {
  return {
    key: 'PM-1',
    url: 'https://keebo.atlassian.net/browse/PM-1',
    issueType: 'Idea',
    summary: 'Ticket',
    status: 'Done',
    statusCategory: 'done',
    priorityOrder: 0,
    roadmap: '26-Q1',
    targetStartDate: null,
    targetDeliveryDate: null,
    actualDeliveryDate: null,
    product: [],
    category: [],
    keyCustomers: [],
    salesforceTotalArr: null,
    salesforceOpportunities: null,
    ...overrides,
  }
}

describe('groupShippedByMonth', () => {
  it('excludes tickets with no actualDeliveryDate', () => {
    const groups = groupShippedByMonth([row({ actualDeliveryDate: null })])
    expect(groups).toEqual([])
  })

  it('groups shipped tickets by calendar month, in chronological order', () => {
    const groups = groupShippedByMonth([
      row({ key: 'A', actualDeliveryDate: '2026-03-10', priorityOrder: 5 }),
      row({ key: 'B', actualDeliveryDate: '2026-02-20', priorityOrder: 10 }),
      row({ key: 'C', actualDeliveryDate: '2026-02-05', priorityOrder: 20 }),
    ])

    expect(groups.map((g) => g.monthLabel)).toEqual(['February', 'March'])
    expect(groups[0].tickets.map((t) => t.key)).toEqual(['B', 'C'])
    expect(groups[1].tickets.map((t) => t.key)).toEqual(['A'])
  })

  it('sorts tickets within a month by priorityOrder descending', () => {
    const groups = groupShippedByMonth([
      row({ key: 'LOW', actualDeliveryDate: '2026-02-05', priorityOrder: 1 }),
      row({ key: 'HIGH', actualDeliveryDate: '2026-02-20', priorityOrder: 99 }),
    ])

    expect(groups[0].tickets.map((t) => t.key)).toEqual(['HIGH', 'LOW'])
  })

  it('omits months with no shipped tickets rather than rendering an empty section', () => {
    const groups = groupShippedByMonth([row({ actualDeliveryDate: '2026-03-10' })])
    expect(groups).toHaveLength(1)
    expect(groups[0].monthLabel).toBe('March')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- recent-ships`
Expected: FAIL — `Failed to resolve import "../recent-ships"`

- [ ] **Step 3: Implement**

Create `src/components/delivery-timeline/recent-ships.ts`:

```ts
import type { PMBoardRow } from '@/app/api/product-planning/pm-board/route'

export interface RecentMonthGroup {
  monthLabel: string
  monthIndex: number
  tickets: PMBoardRow[]
}

export function groupShippedByMonth(tickets: PMBoardRow[]): RecentMonthGroup[] {
  const shipped = tickets.filter((t) => t.actualDeliveryDate !== null)
  const groups = new Map<number, RecentMonthGroup>()

  for (const ticket of shipped) {
    const date = new Date(`${ticket.actualDeliveryDate}T00:00:00Z`)
    const monthIndex = date.getUTCFullYear() * 12 + date.getUTCMonth()
    if (!groups.has(monthIndex)) {
      groups.set(monthIndex, {
        monthLabel: date.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }),
        monthIndex,
        tickets: [],
      })
    }
    groups.get(monthIndex)!.tickets.push(ticket)
  }

  const result = [...groups.values()].sort((a, b) => a.monthIndex - b.monthIndex)
  for (const group of result) {
    group.tickets.sort((a, b) => (b.priorityOrder ?? -Infinity) - (a.priorityOrder ?? -Infinity))
  }
  return result
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- recent-ships`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add src/components/delivery-timeline/recent-ships.ts src/components/delivery-timeline/__tests__/recent-ships.test.ts
git commit -m "feat: add pure Recent Ships month-grouping module"
```

---

### Task 6: GanttChart component

**Files:**
- Create: `src/components/delivery-timeline/GanttChart.tsx`
- Test: `src/components/delivery-timeline/__tests__/GanttChart.test.tsx`

**Interfaces:**
- Consumes: `computeAxis`, `axisMonths`, `barPosition`, `dividerLeftPct`, `sortTickets`, `statusPillInfo`, `resolveTicketBar` from `./gantt` (Task 4); `type PMBoardRow` from `@/app/api/product-planning/pm-board/route`
- Produces: `export function GanttChart({ quarterLabel, tickets, allowSpillover }: { quarterLabel: string; tickets: PMBoardRow[]; allowSpillover: boolean }): JSX.Element` — consumed by Task 9 (`page.tsx`)

**Missing-date rendering:** use `resolveTicketBar(ticket, axisStart, axisEnd)`
for every row's bar `start`/`end` and `isTbd` flag — do not special-case
"both missing" vs. "one missing" in this component; `resolveTicketBar`
already resolves the open boundary per date. Pass its `start`/`end` straight
into `barPosition` (which clamps to the axis). Apply the TBD bar styling
(dashed border, muted fill) and the "Dates TBD" text whenever `isTbd` is
true, regardless of which date is missing — the visual treatment does not
distinguish "one missing" from "both missing." "Started before" and its `‹`
prefix continue to depend only on `targetStartDate` via `sortTickets`'s
`axisStart` comparison (see Task 4) — a ticket can be both "started before"
(dashed left edge) and TBD (dashed bar fill) at once when its start is real
but its delivery date is missing.

- [ ] **Step 1: Write the failing test**

Create `src/components/delivery-timeline/__tests__/GanttChart.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GanttChart } from '../GanttChart'
import type { PMBoardRow } from '@/app/api/product-planning/pm-board/route'

function row(overrides: Partial<PMBoardRow> = {}): PMBoardRow {
  return {
    key: 'PM-1',
    url: 'https://keebo.atlassian.net/browse/PM-1',
    issueType: 'Idea',
    summary: 'Ticket one',
    status: 'In Progress',
    statusCategory: 'indeterminate',
    priorityOrder: 0,
    roadmap: '26-Q2',
    targetStartDate: '2026-05-05',
    targetDeliveryDate: '2026-05-20',
    actualDeliveryDate: null,
    product: [],
    category: [],
    keyCustomers: [],
    salesforceTotalArr: null,
    salesforceOpportunities: null,
    ...overrides,
  }
}

describe('GanttChart', () => {
  it('renders one row per ticket with title, key link, and status pill', () => {
    render(<GanttChart quarterLabel="26-Q2" tickets={[row()]} allowSpillover={false} />)
    expect(screen.getByText('Ticket one')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'PM-1' })).toHaveAttribute(
      'href',
      'https://keebo.atlassian.net/browse/PM-1'
    )
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('2026-05-05 – 2026-05-20')).toBeInTheDocument()
  })

  it('renders a "Dates TBD" row for a ticket missing dates', () => {
    render(
      <GanttChart
        quarterLabel="26-Q2"
        tickets={[row({ targetStartDate: null, targetDeliveryDate: null })]}
        allowSpillover={false}
      />
    )
    expect(screen.getByText('Dates TBD')).toBeInTheDocument()
  })

  it('prefixes a started-before ticket title with the "‹" marker', () => {
    render(
      <GanttChart
        quarterLabel="26-Q2"
        tickets={[row({ targetStartDate: '2026-04-01' })]}
        allowSpillover={false}
      />
    )
    expect(screen.getByText('‹')).toBeInTheDocument()
  })

  it('renders month headers for the axis, marking spillover months', () => {
    render(
      <GanttChart
        quarterLabel="26-Q2"
        tickets={[row({ targetDeliveryDate: '2026-08-15' })]}
        allowSpillover
      />
    )
    expect(screen.getAllByText('May')).toHaveLength(1)
    expect(screen.getAllByText('August')).toHaveLength(1)
  })

  it('sorts started-before tickets to the top', () => {
    render(
      <GanttChart
        quarterLabel="26-Q2"
        tickets={[
          row({ key: 'PM-2', summary: 'Later', targetStartDate: '2026-05-10', priorityOrder: 100 }),
          row({ key: 'PM-1', summary: 'Started before', targetStartDate: '2026-04-01', priorityOrder: 1 }),
        ]}
        allowSpillover={false}
      />
    )
    const rows = screen.getAllByTestId('gantt-row')
    expect(rows[0]).toHaveTextContent('Started before')
    expect(rows[1]).toHaveTextContent('Later')
  })

  it('shows "Dates TBD" and the "‹" marker together for a ticket with a real start before the axis but a missing delivery date', () => {
    render(
      <GanttChart
        quarterLabel="26-Q2"
        tickets={[row({ targetStartDate: '2026-04-01', targetDeliveryDate: null })]}
        allowSpillover={false}
      />
    )
    expect(screen.getByText('Dates TBD')).toBeInTheDocument()
    expect(screen.getByText('‹')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- GanttChart`
Expected: FAIL — `Failed to resolve import "../GanttChart"`

- [ ] **Step 3: Implement**

Create `src/components/delivery-timeline/GanttChart.tsx`:

```tsx
'use client'

import {
  computeAxis,
  axisMonths,
  barPosition,
  dividerLeftPct,
  sortTickets,
  statusPillInfo,
  resolveTicketBar,
  parseISODate,
} from './gantt'
import type { PMBoardRow } from '@/app/api/product-planning/pm-board/route'

export function GanttChart({
  quarterLabel,
  tickets,
  allowSpillover,
}: {
  quarterLabel: string
  tickets: PMBoardRow[]
  allowSpillover: boolean
}) {
  const { axisStart, axisEnd, quarterEnd } = computeAxis(quarterLabel, tickets, allowSpillover)
  const months = axisMonths(axisStart, axisEnd, quarterEnd)
  const divider = dividerLeftPct(axisStart, axisEnd, quarterEnd)
  const sorted = sortTickets(tickets, axisStart)

  return (
    <div className="flex flex-col gap-3" data-testid="gantt-chart">
      <div className="relative h-8 rounded-md bg-muted overflow-hidden">
        {months.map((m) => (
          <div
            key={`${m.label}-${m.leftPct}`}
            className={`absolute top-0 h-full border-l border-border flex items-center pl-2 text-xs ${
              m.isSpillover ? 'bg-muted/60 text-muted-foreground/60' : 'text-muted-foreground'
            }`}
            style={{ left: `${m.leftPct}%`, width: `${m.widthPct}%` }}
          >
            {m.label}
          </div>
        ))}
        {divider !== null && (
          <div
            className="absolute top-0 h-full border-l border-dashed border-border"
            style={{ left: `${divider}%` }}
          />
        )}
      </div>

      <div className="flex flex-col gap-2">
        {sorted.map((t) => {
          const pill = statusPillInfo(t.statusCategory)
          const startedBefore = t.targetStartDate !== null && parseISODate(t.targetStartDate) < axisStart
          const bar = resolveTicketBar(t, axisStart, axisEnd)
          const pos = barPosition(axisStart, axisEnd, bar.start, bar.end)
          const barColorClass =
            t.statusCategory === 'done'
              ? 'bg-success'
              : t.statusCategory === 'new'
                ? 'border border-muted-foreground bg-transparent'
                : 'bg-primary'

          return (
            <div key={t.key} className="flex flex-col gap-1" data-testid="gantt-row">
              <div className="flex items-center gap-2 text-sm">
                {startedBefore && <span className="text-primary font-bold">{'‹'}</span>}
                <span className="font-medium text-foreground">{t.summary}</span>
                <a href={t.url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-xs">
                  {t.key}
                </a>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-xs ${pill.className}`}>{pill.label}</span>
              </div>
              <div className="relative h-4 rounded bg-muted/30">
                <div
                  className={`absolute top-0 h-full rounded ${
                    bar.isTbd ? 'border border-dashed border-muted-foreground bg-muted' : barColorClass
                  } ${startedBefore ? 'border-l-2 border-dashed border-l-primary' : ''}`}
                  style={{ left: `${pos.leftPct}%`, width: `${pos.widthPct}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                {bar.isTbd ? 'Dates TBD' : `${t.targetStartDate} – ${t.targetDeliveryDate}`}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- GanttChart`
Expected: PASS (6/6)

- [ ] **Step 5: Commit**

```bash
git add src/components/delivery-timeline/GanttChart.tsx src/components/delivery-timeline/__tests__/GanttChart.test.tsx
git commit -m "feat: add GanttChart component"
```

---

### Task 7: RecentShips component

**Files:**
- Create: `src/components/delivery-timeline/RecentShips.tsx`
- Test: `src/components/delivery-timeline/__tests__/RecentShips.test.tsx`

**Interfaces:**
- Consumes: `groupShippedByMonth` from `./recent-ships` (Task 5); `type PMBoardRow` from `@/app/api/product-planning/pm-board/route`
- Produces: `export function RecentShips({ quarterLabel, tickets }: { quarterLabel: string; tickets: PMBoardRow[] }): JSX.Element` — consumed by Task 9 (`page.tsx`)

- [ ] **Step 1: Write the failing test**

Create `src/components/delivery-timeline/__tests__/RecentShips.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RecentShips } from '../RecentShips'
import type { PMBoardRow } from '@/app/api/product-planning/pm-board/route'

function row(overrides: Partial<PMBoardRow> = {}): PMBoardRow {
  return {
    key: 'PM-1',
    url: 'https://keebo.atlassian.net/browse/PM-1',
    issueType: 'Idea',
    summary: 'Shipped thing',
    status: 'Done',
    statusCategory: 'done',
    priorityOrder: 0,
    roadmap: '26-Q1',
    targetStartDate: null,
    targetDeliveryDate: null,
    actualDeliveryDate: '2026-02-10',
    product: [],
    category: [],
    keyCustomers: [],
    salesforceTotalArr: null,
    salesforceOpportunities: null,
    ...overrides,
  }
}

describe('RecentShips', () => {
  it('shows the quarter label as "(previous)"', () => {
    render(<RecentShips quarterLabel="26-Q1" tickets={[row()]} />)
    expect(screen.getByText('26-Q1 (previous)')).toBeInTheDocument()
  })

  it('renders one month section per shipped month, with ticket title and linked key', () => {
    render(<RecentShips quarterLabel="26-Q1" tickets={[row()]} />)
    expect(screen.getByText('February')).toBeInTheDocument()
    expect(screen.getByText('Shipped thing')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'PM-1' })).toHaveAttribute(
      'href',
      'https://keebo.atlassian.net/browse/PM-1'
    )
  })

  it('omits tickets with no actualDeliveryDate', () => {
    render(<RecentShips quarterLabel="26-Q1" tickets={[row({ actualDeliveryDate: null })]} />)
    expect(screen.queryByText('Shipped thing')).not.toBeInTheDocument()
    expect(screen.getByText('No ships recorded.')).toBeInTheDocument()
  })

  it('shows a message when nothing shipped', () => {
    render(<RecentShips quarterLabel="26-Q1" tickets={[]} />)
    expect(screen.getByText('No ships recorded.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- RecentShips`
Expected: FAIL — `Failed to resolve import "../RecentShips"`

- [ ] **Step 3: Implement**

Create `src/components/delivery-timeline/RecentShips.tsx`:

```tsx
'use client'

import { groupShippedByMonth } from './recent-ships'
import type { PMBoardRow } from '@/app/api/product-planning/pm-board/route'

export function RecentShips({ quarterLabel, tickets }: { quarterLabel: string; tickets: PMBoardRow[] }) {
  const groups = groupShippedByMonth(tickets)

  return (
    <div className="rounded-lg border border-border bg-card p-4" data-testid="recent-ships-card">
      <h2 className="text-sm font-semibold text-foreground mb-3">{quarterLabel} (previous)</h2>
      {groups.length === 0 && <p className="text-sm text-muted-foreground">No ships recorded.</p>}
      {groups.map((g) => (
        <div key={g.monthIndex} className="mb-4" data-testid="recent-month-section">
          <h3 className="text-xs font-medium text-muted-foreground uppercase mb-2">{g.monthLabel}</h3>
          <ul className="flex flex-col gap-1">
            {g.tickets.map((t) => (
              <li key={t.key} className="flex text-sm" data-testid="recent-ticket-item">
                <span className="order-1 text-foreground">{t.summary}</span>
                <a href={t.url} target="_blank" rel="noreferrer" className="order-2 ml-1 text-primary hover:underline">
                  {t.key}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- RecentShips`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add src/components/delivery-timeline/RecentShips.tsx src/components/delivery-timeline/__tests__/RecentShips.test.tsx
git commit -m "feat: add RecentShips component"
```

---

### Task 8: Sidebar nav entry

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: nothing new
- Produces: nothing consumed elsewhere — this is a leaf UI change

- [ ] **Step 1: Make the change**

In `src/components/layout/Sidebar.tsx`, the `'Product Planning'` group currently reads (lines 24-29):

```tsx
  {
    group: 'Product Planning',
    items: [
      { label: 'PM Board', href: '/product-planning/pm-board' },
    ],
  },
```

Replace it with:

```tsx
  {
    group: 'Product Planning',
    items: [
      { label: 'PM Board', href: '/product-planning/pm-board' },
      { label: 'Delivery Timeline', href: '/product-planning/delivery-timeline' },
    ],
  },
```

- [ ] **Step 2: Verify manually**

Run: `npm run dev`, open `http://localhost:3000`, confirm "Delivery Timeline" appears under "Product Planning" below "PM Board" (it will 404 until Task 9 lands — that's expected at this point).

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat: add Delivery Timeline nav entry"
```

---

### Task 9: Delivery Timeline page

**Files:**
- Create: `src/app/product-planning/delivery-timeline/page.tsx`
- Test: `src/app/product-planning/delivery-timeline/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `currentFiscalQuarterLabel`, `nextFiscalQuarterLabel`, `previousFiscalQuarterLabel` from `@/lib/fiscal-quarter` (Task 1); `GanttChart` from `@/components/delivery-timeline/GanttChart` (Task 6); `RecentShips` from `@/components/delivery-timeline/RecentShips` (Task 7); `type PMBoardRow` from `@/app/api/product-planning/pm-board/route`; fetches `GET /api/product-planning/delivery-timeline?quarter=<label>` (Task 3)
- Produces: default export `DeliveryTimelinePage`, routed at `/product-planning/delivery-timeline` by the App Router (no other file imports this directly)

- [ ] **Step 1: Write the failing test**

Create `src/app/product-planning/delivery-timeline/__tests__/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import DeliveryTimelinePage from '../page'

vi.mock('@/lib/fiscal-quarter', () => ({
  currentFiscalQuarterLabel: () => '26-Q2',
  nextFiscalQuarterLabel: () => '26-Q3',
  previousFiscalQuarterLabel: () => '26-Q1',
}))

function jsonResponse(rows: unknown[]) {
  return { ok: true, status: 200, json: async () => ({ rows }) } as Response
}

describe('DeliveryTimelinePage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('quarter=26-Q2')) {
          return Promise.resolve(
            jsonResponse([
              {
                key: 'PM-1',
                url: 'https://keebo.atlassian.net/browse/PM-1',
                issueType: 'Idea',
                summary: 'Current ticket',
                status: 'In Progress',
                statusCategory: 'indeterminate',
                priorityOrder: 1,
                roadmap: '26-Q2',
                targetStartDate: '2026-05-05',
                targetDeliveryDate: '2026-05-20',
                actualDeliveryDate: null,
                product: [],
                category: [],
                keyCustomers: [],
                salesforceTotalArr: null,
                salesforceOpportunities: null,
              },
            ])
          )
        }
        if (url.includes('quarter=26-Q3')) {
          return Promise.resolve(
            jsonResponse([
              {
                key: 'PM-2',
                url: 'https://keebo.atlassian.net/browse/PM-2',
                issueType: 'Idea',
                summary: 'Next ticket',
                status: 'To Do',
                statusCategory: 'new',
                priorityOrder: 1,
                roadmap: '26-Q3',
                targetStartDate: '2026-08-05',
                targetDeliveryDate: '2026-08-20',
                actualDeliveryDate: null,
                product: [],
                category: [],
                keyCustomers: [],
                salesforceTotalArr: null,
                salesforceOpportunities: null,
              },
            ])
          )
        }
        return Promise.resolve(
          jsonResponse([
            {
              key: 'PM-3',
              url: 'https://keebo.atlassian.net/browse/PM-3',
              issueType: 'Idea',
              summary: 'Shipped ticket',
              status: 'Done',
              statusCategory: 'done',
              priorityOrder: 1,
              roadmap: '26-Q1',
              targetStartDate: '2026-01-05',
              targetDeliveryDate: '2026-01-20',
              actualDeliveryDate: '2026-01-18',
              product: [],
              category: [],
              keyCustomers: [],
              salesforceTotalArr: null,
              salesforceOpportunities: null,
            },
          ])
        )
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches all three quarters and shows the Current Projects tab by default', async () => {
    render(<DeliveryTimelinePage />)
    await waitFor(() => expect(screen.getByText('Current ticket')).toBeInTheDocument())

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/product-planning/delivery-timeline?quarter=26-Q2'
    )
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/product-planning/delivery-timeline?quarter=26-Q3'
    )
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/product-planning/delivery-timeline?quarter=26-Q1'
    )
  })

  it('switches to the What\'s Next tab and shows its tickets', async () => {
    render(<DeliveryTimelinePage />)
    await waitFor(() => expect(screen.getByText('Current ticket')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: "What's Next" }))
    expect(screen.getByText('Next ticket')).toBeInTheDocument()
    expect(screen.queryByText('Current ticket')).not.toBeInTheDocument()
  })

  it('switches to the Recent Ships tab and shows its tickets', async () => {
    render(<DeliveryTimelinePage />)
    await waitFor(() => expect(screen.getByText('Current ticket')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Recent Ships' }))
    expect(screen.getByText('Shipped ticket')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- product-planning/delivery-timeline/__tests__/page`
Expected: FAIL — `Failed to resolve import "../page"`

- [ ] **Step 3: Implement**

Create `src/app/product-planning/delivery-timeline/page.tsx`:

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { currentFiscalQuarterLabel, nextFiscalQuarterLabel, previousFiscalQuarterLabel } from '@/lib/fiscal-quarter'
import { GanttChart } from '@/components/delivery-timeline/GanttChart'
import { RecentShips } from '@/components/delivery-timeline/RecentShips'
import type { PMBoardRow } from '@/app/api/product-planning/pm-board/route'

interface FetchError {
  message: string
}

function SectionError({ error, onRetry }: { error: FetchError; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between gap-4 flex-wrap">
      <span>Failed to load: {error.message}</span>
      <button
        onClick={onRetry}
        className="rounded-md border border-destructive/40 bg-destructive/10 hover:bg-destructive/20 px-3 py-1 text-xs font-medium"
      >
        Retry
      </button>
    </div>
  )
}

function SectionLoader() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 border-2 border-border border-t-foreground/40 rounded-full animate-spin" />
        Loading…
      </div>
    </div>
  )
}

type TabKey = 'current' | 'next' | 'recent'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'current', label: 'Current Projects' },
  { key: 'next', label: "What's Next" },
  { key: 'recent', label: 'Recent Ships' },
]

async function fetchQuarter(quarter: string): Promise<PMBoardRow[]> {
  const res = await fetch(`/api/product-planning/delivery-timeline?quarter=${quarter}`)
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body.rows as PMBoardRow[]
}

export default function DeliveryTimelinePage() {
  const [tab, setTab] = useState<TabKey>('current')
  const [current, setCurrent] = useState<PMBoardRow[] | null>(null)
  const [next, setNext] = useState<PMBoardRow[] | null>(null)
  const [previous, setPrevious] = useState<PMBoardRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<FetchError | null>(null)

  const currentLabel = currentFiscalQuarterLabel()
  const nextLabel = nextFiscalQuarterLabel(currentLabel)
  const previousLabel = previousFiscalQuarterLabel(currentLabel)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [c, n, p] = await Promise.all([
        fetchQuarter(currentLabel),
        fetchQuarter(nextLabel),
        fetchQuarter(previousLabel),
      ])
      setCurrent(c)
      setNext(n)
      setPrevious(p)
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : String(err) })
    } finally {
      setLoading(false)
    }
  }, [currentLabel, nextLabel, previousLabel])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="flex flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Delivery Timeline</h1>
        <button
          onClick={load}
          className="rounded-md border border-border bg-background hover:bg-muted px-3 py-1.5 text-sm font-medium text-foreground transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <SectionError error={error} onRetry={load} />}
      {loading && !current && !next && !previous && <SectionLoader />}

      {tab === 'current' && current && <GanttChart quarterLabel={currentLabel} tickets={current} allowSpillover />}
      {tab === 'next' && next && <GanttChart quarterLabel={nextLabel} tickets={next} allowSpillover={false} />}
      {tab === 'recent' && previous && <RecentShips quarterLabel={previousLabel} tickets={previous} />}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- product-planning/delivery-timeline/__tests__/page`
Expected: PASS (3/3)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: All test files pass, including the pre-existing `pm-board` suite (Task 2 refactor regression check) and every file added in Tasks 1-9.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, open `http://localhost:3000/product-planning/delivery-timeline`. Confirm all three tabs render (data will error/be empty without real Jira credentials in `.env.local` — that's expected in local dev without a live Jira connection; confirm the error banner + Retry button behave correctly in that case, or confirm real tickets render correctly if credentials are configured).

- [ ] **Step 7: Commit**

```bash
git add src/app/product-planning/delivery-timeline/page.tsx src/app/product-planning/delivery-timeline/__tests__/page.test.tsx
git commit -m "feat: add Delivery Timeline page with three tabs"
```

---

## Self-Review

**1. Spec coverage:**
- Nav entry below PM Board → Task 8. ✅
- New single-quarter API route + JQL → Task 3. ✅
- `previousFiscalQuarterLabel` → Task 1. ✅
- Shared `PMBoardRow`/`toRow` reuse (no new row type) → Task 2, consumed by Task 3/4/5/6/7/9. ✅
- Status pill mapping from `statusCategory` → `statusPillInfo` in Task 4, rendered in Task 6. ✅
- Fiscal quarter → calendar month range helper (not in `fiscal-quarter.ts`) → `quarterMonthRange` in Task 4's `gantt.ts`, co-located with the Gantt component per spec. ✅
- Tickets missing dates → full-width `.tbd`-style bar + "Dates TBD" text + priorityOrder-only sort bucket → handled in `sortTickets` (Task 4) and `GanttChart`'s `missingDates` branch (Task 6). ✅
- Sort order (started-before first by priority desc, then rest by priority desc) → `sortTickets` (Task 4), tested explicitly. ✅
- Current Projects spillover extension + spillover visual treatment (band/divider/dim labels) → `computeAxis`/`axisMonths`/`dividerLeftPct` (Task 4) + rendering in `GanttChart` (Task 6). ✅
- Started-before `‹` prefix + `.continues-left`-equivalent dashed-left-border bar treatment → `GanttChart` (Task 6), tested. ✅
- Bar fill/border by status (done=success filled, todo=outlined muted, in-progress=primary filled) → `barColorClass` in `GanttChart` (Task 6). ✅
- What's Next: fixed axis, no spillover, same started-before/TBD/sort rules → `allowSpillover={false}` passed from `page.tsx` (Task 9) into the same `GanttChart` used for Current Projects (Task 6) — shared implementation, per-tab prop. ✅
- Recent Ships: only shipped previous-quarter tickets, grouped by month of `actualDeliveryDate`, sections only for months with ships, title-then-key flex-order display, sort by priority desc, no started-before concept → `groupShippedByMonth` (Task 5) + `RecentShips` (Task 7). ✅
- Out of Scope items (no editing, no filtering, no quarter picker) → correctly not built anywhere in this plan. ✅

**2. Placeholder scan:** No TBD/TODO markers, no "add appropriate error handling" phrasing, no "similar to Task N" shortcuts — every step has complete, runnable code and exact file paths/commands.

**3. Type consistency:** `PMBoardRow` is defined once (Task 2, `jira-row-mapper.ts`) and re-exported unchanged from `pm-board/route.ts`; every later task imports the type from the same `@/app/api/product-planning/pm-board/route` path used by the pre-existing `pm-board/page.tsx`, so no divergent row shape is introduced. Function names/signatures (`computeAxis`, `barPosition`, `axisMonths`, `dividerLeftPct`, `sortTickets`, `statusPillInfo`, `parseISODate`, `groupShippedByMonth`) are declared once in Tasks 4-5 and used with identical names/signatures in Tasks 6-7 and tests.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-09-delivery-timeline.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
