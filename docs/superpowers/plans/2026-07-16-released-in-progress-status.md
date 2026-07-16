# "Released (In-progress)" Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reflect Jira's field renames (Target/Actual completion date) and new "Feature release date" field, plus the new "Released (In-progress)" status, on the Delivery Timeline page — light-green Gantt bars, an exact-label status pill, and inclusion on Recent Ships grouped by Feature release date.

**Architecture:** Rename `PMBoardRow`'s date properties end-to-end (jira.ts → jira-row-mapper.ts → all consumers), add a new `featureReleaseDate` property sourced from a new Jira custom field, then special-case the "Released (In-progress)" status by exact name (mirroring the existing `'paused'` pattern) in the two places that already branch on status: `statusPillInfo` (pill label/color) and `barColorClasses` (Gantt bar color). Recent Ships' filter and per-ticket date selection are extended to admit this status using `featureReleaseDate` instead of `actualCompletionDate`.

**Tech Stack:** Next.js App Router, TypeScript, Vitest + Testing Library, Tailwind CSS with Keebo design tokens.

## Global Constraints

- All colors must come from the Keebo palette (CLAUDE.md). Only `src/app/globals.css` may contain new hex values; components use Tailwind semantic classes only.
- New color token values (exact, both light and dark themes): `--success-light: #a2e7c2`, `--success-light-foreground: #055d35`.
- The status pill label must be the exact string `"Released (In-progress)"` (verbatim match to the Jira status name), matched case-insensitively via `status.toLowerCase() === 'released (in-progress)'`.
- Jira `jira.polaris:interval` fields (`customfield_10062/10063/10891/10892`) silently return zero results with JQL relational operators — only `is EMPTY`/`is not EMPTY` work. Date-range filtering happens in JS after fetching, never in JQL.
- No new Gantt tab, filter, or placement logic — "Released (In-progress)" tickets flow through existing quarter-tab placement; only their color and pill label change.
- No changes to `pm-board/route.ts` source (only its test fixture) — it has no status-specific logic.

---

## File Structure

| File | Change |
|---|---|
| `src/lib/jira.ts` | Add `customfield_10891` to `FIELDS` and `JiraIssueFields` |
| `src/lib/jira-row-mapper.ts` | Rename `targetDeliveryDate`→`targetCompletionDate`, `actualDeliveryDate`→`actualCompletionDate`; add `featureReleaseDate` |
| `src/lib/__tests__/jira-row-mapper.test.ts` | Rename assertions; add `featureReleaseDate` coverage |
| `src/app/globals.css` | Add `--success-light`/`--success-light-foreground` tokens (light + dark) and `@theme inline` mappings |
| `src/components/delivery-timeline/gantt.ts` | Rename field usages; add "Released (In-progress)" branch to `statusPillInfo` |
| `src/components/delivery-timeline/__tests__/gantt.test.ts` | Rename fields; new `statusPillInfo` test case |
| `src/components/delivery-timeline/GanttChart.tsx` | Rename displayed field; add "Released (In-progress)" branch to `barColorClasses` |
| `src/components/delivery-timeline/__tests__/GanttChart.test.tsx` | Rename fields; new bar-color/pill test case |
| `src/components/delivery-timeline/recent-ships.ts` | Admit "Released (In-progress)" tickets, grouped by `featureReleaseDate` |
| `src/components/delivery-timeline/__tests__/recent-ships.test.ts` | Rename fields; new test cases for the new status |
| `src/app/api/product-planning/recent-ships/route.ts` | New union JQL + JS-side date-window filtering/field selection |
| `src/app/api/product-planning/recent-ships/__tests__/route.test.ts` | New JQL assertion; rename; new test case |
| `src/app/api/product-planning/delivery-timeline/route.ts` | Rename `row.targetDeliveryDate`→`row.targetCompletionDate` |
| `src/app/api/product-planning/delivery-timeline/__tests__/route.test.ts` | Rename; add `featureReleaseDate: null` |
| `src/app/product-planning/pm-board/page.tsx` | Rename `COLUMNS` accessors and labels |
| `src/app/api/product-planning/pm-board/__tests__/route.test.ts` | Rename; add `featureReleaseDate: null` (no source change) |
| `src/app/product-planning/delivery-timeline/__tests__/page.test.tsx` | Rename mock row fields |

---

### Task 1: Add `customfield_10891` to the Jira client

**Files:**
- Modify: `src/lib/jira.ts:1-15` (interface), `src/lib/jira.ts:29-43` (FIELDS array)

**Interfaces:**
- Produces: `JiraIssueFields.customfield_10891: string | null` — consumed by Task 2's `toRow`.

- [ ] **Step 1: Add the field to the interface and FIELDS array**

In `src/lib/jira.ts`, update `JiraIssueFields`:

```ts
export interface JiraIssueFields {
  issuetype: { name: string } | null
  summary: string | null
  status: { name: string; statusCategory: { key: string } | null } | null
  customfield_10383: number | null
  customfield_10049: { value: string } | null
  customfield_10062: string | null
  customfield_10063: string | null
  customfield_10891: string | null
  customfield_10892: string | null
  customfield_10064: { value: string }[] | null
  customfield_10048: { value: string }[] | null
  customfield_10059: { value: string }[] | null
  customfield_10925: number | null
  customfield_10926: string | null
}
```

And `FIELDS`:

```ts
const FIELDS = [
  'issuetype',
  'summary',
  'status',
  'customfield_10383',
  'customfield_10049',
  'customfield_10062',
  'customfield_10063',
  'customfield_10891',
  'customfield_10892',
  'customfield_10064',
  'customfield_10048',
  'customfield_10059',
  'customfield_10925',
  'customfield_10926',
]
```

- [ ] **Step 2: Run the existing jira tests to confirm nothing broke**

Run: `npx vitest run src/lib/__tests__/jira.test.ts`
Expected: PASS (all existing tests — none assert on `FIELDS` contents, so no test changes are needed here)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No new errors from this file (existing errors elsewhere from the not-yet-renamed `PMBoardRow` are expected until Task 2 completes — if running standalone, this step just confirms `jira.ts` itself is syntactically valid)

- [ ] **Step 4: Commit**

```bash
git add src/lib/jira.ts
git commit -m "feat: add customfield_10891 (Feature release date) to Jira client"
```

---

### Task 2: Rename PMBoardRow date fields and add featureReleaseDate

**Files:**
- Modify: `src/lib/jira-row-mapper.ts` (full file)
- Test: `src/lib/__tests__/jira-row-mapper.test.ts`

**Interfaces:**
- Consumes: `JiraIssueFields.customfield_10891` (Task 1).
- Produces: `PMBoardRow.targetCompletionDate: string | null`, `PMBoardRow.actualCompletionDate: string | null`, `PMBoardRow.featureReleaseDate: string | null` — consumed by every later task.

- [ ] **Step 1: Update the failing test first**

Replace `src/lib/__tests__/jira-row-mapper.test.ts` with:

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
      customfield_10891: '{"start":"2026-08-20","end":"2026-08-20"}',
      customfield_10892: '{"start":"2026-08-10","end":"2026-08-10"}',
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
      targetCompletionDate: '2026-08-01',
      actualCompletionDate: '2026-08-10',
      featureReleaseDate: '2026-08-20',
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

  it('defaults featureReleaseDate to null when customfield_10891 is null', () => {
    const row = toRow(baseIssue({ customfield_10891: null }))
    expect(row.featureReleaseDate).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/jira-row-mapper.test.ts`
Expected: FAIL — `toRow` output still has `targetDeliveryDate`/`actualDeliveryDate` and no `featureReleaseDate`, so the `toEqual` assertion mismatches.

- [ ] **Step 3: Update jira-row-mapper.ts**

Replace `src/lib/jira-row-mapper.ts` with:

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
  targetCompletionDate: string | null
  actualCompletionDate: string | null
  featureReleaseDate: string | null
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
    targetCompletionDate: intervalStart(f.customfield_10063),
    actualCompletionDate: intervalStart(f.customfield_10892),
    featureReleaseDate: intervalStart(f.customfield_10891),
    product: (f.customfield_10064 ?? []).map((v) => v.value),
    category: (f.customfield_10048 ?? []).map((v) => v.value),
    keyCustomers: (f.customfield_10059 ?? []).map((v) => v.value),
    salesforceTotalArr: f.customfield_10925 ?? null,
    salesforceOpportunities: f.customfield_10926 ?? null,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/jira-row-mapper.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/jira-row-mapper.ts src/lib/__tests__/jira-row-mapper.test.ts
git commit -m "feat: rename PMBoardRow completion-date fields, add featureReleaseDate"
```

---

### Task 3: Add the success-light color token

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: Tailwind utilities `bg-success-light`, `text-success-light-foreground`, `border-success-light` — consumed by Task 4 (`statusPillInfo`) and Task 5 (`barColorClasses`).

- [ ] **Step 1: Add `@theme inline` mappings**

In `src/app/globals.css`, after the existing `--color-success-foreground: var(--success-foreground);` line (line 28):

```css
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-success-light: var(--success-light);
  --color-success-light-foreground: var(--success-light-foreground);
```

- [ ] **Step 2: Add tokens to `:root`**

After the existing `--success-foreground: #f0fdf4;` line (line 77):

```css
  --success: #2e7d52;
  --success-foreground: #f0fdf4;
  --success-light: #a2e7c2;
  --success-light-foreground: #055d35;
```

- [ ] **Step 3: Add tokens to `.dark`**

After the existing `--success-foreground: #00371e;` line (line 127):

```css
  --success: #56bd88;
  --success-foreground: #00371e;
  --success-light: #a2e7c2;
  --success-light-foreground: #055d35;
```

- [ ] **Step 4: Type-check / build sanity**

Run: `npx tsc --noEmit`
Expected: No new errors (CSS changes aren't type-checked, but this confirms nothing else is broken)

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: add success-light color token for Released (In-progress) status"
```

---

### Task 4: Rename gantt.ts field usages, add statusPillInfo branch

**Files:**
- Modify: `src/components/delivery-timeline/gantt.ts`
- Test: `src/components/delivery-timeline/__tests__/gantt.test.ts`

**Interfaces:**
- Consumes: `PMBoardRow.targetCompletionDate`, `.actualCompletionDate` (renamed in Task 2).
- Produces: `statusPillInfo(statusCategory, status?)` now also returns `{ label: 'Released (In-progress)', className: 'bg-success-light text-success-light-foreground' }` when `status?.toLowerCase() === 'released (in-progress)'` — consumed by `GanttChart.tsx` (Task 5) and `RecentShips.tsx` (unchanged, already passes `status` through).

- [ ] **Step 1: Update the test file first**

Replace `src/components/delivery-timeline/__tests__/gantt.test.ts` with (renames `targetDeliveryDate`→`targetCompletionDate`, `actualDeliveryDate`→`actualCompletionDate` throughout, adds `featureReleaseDate: null` to the `row()` helper, and adds a new `statusPillInfo` case):

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
    targetCompletionDate: null,
    actualCompletionDate: null,
    featureReleaseDate: null,
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
    const tickets = [row({ targetCompletionDate: '2026-09-04' })]
    const { axisStart, axisEnd, quarterEnd } = computeAxis('26-Q2', tickets, false)
    expect(axisStart.toISOString().slice(0, 10)).toBe('2026-05-01')
    expect(axisEnd.toISOString().slice(0, 10)).toBe('2026-07-31')
    expect(quarterEnd.toISOString().slice(0, 10)).toBe('2026-07-31')
  })

  it('with allowSpillover=true, extends axisEnd to end-of-month of the latest targetCompletionDate past quarter end', () => {
    const tickets = [row({ targetCompletionDate: '2026-08-15' }), row({ targetCompletionDate: '2026-07-20' })]
    const { axisStart, axisEnd, quarterEnd } = computeAxis('26-Q2', tickets, true)
    expect(axisStart.toISOString().slice(0, 10)).toBe('2026-05-01')
    expect(axisEnd.toISOString().slice(0, 10)).toBe('2026-08-31')
    expect(quarterEnd.toISOString().slice(0, 10)).toBe('2026-07-31')
  })

  it('with allowSpillover=true and no ticket past quarter end, axis stays at the quarter end', () => {
    const tickets = [row({ targetCompletionDate: '2026-07-01' })]
    const { axisEnd } = computeAxis('26-Q2', tickets, true)
    expect(axisEnd.toISOString().slice(0, 10)).toBe('2026-07-31')
  })

  it('ignores tickets with no targetCompletionDate', () => {
    const tickets = [row({ targetCompletionDate: null })]
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

  it('maps status "Released (In-progress)" (case-insensitive) to a light-green pill, overriding statusCategory', () => {
    const pill = statusPillInfo('indeterminate', 'Released (In-progress)')
    expect(pill.label).toBe('Released (In-progress)')
    expect(pill.className).toBe('bg-success-light text-success-light-foreground')
  })
})

describe('resolveTicketBar', () => {
  const axisStart = parseISODate('2026-05-01')
  const axisEnd = parseISODate('2026-07-31')

  it('both dates present: uses the real dates and isTbd is false', () => {
    const t = row({ targetStartDate: '2026-05-10', targetCompletionDate: '2026-06-01' })
    const bar = resolveTicketBar(t, axisStart, axisEnd)
    expect(bar.start.toISOString().slice(0, 10)).toBe('2026-05-10')
    expect(bar.end.toISOString().slice(0, 10)).toBe('2026-06-01')
    expect(bar.isTbd).toBe(false)
  })

  it('missing targetStartDate only: bar opens at axisStart, isTbd is true', () => {
    const t = row({ targetStartDate: null, targetCompletionDate: '2026-06-01' })
    const bar = resolveTicketBar(t, axisStart, axisEnd)
    expect(bar.start.toISOString().slice(0, 10)).toBe('2026-05-01')
    expect(bar.end.toISOString().slice(0, 10)).toBe('2026-06-01')
    expect(bar.isTbd).toBe(true)
  })

  it('missing targetCompletionDate only: bar extends to axisEnd, isTbd is true', () => {
    const t = row({ targetStartDate: '2026-05-10', targetCompletionDate: null })
    const bar = resolveTicketBar(t, axisStart, axisEnd)
    expect(bar.start.toISOString().slice(0, 10)).toBe('2026-05-10')
    expect(bar.end.toISOString().slice(0, 10)).toBe('2026-07-31')
    expect(bar.isTbd).toBe(true)
  })

  it('both missing: bar spans the full axis, isTbd is true', () => {
    const t = row({ targetStartDate: null, targetCompletionDate: null })
    const bar = resolveTicketBar(t, axisStart, axisEnd)
    expect(bar.start.toISOString().slice(0, 10)).toBe('2026-05-01')
    expect(bar.end.toISOString().slice(0, 10)).toBe('2026-07-31')
    expect(bar.isTbd).toBe(true)
  })
})

describe('sortTickets with a mixed started-before + TBD delivery ticket', () => {
  it('a ticket with a real targetStartDate before axisStart sorts as started-before even when targetCompletionDate is missing', () => {
    const axisStart = parseISODate('2026-05-01')
    const a = row({ key: 'A', targetStartDate: '2026-04-01', targetCompletionDate: null, priorityOrder: 1 })
    const b = row({ key: 'B', targetStartDate: '2026-05-10', targetCompletionDate: '2026-05-20', priorityOrder: 100 })
    const sorted = sortTickets([b, a], axisStart)
    expect(sorted.map((t) => t.key)).toEqual(['A', 'B'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/delivery-timeline/__tests__/gantt.test.ts`
Expected: FAIL — `gantt.ts` still uses `targetDeliveryDate`/`actualDeliveryDate` and has no "Released (In-progress)" branch; the new test file references properties that don't exist on `PMBoardRow` yet in `gantt.ts`'s own usage, and the new `statusPillInfo` case fails.

- [ ] **Step 3: Update gantt.ts**

In `src/components/delivery-timeline/gantt.ts`, update `computeAxis` (rename in the loop body):

```ts
export function computeAxis(
  quarterLabel: string,
  tickets: PMBoardRow[],
  allowSpillover: boolean
): { axisStart: Date; axisEnd: Date; quarterEnd: Date } {
  const { start, end } = quarterMonthRange(quarterLabel)
  if (!allowSpillover) return { axisStart: start, axisEnd: end, quarterEnd: end }

  let axisEnd = end
  for (const ticket of tickets) {
    if (!ticket.targetCompletionDate) continue
    const delivery = parseISODate(ticket.targetCompletionDate)
    if (delivery > axisEnd) {
      const extended = endOfMonth(delivery)
      if (extended > axisEnd) axisEnd = extended
    }
  }
  return { axisStart: start, axisEnd, quarterEnd: end }
}
```

Update `statusPillInfo` to add the new branch before the `'paused'` check falls through:

```ts
export function statusPillInfo(statusCategory: string, status?: string): { label: string; className: string } {
  if (status?.toLowerCase() === 'released (in-progress)') {
    return { label: 'Released (In-progress)', className: 'bg-success-light text-success-light-foreground' }
  }
  if (status?.toLowerCase() === 'paused') {
    return { label: 'Paused', className: 'border border-border text-muted-foreground' }
  }
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
```

Update `resolveTicketBar`:

```ts
export function resolveTicketBar(
  ticket: PMBoardRow,
  axisStart: Date,
  axisEnd: Date
): { start: Date; end: Date; isTbd: boolean } {
  const start = ticket.targetStartDate ? parseISODate(ticket.targetStartDate) : axisStart
  const end = ticket.targetCompletionDate ? parseISODate(ticket.targetCompletionDate) : axisEnd
  const isTbd = ticket.targetStartDate === null || ticket.targetCompletionDate === null
  return { start, end, isTbd }
}
```

(`isStartedBefore` and `sortTickets` reference only `targetStartDate`, which is unchanged — no edit needed there.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/delivery-timeline/__tests__/gantt.test.ts`
Expected: PASS (all tests, including the new `statusPillInfo` case)

- [ ] **Step 5: Commit**

```bash
git add src/components/delivery-timeline/gantt.ts src/components/delivery-timeline/__tests__/gantt.test.ts
git commit -m "feat: rename gantt.ts date fields, add Released (In-progress) pill styling"
```

---

### Task 5: Rename GanttChart.tsx field usage, add barColorClasses branch

**Files:**
- Modify: `src/components/delivery-timeline/GanttChart.tsx`
- Test: `src/components/delivery-timeline/__tests__/GanttChart.test.tsx`

**Interfaces:**
- Consumes: `PMBoardRow.targetCompletionDate` (Task 2), `statusPillInfo` (Task 4, unchanged signature).
- Produces: `barColorClasses(statusCategory, isTbd, status)` returns `'border-success-light bg-success-light/10'` when `status.toLowerCase() === 'released (in-progress)'`.

- [ ] **Step 1: Update the test file first**

Replace `src/components/delivery-timeline/__tests__/GanttChart.test.tsx` with (renames the `row()` helper's `targetDeliveryDate`/`actualDeliveryDate`, adds `featureReleaseDate: null`, and adds a new test for the light-green bar/pill):

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
    targetCompletionDate: '2026-05-20',
    actualCompletionDate: null,
    featureReleaseDate: null,
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
        tickets={[row({ targetStartDate: null, targetCompletionDate: null })]}
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
        tickets={[row({ targetCompletionDate: '2026-08-15' })]}
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
        tickets={[row({ targetStartDate: '2026-04-01', targetCompletionDate: null })]}
        allowSpillover={false}
      />
    )
    expect(screen.getByText('Dates TBD')).toBeInTheDocument()
    expect(screen.getByText('‹')).toBeInTheDocument()
  })

  it('renders a "Released (In-progress)" ticket with the light-green pill and bar color', () => {
    render(
      <GanttChart
        quarterLabel="26-Q2"
        tickets={[row({ status: 'Released (In-progress)', statusCategory: 'indeterminate' })]}
        allowSpillover={false}
      />
    )
    expect(screen.getByText('Released (In-progress)')).toBeInTheDocument()
    const bar = screen.getByTestId('gantt-row').querySelector('div')
    expect(bar).toHaveClass('border-success-light', 'bg-success-light/10')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/delivery-timeline/__tests__/GanttChart.test.tsx`
Expected: FAIL — `GanttChart.tsx` still references `targetDeliveryDate`, causing a type error on the renamed `PMBoardRow`, and has no light-green bar-color branch.

- [ ] **Step 3: Update GanttChart.tsx**

In `src/components/delivery-timeline/GanttChart.tsx`, update `barColorClasses`:

```ts
function barColorClasses(statusCategory: string, isTbd: boolean, status: string): string {
  if (isTbd) return 'border-dashed border-muted-foreground bg-muted'
  if (status.toLowerCase() === 'released (in-progress)') return 'border-success-light bg-success-light/10'
  if (status.toLowerCase() === 'paused') return 'border-muted-foreground bg-muted'
  if (statusCategory === 'done') return 'border-success bg-success/10'
  if (statusCategory === 'new') return 'border-border bg-chart-6'
  return 'border-chart-4 bg-chart-4/30'
}
```

And update the displayed date range at line 115:

```tsx
                  <span className="truncate text-[10px] text-muted-foreground">
                    {bar.isTbd ? 'Dates TBD' : `${t.targetStartDate} – ${t.targetCompletionDate}`}
                  </span>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/delivery-timeline/__tests__/GanttChart.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/delivery-timeline/GanttChart.tsx src/components/delivery-timeline/__tests__/GanttChart.test.tsx
git commit -m "feat: rename GanttChart date field, add Released (In-progress) bar color"
```

---

### Task 6: Update Recent Ships grouping to admit "Released (In-progress)" tickets

**Files:**
- Modify: `src/components/delivery-timeline/recent-ships.ts`
- Test: `src/components/delivery-timeline/__tests__/recent-ships.test.ts`

**Interfaces:**
- Consumes: `PMBoardRow.actualCompletionDate`, `.featureReleaseDate` (Task 2).
- Produces: `groupShippedByMonth(tickets)` unchanged signature; now also admits tickets where `status.toLowerCase() === 'released (in-progress)' && featureReleaseDate !== null`, grouping them by `featureReleaseDate`.

- [ ] **Step 1: Update the test file first**

Replace `src/components/delivery-timeline/__tests__/recent-ships.test.ts` with:

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
    targetCompletionDate: null,
    actualCompletionDate: null,
    featureReleaseDate: null,
    product: [],
    category: [],
    keyCustomers: [],
    salesforceTotalArr: null,
    salesforceOpportunities: null,
    ...overrides,
  }
}

describe('groupShippedByMonth', () => {
  it('excludes tickets with no actualCompletionDate', () => {
    const groups = groupShippedByMonth([row({ actualCompletionDate: null })])
    expect(groups).toEqual([])
  })

  it('excludes tickets that are not Done, even with an actualCompletionDate', () => {
    const groups = groupShippedByMonth([row({ statusCategory: 'indeterminate', actualCompletionDate: '2026-03-10' })])
    expect(groups).toEqual([])
  })

  it('groups shipped tickets by calendar month, in chronological order', () => {
    const groups = groupShippedByMonth([
      row({ key: 'A', actualCompletionDate: '2026-03-10', priorityOrder: 5 }),
      row({ key: 'B', actualCompletionDate: '2026-02-20', priorityOrder: 10 }),
      row({ key: 'C', actualCompletionDate: '2026-02-05', priorityOrder: 20 }),
    ])

    expect(groups.map((g) => g.monthLabel)).toEqual(['February', 'March'])
    expect(groups[0].tickets.map((t) => t.key)).toEqual(['C', 'B'])
    expect(groups[1].tickets.map((t) => t.key)).toEqual(['A'])
  })

  it('sorts tickets within a month by priorityOrder descending', () => {
    const groups = groupShippedByMonth([
      row({ key: 'LOW', actualCompletionDate: '2026-02-05', priorityOrder: 1 }),
      row({ key: 'HIGH', actualCompletionDate: '2026-02-20', priorityOrder: 99 }),
    ])

    expect(groups[0].tickets.map((t) => t.key)).toEqual(['HIGH', 'LOW'])
  })

  it('omits months with no shipped tickets rather than rendering an empty section', () => {
    const groups = groupShippedByMonth([row({ actualCompletionDate: '2026-03-10' })])
    expect(groups).toHaveLength(1)
    expect(groups[0].monthLabel).toBe('March')
  })

  it('admits a "Released (In-progress)" ticket and groups it by featureReleaseDate', () => {
    const groups = groupShippedByMonth([
      row({
        key: 'REL',
        status: 'Released (In-progress)',
        statusCategory: 'indeterminate',
        actualCompletionDate: null,
        featureReleaseDate: '2026-04-12',
      }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].monthLabel).toBe('April')
    expect(groups[0].tickets.map((t) => t.key)).toEqual(['REL'])
  })

  it('excludes a "Released (In-progress)" ticket with no featureReleaseDate', () => {
    const groups = groupShippedByMonth([
      row({ status: 'Released (In-progress)', statusCategory: 'indeterminate', featureReleaseDate: null }),
    ])
    expect(groups).toEqual([])
  })

  it('matches status case-insensitively for "Released (In-progress)"', () => {
    const groups = groupShippedByMonth([
      row({
        key: 'REL',
        status: 'released (in-progress)',
        statusCategory: 'indeterminate',
        featureReleaseDate: '2026-04-12',
      }),
    ])
    expect(groups).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/delivery-timeline/__tests__/recent-ships.test.ts`
Expected: FAIL — `groupShippedByMonth` still filters only on `statusCategory === 'done' && actualDeliveryDate`, so the new "Released (In-progress)" cases return empty arrays and the rename breaks the `actualCompletionDate` field references.

- [ ] **Step 3: Update recent-ships.ts**

Replace `src/components/delivery-timeline/recent-ships.ts` with:

```ts
import type { PMBoardRow } from '@/app/api/product-planning/pm-board/route'

export interface RecentMonthGroup {
  monthLabel: string
  monthIndex: number
  tickets: PMBoardRow[]
}

export function groupShippedByMonth(tickets: PMBoardRow[]): RecentMonthGroup[] {
  const groups = new Map<number, RecentMonthGroup>()

  const shipped = tickets
    .filter(
      (t) =>
        (t.statusCategory === 'done' && t.actualCompletionDate !== null) ||
        (t.status.toLowerCase() === 'released (in-progress)' && t.featureReleaseDate !== null)
    )
    .sort((a, b) => (b.priorityOrder ?? -Infinity) - (a.priorityOrder ?? -Infinity))

  for (const ticket of shipped) {
    const dateStr =
      ticket.status.toLowerCase() === 'released (in-progress)' ? ticket.featureReleaseDate! : ticket.actualCompletionDate!
    const date = new Date(`${dateStr}T00:00:00Z`)
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

  return [...groups.values()].sort((a, b) => a.monthIndex - b.monthIndex)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/delivery-timeline/__tests__/recent-ships.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/delivery-timeline/recent-ships.ts src/components/delivery-timeline/__tests__/recent-ships.test.ts
git commit -m "feat: admit Released (In-progress) tickets into Recent Ships, grouped by feature release date"
```

---

### Task 7: Update the recent-ships API route's JQL and date filtering

**Files:**
- Modify: `src/app/api/product-planning/recent-ships/route.ts`
- Test: `src/app/api/product-planning/recent-ships/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `toRow` (Task 2, now producing `actualCompletionDate`/`featureReleaseDate`).
- Produces: `GET()` unchanged export shape (`NextResponse` with `{ rows: PMBoardRow[] }` or `{ error }`), but now queries and filters both "Done" and "Released (In-progress)" tickets within a 90-day window.

- [ ] **Step 1: Update the test file first**

Replace `src/app/api/product-planning/recent-ships/__tests__/route.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { JiraIssue } from '@/lib/jira'

vi.mock('@/lib/jira', () => ({
  searchIssues: vi.fn(),
  jiraBrowseUrl: (key: string) => `https://keebo.atlassian.net/browse/${key}`,
}))

function baseIssue(overrides: Partial<JiraIssue['fields']> = {}, key = 'PM-585'): JiraIssue {
  return {
    id: '1',
    key,
    fields: {
      issuetype: { name: 'Idea' },
      summary: 'Do the thing',
      status: { name: 'Done', statusCategory: { key: 'done' } },
      customfield_10383: 420,
      customfield_10049: { value: '26-Q2' },
      customfield_10062: '{"start":"2026-07-01","end":"2026-07-15"}',
      customfield_10063: '{"start":"2026-08-01","end":"2026-08-15"}',
      customfield_10891: null,
      customfield_10892: '{"start":"2026-08-10","end":"2026-08-10"}',
      customfield_10064: [],
      customfield_10048: [],
      customfield_10059: [],
      customfield_10925: null,
      customfield_10926: null,
      ...overrides,
    },
  }
}

describe('GET /api/product-planning/recent-ships', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries Jira for Done and Released (In-progress) issues, unioned', async () => {
    const { searchIssues } = await import('@/lib/jira')
    vi.mocked(searchIssues).mockResolvedValue([baseIssue()])

    const { GET } = await import('../route')
    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(vi.mocked(searchIssues)).toHaveBeenCalledWith(
      'project = PM AND (statusCategory = Done OR status = "Released (In-progress)") AND ("cf[10892]" is not EMPTY OR "cf[10891]" is not EMPTY) ORDER BY updated DESC'
    )
    expect(body.rows).toEqual([
      {
        key: 'PM-585',
        url: 'https://keebo.atlassian.net/browse/PM-585',
        issueType: 'Idea',
        summary: 'Do the thing',
        status: 'Done',
        statusCategory: 'done',
        priorityOrder: 420,
        roadmap: '26-Q2',
        targetStartDate: '2026-07-01',
        targetCompletionDate: '2026-08-01',
        actualCompletionDate: '2026-08-10',
        featureReleaseDate: null,
        product: [],
        category: [],
        keyCustomers: [],
        salesforceTotalArr: null,
        salesforceOpportunities: null,
      },
    ])
  })

  it('includes a "Released (In-progress)" ticket with a recent featureReleaseDate', async () => {
    const { searchIssues } = await import('@/lib/jira')
    vi.mocked(searchIssues).mockResolvedValue([
      baseIssue(
        {
          status: { name: 'Released (In-progress)', statusCategory: { key: 'indeterminate' } },
          customfield_10891: '{"start":"2026-08-05","end":"2026-08-05"}',
          customfield_10892: null,
        },
        'PM-600'
      ),
    ])

    const { GET } = await import('../route')
    const res = await GET()
    const body = await res.json()

    expect(body.rows.map((r: { key: string }) => r.key)).toEqual(['PM-600'])
    expect(body.rows[0].featureReleaseDate).toBe('2026-08-05')
  })

  it('excludes a Done ticket whose actualCompletionDate is more than 90 days old, and a Released (In-progress) ticket whose featureReleaseDate is more than 90 days old', async () => {
    const { searchIssues } = await import('@/lib/jira')
    vi.mocked(searchIssues).mockResolvedValue([
      baseIssue({ customfield_10892: '{"start":"2020-01-01","end":"2020-01-01"}' }, 'PM-OLD-DONE'),
      baseIssue(
        {
          status: { name: 'Released (In-progress)', statusCategory: { key: 'indeterminate' } },
          customfield_10891: '{"start":"2020-01-01","end":"2020-01-01"}',
          customfield_10892: null,
        },
        'PM-OLD-RELEASED'
      ),
    ])

    const { GET } = await import('../route')
    const res = await GET()
    const body = await res.json()

    expect(body.rows).toEqual([])
  })

  it('returns a 502 with the error message when searchIssues throws', async () => {
    const { searchIssues } = await import('@/lib/jira')
    vi.mocked(searchIssues).mockRejectedValue(new Error('Jira API 401 at /search/jql: Unauthorized'))

    const { GET } = await import('../route')
    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(502)
    expect(body.error).toContain('401')
  })
})
```

Note: this test mocks the current wall-clock implicitly via fixed dates relative to `2020-01-01` vs. the fixtures' `2026-08-xx` dates — the 90-day window is evaluated against `Date.now()` at test run time, and 2020-01-01 is always more than 90 days in the past regardless of when the suite runs, so this stays stable without mocking `Date`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/product-planning/recent-ships/__tests__/route.test.ts`
Expected: FAIL — current route uses the old single-status JQL and does no JS-side date filtering.

- [ ] **Step 3: Update recent-ships/route.ts**

Replace `src/app/api/product-planning/recent-ships/route.ts` with:

```ts
import { NextResponse } from 'next/server'
import { searchIssues } from '@/lib/jira'
import { toRow, type PMBoardRow } from '@/lib/jira-row-mapper'

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

function isWithinLast90Days(dateStr: string): boolean {
  const date = new Date(`${dateStr}T00:00:00Z`)
  return Date.now() - date.getTime() <= NINETY_DAYS_MS
}

function shippedDate(row: PMBoardRow): string | null {
  return row.status.toLowerCase() === 'released (in-progress)' ? row.featureReleaseDate : row.actualCompletionDate
}

export async function GET(): Promise<NextResponse> {
  try {
    // "cf[10892]"/"cf[10891]" are jira.polaris:interval fields — JQL relational operators
    // silently match nothing against them, so the 90-day recency window is applied in JS
    // below, using whichever date field applies to each ticket's status.
    const jql = `project = PM AND (statusCategory = Done OR status = "Released (In-progress)") AND ("cf[10892]" is not EMPTY OR "cf[10891]" is not EMPTY) ORDER BY updated DESC`
    const issues = await searchIssues(jql)
    const rows = issues
      .map(toRow)
      .filter((row) => {
        const date = shippedDate(row)
        return date !== null && isWithinLast90Days(date)
      })
    return NextResponse.json({ rows })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/product-planning/recent-ships/__tests__/route.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/product-planning/recent-ships/route.ts src/app/api/product-planning/recent-ships/__tests__/route.test.ts
git commit -m "feat: union Done and Released (In-progress) issues in recent-ships route, filter 90-day window in JS"
```

---

### Task 8: Rename delivery-timeline route's field reference

**Files:**
- Modify: `src/app/api/product-planning/delivery-timeline/route.ts:36`
- Test: `src/app/api/product-planning/delivery-timeline/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `PMBoardRow.targetCompletionDate` (Task 2).

- [ ] **Step 1: Update the test file first**

Replace `src/app/api/product-planning/delivery-timeline/__tests__/route.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { JiraIssue } from '@/lib/jira'

vi.mock('@/lib/jira', () => ({
  searchIssues: vi.fn(),
  jiraBrowseUrl: (key: string) => `https://keebo.atlassian.net/browse/${key}`,
}))

function baseIssue(overrides: Partial<JiraIssue['fields']> = {}, key = 'PM-585'): JiraIssue {
  return {
    id: '1',
    key,
    fields: {
      issuetype: { name: 'Idea' },
      summary: 'Do the thing',
      status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
      customfield_10383: 420,
      customfield_10049: { value: '26-Q2' },
      customfield_10062: '{"start":"2026-07-01","end":"2026-07-15"}',
      customfield_10063: '{"start":"2026-08-01","end":"2026-08-15"}',
      customfield_10891: null,
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
        targetCompletionDate: '2026-08-01',
        actualCompletionDate: null,
        featureReleaseDate: null,
        product: [],
        category: [],
        keyCustomers: [],
        salesforceTotalArr: null,
        salesforceOpportunities: null,
      },
    ])
  })

  it('mode=date returns the union of in-range delivery dates and quarter-assigned issues, deduped', async () => {
    const { searchIssues } = await import('@/lib/jira')
    vi.mocked(searchIssues).mockResolvedValue([
      // Delivery date 2026-08-01 falls inside the 26-Q3 window (Aug–Oct), even though roadmap = 26-Q1.
      baseIssue({ customfield_10049: { value: '26-Q1' } }, 'PM-585'),
      // Delivery date 2026-05-30 falls outside the 26-Q3 window and roadmap != 26-Q3 — excluded.
      baseIssue(
        { customfield_10049: { value: '26-Q1' }, customfield_10063: '{"start":"2026-05-30","end":"2026-05-30"}' },
        'PM-579'
      ),
      // Roadmap = 26-Q3 but no delivery date set — still included via the roadmap match.
      baseIssue({ customfield_10049: { value: '26-Q3' }, customfield_10063: null }, 'PM-600'),
      // Matches both criteria (roadmap = 26-Q3 and delivery date in range) — must appear once.
      baseIssue({ customfield_10049: { value: '26-Q3' } }, 'PM-601'),
    ])

    const { GET } = await import('../route')
    const res = await GET(
      makeRequest('http://localhost/api/product-planning/delivery-timeline?quarter=26-Q3&mode=date')
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    // customfield_10063 is a Jira "interval" field, not a native date field, so JQL relational
    // operators against it silently match nothing — fetch the union via the roadmap field
    // (which does support "=") plus "is not EMPTY", then filter/dedupe in JS.
    expect(vi.mocked(searchIssues)).toHaveBeenCalledWith(
      'project = PM AND ("cf[10049]" = "26-Q3" OR "cf[10063]" is not EMPTY) ORDER BY "cf[10383]" DESC'
    )
    expect(body.rows.map((r: { key: string }) => r.key).sort()).toEqual(['PM-585', 'PM-600', 'PM-601'])
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

Run: `npx vitest run src/app/api/product-planning/delivery-timeline/__tests__/route.test.ts`
Expected: FAIL — `route.ts` still filters on `row.targetDeliveryDate`, which no longer exists on `PMBoardRow`, and expected rows now include `featureReleaseDate`.

- [ ] **Step 3: Update delivery-timeline/route.ts**

In `src/app/api/product-planning/delivery-timeline/route.ts`, update the `mode === 'date'` filter:

```ts
      const rows = issues
        .map(toRow)
        .filter(
          (row) =>
            row.roadmap === quarter ||
            (row.targetCompletionDate !== null && row.targetCompletionDate >= startStr && row.targetCompletionDate <= endStr)
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/product-planning/delivery-timeline/__tests__/route.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/product-planning/delivery-timeline/route.ts src/app/api/product-planning/delivery-timeline/__tests__/route.test.ts
git commit -m "feat: rename targetDeliveryDate reference in delivery-timeline route"
```

---

### Task 9: Rename PM Board page column accessors and labels

**Files:**
- Modify: `src/app/product-planning/pm-board/page.tsx:60-61`

**Interfaces:**
- Consumes: `PMBoardRow.targetCompletionDate`, `.actualCompletionDate` (Task 2).

This file is not part of the Delivery Timeline page the spec covers, but its `COLUMNS` array accesses `PMBoardRow.targetDeliveryDate`/`.actualDeliveryDate`, which no longer exist after Task 2 — this update is required for the project to type-check. Column labels are renamed to match, for consistency with the underlying Jira field rename.

- [ ] **Step 1: Update the COLUMNS array**

In `src/app/product-planning/pm-board/page.tsx`, replace lines 60-61:

```tsx
  { key: 'targetCompletionDate', label: 'Target completion date', type: 'date', getCell: (r) => dateCell(r.targetCompletionDate), render: (r) => formatShortDate(r.targetCompletionDate) },
  { key: 'actualCompletionDate', label: 'Actual completion date', type: 'date', getCell: (r) => dateCell(r.actualCompletionDate), render: (r) => formatShortDate(r.actualCompletionDate) },
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors referencing `pm-board/page.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/app/product-planning/pm-board/page.tsx
git commit -m "feat: rename PM Board table columns to match completion-date field rename"
```

---

### Task 10: Rename fields in pm-board route test fixture

**Files:**
- Modify: `src/app/api/product-planning/pm-board/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `PMBoardRow.targetCompletionDate`, `.actualCompletionDate`, `.featureReleaseDate` (Task 2). No source file changes — `pm-board/route.ts` has no field-name references.

- [ ] **Step 1: Update the test file**

In `src/app/api/product-planning/pm-board/__tests__/route.test.ts`, update `baseIssue`'s default fields to include `customfield_10891: null` (alongside the existing `customfield_10892: null`):

```ts
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
      customfield_10891: null,
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

And update the two expected-row assertions — the `toEqual` block in the first test:

```ts
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
        targetCompletionDate: '2026-08-01',
        actualCompletionDate: null,
        featureReleaseDate: null,
        product: ['KWO for Databricks', 'KWO for Snowflake'],
        category: ['Platform'],
        keyCustomers: [],
        salesforceTotalArr: 120000,
        salesforceOpportunities: 'OPP-1234',
      },
    ])
```

(The second test's `toMatchObject` assertion only checks `issueType`/`status`/`statusCategory`/`priorityOrder`/`roadmap`/`targetStartDate` — no rename needed there since it doesn't reference the renamed fields.)

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run src/app/api/product-planning/pm-board/__tests__/route.test.ts`
Expected: PASS (3 tests) — this file only needed its fixture updated since `pm-board/route.ts` has no source changes.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/product-planning/pm-board/__tests__/route.test.ts
git commit -m "test: update pm-board route fixture for renamed completion-date fields"
```

---

### Task 11: Rename mock row fields in delivery-timeline page test

**Files:**
- Modify: `src/app/product-planning/delivery-timeline/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `PMBoardRow.targetCompletionDate`, `.actualCompletionDate`, `.featureReleaseDate` (Task 2). `DeliveryTimelinePage` doesn't destructure these fields directly, so this is a type-correctness update, not a behavioral one.

- [ ] **Step 1: Update the three inline mock row objects**

In `src/app/product-planning/delivery-timeline/__tests__/page.test.tsx`, rename `targetDeliveryDate`→`targetCompletionDate` and `actualDeliveryDate`→`actualCompletionDate` in all three mock objects (the `quarter=26-Q2` response, the `quarter=26-Q3` response, and the `/api/product-planning/recent-ships` response), adding `featureReleaseDate: null` to each:

```tsx
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
                targetCompletionDate: '2026-05-20',
                actualCompletionDate: null,
                featureReleaseDate: null,
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
                targetCompletionDate: '2026-08-20',
                actualCompletionDate: null,
                featureReleaseDate: null,
                product: [],
                category: [],
                keyCustomers: [],
                salesforceTotalArr: null,
                salesforceOpportunities: null,
              },
            ])
          )
        }
        if (url.includes('/api/product-planning/recent-ships')) {
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
                targetCompletionDate: '2026-01-20',
                actualCompletionDate: '2026-01-18',
                featureReleaseDate: null,
                product: [],
                category: [],
                keyCustomers: [],
                salesforceTotalArr: null,
                salesforceOpportunities: null,
              },
            ])
          )
        }
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run src/app/product-planning/delivery-timeline/__tests__/page.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 3: Commit**

```bash
git add src/app/product-planning/delivery-timeline/__tests__/page.test.tsx
git commit -m "test: rename mock row fields in delivery-timeline page test"
```

---

### Task 12: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: All tests pass, 0 failures

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`, visit `http://localhost:4000/product-planning/delivery-timeline`. Confirm:
- Current Projects / What's Next tabs still render bars and pills for ordinary statuses
- Any ticket with Jira status "Released (In-progress)" (if present in current data) shows a light-green bar and a "Released (In-progress)" pill
- Recent Ships includes such tickets grouped under the month of their Feature release date

---

## Self-Review Notes

- **Spec coverage:** Requirement 1 (field renames) → Tasks 1, 2, 8, 9, 10, 11. Requirement 2 (status special-casing, pill, Recent Ships) → Tasks 4, 5, 6, 7. Requirement 3 (palette-only colors) → Task 3, values copied verbatim from spec §3. Design §1–§5 all mapped to tasks; Out-of-scope items respected (no `pm-board/route.ts` source change — Task 10 is test-only; no new Gantt placement logic — Tasks 4/5 only touch coloring functions).
- **Placeholder scan:** No TBD/TODO markers; every step includes complete code and exact run commands.
- **Type consistency:** `PMBoardRow.targetCompletionDate` / `.actualCompletionDate` / `.featureReleaseDate` used identically across Tasks 2, 4, 5, 6, 7, 8, 9, 10, 11. `statusPillInfo(statusCategory, status?)` and `barColorClasses(statusCategory, isTbd, status)` signatures unchanged from their originals — only internal branches added.
