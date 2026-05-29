# Customers Table — Source Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Source" column to the Customers table that shows a human-readable label for each record's `source` field.

**Architecture:** Single-file change. Add a `SOURCE_LABELS` lookup map near the existing label constants, insert the column header, add the cell, and bump the `colSpan` values that count columns.

**Tech Stack:** Next.js, React, Tailwind CSS

---

### Task 1: Add Source column to Customers table

**Files:**
- Modify: `src/app/platform/customers/page.tsx`

The `source` field on `Customer` (optional `string`) carries one of these values (or `undefined` for legacy/manual records):

| Raw value | Human-readable label |
|---|---|
| `'subscript'` | Subscript |
| `'bigquery:trial'` | BigQuery trial |
| `'bigquery:pre-subscript'` | BigQuery pre-subscription |
| `'bigquery:post-subscript'` | BigQuery post-subscription |
| `'bigquery:gap-fill'` | BigQuery gap fill |
| `undefined` / anything else | — (em dash, muted) |

- [ ] **Step 1: Add `SOURCE_LABELS` constant**

  In `src/app/platform/customers/page.tsx`, after the `MODULE_LABELS` block (around line 51), add:

  ```tsx
  const SOURCE_LABELS: Record<string, string> = {
    'subscript': 'Subscript',
    'bigquery:trial': 'BigQuery trial',
    'bigquery:pre-subscript': 'BigQuery pre-subscription',
    'bigquery:post-subscript': 'BigQuery post-subscription',
    'bigquery:gap-fill': 'BigQuery gap fill',
  }
  ```

- [ ] **Step 2: Add the column header**

  The column array at lines 486–492 currently has 5 entries. Add `source` as the 6th (before the blank actions column):

  ```tsx
  { key: 'source', label: 'Source' },
  ```

  Full updated array:

  ```tsx
  {([
    { key: 'name', label: 'Customer' },
    { key: 'module', label: 'Module' },
    { key: 'contract_type', label: 'Contract Type' },
    { key: 'valid_from', label: 'Valid From' },
    { key: 'valid_to', label: 'Valid To' },
    { key: 'source', label: 'Source' },
  ] as { key: SortKey; label: string }[]).map((col) => (
  ```

- [ ] **Step 3: Add the source cell to each row**

  After the `valid_to` cell (line 544) and before the actions cell, add:

  ```tsx
  <td className="px-4 text-sm tabular-nums">
    {c.source && SOURCE_LABELS[c.source]
      ? <span className="text-foreground">{SOURCE_LABELS[c.source]}</span>
      : <span className="text-muted-foreground">—</span>}
  </td>
  ```

- [ ] **Step 4: Update colSpan values**

  There are two `colSpan={6}` values — one for the loading spinner row and one for the "no rows" empty state row (lines 510 and 517). Change both to `colSpan={7}`:

  ```tsx
  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
    <Loader2 className="size-4 animate-spin inline-block" />
  </td>
  ```

  ```tsx
  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
    No rows match the current filters
  </td>
  ```

- [ ] **Step 5: Verify visually**

  Run `npm run dev` and navigate to `/platform/customers`. Confirm:
  - "Source" column header appears between "Valid To" and the actions column
  - Subscript rows show "Subscript"
  - BigQuery-derived rows show e.g. "BigQuery pre-subscription"
  - Legacy rows (no source) show "—" in muted text

- [ ] **Step 6: Type-check and commit**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no errors.

  ```bash
  git add src/app/platform/customers/page.tsx
  git commit -m "feat: add Source column to Customers table"
  ```
