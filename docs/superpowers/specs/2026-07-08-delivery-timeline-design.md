# Delivery Timeline Page — Design Spec

## Overview

A new page, **Delivery Timeline**, gives Keebo's PM/leadership audience a
fast visual read on delivery: what's in flight this quarter, what's coming
next quarter, and what shipped last quarter. It sits in the sidebar directly
below "PM Board" (same "Product Planning" nav group) and reuses PM Board's
Jira data source, but presents it as three Gantt/list views instead of a flat
filterable table.

Route: `/product-planning/delivery-timeline`
Nav: `src/components/layout/Sidebar.tsx` — add
`{ label: 'Delivery Timeline', href: '/product-planning/delivery-timeline' }`
to the `'Product Planning'` group's `items` array, after the PM Board entry.

The page has three tabs, CSS-tab-styled to match the mockup
(`.superpowers/brainstorm/72279-1783536270/content/timeline-mockup.html`):

1. **Current Projects** — current fiscal quarter, Gantt chart
2. **What's Next** — next fiscal quarter, Gantt chart
3. **Recent Ships** — previous fiscal quarter, vertical monthly lists

## Data Source

Reuses the existing Jira issue shape (`src/lib/jira.ts`, `JiraIssue`) and
field mapping already established in
`src/app/api/product-planning/pm-board/route.ts`. No new Jira fields are
needed. Relevant fields:

| Field | Jira ID | Meaning |
|---|---|---|
| `roadmap` | `customfield_10049` | Fiscal quarter label, e.g. `"26-Q2"` |
| `targetStartDate` | `customfield_10062` (interval start) | Planned start |
| `targetDeliveryDate` | `customfield_10063` (interval start) | Planned delivery |
| `actualDeliveryDate` | `customfield_10892` (interval start) | Actual delivery, set once shipped |
| `priorityOrder` | `customfield_10383` | Manual priority rank (higher = higher priority, per PM Board's `ORDER BY ... DESC`) |
| `status` / `statusCategory` | `status.name` / `status.statusCategory.key` | Jira status + category (`new` / `indeterminate` / `done`) |
| `summary`, `key`, `url` | — | Ticket title, key, Jira browse link (`jiraBrowseUrl`) |

### New API route

`src/app/api/product-planning/delivery-timeline/route.ts` — a `GET`
handler that accepts a `quarter` label (e.g. `?quarter=26-Q2`) as a query
param and returns all issues whose `roadmap` field equals that exact label:

```
GET /api/product-planning/delivery-timeline?quarter=26-Q2
```

JQL: `project = PM AND "cf[10049]" = "<quarter>" ORDER BY "cf[10383]" DESC`

This differs from PM Board's route, which queries a *forward-looking window*
of quarters (`quarterWindow()`) for one combined table. Implementation
Status needs three *single-quarter* queries (previous, current, next), so it
takes the quarter label as a parameter rather than hardcoding a window. The
response shape mirrors `PMBoardRow` (already exported from the PM Board
route) — reuse that type rather than defining a new one.

The page component calls this route three times (previous / current / next
quarter labels), computed client-side via `fiscal-quarter.ts` helpers.

### `fiscal-quarter.ts` addition

Add `previousFiscalQuarterLabel(label: string): string`, the inverse of the
existing `nextFiscalQuarterLabel`. Same parsing/rolling logic, decrementing
instead of incrementing (Q1 → previous year's Q4).

```ts
export function previousFiscalQuarterLabel(label: string): string {
  const match = LABEL_RE.exec(label)
  if (!match) throw new Error(`Invalid fiscal quarter label: ${label}`)
  const year = Number(match[1])
  const quarter = Number(match[2])
  if (quarter === 1) return `${String((year - 1 + 100) % 100).padStart(2, '0')}-Q4`
  return `${String(year).padStart(2, '0')}-Q${quarter - 1}`
}
```

The page computes:
- `current = currentFiscalQuarterLabel()`
- `next = nextFiscalQuarterLabel(current)`
- `previous = previousFiscalQuarterLabel(current)`

## Shared Concepts

### Status pill

Derived from `statusCategory`, not raw `status` text (Jira status names vary
per workflow, but `statusCategory.key` is stable):

| `statusCategory` | Pill label | Pill style |
|---|---|---|
| `new` | To Do | `.status-pill.todo` |
| `indeterminate` | In Progress | `.status-pill.progress` |
| `done` | Done | `.status-pill.done` |

### Fiscal quarter → calendar month range

Every quarter label maps to 3 calendar months via the existing Feb-1
fiscal-year rule (`fiscal-quarter.ts`): Q1 = Feb–Apr, Q2 = May–Jul,
Q3 = Aug–Oct, Q4 = Nov–Jan. Both Gantt tabs need the concrete
first-day/last-day `Date` of their quarter to build the axis; add a small
helper (co-located with the Gantt component, not in `fiscal-quarter.ts`,
since it's presentation-only) that maps a label to `{ start: Date, end: Date }`.

### Tickets missing dates

A ticket missing `targetStartDate`, `targetDeliveryDate`, or both is styled
`.ticket-bar.tbd` (dashed border, muted fill) and its dates row shows "Dates
TBD" instead of a date range — the visual treatment is identical regardless
of which date (or both) is missing.

Bar placement treats a missing date as an open boundary at the axis edge on
that side, rather than always spanning the full axis:
- Missing `targetStartDate` (delivery present): bar runs from the axis start
  to the (axis-clamped) `targetDeliveryDate`.
- Missing `targetDeliveryDate` (start present): bar runs from the
  (axis-clamped) `targetStartDate` to the axis end.
- Both missing: full-width bar spanning the entire visible axis (unchanged).

**Sorting / "started before":** the "started before" check (see below) uses
the ticket's real `targetStartDate` when present, regardless of whether
`targetDeliveryDate` is missing — a ticket with a known start before the
axis is "started before" even if its delivery date is TBD. A ticket with no
`targetStartDate` can never be "started before" (its displayed start is the
axis start) and sorts by `priorityOrder` only, in the remaining-tickets
bucket.

### Sorting within a tab's ticket list

1. Tickets flagged "started before" (see below) first, in `priorityOrder`
   descending order among themselves.
2. Remaining tickets (including TBD), in `priorityOrder` descending.

## Tab 1: Current Projects

Fetches issues where `roadmap == currentFiscalQuarterLabel()`.

**Axis:** Starts at the 1st of the current quarter's first month. Normally
ends on the last day of the quarter's last month. **Spillover extension:**
if any ticket's `targetDeliveryDate` falls after the quarter's last day, the
axis extends forward to cover the latest such `targetDeliveryDate`, rounded
up to the end of that month. (Example: quarter is May–Jul; a ticket ending
Sep 4 extends the axis through Sep 30.) This keeps every current-quarter
ticket's full bar visible without a truncating chevron.

**Spillover visual treatment**, applied to the borrowed months only (the
months beyond the quarter's own last month):
- `.spillover-band` — a muted background band behind those months' portion
  of the axis, to visually separate "this quarter" from "borrowed time."
- `.quarter-label.spillover` — the month labels for borrowed months render
  in a dimmer color than the quarter's own month labels.
- `.quarter-divider` — a dashed vertical line at the exact boundary between
  the quarter's last day and the first borrowed day.

**"Started before" indicator:** a ticket whose `targetStartDate` is before
the 1st of the quarter's first month is flagged "started before." Its bar
gets the `.continues-left` treatment (dashed left edge instead of a squared
edge, signaling the bar's true start is off-axis to the left) and its title
gets a `‹ ` prefix via `.ticket-title.started-before::before { content:
"\2039 "; color: var(--primary); font-weight: 700; }`. These tickets sort to
the top of the list per the Sorting rule above.

**Bar fill/border style by status:** `.ticket-bar.done` (filled,
success-colored), `.ticket-bar.todo` (outlined, muted), unstyled base
`.ticket-bar` for in-progress (filled, primary-colored) — matching PM
Board's existing `statusCategory` semantics, applied here as bar treatment
instead of a table cell.

**Each ticket row shows:** title (with `‹` prefix if applicable), linked
ticket key, date range (`targetStartDate`–`targetDeliveryDate`, or "Dates
TBD"), and the status pill.

## Tab 2: What's Next

Fetches issues where `roadmap == nextFiscalQuarterLabel(currentFiscalQuarterLabel())`.

**Axis:** Fixed to the next quarter's own 3 calendar months — start of first
month to end of last month. No spillover extension on this tab: a ticket
planned in the *next* quarter that runs past its end is left as-is (this
tab's job is "what starts soon," not full delivery tracking — spillover
tracking happens once it becomes the *current* quarter, on Tab 1).

**"Started before" indicator:** identical rule and treatment as Tab 1 —
applies to any ticket whose `targetStartDate` precedes the 1st of *this
tab's* first month (i.e., a ticket that's actually already underway in the
current quarter but tagged with next quarter's roadmap value, or one
carrying over). Same `‹` prefix, same `.continues-left` bar treatment, same
top-of-list sort.

**Everything else** (bar status styling, TBD handling, row contents,
sorting) is identical to Tab 1.

## Tab 3: Recent Ships

Fetches issues where `roadmap == previousFiscalQuarterLabel(currentFiscalQuarterLabel())`
**and** `actualDeliveryDate` is not null. A ticket tagged to last quarter
that never actually shipped (no `actualDeliveryDate`) does not appear here —
"Recent Ships" means delivered work, not planned work. (Undelivered
previous-quarter tickets are not shown anywhere on this page; that's a gap
PM Board's flat table already covers.)

**Layout:** no Gantt axis. A single card (`.recent-card`) headed by the
quarter label (e.g. "26-Q1 (previous)"), containing one
`.recent-month-section` per calendar month in that quarter, in chronological
order. Sections render only for months that have at least one shipped
ticket (a quarter with no ships in its first month simply omits that
section, it isn't shown empty).

Ticket-to-month grouping: by calendar month of `actualDeliveryDate`.

Each `.recent-month-section` has a `.recent-month-heading` (month name) and
a bulleted list of `.recent-ticket-item`s, each showing the ticket title
followed by its linked ticket key (`title · PM-XXX`, key in
`var(--primary)`, via the `.recent-ticket-title { order: 1 }` /
`.recent-ticket-key { order: 2 }` flex-order pattern — the key stays first
in DOM order for accessibility/semantics but renders visually after the
title).

Within a month, tickets sort by `priorityOrder` descending. No "started
before" concept applies to this tab (it's a retrospective, not a forecast).

## Out of Scope

- Editing tickets from this page (Jira remains the source of truth; PM Board
  already links out to Jira for that).
- Filtering/searching within Delivery Timeline (PM Board's
  `FilterSortTable` already covers ad-hoc filtering across quarters).
- Any quarter other than previous/current/next — no quarter picker.
- The `.superpowers/brainstorm/.../timeline-mockup.html`'s "PM-540" demo
  ticket (Current Projects tab) is illustrative only, added purely to
  demonstrate the "started before" bar/indicator treatment since none of
  the real current-quarter tickets in the mockup data happened to start
  before May 1. It is not real backlog data and has no equivalent in this
  spec — the "started before" behavior is defined generically above and
  will apply naturally once a real ticket meets the condition.
