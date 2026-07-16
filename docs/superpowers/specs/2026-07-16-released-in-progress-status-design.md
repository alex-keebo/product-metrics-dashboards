# "Released (In-progress)" Status — Design Spec

## Background

Jira has renamed and added fields on the PM project's tickets:

- "Target delivery date" → **"Target completion date"** (`customfield_10063`, unchanged field, `jira.polaris:interval` schema)
- "Actual delivery date" → **"Actual completion date"** (`customfield_10892`, unchanged field, `jira.polaris:interval` schema)
- "Actual start date" has been repurposed into a new field, **"Feature release date"** (`customfield_10891`, `jira.polaris:interval` schema)
- "Target start date" (`customfield_10062`) is unchanged.

Jira also introduced a new status, **"Released (In-progress)"** (status id `10421`), with `statusCategory.key = "indeterminate"` — the same category as ordinary "In Progress" statuses. It cannot be distinguished from generic in-progress tickets via `statusCategory` alone; it must be special-cased by status name, following the precedent already in the codebase for the `'paused'` status.

This spec covers reflecting these changes on the Delivery Timeline page (Gantt tabs + Recent Ships).

## Requirements

1. Rename fields throughout the codebase:
   - `targetDeliveryDate` → `targetCompletionDate` (still sourced from `customfield_10063`)
   - `actualDeliveryDate` → `actualCompletionDate` (still sourced from `customfield_10892`)
   - Add new `featureReleaseDate`, sourced from `customfield_10891` via the existing `intervalStart` helper
   - `targetStartDate` (`customfield_10062`) is unchanged
2. Tickets with status "Released (In-progress)" must:
   - Display a light-green Gantt bar (lighter than the "Done" green) on whichever quarter tab they'd normally appear on (no new placement logic — only new coloring)
   - Display a status pill with the exact label **"Released (In-progress)"**, styled with the same light-green treatment
   - Appear on Recent Ships, grouped by month using **Feature release date** (not Actual completion date)
3. No new hex colors outside the documented Keebo palette. The green scale (light → dark) is: `#E3FFEE` · `#A2E7C2` · `#56BD88` · `#2E7D52` · `#055D35` · `#00371E`.

## Design

### 1. Field renames

**`src/lib/jira.ts`**
- Add `customfield_10891` to the `FIELDS` array and `JiraIssueFields` interface (alongside existing `customfield_10062`, `customfield_10063`, `customfield_10892`).

**`src/lib/jira-row-mapper.ts`**
- `PMBoardRow.targetDeliveryDate` → `targetCompletionDate`
- `PMBoardRow.actualDeliveryDate` → `actualCompletionDate`
- Add `PMBoardRow.featureReleaseDate: string | null`, computed via `intervalStart(fields.customfield_10891)`
- `targetStartDate` unchanged

All consumers of the renamed fields (`gantt.ts`, `GanttChart.tsx`, `recent-ships.ts`, `delivery-timeline/route.ts`, and their tests) are updated to the new names.

### 2. Status special-casing

Both `statusPillInfo` (`gantt.ts`) and `barColorClasses` (`GanttChart.tsx`) already accept the raw `status` string alongside `statusCategory` and special-case `'paused'` by name before falling into the `statusCategory` branches. Add an equivalent branch for `status.toLowerCase() === 'released (in-progress)'`, checked before the `statusCategory` switch/if-chain (same position as the `'paused'` check):

- `statusPillInfo`: returns `{ label: 'Released (In-progress)', className: 'bg-success-light text-success-light-foreground' }`
- `barColorClasses`: returns `'border-success-light bg-success-light/10'`

### 3. New color token

`src/app/globals.css` is the one file allowed new hex values (per CLAUDE.md). Add, in both `:root` and `.dark` blocks:

```css
--success-light: #a2e7c2;
--success-light-foreground: #055d35;
```

(Same values in both themes — `#A2E7C2` reads as a clear light green against both the light `--card` (`#ffffff`) and dark `--card` (`#04202d`) backgrounds, and `#055D35` gives sufficient contrast as foreground text in both.)

Add corresponding entries to the `@theme inline` mapping block:

```css
--color-success-light: var(--success-light);
--color-success-light-foreground: var(--success-light-foreground);
```

This produces Tailwind utilities `bg-success-light`, `text-success-light-foreground`, `border-success-light`.

### 4. Recent Ships

**`src/components/delivery-timeline/recent-ships.ts`** — `groupShippedByMonth` currently:

```ts
const shipped = tickets
  .filter((t) => t.statusCategory === 'done' && t.actualDeliveryDate !== null)
```

Update to admit "Released (In-progress)" tickets too, and group each ticket by the correct date field depending on which condition matched:

```ts
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
  // ... unchanged grouping logic below, using `date`
}
```

**`src/app/api/product-planning/recent-ships/route.ts`** — current JQL:

```
project = PM AND statusCategory = Done AND "cf[10892]" >= -90d ORDER BY "cf[10892]" DESC
```

This excludes "Released (In-progress)" entirely, since it's `statusCategory = indeterminate`, not `Done`. Update to union both conditions (mirroring the existing interval-field JQL workaround pattern in `delivery-timeline/route.ts` — relational operators against `jira.polaris:interval` fields silently return zero results, so date-range filtering happens in JS, not JQL):

```
project = PM AND (statusCategory = Done OR status = "Released (In-progress)") AND ("cf[10892]" is not EMPTY OR "cf[10891]" is not EMPTY) ORDER BY updated DESC
```

The 90-day recency window and final ordering are then applied in JS in the route handler, using `actualCompletionDate` for `done` tickets and `featureReleaseDate` for "Released (In-progress)" tickets — consistent with how `groupShippedByMonth` already needs to pick the right field per ticket.

### 5. Gantt placement

No new placement logic. "Released (In-progress)" tickets already flow through the same `resolveTicketBar`/quarter-tab filtering as any other ticket; only their color (via `barColorClasses`) and pill label (via `statusPillInfo`) change.

## Out of scope

- No changes to `pm-board/route.ts` beyond the field rename propagation (it has no status-specific logic).
- No changes to the Gantt tab placement/filtering logic itself.
- No new "Released (In-progress)" filter/tab — it appears wherever its existing status/dates would already place it (Gantt tab by roadmap quarter, Recent Ships by Feature release date).

## Testing

Existing test files to update for the renames and new behavior: `gantt.test.ts`, `recent-ships.test.ts`, `GanttChart.test.tsx`, `page.test.tsx`, `pm-board/__tests__/route.test.ts`, `recent-ships/__tests__/route.test.ts`, `delivery-timeline/__tests__/route.test.ts`. New test cases needed for: `statusPillInfo` returning the "Released (In-progress)" label/class, `barColorClasses` returning the light-green class, `groupShippedByMonth` admitting and correctly grouping "Released (In-progress)" tickets by `featureReleaseDate`, and the recent-ships route JQL/filtering including the new status.
