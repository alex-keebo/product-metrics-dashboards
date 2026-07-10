# Product Planning / PM Board

**Date:** 2026-07-08
**Status:** Approved

## Overview

Add a new "Product Planning" section to the sidebar, positioned between "UI Usage Telemetry" and "Platform", with one page: **PM Board**. It shows a live, sorted table of near-term roadmap tickets pulled directly from Jira's `PM` project via the Jira Cloud REST API — no local caching or JSON snapshot, since this is meant to reflect the current state of planning.

## Navigation

`src/components/layout/Sidebar.tsx` — insert a new group between `UI Usage Telemetry` and `Platform`:

```ts
{
  group: 'Product Planning',
  items: [
    { label: 'PM Board', href: '/product-planning/pm-board' },
  ],
},
```

## Data Source: Jira Cloud REST API

- Base: `https://keebo.atlassian.net` (`JIRA_BASE_URL`)
- Auth: HTTP Basic, `email:api_token` (`JIRA_EMAIL`, `JIRA_API_TOKEN`)
- Endpoint: `GET /rest/api/3/search/jql` (paginated via `nextPageToken`, not the deprecated offset-based `/search`)
- Credentials live only in `.env.local` (gitignored) and `.env.local.example` (blank placeholders) — never committed.

### Quarter window

Keebo's fiscal year starts **February 1**. A helper (`src/lib/fiscal-quarter.ts`) computes the current fiscal-quarter label from today's date:

```
month_index = (calendar_month - 2 + 12) % 12   // 0-11, Feb = 0
fiscal_year = calendar_month >= 2 ? calendar_year : calendar_year - 1
quarter     = floor(month_index / 3) + 1        // 1-4
label       = `${String(fiscal_year % 100).padStart(2, '0')}-Q${quarter}`
```

Verified: 2026-07-08 → `26-Q2`. 2027-01-15 → `26-Q4` (Nov–Jan quarter, still FY26).

The JQL quarter list is **current quarter + next 6 quarters + "Future"** (8 buckets total), recomputed on every request:

```
26-Q2, 26-Q3, 26-Q4, 27-Q1, 27-Q2, 27-Q3, 27-Q4, Future
```

This slides forward automatically — no manual updates as time passes.

### JQL

Built server-side on each request, using custom field IDs (not display names, since several fields share display names across the Jira instance):

```
project = PM AND "cf[10049]" IN (26-Q2, 26-Q3, 26-Q4, 27-Q1, 27-Q2, 27-Q3, 27-Q4, Future)
ORDER BY "cf[10049]" ASC, "cf[10383]" DESC
```

- `cf[10049]` = "Roadmap" (select field) — primary sort, ascending (chronological — verified against Jira's option ordering)
- `cf[10383]` = "Priority order" (float) — secondary sort, descending (higher value = higher priority)

### Fields fetched

Confirmed against a live export from the PM project (field IDs are PM-project-specific; several field names collide across other Jira Cloud projects, hence explicit IDs):

| Column | Jira field | Notes |
|---|---|---|
| Issue Type | `issuetype` | e.g. "Idea" |
| Key | `key` | e.g. `PM-585`; links to `{JIRA_BASE_URL}/browse/{key}` |
| Summary | `summary` | |
| Status | `status` | name + status category (for color) |
| Priority order | `customfield_10383` | float, e.g. `420.0` |
| Roadmap | `customfield_10049` | select option, e.g. `26-Q2` |
| Target start date | `customfield_10062` | Polaris interval field — JSON string `{"start":"YYYY-MM-DD","end":"YYYY-MM-DD"}`; render `start` |
| Target delivery date | `customfield_10063` | same shape |
| Actual delivery date | `customfield_10892` | same shape; often `null` |
| Product | `customfield_10064` | multi-select array of `{value}` |
| Category | `customfield_10048` | multi-select array of `{value}` |
| Key customers | `customfield_10059` | multi-select array of `{value}`; often `null`/empty |

## Backend

- `src/lib/jira.ts` — thin API client (mirrors the existing `src/lib/subscript.ts` pattern): builds auth header, calls `/rest/api/3/search/jql`, handles pagination via `nextPageToken` until `isLast: true`.
- `src/app/api/product-planning/pm-board/route.ts` — computes the quarter window, builds the JQL, calls the Jira client, shapes each issue into a flat row (extracting `.value` from option/array fields, `.start` from interval fields), returns JSON.

## Frontend

- `src/app/product-planning/pm-board/page.tsx` — client component. Fetches the full ticket list from the API route **once**, on mount (and on manual "Refresh"). All sorting and filtering afterward is client-side, in-memory — no re-fetch.
- Key column renders as a link (`target="_blank"`) to the Jira issue.
- Product / Category / Key customers render as comma-joined text (consistent with how `ModuleRow`/`ActiveCustomerRow` render similar list fields elsewhere in the app).

### New component: `FilterSortTable`

The existing `DataTable` component (`src/components/tables/DataTable.tsx`) only supports single-column click-to-sort and has no per-column filter menu — extending it in place would change header behavior for its other consumers (Customers, Platform Usage, Feature Analytics). Instead, add a new component, `src/components/tables/FilterSortTable.tsx`, used only by the PM Board page for now (reusing the same visual style — card container, row striping, pagination footer — as `DataTable`).

**Per-column header:** label + a small filter-icon button. Clicking it opens a floating menu below the header, modeled on the Google Sheets column filter menu, minus the two color-based options:

1. **Sort A to Z** / **Sort Z to A** — applies a single-key ascending/descending sort by that column's rendered value. Choosing a sort on one column replaces any previously active sort (only one sort key active at a time, matching spreadsheet behavior). Before the user sorts anything, rows stay in the order returned by the API (i.e. the JQL default: Roadmap ascending, then Priority order descending).
2. **Filter by condition** — a collapsible section (collapsed/expanded like the screenshot's ▾) containing a condition dropdown, **type-aware per column**:
   - Text columns (Issue Type, Key, Summary, Status, Product, Category, Key customers): `None`, `Text contains`, `Text does not contain`, `Text starts with`, `Text ends with`, `Text is exactly`, `Is empty`, `Is not empty`. Multi-value columns are matched against their comma-joined display text.
   - Number column (Priority order): `None`, `Greater than`, `Greater than or equal to`, `Less than`, `Less than or equal to`, `Equal to`, `Not equal to`, `Between`, `Is empty`, `Is not empty`.
   - Date columns (Target start date, Target delivery date, Actual delivery date): `None`, `Date is`, `Date is before`, `Date is after`, `Date is on or before`, `Date is on or after`, `Is empty`, `Is not empty`.
   
   Selecting a condition other than `None`/`Is empty`/`Is not empty` reveals the matching input(s) (one text/number/date input, or two for `Between`).
3. **Filter by values** — a collapsible section (collapsed by default) with `Select all N` / `Clear` links, a `Displaying M` count, a search box, and a checklist of unique values found in that column. For multi-value columns (Product, Category, Key customers), each **individual** value across all rows gets its own checkbox (e.g. `KWO for Databricks` and `KWO for Snowflake` listed separately) — checking one matches any row whose list includes that value, regardless of what else is in it.
4. **Cancel / OK** buttons at the bottom apply or discard the pending condition + value selections for that column.

**Combining filters:** every column's active filter (condition and/or values) combines with logical AND across all filtered columns. A column with an active filter or sort shows a visually distinct filter icon (filled/highlighted) so active state is visible at a glance. Pagination and the "N rows" count reflect the post-filter row set.

## Error Handling

If the Jira API call fails (auth error, network error, rate limit), the API route returns a 502 with an error message; the page shows an inline error banner (consistent with existing dashboard error patterns) instead of crashing, with a "Retry" affordance tied to the same Refresh button.

## Env Vars

Added to `.env.local` (already set, not committed) and `.env.local.example` (blank):

```
JIRA_BASE_URL=
JIRA_EMAIL=
JIRA_API_TOKEN=
```
