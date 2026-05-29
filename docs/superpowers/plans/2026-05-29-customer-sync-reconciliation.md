# Customer Sync BigQuery Reconciliation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the naive `applyTrialDates` + trial→subscription-closing logic with a `reconcileBigQueryDates` function that correctly positions BigQuery-derived customer records relative to gold-standard Subscript ranges, handling pre-subscription trials, gap-fills, and post-subscription continuations.

**Architecture:** A pure, injectable `reconcileBigQueryDates` function in its own module computes which Customer records to emit for a given org+module based on BigQuery date evidence and existing Subscript records. `sync-customers.ts` calls it after all Subscript rows are in place, replacing both `applyTrialDates` and the trial→subscription closing step. A `source` string field is added to every Customer record describing how it was derived.

**Tech Stack:** TypeScript, Vitest (test runner: `npm test`)

---

## Reconciliation Rules (reference)

Subscript records are the gold standard. BigQuery provides `first_date` and `last_date` per org.

**Effective BigQuery end date:**
- If `last_date >= today - 7 days` → `bq_end = null` (still active)
- Otherwise → `bq_end = last_date`
- For comparisons, use `bq_end_eff = bq_end ?? '9999-12-31'`

**Cases (per org+module, relative to union of Subscript ranges):**

| Case | Condition | Output |
|---|---|---|
| No Subscript records | — | 1 trial record, `source: 'bigquery:trial'` |
| Pre-subscript | `bq_start < first_sub.valid_from` | Trial: `[bq_start, first_sub.valid_from - 1]`, `source: 'bigquery:pre-subscript'` |
| Straddles all Subscript | pre-condition AND `bq_end_eff > last_sub.valid_to_eff` | Trial (pre) + post-sub record (see below) |
| Entirely inside | `bq_start >= first_sub.valid_from` AND `bq_end_eff <= last_sub.valid_to_eff` | Empty — exclude |
| Starts inside, ends after | `bq_start >= first_sub.valid_from` AND `bq_end_eff > last_sub.valid_to_eff` | 1 post-sub record |
| Entirely after | `bq_start > last_sub.valid_to_eff` | 1 post-sub record |
| Gap-fill | BQ range fully spans a gap between two consecutive Subscript records (`bq_start <= gap_start AND bq_end_eff >= gap_end`) | 1 record per spanned gap, full gap boundaries |

**Post-subscript records:** `valid_from = last_sub.valid_to + 1`, `valid_to = bq_end`, `contract_type` inherited from last Subscript record.

**Gap-fill records:** `valid_from = prev_sub.valid_to + 1`, `valid_to = next_sub.valid_from - 1`, `contract_type` inherited from `prev_sub`.

**`source` field values:**
- `'subscript'` — came directly from a Subscript subscription
- `'bigquery:trial'` — new trial, no Subscript record exists for this org+module
- `'bigquery:pre-subscript'` — trial period before first Subscript range
- `'bigquery:post-subscript'` — usage after latest Subscript valid_to
- `'bigquery:gap-fill'` — fills a gap between two Subscript ranges

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/types.ts` | Modify | Add `source?: string` to `Customer` |
| `src/lib/reconcile-bigquery-dates.ts` | Create | Pure reconciliation function |
| `src/lib/__tests__/reconcile-bigquery-dates.test.ts` | Create | Unit tests for reconciliation logic |
| `src/lib/sync-customers.ts` | Modify | Wire up new function; add `source` to Subscript rows; drop trial/lost_trial for subscript-known orgs; remove `applyTrialDates` |

---

## Task 1: Add `source` to Customer type

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add `source` field to `Customer` interface**

In `src/lib/types.ts`, update `Customer`:

```typescript
export interface Customer {
  org_id: string
  name: string
  module: Module
  valid_from: string   // YYYY-MM-DD
  valid_to: string | null
  contract_type: ContractType
  source?: string
}
```

- [ ] **Step 2: Verify type check passes**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add source field to Customer type"
```

---

## Task 2: Create `reconcileBigQueryDates` function

**Files:**
- Create: `src/lib/reconcile-bigquery-dates.ts`

- [ ] **Step 1: Create the file with helpers and function signature**

Create `src/lib/reconcile-bigquery-dates.ts`:

```typescript
import type { Customer, ContractType, Module } from './types'

export interface BigQueryRange {
  first_date: string  // YYYY-MM-DD
  last_date: string   // YYYY-MM-DD
}

export interface ReconcileParams {
  org_id: string
  module: Module
  name: string
  bqRange: BigQueryRange
  subscriptRecords: Customer[]
  today: string  // YYYY-MM-DD — injected so tests are deterministic
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

export function reconcileBigQueryDates(params: ReconcileParams): Customer[] {
  const { org_id, module, name, bqRange, subscriptRecords, today } = params

  // Determine effective BQ end: null if data is recent (within 7 days of today)
  const bq_end: string | null =
    daysBetween(bqRange.last_date, today) <= 7 ? null : bqRange.last_date
  const bq_end_eff = bq_end ?? '9999-12-31'
  const bq_start = bqRange.first_date

  const make = (
    valid_from: string,
    valid_to: string | null,
    contract_type: ContractType,
    source: string
  ): Customer => ({ org_id, name, module, valid_from, valid_to, contract_type, source })

  // No Subscript records — plain trial
  if (subscriptRecords.length === 0) {
    return [make(bq_start, bq_end, 'trial', 'bigquery:trial')]
  }

  const sorted = [...subscriptRecords].sort((a, b) => a.valid_from.localeCompare(b.valid_from))
  const first_sub = sorted[0]
  const last_sub = sorted[sorted.length - 1]
  const last_sub_valid_to_eff = last_sub.valid_to ?? '9999-12-31'

  const result: Customer[] = []

  // Pre-subscript portion
  if (bq_start < first_sub.valid_from) {
    const pre_end = addDays(first_sub.valid_from, -1)
    result.push(make(bq_start, pre_end, 'trial', 'bigquery:pre-subscript'))
  }

  // Gap-fill: check each consecutive pair of Subscript records
  for (let i = 0; i < sorted.length - 1; i++) {
    const prev = sorted[i]
    const next = sorted[i + 1]
    if (!prev.valid_to) continue  // open-ended sub — no gap possible
    const gap_start = addDays(prev.valid_to, 1)
    const gap_end = addDays(next.valid_from, -1)
    if (gap_start > gap_end) continue  // adjacent records, no gap
    if (bq_start <= gap_start && bq_end_eff >= gap_end) {
      result.push(make(gap_start, gap_end, prev.contract_type, 'bigquery:gap-fill'))
    }
  }

  // Post-subscript portion
  if (bq_end_eff > last_sub_valid_to_eff) {
    if (!last_sub.valid_to) return result  // last sub is open-ended — can't be post-subscript
    const post_start = addDays(last_sub.valid_to, 1)
    result.push(make(post_start, bq_end, last_sub.contract_type, 'bigquery:post-subscript'))
  }

  return result
}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: no errors

---

## Task 3: Write and run tests for `reconcileBigQueryDates`

**Files:**
- Create: `src/lib/__tests__/reconcile-bigquery-dates.test.ts`

- [ ] **Step 1: Create test file**

Create `src/lib/__tests__/reconcile-bigquery-dates.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { reconcileBigQueryDates } from '../reconcile-bigquery-dates'
import type { Customer } from '../types'

const TODAY = '2026-05-29'

function sub(
  valid_from: string,
  valid_to: string | null,
  contract_type: Customer['contract_type'] = 'consumption'
): Customer {
  return {
    org_id: 'org1',
    name: 'Test Org',
    module: 'kwo-snowflake',
    valid_from,
    valid_to,
    contract_type,
    source: 'subscript',
  }
}

function bq(first_date: string, last_date: string) {
  return { first_date, last_date }
}

describe('reconcileBigQueryDates — no Subscript records', () => {
  it('returns a single trial record', () => {
    const result = reconcileBigQueryDates({
      org_id: 'org1', module: 'kwo-snowflake', name: 'Test Org',
      bqRange: bq('2023-01-01', '2026-05-28'),
      subscriptRecords: [],
      today: TODAY,
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      contract_type: 'trial',
      source: 'bigquery:trial',
      valid_from: '2023-01-01',
      valid_to: null,  // last_date is recent
    })
  })

  it('sets valid_to when last_date is stale (>7 days old)', () => {
    const result = reconcileBigQueryDates({
      org_id: 'org1', module: 'kwo-snowflake', name: 'Test Org',
      bqRange: bq('2023-01-01', '2024-01-01'),
      subscriptRecords: [],
      today: TODAY,
    })
    expect(result[0].valid_to).toBe('2024-01-01')
  })
})

describe('reconcileBigQueryDates — pre-subscript', () => {
  it('BQ starts before Subscript, ends before Subscript end → trial truncated at sub start - 1', () => {
    const result = reconcileBigQueryDates({
      org_id: 'org1', module: 'kwo-snowflake', name: 'Test Org',
      bqRange: bq('2023-01-01', '2023-06-01'),
      subscriptRecords: [sub('2023-08-21', '2026-08-20')],
      today: TODAY,
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      contract_type: 'trial',
      source: 'bigquery:pre-subscript',
      valid_from: '2023-01-01',
      valid_to: '2023-08-20',  // sub.valid_from - 1
    })
  })
})

describe('reconcileBigQueryDates — entirely inside', () => {
  it('BQ range fully inside Subscript → no records emitted', () => {
    const result = reconcileBigQueryDates({
      org_id: 'org1', module: 'kwo-snowflake', name: 'Test Org',
      bqRange: bq('2023-10-25', '2024-01-01'),
      subscriptRecords: [sub('2023-08-21', '2026-08-20')],
      today: TODAY,
    })
    expect(result).toHaveLength(0)
  })
})

describe('reconcileBigQueryDates — straddles', () => {
  it('BQ starts before and ends after all Subscript ranges → trial + post-sub', () => {
    const result = reconcileBigQueryDates({
      org_id: 'org1', module: 'kwo-snowflake', name: 'Test Org',
      bqRange: bq('2023-01-01', '2024-01-01'),
      subscriptRecords: [sub('2023-03-01', '2023-09-30', 'subscription')],
      today: TODAY,
    })
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      contract_type: 'trial',
      source: 'bigquery:pre-subscript',
      valid_from: '2023-01-01',
      valid_to: '2023-02-28',
    })
    expect(result[1]).toMatchObject({
      contract_type: 'subscription',  // inherited from last sub
      source: 'bigquery:post-subscript',
      valid_from: '2023-10-01',
      valid_to: '2024-01-01',
    })
  })
})

describe('reconcileBigQueryDates — starts inside, ends after', () => {
  it('BQ valid_from inside Subscript range, valid_to beyond → single post-sub record', () => {
    const result = reconcileBigQueryDates({
      org_id: 'org1', module: 'kwo-snowflake', name: 'Test Org',
      bqRange: bq('2023-10-01', '2024-06-01'),
      subscriptRecords: [sub('2023-08-21', '2023-12-31', 'consumption')],
      today: TODAY,
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      contract_type: 'consumption',
      source: 'bigquery:post-subscript',
      valid_from: '2024-01-01',
      valid_to: '2024-06-01',
    })
  })
})

describe('reconcileBigQueryDates — entirely after', () => {
  it('BQ starts after all Subscript ranges → single post-sub record from sub_end + 1', () => {
    const result = reconcileBigQueryDates({
      org_id: 'org1', module: 'kwo-snowflake', name: 'Test Org',
      bqRange: bq('2024-03-01', '2026-05-28'),
      subscriptRecords: [sub('2023-01-01', '2024-01-31', 'subscription')],
      today: TODAY,
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      contract_type: 'subscription',
      source: 'bigquery:post-subscript',
      valid_from: '2024-02-01',  // sub.valid_to + 1
      valid_to: null,            // last_date is recent
    })
  })
})

describe('reconcileBigQueryDates — gap-fill', () => {
  it('BQ spans gap between two Subscript records → trial + gap-fill records', () => {
    const result = reconcileBigQueryDates({
      org_id: 'org1', module: 'kwo-snowflake', name: 'Test Org',
      bqRange: bq('2022-12-01', '2024-11-30'),
      subscriptRecords: [
        sub('2023-01-01', '2023-06-30', 'subscription'),
        sub('2023-09-01', '2024-12-31', 'subscription'),
      ],
      today: TODAY,
    })
    // pre-subscript trial + gap-fill; no post-sub (BQ ends inside last sub)
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      contract_type: 'trial',
      source: 'bigquery:pre-subscript',
      valid_from: '2022-12-01',
      valid_to: '2022-12-31',
    })
    expect(result[1]).toMatchObject({
      contract_type: 'subscription',
      source: 'bigquery:gap-fill',
      valid_from: '2023-07-01',
      valid_to: '2023-08-31',
    })
  })

  it('BQ does not span gap (ends before gap end) → no gap-fill', () => {
    const result = reconcileBigQueryDates({
      org_id: 'org1', module: 'kwo-snowflake', name: 'Test Org',
      bqRange: bq('2022-12-01', '2023-07-15'),
      subscriptRecords: [
        sub('2023-01-01', '2023-06-30', 'subscription'),
        sub('2023-09-01', '2024-12-31', 'subscription'),
      ],
      today: TODAY,
    })
    // BQ ends 2023-07-15, gap ends 2023-08-31 — BQ doesn't span the full gap
    const gapFill = result.find((r) => r.source === 'bigquery:gap-fill')
    expect(gapFill).toBeUndefined()
  })

  it('open-ended Subscript record (valid_to null) produces no gap after it', () => {
    const result = reconcileBigQueryDates({
      org_id: 'org1', module: 'kwo-snowflake', name: 'Test Org',
      bqRange: bq('2022-12-01', '2026-05-28'),
      subscriptRecords: [
        sub('2023-01-01', null, 'subscription'),  // open-ended
      ],
      today: TODAY,
    })
    // BQ before sub → pre-subscript trial; no post-sub (open-ended sub covers everything)
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe('bigquery:pre-subscript')
  })
})

describe('reconcileBigQueryDates — active threshold', () => {
  it('last_date exactly 7 days before today → valid_to null (still active)', () => {
    const result = reconcileBigQueryDates({
      org_id: 'org1', module: 'kwo-snowflake', name: 'Test Org',
      bqRange: bq('2023-01-01', '2026-05-22'),  // 7 days before TODAY
      subscriptRecords: [],
      today: TODAY,
    })
    expect(result[0].valid_to).toBeNull()
  })

  it('last_date 8 days before today → valid_to set to last_date', () => {
    const result = reconcileBigQueryDates({
      org_id: 'org1', module: 'kwo-snowflake', name: 'Test Org',
      bqRange: bq('2023-01-01', '2026-05-21'),  // 8 days before TODAY
      subscriptRecords: [],
      today: TODAY,
    })
    expect(result[0].valid_to).toBe('2026-05-21')
  })
})
```

- [ ] **Step 2: Run tests — expect them to fail (implementation exists but verify test file loads)**

```bash
npm test -- reconcile-bigquery-dates
```

Expected: all tests pass (implementation was written in Task 2 before tests — acceptable since reconcile module is new code with no prior behavior)

- [ ] **Step 3: Commit**

```bash
git add src/lib/reconcile-bigquery-dates.ts src/lib/__tests__/reconcile-bigquery-dates.test.ts
git commit -m "feat: add reconcileBigQueryDates with full test coverage"
```

---

## Task 4: Wire `reconcileBigQueryDates` into `sync-customers.ts`

**Files:**
- Modify: `src/lib/sync-customers.ts`

This task makes four changes to `sync-customers.ts`:
1. Add `source: 'subscript'` to all Subscript-derived records (step 6)
2. Expand the drop step to also remove trial/lost_trial rows for Subscript-known orgs (so we can regenerate them cleanly)
3. Capture existing names before the drop so name-preservation still works
4. Replace `applyTrialDates` calls + trial→subscription closing step with `reconcileBigQueryDates`

- [ ] **Step 1: Add import for `reconcileBigQueryDates`**

At the top of `src/lib/sync-customers.ts`, add:

```typescript
import { reconcileBigQueryDates } from './reconcile-bigquery-dates'
```

- [ ] **Step 2: Capture existing names before the drop step**

Locate the comment `// Drop all existing subscription/consumption/churn rows`. Just before it, add:

```typescript
  // Capture names before drop so manual edits survive regeneration
  const existingNameByOrgId = new Map<string, string>(
    customers
      .filter((c) => c.name !== c.org_id)
      .map((c) => [c.org_id, c.name])
  )
```

- [ ] **Step 3: Expand the drop step to include trial/lost_trial for Subscript-known orgs**

Replace the `kept` filter:

```typescript
  const kept = customers.filter(
    (c) =>
      !subscriptOrgIdSet.has(c.org_id) ||
      (c.contract_type !== 'subscription' && c.contract_type !== 'consumption' && c.contract_type !== 'churn')
  )
```

With:

```typescript
  const kept = customers.filter(
    (c) =>
      !subscriptOrgIdSet.has(c.org_id) ||
      (c.contract_type !== 'subscription' &&
        c.contract_type !== 'consumption' &&
        c.contract_type !== 'churn' &&
        c.contract_type !== 'trial' &&
        c.contract_type !== 'lost_trial')
  )
```

- [ ] **Step 4: Add `source: 'subscript'` and use preserved name in the Subscript re-add loop**

In the "Re-add from Subscript" loop (around line 225), replace:

```typescript
      // Use existing name if already present in customers.json, otherwise use Subscript name
      const existingName = customers.find((c) => c.org_id === orgId)?.name ?? name

      customers.push({ org_id: orgId, name: existingName, module, valid_from: validFrom, valid_to: validTo, contract_type: contractType })
```

With:

```typescript
      const existingName = existingNameByOrgId.get(orgId) ?? name
      customers.push({ org_id: orgId, name: existingName, module, valid_from: validFrom, valid_to: validTo, contract_type: contractType, source: 'subscript' })
```

- [ ] **Step 5: Replace `applyTrialDates` calls and trial→subscription closing step**

After step 5 (BigQuery Snowflake query), remove the two `applyTrialDates(...)` calls and the entire "Step 6: close trial → subscription transitions" block.

Replace them with:

```typescript
  // ── Step 6: reconcile BigQuery dates against Subscript ranges ─────────────────
  const allBqDates = [
    ...dbxDates.map((r) => ({ ...r, module: 'kwo-databricks' as const })),
    ...snfDates.map((r) => ({ ...r, module: 'kwo-snowflake' as const })),
  ]
  const syncDate = today()
  for (const { org_id, first_date, last_date, module } of allBqDates) {
    const subscriptRecords = customers.filter(
      (c) => c.org_id === org_id && c.module === module && c.source === 'subscript'
    )
    const name = existingNameByOrgId.get(org_id) ?? customerIdToName.get(
      [...customerIdToOrgId.entries()].find(([, v]) => v === org_id)?.[0] ?? ''
    ) ?? org_id
    const derived = reconcileBigQueryDates({
      org_id,
      module,
      name,
      bqRange: { first_date, last_date },
      subscriptRecords,
      today: syncDate,
    })
    customers.push(...derived)
  }
  log.steps.push(`Reconciled ${allBqDates.length} BigQuery org+module entries`)
```

- [ ] **Step 6: Remove `applyTrialDates` function**

Delete the entire `applyTrialDates` function at the bottom of the file (it is no longer called anywhere).

- [ ] **Step 7: Update lost-trial detection step number comment**

The lost-trial detection step was step 7 — update its comment to `// ── Step 7: lost trial detection` and churn detection to `// ── Step 8: churn detection` and name back-fill to `// ── Step 9: back-fill placeholder names` and persist to `// ── Step 10: persist`.

- [ ] **Step 8: Type check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 9: Run full test suite**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 10: Commit**

```bash
git add src/lib/sync-customers.ts
git commit -m "feat: replace applyTrialDates with reconcileBigQueryDates in customer sync"
```

---

## Self-Review

### Spec coverage

| Rule | Task |
|---|---|
| Per org+module scope | Task 2 (ReconcileParams has `module`) |
| BQ effective end (7-day threshold) | Task 2 (`daysBetween` logic), Task 3 (threshold tests) |
| Pre-subscript → trial | Task 2, Task 3 |
| Straddle → split | Task 2, Task 3 |
| Inside → exclude | Task 2, Task 3 |
| Starts inside, ends after → post-sub | Task 2, Task 3 |
| Entirely after → post-sub from sub_end+1 | Task 2, Task 3 |
| Gap-fill when BQ spans gap | Task 2, Task 3 |
| No gap-fill when BQ doesn't span | Task 3 |
| Inherited contract_type on post-sub/gap-fill | Task 2, Task 3 |
| `source` field on all records | Task 1 (type), Task 2, Task 4 |
| Subscript records get `source: 'subscript'` | Task 4 step 4 |
| Name preservation across regeneration | Task 4 step 2 + step 4 |
| Drop trial/lost_trial for Subscript-known orgs | Task 4 step 3 |
| Lost-trial and churn detection unchanged | Not touched — they follow after step 6 |
| Name back-fill (placeholder → real name) | Already implemented in prior session — untouched |
