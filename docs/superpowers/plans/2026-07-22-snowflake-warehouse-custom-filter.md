# Snowflake Warehouse Custom Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a custom AND/OR filter-condition builder to the Snowflake Warehouse Analysis dashboard, scoped to a static 27-column registry of `query_history_view_tf` fields, applied server-side via parameterized BigQuery SQL to the timeseries and 4 histogram endpoints.

**Architecture:** A static field registry (`src/lib/filterFields.ts`) drives the frontend condition-builder UI and backend validation. A recursive `FilterGroup` tree is compiled client-side-agnostic (pure function `buildFilterWhereClause`) into a parameterized SQL fragment + bound params, which the 5 affected API routes (now POST) splice into a `{{FILTER_CLAUSE}}` marker inside their `.sql` files' query-level CTEs. The 3 usage/cost/cluster-activity charts, which read from non-query-level tables, are structurally exempt and show a static "Filter not applicable" badge when a filter is active.

**Tech Stack:** Next.js App Router route handlers, `@google-cloud/bigquery` parameterized queries, React/TypeScript, existing `Dropdown.tsx` primitive (reused, not duplicated), Vitest/Jest (whichever the repo's existing `__tests__` convention uses — confirmed below).

## Global Constraints

- Field registry is a fixed, static, hand-curated list of 27 entries — no dynamic field-discovery API (`FILTER_FIELDS` in `src/lib/filterFields.ts`).
- No `'dimension'` field-ref variant anywhere — this codebase has no dimensions concept.
- All filter values are bound BigQuery params (`@p_0`, `@p_1`, ...) — never string-interpolated. Only the validated field's SQL column name (looked up from the static registry, never taken from user input directly) is interpolated into SQL text.
- Field keys must be validated against `FILTER_FIELDS` before compiling — unknown key throws.
- The 5 affected routes (`timeseries`, `execution-time-histogram`, `data-scanned-histogram`, `spillage-histogram`, `compile-time-histogram`) switch from `GET` to `POST` to carry the filter tree in the JSON body. `cluster-activity` and `warehouses` routes are unchanged (GET, no filter).
- Filter fragment splices only into query-level CTEs sourced from `query_history_view_tf` (`base` in each histogram SQL, `base` + `run_windows_filtered` in the timeseries SQL). It must NOT touch the `usage` CTE (`warehouse_metering_history_tf`).
- Filter is session-only state (`appliedFilter` in `page.tsx`) — no URL sync, no persistence across reloads.
- Autocomplete values are fetched org-wide (no warehouse/date scoping) via a new `GET /api/kwo-snowflake-warehouse-analysis/distinct-values` route, capped at 200 rows, cached client-side per field for the session.
- BigQuery `NUMERIC`/`BIGNUMERIC` columns must be wrapped in `Number(...)` before returning from API routes (existing repo lesson — none of the new numeric filter fields hit this since filter values pass through as query params, not response fields, but any new response field must still follow this rule).
- Reuse `Dropdown.tsx` (`src/components/filters/Dropdown.tsx`) for the field selector, operator selector, and `IN`/`NOT IN`/autocomplete value pickers — do not build a parallel one-off dropdown.
- Colors in any new UI (badges, panel chrome) must come from the existing Keebo CSS variables per `docs/design-system.md` — no hardcoded hex values.

**Resolved design gap (Query Concurrency CTE):** The timeseries SQL's `run_windows_filtered` CTE (lines 139-150 of `sql/kwo_snowflake_warehouse_analysis_timeseries.sql`) queries `query_history_view_tf` directly, structurally separate from `base`, to compute the Query Concurrency chart's sweep-line aggregation. Since it reads the same filterable table as `base`, the filter fragment is spliced into **both** `base` and `run_windows_filtered`. Query Concurrency is therefore treated as **filter-affected**, not exempt — only Warehouse Usage, Cost per 1000 Queries, and Cluster Activity (all sourced from non-`query_history_view_tf` tables) are exempt.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/types.ts` (modify) | Add `FilterFieldType`, `FilterOperator`, `FilterCondition`, `FilterGroup` types |
| `src/lib/filterFields.ts` (create) | Static 27-entry `FILTER_FIELDS` registry + per-type operator lists |
| `src/lib/filterCompiler.ts` (create) | `buildFilterWhereClause(group)` — recursive AND/OR → parameterized SQL |
| `src/lib/__tests__/filterCompiler.test.ts` (create) | Unit tests for the compiler |
| `sql/kwo_snowflake_warehouse_execution_time_histogram.sql` (modify) | Add `{{FILTER_CLAUSE}}` marker in `base` WHERE |
| `sql/kwo_snowflake_warehouse_compile_time_histogram.sql` (modify) | Same |
| `sql/kwo_snowflake_warehouse_data_scanned_histogram.sql` (modify) | Same |
| `sql/kwo_snowflake_warehouse_spillage_histogram.sql` (modify) | Same |
| `sql/kwo_snowflake_warehouse_analysis_timeseries.sql` (modify) | Add `{{FILTER_CLAUSE}}` marker in `base` and `run_windows_filtered` WHERE clauses |
| `src/lib/histogramRoute.ts` (modify) | Factory switches GET→POST, splices compiled filter fragment into loaded SQL |
| `src/app/api/kwo-snowflake-warehouse-analysis/execution-time-histogram/route.ts` (modify) | `export const GET` → `export const POST` |
| `src/app/api/kwo-snowflake-warehouse-analysis/compile-time-histogram/route.ts` (modify) | Same |
| `src/app/api/kwo-snowflake-warehouse-analysis/data-scanned-histogram/route.ts` (modify) | Same |
| `src/app/api/kwo-snowflake-warehouse-analysis/spillage-histogram/route.ts` (modify) | Same |
| `src/app/api/kwo-snowflake-warehouse-analysis/timeseries/route.ts` (modify) | GET→POST, splices filter into both CTEs |
| `src/app/api/kwo-snowflake-warehouse-analysis/distinct-values/route.ts` (create) | New GET route: org-wide distinct values for one categorical field |
| `src/components/filters/FilterConditionBuilder.tsx` (create) | Recursive AND/OR condition tree editor, reuses `Dropdown` |
| `src/components/filters/FilterPanel.tsx` (create) | Trigger button + slide-down panel, draft/apply/cancel/clear |
| `src/components/filters/WarehouseAnalysisFilters.tsx` (modify) | Mount `FilterPanel` alongside existing filters |
| `src/app/kwo-snowflake-warehouse-analysis/page.tsx` (modify) | `appliedFilter` state, 5 POST-converted fetches, Cluster Activity exemption badge |
| `src/components/charts/WarehouseAnalysisCharts.tsx` (modify) | `filterActive` prop, exemption badge on Warehouse Usage + Cost per 1000 Queries |
| `src/components/charts/TimeSeriesCharts.tsx` (modify) | `ChartWrapper` gets optional `notApplicable?: boolean` prop rendering a badge |
| `src/components/charts/__tests__/WarehouseAnalysisCharts.test.tsx` (modify) | Extend for `filterActive` prop |
| `src/components/filters/__tests__/FilterConditionBuilder.test.tsx` (create) | Component tests |
| `src/components/filters/__tests__/FilterPanel.test.tsx` (create) | Component tests |

Before Task 1, confirm the test runner:

- [ ] **Step 0: Confirm test runner and existing test file conventions**

Run: `cat package.json | grep -A2 '"test"'`
Expected: a `test` script (e.g. `vitest` or `jest`). Use whichever is present; all test code below is written in a runner-agnostic style (`describe`/`it`/`expect`) that works with both.

---

### Task 1: Filter data model types

**Files:**
- Modify: `src/lib/types.ts`

**Interfaces:**
- Produces: `FilterFieldType`, `FilterOperator`, `FilterCondition`, `FilterGroup` — consumed by Task 2 (`filterFields.ts`), Task 3 (`filterCompiler.ts`), and all frontend/route tasks.

- [ ] **Step 1: Append the filter types to `src/lib/types.ts`**

Add at the end of the file:

```ts
export type FilterFieldType = 'string' | 'number' | 'boolean'

export type FilterOperator =
  | '='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'contains'
  | 'starts with'
  | 'ends with'
  | 'IN'
  | 'NOT IN'
  | 'is null'
  | 'is not null'

export interface FilterCondition {
  id: string
  field: string
  operator: FilterOperator
  value: string | string[]
}

export interface FilterGroup {
  id: string
  match: 'AND' | 'OR'
  conditions: (FilterCondition | FilterGroup)[]
}

export function isFilterGroup(node: FilterCondition | FilterGroup): node is FilterGroup {
  return 'match' in node
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add filter condition/group types"
```

---

### Task 2: Static field registry

**Files:**
- Create: `src/lib/filterFields.ts`

**Interfaces:**
- Consumes: `FilterFieldType`, `FilterOperator` from `src/lib/types.ts` (Task 1)
- Produces: `FILTER_FIELDS: Record<string, FilterFieldDef>`, `FilterFieldDef` interface, `OPERATORS_BY_TYPE: Record<FilterFieldType, FilterOperator[]>`, `FIELD_SECTIONS: { label: string; keys: string[] }[]` — consumed by Task 3 (`filterCompiler.ts`), Task 7 (distinct-values route), Task 9 (`FilterConditionBuilder.tsx`).

- [ ] **Step 1: Write `src/lib/filterFields.ts`**

```ts
import type { FilterFieldType, FilterOperator } from './types'

export interface FilterFieldDef {
  label: string
  column: string
  type: FilterFieldType
  autocomplete?: boolean
}

export const FILTER_FIELDS: Record<string, FilterFieldDef> = {
  query_type: { label: 'Query Type', column: 'QUERY_TYPE', type: 'string', autocomplete: true },
  execution_status: { label: 'Execution Status', column: 'EXECUTION_STATUS', type: 'string', autocomplete: true },
  error_code: { label: 'Error Code', column: 'ERROR_CODE', type: 'string', autocomplete: true },
  error_message: { label: 'Error Message', column: 'ERROR_MESSAGE', type: 'string' },
  database_name: { label: 'Database Name', column: 'DATABASE_NAME', type: 'string', autocomplete: true },
  warehouse_size: { label: 'Warehouse Size', column: 'WAREHOUSE_SIZE', type: 'string', autocomplete: true },
  warehouse_type: { label: 'Warehouse Type', column: 'WAREHOUSE_TYPE', type: 'string', autocomplete: true },
  query_tag: { label: 'Query Tag', column: 'QUERY_TAG', type: 'string', autocomplete: true },
  is_client_generated: {
    label: 'Client-Generated Statement',
    column: 'IS_CLIENT_GENERATED_STATEMENT',
    type: 'boolean',
  },
  hash_user_name: { label: 'User (hashed)', column: 'HASH_USER_NAME', type: 'string' },
  hash_role_name: { label: 'Role (hashed)', column: 'HASH_ROLE_NAME', type: 'string' },
  total_elapsed_time: { label: 'Total Elapsed Time', column: 'TOTAL_ELAPSED_TIME', type: 'number' },
  execution_time: { label: 'Execution Time', column: 'EXECUTION_TIME', type: 'number' },
  compilation_time: { label: 'Compilation Time', column: 'COMPILATION_TIME', type: 'number' },
  bytes_scanned: { label: 'Bytes Scanned', column: 'BYTES_SCANNED', type: 'number' },
  bytes_written: { label: 'Bytes Written', column: 'BYTES_WRITTEN', type: 'number' },
  rows_produced: { label: 'Rows Produced', column: 'ROWS_PRODUCED', type: 'number' },
  rows_inserted: { label: 'Rows Inserted', column: 'ROWS_INSERTED', type: 'number' },
  rows_updated: { label: 'Rows Updated', column: 'ROWS_UPDATED', type: 'number' },
  rows_deleted: { label: 'Rows Deleted', column: 'ROWS_DELETED', type: 'number' },
  partitions_scanned: { label: 'Partitions Scanned', column: 'PARTITIONS_SCANNED', type: 'number' },
  partitions_total: { label: 'Partitions Total', column: 'PARTITIONS_TOTAL', type: 'number' },
  bytes_spilled_local: {
    label: 'Bytes Spilled (Local)',
    column: 'BYTES_SPILLED_TO_LOCAL_STORAGE',
    type: 'number',
  },
  bytes_spilled_remote: {
    label: 'Bytes Spilled (Remote)',
    column: 'BYTES_SPILLED_TO_REMOTE_STORAGE',
    type: 'number',
  },
  queued_provisioning_time: {
    label: 'Queued Provisioning Time',
    column: 'QUEUED_PROVISIONING_TIME',
    type: 'number',
  },
  queued_repair_time: { label: 'Queued Repair Time', column: 'QUEUED_REPAIR_TIME', type: 'number' },
  queued_overload_time: { label: 'Queued Overload Time', column: 'QUEUED_OVERLOAD_TIME', type: 'number' },
  credits_used_cloud_services: {
    label: 'Credits Used (Cloud Services)',
    column: 'CREDITS_USED_CLOUD_SERVICES',
    type: 'number',
  },
  query_load_percent: { label: 'Query Load %', column: 'QUERY_LOAD_PERCENT', type: 'number' },
  pct_scanned_from_cache: {
    label: '% Scanned From Cache',
    column: 'PERCENTAGE_SCANNED_FROM_CACHE',
    type: 'number',
  },
}

export const OPERATORS_BY_TYPE: Record<FilterFieldType, FilterOperator[]> = {
  string: ['=', '!=', 'contains', 'starts with', 'ends with', 'IN', 'NOT IN', 'is null', 'is not null'],
  number: ['=', '!=', '<', '<=', '>', '>=', 'is null', 'is not null'],
  boolean: ['='],
}

export const FIELD_SECTIONS: { label: string; keys: string[] }[] = [
  {
    label: 'Query Info',
    keys: [
      'query_type',
      'execution_status',
      'error_code',
      'error_message',
      'database_name',
      'warehouse_size',
      'warehouse_type',
      'query_tag',
      'is_client_generated',
      'hash_user_name',
      'hash_role_name',
    ],
  },
  {
    label: 'Performance',
    keys: [
      'total_elapsed_time',
      'execution_time',
      'compilation_time',
      'queued_provisioning_time',
      'queued_repair_time',
      'queued_overload_time',
      'query_load_percent',
      'credits_used_cloud_services',
    ],
  },
  {
    label: 'Data Volume',
    keys: [
      'bytes_scanned',
      'bytes_written',
      'rows_produced',
      'rows_inserted',
      'rows_updated',
      'rows_deleted',
      'partitions_scanned',
      'partitions_total',
      'bytes_spilled_local',
      'bytes_spilled_remote',
      'pct_scanned_from_cache',
    ],
  },
]
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/filterFields.ts
git commit -m "feat: add static filter field registry"
```

---

### Task 3: Filter compiler + unit tests

**Files:**
- Create: `src/lib/filterCompiler.ts`
- Test: `src/lib/__tests__/filterCompiler.test.ts`

**Interfaces:**
- Consumes: `FilterGroup`, `FilterCondition`, `isFilterGroup` from `src/lib/types.ts`; `FILTER_FIELDS` from `src/lib/filterFields.ts`.
- Produces: `buildFilterWhereClause(group: FilterGroup): { sql: string; params: Record<string, unknown>; types: Record<string, string> }` — consumed by Task 5 (`histogramRoute.ts`) and Task 8 (`timeseries/route.ts`).
  - `sql` is either `''` (no filter) or a bare boolean expression (no leading `AND`/`WHERE`) — callers splice it as `AND (${sql})` when non-empty.
  - `params` keys are `p_0`, `p_1`, ... in the order conditions are visited (depth-first).
  - `types` maps each param key to a BigQuery `types` hint (`'STRING'`, `'INT64'`, `'FLOAT64'`, `'BOOL'`, or `'STRING'`/repeated array type as `['STRING']` for `IN`/`NOT IN`) — needed because `runQuery`'s `bigquery.query({ params, types })` call requires explicit array-element types for `UNNEST`-free `IN (...)` lists when the array could be empty; non-empty lists are inferred fine, so `types` is only populated for empty-value edge cases. In practice this repo's `runQuery` signature only accepts a single merged `types` object (see `src/lib/bigquery.ts` — currently only `org_ids: ['STRING']` is set); Task 5/8 must merge the compiler's `types` output into the existing static `types` object passed to `bigquery.query`.

- [ ] **Step 1: Write the failing test file `src/lib/__tests__/filterCompiler.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { buildFilterWhereClause } from '../filterCompiler'
import type { FilterGroup } from '../types'

const emptyGroup: FilterGroup = { id: 'root', match: 'AND', conditions: [] }

describe('buildFilterWhereClause', () => {
  it('returns empty sql and params for an empty group', () => {
    const result = buildFilterWhereClause(emptyGroup)
    expect(result).toEqual({ sql: '', params: {}, types: {} })
  })

  it('compiles a single string equality condition', () => {
    const group: FilterGroup = {
      id: 'root',
      match: 'AND',
      conditions: [{ id: 'c1', field: 'query_type', operator: '=', value: 'SELECT' }],
    }
    const result = buildFilterWhereClause(group)
    expect(result.sql).toBe('QUERY_TYPE = @p_0')
    expect(result.params).toEqual({ p_0: 'SELECT' })
  })

  it('compiles a numeric comparison condition', () => {
    const group: FilterGroup = {
      id: 'root',
      match: 'AND',
      conditions: [{ id: 'c1', field: 'execution_time', operator: '>=', value: '1000' }],
    }
    const result = buildFilterWhereClause(group)
    expect(result.sql).toBe('EXECUTION_TIME >= @p_0')
    expect(result.params).toEqual({ p_0: 1000 })
  })

  it('compiles a boolean equality condition', () => {
    const group: FilterGroup = {
      id: 'root',
      match: 'AND',
      conditions: [{ id: 'c1', field: 'is_client_generated', operator: '=', value: 'true' }],
    }
    const result = buildFilterWhereClause(group)
    expect(result.sql).toBe('IS_CLIENT_GENERATED_STATEMENT = @p_0')
    expect(result.params).toEqual({ p_0: true })
  })

  it('compiles contains/starts with/ends with as LIKE', () => {
    const contains = buildFilterWhereClause({
      id: 'root',
      match: 'AND',
      conditions: [{ id: 'c1', field: 'error_message', operator: 'contains', value: 'timeout' }],
    })
    expect(contains.sql).toBe('ERROR_MESSAGE LIKE @p_0')
    expect(contains.params).toEqual({ p_0: '%timeout%' })

    const startsWith = buildFilterWhereClause({
      id: 'root',
      match: 'AND',
      conditions: [{ id: 'c1', field: 'error_message', operator: 'starts with', value: 'timeout' }],
    })
    expect(startsWith.params).toEqual({ p_0: 'timeout%' })

    const endsWith = buildFilterWhereClause({
      id: 'root',
      match: 'AND',
      conditions: [{ id: 'c1', field: 'error_message', operator: 'ends with', value: 'timeout' }],
    })
    expect(endsWith.params).toEqual({ p_0: '%timeout' })
  })

  it('compiles IN with a list value', () => {
    const group: FilterGroup = {
      id: 'root',
      match: 'AND',
      conditions: [{ id: 'c1', field: 'query_type', operator: 'IN', value: ['SELECT', 'INSERT'] }],
    }
    const result = buildFilterWhereClause(group)
    expect(result.sql).toBe('QUERY_TYPE IN UNNEST(@p_0)')
    expect(result.params).toEqual({ p_0: ['SELECT', 'INSERT'] })
  })

  it('compiles NOT IN with a list value', () => {
    const group: FilterGroup = {
      id: 'root',
      match: 'AND',
      conditions: [{ id: 'c1', field: 'query_type', operator: 'NOT IN', value: ['SELECT'] }],
    }
    const result = buildFilterWhereClause(group)
    expect(result.sql).toBe('QUERY_TYPE NOT IN UNNEST(@p_0)')
  })

  it('compiles is null / is not null with no bound param', () => {
    const isNull = buildFilterWhereClause({
      id: 'root',
      match: 'AND',
      conditions: [{ id: 'c1', field: 'error_code', operator: 'is null', value: '' }],
    })
    expect(isNull.sql).toBe('ERROR_CODE IS NULL')
    expect(isNull.params).toEqual({})

    const isNotNull = buildFilterWhereClause({
      id: 'root',
      match: 'AND',
      conditions: [{ id: 'c1', field: 'error_code', operator: 'is not null', value: '' }],
    })
    expect(isNotNull.sql).toBe('ERROR_CODE IS NOT NULL')
  })

  it('combines multiple conditions with AND', () => {
    const group: FilterGroup = {
      id: 'root',
      match: 'AND',
      conditions: [
        { id: 'c1', field: 'query_type', operator: '=', value: 'SELECT' },
        { id: 'c2', field: 'execution_time', operator: '>', value: '500' },
      ],
    }
    const result = buildFilterWhereClause(group)
    expect(result.sql).toBe('(QUERY_TYPE = @p_0 AND EXECUTION_TIME > @p_1)')
    expect(result.params).toEqual({ p_0: 'SELECT', p_1: 500 })
  })

  it('combines multiple conditions with OR', () => {
    const group: FilterGroup = {
      id: 'root',
      match: 'OR',
      conditions: [
        { id: 'c1', field: 'query_type', operator: '=', value: 'SELECT' },
        { id: 'c2', field: 'query_type', operator: '=', value: 'INSERT' },
      ],
    }
    const result = buildFilterWhereClause(group)
    expect(result.sql).toBe('(QUERY_TYPE = @p_0 OR QUERY_TYPE = @p_1)')
  })

  it('compiles nested groups recursively', () => {
    const group: FilterGroup = {
      id: 'root',
      match: 'AND',
      conditions: [
        { id: 'c1', field: 'query_type', operator: '=', value: 'SELECT' },
        {
          id: 'g1',
          match: 'OR',
          conditions: [
            { id: 'c2', field: 'error_code', operator: 'is not null', value: '' },
            { id: 'c3', field: 'execution_time', operator: '>', value: '10000' },
          ],
        },
      ],
    }
    const result = buildFilterWhereClause(group)
    expect(result.sql).toBe('(QUERY_TYPE = @p_0 AND (ERROR_CODE IS NOT NULL OR EXECUTION_TIME > @p_1))')
    expect(result.params).toEqual({ p_0: 'SELECT', p_1: 10000 })
  })

  it('throws on an unknown field key', () => {
    const group: FilterGroup = {
      id: 'root',
      match: 'AND',
      conditions: [{ id: 'c1', field: 'not_a_real_field', operator: '=', value: 'x' }],
    }
    expect(() => buildFilterWhereClause(group)).toThrow(/unknown filter field/i)
  })

  it('a single-condition nested empty group is dropped (no dangling parens)', () => {
    const group: FilterGroup = {
      id: 'root',
      match: 'AND',
      conditions: [
        { id: 'c1', field: 'query_type', operator: '=', value: 'SELECT' },
        { id: 'g1', match: 'OR', conditions: [] },
      ],
    }
    const result = buildFilterWhereClause(group)
    expect(result.sql).toBe('QUERY_TYPE = @p_0')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/filterCompiler.test.ts` (substitute `jest` if that's the repo's runner per Step 0)
Expected: FAIL — `Cannot find module '../filterCompiler'`

- [ ] **Step 3: Write `src/lib/filterCompiler.ts`**

```ts
import { FILTER_FIELDS } from './filterFields'
import { isFilterGroup, type FilterCondition, type FilterGroup } from './types'

export interface CompiledFilter {
  sql: string
  params: Record<string, unknown>
  types: Record<string, string | string[]>
}

function coerceValue(fieldType: 'string' | 'number' | 'boolean', raw: string): string | number | boolean {
  if (fieldType === 'number') return Number(raw)
  if (fieldType === 'boolean') return raw === 'true' || raw === true
  return raw
}

function compileCondition(
  cond: FilterCondition,
  params: Record<string, unknown>,
  types: Record<string, string | string[]>
): string {
  const def = FILTER_FIELDS[cond.field]
  if (!def) {
    throw new Error(`unknown filter field: ${cond.field}`)
  }

  if (cond.operator === 'is null') return `${def.column} IS NULL`
  if (cond.operator === 'is not null') return `${def.column} IS NOT NULL`

  const paramName = `p_${Object.keys(params).length}`

  if (cond.operator === 'IN' || cond.operator === 'NOT IN') {
    const values = (Array.isArray(cond.value) ? cond.value : [cond.value]).map((v) => coerceValue(def.type, v))
    params[paramName] = values
    const bqType = def.type === 'number' ? 'FLOAT64' : def.type === 'boolean' ? 'BOOL' : 'STRING'
    types[paramName] = [bqType]
    return `${def.column} ${cond.operator} UNNEST(@${paramName})`
  }

  const rawValue = Array.isArray(cond.value) ? cond.value[0] ?? '' : cond.value

  if (cond.operator === 'contains' || cond.operator === 'starts with' || cond.operator === 'ends with') {
    const pattern =
      cond.operator === 'contains'
        ? `%${rawValue}%`
        : cond.operator === 'starts with'
          ? `${rawValue}%`
          : `%${rawValue}`
    params[paramName] = pattern
    return `${def.column} LIKE @${paramName}`
  }

  params[paramName] = coerceValue(def.type, rawValue)
  return `${def.column} ${cond.operator} @${paramName}`
}

function compileGroup(
  group: FilterGroup,
  params: Record<string, unknown>,
  types: Record<string, string | string[]>
): string {
  const parts = group.conditions
    .map((node) => (isFilterGroup(node) ? compileGroup(node, params, types) : compileCondition(node, params, types)))
    .filter((s) => s.length > 0)

  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  return `(${parts.join(` ${group.match} `)})`
}

export function buildFilterWhereClause(group: FilterGroup): CompiledFilter {
  const params: Record<string, unknown> = {}
  const types: Record<string, string | string[]> = {}
  const sql = compileGroup(group, params, types)
  return { sql, params, types }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/filterCompiler.test.ts`
Expected: PASS (all cases)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/filterCompiler.ts src/lib/__tests__/filterCompiler.test.ts
git commit -m "feat: add recursive AND/OR filter compiler with tests"
```

---

### Task 4: Add `{{FILTER_CLAUSE}}` marker to the 4 histogram SQL files

**Files:**
- Modify: `sql/kwo_snowflake_warehouse_execution_time_histogram.sql`
- Modify: `sql/kwo_snowflake_warehouse_compile_time_histogram.sql`
- Modify: `sql/kwo_snowflake_warehouse_data_scanned_histogram.sql`
- Modify: `sql/kwo_snowflake_warehouse_spillage_histogram.sql`

**Interfaces:**
- Produces: literal marker string `{{FILTER_CLAUSE}}` inside each file's `base` CTE WHERE clause — consumed by Task 5 (`histogramRoute.ts`'s string-replace splice).

All 4 files share the identical `base` CTE structure:

```sql
WITH base AS (
  ...
  FROM `keebo-portal.k3o_prd_ORGID_000_tf.query_history_view_tf`
  WHERE warehouse_name = @warehouse_name
    AND start_time >= UNIX_MILLIS(TIMESTAMP(@start_date))
    AND start_time <= UNIX_MILLIS(TIMESTAMP(@end_date))
    {{FILTER_CLAUSE}}
),
```

- [ ] **Step 1: Add the marker line to `kwo_snowflake_warehouse_execution_time_histogram.sql`**

Find:
```sql
  WHERE warehouse_name = @warehouse_name
    AND start_time >= UNIX_MILLIS(TIMESTAMP(@start_date))
    AND start_time <= UNIX_MILLIS(TIMESTAMP(@end_date))
),
```
Replace with:
```sql
  WHERE warehouse_name = @warehouse_name
    AND start_time >= UNIX_MILLIS(TIMESTAMP(@start_date))
    AND start_time <= UNIX_MILLIS(TIMESTAMP(@end_date))
    {{FILTER_CLAUSE}}
),
```

- [ ] **Step 2: Apply the identical edit to `kwo_snowflake_warehouse_compile_time_histogram.sql`, `kwo_snowflake_warehouse_data_scanned_histogram.sql`, `kwo_snowflake_warehouse_spillage_histogram.sql`**

Same find/replace as Step 1 in each of the 3 remaining files (confirmed identical WHERE-clause structure by direct inspection).

- [ ] **Step 3: Verify the marker is present in all 4 files**

Run: `grep -l "{{FILTER_CLAUSE}}" sql/kwo_snowflake_warehouse_*histogram.sql`
Expected: all 4 filenames printed.

- [ ] **Step 4: Commit**

```bash
git add sql/kwo_snowflake_warehouse_execution_time_histogram.sql sql/kwo_snowflake_warehouse_compile_time_histogram.sql sql/kwo_snowflake_warehouse_data_scanned_histogram.sql sql/kwo_snowflake_warehouse_spillage_histogram.sql
git commit -m "feat: add filter clause marker to histogram SQL base CTEs"
```

---

### Task 5: Convert `histogramRoute.ts` factory to POST + splice filter

**Files:**
- Modify: `src/lib/histogramRoute.ts`

**Interfaces:**
- Consumes: `buildFilterWhereClause` from `src/lib/filterCompiler.ts` (Task 3); `FilterGroup` from `src/lib/types.ts` (Task 1); `{{FILTER_CLAUSE}}` marker from Task 4.
- Produces: `createHistogramRouteHandler(sqlFile, logTag)` now returns a `POST` handler reading `{ org_id, warehouse_name, start_date, end_date, filter_conditions }` from the JSON body — consumed by Task 6 (4 route.ts files).

- [ ] **Step 1: Rewrite `src/lib/histogramRoute.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { runQuery, AdcAuthError, ORG_ID_PATTERN, loadOrgScopedSql } from '@/lib/bigquery'
import { buildFilterWhereClause } from '@/lib/filterCompiler'
import type { HistogramBucket, HistogramResponse, FilterGroup } from '@/lib/types'

interface HistogramRow {
  bucket_label: string
  bucket_order: number
  query_count: number
}

interface HistogramRequestBody {
  org_id: string
  warehouse_name: string
  start_date: string
  end_date: string
  filter_conditions?: FilterGroup
}

export function createHistogramRouteHandler(sqlFile: string, logTag: string) {
  return async function POST(request: NextRequest) {
    const body = (await request.json()) as Partial<HistogramRequestBody>
    const { org_id: orgId, warehouse_name: warehouseName, start_date: startDate, end_date: endDate, filter_conditions: filterConditions } = body

    if (!orgId || !warehouseName || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'org_id, warehouse_name, start_date, and end_date are required' },
        { status: 400 }
      )
    }
    if (!ORG_ID_PATTERN.test(orgId)) {
      return NextResponse.json({ error: 'invalid org_id' }, { status: 400 })
    }

    try {
      let sql = loadOrgScopedSql(sqlFile, orgId)
      let filterParams: Record<string, unknown> = {}
      let filterTypes: Record<string, string | string[]> = {}

      if (filterConditions) {
        const compiled = buildFilterWhereClause(filterConditions)
        filterParams = compiled.params
        filterTypes = compiled.types
        sql = sql.replace('{{FILTER_CLAUSE}}', compiled.sql ? `AND (${compiled.sql})` : '')
      } else {
        sql = sql.replace('{{FILTER_CLAUSE}}', '')
      }

      const rows = await runQuery<HistogramRow>(
        sql,
        {
          warehouse_name: warehouseName,
          start_date: `${startDate} 00:00:00`,
          end_date: `${endDate} 23:59:59`,
          ...filterParams,
        },
        filterTypes
      )

      const buckets: HistogramBucket[] = rows
        .sort((a, b) => a.bucket_order - b.bucket_order)
        .map((r) => ({ bucket_label: r.bucket_label, query_count: Number(r.query_count) }))

      const response: HistogramResponse = { buckets }
      return NextResponse.json(response)
    } catch (err) {
      console.error(`[${logTag}]`, err)
      if (err instanceof AdcAuthError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: 401 })
      }
      return NextResponse.json({ error: String(err) }, { status: 500 })
    }
  }
}
```

Note: this calls `runQuery(sql, params, types)` with a 3rd argument. Task 5a below updates `runQuery`'s signature to accept it.

- [ ] **Step 2: Update `runQuery` in `src/lib/bigquery.ts` to accept an optional `types` argument**

Find:
```ts
export async function runQuery<T>(query: string, params: Record<string, unknown>): Promise<T[]> {
  try {
    const [rows] = await bigquery.query({
      query,
      params,
      location: LOCATION,
      types: {
        org_ids: ['STRING'],
      },
    })
    return rows as T[]
  } catch (err) {
```
Replace with:
```ts
export async function runQuery<T>(
  query: string,
  params: Record<string, unknown>,
  extraTypes: Record<string, string | string[]> = {}
): Promise<T[]> {
  try {
    const [rows] = await bigquery.query({
      query,
      params,
      location: LOCATION,
      types: {
        org_ids: ['STRING'],
        ...extraTypes,
      },
    })
    return rows as T[]
  } catch (err) {
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/histogramRoute.ts src/lib/bigquery.ts
git commit -m "feat: convert histogram route factory to POST with filter splicing"
```

---

### Task 6: Convert the 4 histogram `route.ts` files from GET to POST

**Files:**
- Modify: `src/app/api/kwo-snowflake-warehouse-analysis/execution-time-histogram/route.ts`
- Modify: `src/app/api/kwo-snowflake-warehouse-analysis/compile-time-histogram/route.ts`
- Modify: `src/app/api/kwo-snowflake-warehouse-analysis/data-scanned-histogram/route.ts`
- Modify: `src/app/api/kwo-snowflake-warehouse-analysis/spillage-histogram/route.ts`

**Interfaces:**
- Consumes: `createHistogramRouteHandler` from `src/lib/histogramRoute.ts` (Task 5), now returning a POST handler.

- [ ] **Step 1: Update `execution-time-histogram/route.ts`**

Find:
```ts
export const GET = createHistogramRouteHandler(
```
Replace with:
```ts
export const POST = createHistogramRouteHandler(
```

- [ ] **Step 2: Apply the identical one-line edit to the other 3 route files**

Same `GET` → `POST` rename in `compile-time-histogram/route.ts`, `data-scanned-histogram/route.ts`, `spillage-histogram/route.ts`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/kwo-snowflake-warehouse-analysis/execution-time-histogram/route.ts src/app/api/kwo-snowflake-warehouse-analysis/compile-time-histogram/route.ts src/app/api/kwo-snowflake-warehouse-analysis/data-scanned-histogram/route.ts src/app/api/kwo-snowflake-warehouse-analysis/spillage-histogram/route.ts
git commit -m "feat: switch histogram routes to POST"
```

---

### Task 7: New distinct-values API route (autocomplete)

**Files:**
- Create: `src/app/api/kwo-snowflake-warehouse-analysis/distinct-values/route.ts`
- Modify: `src/lib/bigquery.ts` (add `getDistinctFieldValues` helper)

**Interfaces:**
- Consumes: `FILTER_FIELDS` from `src/lib/filterFields.ts` (Task 2); `ORG_ID_PATTERN`, `runQuery` from `src/lib/bigquery.ts`.
- Produces: `GET /api/kwo-snowflake-warehouse-analysis/distinct-values?org_id=...&field=...` → `{ values: string[] }` — consumed by Task 9 (`FilterConditionBuilder.tsx`).

- [ ] **Step 1: Add `getDistinctFieldValues` to `src/lib/bigquery.ts`**

Add near `getWarehousesForOrg`:

```ts
export async function getDistinctFieldValues(orgId: string, column: string): Promise<string[]> {
  const query = `
    SELECT DISTINCT ${column} AS value
    FROM \`${PROJECT}.k3o_prd_${orgId}_000_tf.query_history_view_tf\`
    WHERE ${column} IS NOT NULL
    LIMIT 200
  `
  const rows = await runQuery<{ value: string }>(query, {})
  return rows.map((r) => String(r.value))
}
```

Note: `column` is never taken from raw user input — the route handler (Step 2) resolves it via a registry lookup keyed by a validated `field` key, so no SQL injection surface exists despite the interpolation.

- [ ] **Step 2: Write `src/app/api/kwo-snowflake-warehouse-analysis/distinct-values/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDistinctFieldValues, AdcAuthError, ORG_ID_PATTERN } from '@/lib/bigquery'
import { FILTER_FIELDS } from '@/lib/filterFields'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const orgId = searchParams.get('org_id')
  const field = searchParams.get('field')

  if (!orgId || !field) {
    return NextResponse.json({ error: 'org_id and field are required' }, { status: 400 })
  }
  if (!ORG_ID_PATTERN.test(orgId)) {
    return NextResponse.json({ error: 'invalid org_id' }, { status: 400 })
  }
  const def = FILTER_FIELDS[field]
  if (!def || !def.autocomplete) {
    return NextResponse.json({ error: 'field is not autocomplete-eligible' }, { status: 400 })
  }

  try {
    const values = await getDistinctFieldValues(orgId, def.column)
    return NextResponse.json({ values })
  } catch (err) {
    console.error('[snf-warehouse-distinct-values]', err)
    if (err instanceof AdcAuthError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 401 })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`, then in another terminal:
`curl "http://localhost:4000/api/kwo-snowflake-warehouse-analysis/distinct-values?org_id=<a_real_org_id>&field=query_type"`
Expected: `{"values": [...]}` with real query type strings (requires ADC auth to be set up per repo README).

- [ ] **Step 5: Commit**

```bash
git add src/lib/bigquery.ts src/app/api/kwo-snowflake-warehouse-analysis/distinct-values/route.ts
git commit -m "feat: add distinct-values autocomplete endpoint"
```

---

### Task 8: Convert `timeseries/route.ts` to POST + splice filter into `base` and `run_windows_filtered`

**Files:**
- Modify: `sql/kwo_snowflake_warehouse_analysis_timeseries.sql`
- Modify: `src/app/api/kwo-snowflake-warehouse-analysis/timeseries/route.ts`

**Interfaces:**
- Consumes: `buildFilterWhereClause` from `src/lib/filterCompiler.ts` (Task 3); `FilterGroup` from `src/lib/types.ts` (Task 1).
- Produces: `POST /api/kwo-snowflake-warehouse-analysis/timeseries` reading `{ org_id, warehouse_name, start_date, end_date, granularity, filter_conditions }` from the JSON body — consumed by Task 11 (`page.tsx` timeseries fetch).

- [ ] **Step 1: Add two `{{FILTER_CLAUSE}}` markers to `sql/kwo_snowflake_warehouse_analysis_timeseries.sql`**

Find (the `base` CTE, lines ~48-50):
```sql
  WHERE q.warehouse_name = @warehouse_name
    AND q.start_time >= UNIX_MILLIS(TIMESTAMP(@start_date))
    AND q.start_time <= UNIX_MILLIS(TIMESTAMP(@end_date))
),
query_volume AS (
```
Replace with:
```sql
  WHERE q.warehouse_name = @warehouse_name
    AND q.start_time >= UNIX_MILLIS(TIMESTAMP(@start_date))
    AND q.start_time <= UNIX_MILLIS(TIMESTAMP(@end_date))
    {{FILTER_CLAUSE}}
),
query_volume AS (
```

Find (the `run_windows_filtered` CTE, lines ~144-149):
```sql
  WHERE q.warehouse_name = @warehouse_name
    -- overlap filter, not start_time-in-range: a query whose run window
    -- starts just before @start_date but extends into the range must
    -- still count toward concurrency in the periods it overlaps.
    AND q.end_time - q.execution_time <= UNIX_MILLIS(TIMESTAMP(@end_date))
    AND q.end_time >= UNIX_MILLIS(TIMESTAMP(@start_date))
),
```
Replace with:
```sql
  WHERE q.warehouse_name = @warehouse_name
    -- overlap filter, not start_time-in-range: a query whose run window
    -- starts just before @start_date but extends into the range must
    -- still count toward concurrency in the periods it overlaps.
    AND q.end_time - q.execution_time <= UNIX_MILLIS(TIMESTAMP(@end_date))
    AND q.end_time >= UNIX_MILLIS(TIMESTAMP(@start_date))
    {{FILTER_CLAUSE}}
),
```

Both markers get replaced with the **same** compiled filter fragment — the filter applies identically to both CTEs since they both read query-level rows from `query_history_view_tf`.

- [ ] **Step 2: Rewrite `src/app/api/kwo-snowflake-warehouse-analysis/timeseries/route.ts`**

Find:
```ts
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const orgId = searchParams.get('org_id')
  const warehouseName = searchParams.get('warehouse_name')
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')
  const granularityParam = (searchParams.get('granularity') || 'day') as Granularity
```
Replace with:
```ts
export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    org_id?: string
    warehouse_name?: string
    start_date?: string
    end_date?: string
    granularity?: Granularity
    filter_conditions?: FilterGroup
  }
  const orgId = body.org_id ?? null
  const warehouseName = body.warehouse_name ?? null
  const startDate = body.start_date ?? null
  const endDate = body.end_date ?? null
  const granularityParam = body.granularity || 'day'
  const filterConditions = body.filter_conditions
```

Add to the imports at the top:
```ts
import { buildFilterWhereClause } from '@/lib/filterCompiler'
import type { Granularity, WarehouseAnalysisPoint, WarehouseAnalysisResponse, FilterGroup } from '@/lib/types'
```
(replacing the existing narrower `import type { Granularity, WarehouseAnalysisPoint, WarehouseAnalysisResponse } from '@/lib/types'` line.)

Find:
```ts
    const rows = await runQuery<WarehouseAnalysisRow>(sql, {
      warehouse_name: warehouseName,
      start_date: queryStartDate,
      end_date: queryEndDate,
      period_starts: periods.map((p) => p.start),
      period_start_bounds: periodStartBounds,
      period_end_bounds: periodEndBounds,
    })
```
Replace with:
```ts
    let filterParams: Record<string, unknown> = {}
    let filterTypes: Record<string, string | string[]> = {}
    let filteredSql = sql
    if (filterConditions) {
      const compiled = buildFilterWhereClause(filterConditions)
      filterParams = compiled.params
      filterTypes = compiled.types
      filteredSql = filteredSql.replace(
        /\{\{FILTER_CLAUSE\}\}/g,
        compiled.sql ? `AND (${compiled.sql})` : ''
      )
    } else {
      filteredSql = filteredSql.replace(/\{\{FILTER_CLAUSE\}\}/g, '')
    }

    const rows = await runQuery<WarehouseAnalysisRow>(
      filteredSql,
      {
        warehouse_name: warehouseName,
        start_date: queryStartDate,
        end_date: queryEndDate,
        period_starts: periods.map((p) => p.start),
        period_start_bounds: periodStartBounds,
        period_end_bounds: periodEndBounds,
        ...filterParams,
      },
      filterTypes
    )
```

Note the `/g` flag on the replace regex — this SQL file has two `{{FILTER_CLAUSE}}` markers (Step 1), both must be replaced with the identical compiled fragment; `sql.replace('{{FILTER_CLAUSE}}', ...)` without `/g` only replaces the first occurrence, which is why the histogram routes (Task 5, single marker each) use plain `.replace(...)` but this route must use the global regex form.

Also update the earlier line:
```ts
    const sql = loadOrgScopedSql('kwo_snowflake_warehouse_analysis_timeseries.sql', orgId)
```
leave as-is — `sql` is the loaded template; `filteredSql` (introduced above) is the post-splice version passed to `runQuery`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add sql/kwo_snowflake_warehouse_analysis_timeseries.sql src/app/api/kwo-snowflake-warehouse-analysis/timeseries/route.ts
git commit -m "feat: convert timeseries route to POST with filter splicing into base and concurrency CTEs"
```

---

### Task 9: `FilterConditionBuilder.tsx` — recursive condition tree editor

**Files:**
- Create: `src/components/filters/FilterConditionBuilder.tsx`
- Test: `src/components/filters/__tests__/FilterConditionBuilder.test.tsx`

**Interfaces:**
- Consumes: `FilterGroup`, `FilterCondition`, `isFilterGroup` from `src/lib/types.ts`; `FILTER_FIELDS`, `OPERATORS_BY_TYPE`, `FIELD_SECTIONS` from `src/lib/filterFields.ts`; `Dropdown` from `./Dropdown.tsx` (reused for field/operator/value selects, per CLAUDE.md's reuse-existing-components rule).
- Produces: `<FilterConditionBuilder group={FilterGroup} onChange={(next: FilterGroup) => void} orgId={string | null} />` — consumed by Task 10 (`FilterPanel.tsx`).

- [ ] **Step 1: Write `src/components/filters/FilterConditionBuilder.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Dropdown } from './Dropdown'
import { FILTER_FIELDS, OPERATORS_BY_TYPE, FIELD_SECTIONS } from '@/lib/filterFields'
import { isFilterGroup, type FilterCondition, type FilterGroup, type FilterOperator } from '@/lib/types'

let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

export function newCondition(): FilterCondition {
  return { id: nextId('cond'), field: '', operator: '=', value: '' }
}

export function newGroup(match: 'AND' | 'OR' = 'AND'): FilterGroup {
  return { id: nextId('group'), match, conditions: [newCondition()] }
}

const FIELD_OPTIONS = FIELD_SECTIONS.flatMap((section) =>
  section.keys.map((key) => ({ value: key, label: FILTER_FIELDS[key].label, group: section.label }))
)

function needsValueInput(operator: FilterOperator): boolean {
  return operator !== 'is null' && operator !== 'is not null'
}

function isListOperator(operator: FilterOperator): boolean {
  return operator === 'IN' || operator === 'NOT IN'
}

function ConditionRow({
  condition,
  orgId,
  onChange,
  onRemove,
}: {
  condition: FilterCondition
  orgId: string | null
  onChange: (next: FilterCondition) => void
  onRemove: () => void
}) {
  const fieldDef = condition.field ? FILTER_FIELDS[condition.field] : undefined
  const operatorOptions = fieldDef ? OPERATORS_BY_TYPE[fieldDef.type] : []
  const [autocompleteValues, setAutocompleteValues] = useState<string[]>([])

  useEffect(() => {
    if (!fieldDef?.autocomplete || !orgId) {
      setAutocompleteValues([])
      return
    }
    const controller = new AbortController()
    fetch(`/api/kwo-snowflake-warehouse-analysis/distinct-values?org_id=${orgId}&field=${condition.field}`, {
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((body: { values?: string[] }) => setAutocompleteValues(body.values ?? []))
      .catch(() => setAutocompleteValues([]))
    return () => controller.abort()
  }, [fieldDef?.autocomplete, orgId, condition.field])

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="filter-condition-row">
      <Dropdown
        mode="single"
        options={FIELD_OPTIONS}
        value={condition.field}
        placeholder="Select field ..."
        onChange={(field) => {
          const def = FILTER_FIELDS[field]
          onChange({ ...condition, field, operator: OPERATORS_BY_TYPE[def.type][0], value: '' })
        }}
      />
      {fieldDef && (
        <Dropdown
          mode="single"
          options={operatorOptions.map((op) => ({ value: op, label: op }))}
          value={condition.operator}
          onChange={(operator) =>
            onChange({ ...condition, operator: operator as FilterOperator, value: isListOperator(operator as FilterOperator) ? [] : '' })
          }
        />
      )}
      {fieldDef && needsValueInput(condition.operator) && fieldDef.type === 'boolean' && (
        <Dropdown
          mode="single"
          options={[
            { value: 'true', label: 'True' },
            { value: 'false', label: 'False' },
          ]}
          value={typeof condition.value === 'string' ? condition.value : ''}
          onChange={(value) => onChange({ ...condition, value })}
        />
      )}
      {fieldDef && needsValueInput(condition.operator) && fieldDef.type !== 'boolean' && isListOperator(condition.operator) && (
        <Dropdown
          mode="multi"
          options={autocompleteValues.map((v) => ({ value: v, label: v }))}
          value={Array.isArray(condition.value) ? condition.value : []}
          onChange={(value) => onChange({ ...condition, value: value as unknown as string[] })}
          placeholder="Select values ..."
        />
      )}
      {fieldDef &&
        needsValueInput(condition.operator) &&
        fieldDef.type !== 'boolean' &&
        !isListOperator(condition.operator) &&
        (fieldDef.autocomplete ? (
          <Dropdown
            mode="single"
            options={autocompleteValues.map((v) => ({ value: v, label: v }))}
            value={typeof condition.value === 'string' ? condition.value : ''}
            onChange={(value) => onChange({ ...condition, value })}
            placeholder="Select value ..."
          />
        ) : (
          <input
            className="border border-border rounded px-2 py-1 text-sm bg-background"
            type={fieldDef.type === 'number' ? 'number' : 'text'}
            value={typeof condition.value === 'string' ? condition.value : ''}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
          />
        ))}
      <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={onRemove}>
        Remove
      </button>
    </div>
  )
}

export function FilterConditionBuilder({
  group,
  orgId,
  onChange,
}: {
  group: FilterGroup
  orgId: string | null
  onChange: (next: FilterGroup) => void
}) {
  function updateNode(index: number, next: FilterCondition | FilterGroup) {
    const conditions = [...group.conditions]
    conditions[index] = next
    onChange({ ...group, conditions })
  }

  function removeNode(index: number) {
    const conditions = group.conditions.filter((_, i) => i !== index)
    onChange({ ...group, conditions })
  }

  return (
    <div className="flex flex-col gap-2 pl-2 border-l border-border" data-testid="filter-group">
      <div className="flex items-center gap-2">
        <Dropdown
          mode="single"
          options={[
            { value: 'AND', label: 'AND' },
            { value: 'OR', label: 'OR' },
          ]}
          value={group.match}
          onChange={(match) => onChange({ ...group, match: match as 'AND' | 'OR' })}
        />
      </div>
      {group.conditions.map((node, index) =>
        isFilterGroup(node) ? (
          <FilterConditionBuilder
            key={node.id}
            group={node}
            orgId={orgId}
            onChange={(next) => updateNode(index, next)}
          />
        ) : (
          <ConditionRow
            key={node.id}
            condition={node}
            orgId={orgId}
            onChange={(next) => updateNode(index, next)}
            onRemove={() => removeNode(index)}
          />
        )
      )}
      <div className="flex gap-3">
        <button
          type="button"
          className="text-xs text-primary"
          onClick={() => onChange({ ...group, conditions: [...group.conditions, newCondition()] })}
        >
          + Add condition
        </button>
        <button
          type="button"
          className="text-xs text-primary"
          onClick={() => onChange({ ...group, conditions: [...group.conditions, newGroup()] })}
        >
          + Add group
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write `src/components/filters/__tests__/FilterConditionBuilder.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterConditionBuilder, newGroup } from '../FilterConditionBuilder'

describe('FilterConditionBuilder', () => {
  it('renders one condition row for a freshly created group', () => {
    render(<FilterConditionBuilder group={newGroup()} orgId="abc123" onChange={vi.fn()} />)
    expect(screen.getAllByTestId('filter-condition-row')).toHaveLength(1)
  })

  it('adds a new condition row when "+ Add condition" is clicked', () => {
    const group = newGroup()
    const onChange = vi.fn()
    render(<FilterConditionBuilder group={group} orgId="abc123" onChange={onChange} />)
    fireEvent.click(screen.getByText('+ Add condition'))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ conditions: expect.arrayContaining([expect.anything(), expect.anything()]) })
    )
  })

  it('adds a nested group when "+ Add group" is clicked', () => {
    const group = newGroup()
    const onChange = vi.fn()
    render(<FilterConditionBuilder group={group} orgId="abc123" onChange={onChange} />)
    fireEvent.click(screen.getByText('+ Add group'))
    const updated = onChange.mock.calls[0][0]
    expect(updated.conditions).toHaveLength(2)
    expect(updated.conditions[1]).toHaveProperty('match')
  })

  it('removes a condition row when Remove is clicked', () => {
    const group = newGroup()
    const onChange = vi.fn()
    render(<FilterConditionBuilder group={group} orgId="abc123" onChange={onChange} />)
    fireEvent.click(screen.getByText('Remove'))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ conditions: [] }))
  })
})
```

- [ ] **Step 3: Run the component tests**

Run: `npx vitest run src/components/filters/__tests__/FilterConditionBuilder.test.tsx`
Expected: PASS

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/filters/FilterConditionBuilder.tsx src/components/filters/__tests__/FilterConditionBuilder.test.tsx
git commit -m "feat: add recursive filter condition builder component"
```

---

### Task 10: `FilterPanel.tsx` — trigger button + slide-down panel

**Files:**
- Create: `src/components/filters/FilterPanel.tsx`
- Test: `src/components/filters/__tests__/FilterPanel.test.tsx`

**Interfaces:**
- Consumes: `FilterConditionBuilder`, `newGroup` from `./FilterConditionBuilder.tsx` (Task 9); `FilterGroup` from `src/lib/types.ts`.
- Produces: `<FilterPanel appliedFilter={FilterGroup} onApply={(next: FilterGroup) => void} orgId={string | null} />` — consumed by Task 11 (`WarehouseAnalysisFilters.tsx`).

- [ ] **Step 1: Write `src/components/filters/FilterPanel.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { FilterConditionBuilder, newGroup } from './FilterConditionBuilder'
import type { FilterGroup } from '@/lib/types'

function isEmpty(group: FilterGroup): boolean {
  return group.conditions.length === 0
}

export function FilterPanel({
  appliedFilter,
  onApply,
  orgId,
}: {
  appliedFilter: FilterGroup
  onApply: (next: FilterGroup) => void
  orgId: string | null
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<FilterGroup>(appliedFilter)

  const hasActiveFilter = !isEmpty(appliedFilter)
  const isDirty = JSON.stringify(draft) !== JSON.stringify(appliedFilter)

  function handleOpen() {
    setDraft(appliedFilter)
    setOpen(true)
  }

  function handleApply() {
    onApply(draft)
    setOpen(false)
  }

  function handleCancel() {
    setDraft(appliedFilter)
    setOpen(false)
  }

  function handleClearAll() {
    const cleared = newGroup()
    cleared.conditions = []
    setDraft(cleared)
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="relative flex items-center gap-2 border border-border rounded px-3 py-2 text-sm bg-background"
        onClick={() => (open ? setOpen(false) : handleOpen())}
        data-testid="filter-trigger"
      >
        Filters
        {hasActiveFilter && (
          <span
            className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary"
            data-testid="filter-active-dot"
          />
        )}
      </button>
      {open && (
        <div
          className="absolute z-10 mt-2 p-4 rounded-lg border border-border bg-background shadow-lg min-w-[480px]"
          data-testid="filter-panel"
        >
          <FilterConditionBuilder group={draft} orgId={orgId} onChange={setDraft} />
          <div className="flex justify-between items-center mt-4 pt-3 border-t border-border">
            <button type="button" className="text-xs text-muted-foreground" onClick={handleClearAll}>
              Clear all
            </button>
            <div className="flex gap-2">
              <button type="button" className="text-xs px-3 py-1.5 rounded border border-border" onClick={handleCancel}>
                Cancel
              </button>
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground disabled:opacity-50"
                onClick={handleApply}
                disabled={!isDirty}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Write `src/components/filters/__tests__/FilterPanel.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterPanel } from '../FilterPanel'
import type { FilterGroup } from '@/lib/types'

const emptyGroup: FilterGroup = { id: 'root', match: 'AND', conditions: [] }

describe('FilterPanel', () => {
  it('does not show the active-filter dot when no filter is applied', () => {
    render(<FilterPanel appliedFilter={emptyGroup} onApply={vi.fn()} orgId="abc123" />)
    expect(screen.queryByTestId('filter-active-dot')).toBeNull()
  })

  it('shows the active-filter dot when a filter is applied', () => {
    const applied: FilterGroup = {
      id: 'root',
      match: 'AND',
      conditions: [{ id: 'c1', field: 'query_type', operator: '=', value: 'SELECT' }],
    }
    render(<FilterPanel appliedFilter={applied} onApply={vi.fn()} orgId="abc123" />)
    expect(screen.getByTestId('filter-active-dot')).toBeInTheDocument()
  })

  it('opens the panel on trigger click', () => {
    render(<FilterPanel appliedFilter={emptyGroup} onApply={vi.fn()} orgId="abc123" />)
    fireEvent.click(screen.getByTestId('filter-trigger'))
    expect(screen.getByTestId('filter-panel')).toBeInTheDocument()
  })

  it('calls onApply with the draft when Apply is clicked', () => {
    const onApply = vi.fn()
    render(<FilterPanel appliedFilter={emptyGroup} onApply={onApply} orgId="abc123" />)
    fireEvent.click(screen.getByTestId('filter-trigger'))
    fireEvent.click(screen.getByText('+ Add condition'))
    fireEvent.click(screen.getByText('Apply'))
    expect(onApply).toHaveBeenCalled()
  })

  it('discards draft changes on Cancel', () => {
    const onApply = vi.fn()
    render(<FilterPanel appliedFilter={emptyGroup} onApply={onApply} orgId="abc123" />)
    fireEvent.click(screen.getByTestId('filter-trigger'))
    fireEvent.click(screen.getByText('+ Add condition'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(onApply).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run the component tests**

Run: `npx vitest run src/components/filters/__tests__/FilterPanel.test.tsx`
Expected: PASS

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/filters/FilterPanel.tsx src/components/filters/__tests__/FilterPanel.test.tsx
git commit -m "feat: add filter trigger button and slide-down panel"
```

---

### Task 11: Mount `FilterPanel` in `WarehouseAnalysisFilters.tsx`

**Files:**
- Modify: `src/components/filters/WarehouseAnalysisFilters.tsx`

**Interfaces:**
- Consumes: `FilterPanel` from `./FilterPanel.tsx` (Task 10).
- Produces: `WarehouseAnalysisFiltersProps` gains `appliedFilter: FilterGroup` and `onFilterApply: (next: FilterGroup) => void` — consumed by Task 12 (`page.tsx`).

- [ ] **Step 1: Update imports and props interface**

Find:
```tsx
import { Dropdown } from './Dropdown'
import { DateRangePicker } from './DateRangePicker'
import { Badge } from '@/components/ui/badge'
import type { Granularity, WarehouseOption } from '@/lib/types'
```
Replace with:
```tsx
import { Dropdown } from './Dropdown'
import { DateRangePicker } from './DateRangePicker'
import { FilterPanel } from './FilterPanel'
import { Badge } from '@/components/ui/badge'
import type { FilterGroup, Granularity, WarehouseOption } from '@/lib/types'
```

Find:
```tsx
interface WarehouseAnalysisFiltersProps {
  customers: { org_id: string; name: string }[]
  selectedCustomer: string | null
  onCustomerChange: (orgId: string | null) => void
  startDate: string
  endDate: string
  onRangeChange: (start: string, end: string) => void
  granularity: Granularity
  onGranularityChange: (g: Granularity) => void
  warehouses: WarehouseOption[]
  selectedWarehouse: string | null
  onWarehouseChange: (warehouseName: string | null) => void
  warehousesDisabled: boolean
  warehousesError: string | null
}
```
Replace with:
```tsx
interface WarehouseAnalysisFiltersProps {
  customers: { org_id: string; name: string }[]
  selectedCustomer: string | null
  onCustomerChange: (orgId: string | null) => void
  startDate: string
  endDate: string
  onRangeChange: (start: string, end: string) => void
  granularity: Granularity
  onGranularityChange: (g: Granularity) => void
  warehouses: WarehouseOption[]
  selectedWarehouse: string | null
  onWarehouseChange: (warehouseName: string | null) => void
  warehousesDisabled: boolean
  warehousesError: string | null
  appliedFilter: FilterGroup
  onFilterApply: (next: FilterGroup) => void
}
```

Find:
```tsx
export function WarehouseAnalysisFilters({
  customers,
  selectedCustomer,
  onCustomerChange,
  startDate,
  endDate,
  onRangeChange,
  granularity,
  onGranularityChange,
  warehouses,
  selectedWarehouse,
  onWarehouseChange,
  warehousesDisabled,
  warehousesError,
}: WarehouseAnalysisFiltersProps) {
```
Replace with:
```tsx
export function WarehouseAnalysisFilters({
  customers,
  selectedCustomer,
  onCustomerChange,
  startDate,
  endDate,
  onRangeChange,
  granularity,
  onGranularityChange,
  warehouses,
  selectedWarehouse,
  onWarehouseChange,
  warehousesDisabled,
  warehousesError,
  appliedFilter,
  onFilterApply,
}: WarehouseAnalysisFiltersProps) {
```

- [ ] **Step 2: Add the `FilterPanel` after the Warehouse dropdown block**

Find:
```tsx
        {warehousesError && <span className="text-xs text-destructive">{warehousesError}</span>}
      </div>
    </div>
  )
}
```
Replace with:
```tsx
        {warehousesError && <span className="text-xs text-destructive">{warehousesError}</span>}
      </div>
      <FilterPanel appliedFilter={appliedFilter} onApply={onFilterApply} orgId={selectedCustomer} />
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: errors expected at the `page.tsx` call site (missing new required props) — resolved in Task 12.

- [ ] **Step 4: Commit**

```bash
git add src/components/filters/WarehouseAnalysisFilters.tsx
git commit -m "feat: mount filter panel in warehouse analysis filter bar"
```

---

### Task 12: Wire `appliedFilter` state and POST-convert the 5 fetch effects in `page.tsx`

**Files:**
- Modify: `src/app/kwo-snowflake-warehouse-analysis/page.tsx`

**Interfaces:**
- Consumes: `WarehouseAnalysisFilters` (Task 11) new props; `FilterGroup` from `src/lib/types.ts`.
- Produces: `appliedFilter` state passed down to `WarehouseAnalysisCharts` (Task 13) as `filterActive={appliedFilter.conditions.length > 0}`; drives the Cluster Activity exemption badge (this task, since that `ChartWrapper` lives directly in `page.tsx`).

- [ ] **Step 1: Add `appliedFilter` state**

Find:
```tsx
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | null>(null)
```
Replace with:
```tsx
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | null>(null)

  const [appliedFilter, setAppliedFilter] = useState<FilterGroup>({ id: 'root', match: 'AND', conditions: [] })
```

Add `FilterGroup` to the existing type-only import block (the exact import list depends on what's already imported starting at line 13 — add `FilterGroup` to it):
```tsx
import type {
  // ...existing entries...
  FilterGroup,
} from '@/lib/types'
```

- [ ] **Step 2: Convert the timeseries fetch effect to POST**

Find:
```tsx
    const params = new URLSearchParams({
      org_id: selectedCustomer,
      warehouse_name: selectedWarehouse,
      start_date: startDate,
      end_date: endDate,
      granularity,
    })

    fetch(`/api/kwo-snowflake-warehouse-analysis/timeseries?${params}`, { signal: controller.signal })
```
Replace with:
```tsx
    fetch('/api/kwo-snowflake-warehouse-analysis/timeseries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: selectedCustomer,
        warehouse_name: selectedWarehouse,
        start_date: startDate,
        end_date: endDate,
        granularity,
        filter_conditions: appliedFilter,
      }),
      signal: controller.signal,
    })
```
And update its dependency array:
```tsx
  }, [selectedCustomer, selectedWarehouse, startDate, endDate, granularity, appliedFilter])
```

- [ ] **Step 3: Convert the 4 histogram fetch effects to POST (identical shape each)**

For each of `execution-time-histogram`, `data-scanned-histogram`, `spillage-histogram`, `compile-time-histogram`, find (using execution-time-histogram as the example):
```tsx
    const params = new URLSearchParams({
      org_id: selectedCustomer,
      warehouse_name: selectedWarehouse,
      start_date: startDate,
      end_date: endDate,
    })

    fetch(`/api/kwo-snowflake-warehouse-analysis/execution-time-histogram?${params}`, { signal: controller.signal })
```
Replace with:
```tsx
    fetch('/api/kwo-snowflake-warehouse-analysis/execution-time-histogram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: selectedCustomer,
        warehouse_name: selectedWarehouse,
        start_date: startDate,
        end_date: endDate,
        filter_conditions: appliedFilter,
      }),
      signal: controller.signal,
    })
```
And update its dependency array from `[selectedCustomer, selectedWarehouse, startDate, endDate]` to `[selectedCustomer, selectedWarehouse, startDate, endDate, appliedFilter]`.

Repeat identically for `data-scanned-histogram`, `spillage-histogram`, `compile-time-histogram` (each substituting its own endpoint path).

Do **not** touch the `cluster-activity` fetch effect (lines 180-209) or the `customers`/`warehouses` effects — they stay GET, no filter.

- [ ] **Step 4: Pass filter props to `WarehouseAnalysisFilters` and add the Cluster Activity exemption badge**

Find:
```tsx
        warehousesDisabled={!selectedCustomer}
        warehousesError={warehousesError}
      />
```
Replace with:
```tsx
        warehousesDisabled={!selectedCustomer}
        warehousesError={warehousesError}
        appliedFilter={appliedFilter}
        onFilterApply={setAppliedFilter}
      />
```

Find:
```tsx
          <ChartWrapper
            title="Cluster Activity"
            isLight={isLight}
            totals={SHOW_WAREHOUSE_ACTIVITY_METRIC ? totalsClusterActivity : undefined}
            loading={clusterActivityLoading}
          >
```
Replace with:
```tsx
          <ChartWrapper
            title="Cluster Activity"
            isLight={isLight}
            totals={SHOW_WAREHOUSE_ACTIVITY_METRIC ? totalsClusterActivity : undefined}
            loading={clusterActivityLoading}
            notApplicable={appliedFilter.conditions.length > 0}
          >
```

- [ ] **Step 5: Pass `filterActive` to `WarehouseAnalysisCharts`**

Find:
```tsx
          <WarehouseAnalysisCharts
            points={points}
            histogramBuckets={histogramBuckets}
            dataScannedHistogramBuckets={dataScannedHistogramBuckets}
            spillageHistogramBuckets={spillageHistogramBuckets}
            compileTimeHistogramBuckets={compileTimeHistogramBuckets}
            loading={loading}
            histogramLoading={histogramLoading}
            dataScannedHistogramLoading={dataScannedHistogramLoading}
            spillageHistogramLoading={spillageHistogramLoading}
            compileTimeHistogramLoading={compileTimeHistogramLoading}
          />
```
Replace with:
```tsx
          <WarehouseAnalysisCharts
            points={points}
            histogramBuckets={histogramBuckets}
            dataScannedHistogramBuckets={dataScannedHistogramBuckets}
            spillageHistogramBuckets={spillageHistogramBuckets}
            compileTimeHistogramBuckets={compileTimeHistogramBuckets}
            loading={loading}
            histogramLoading={histogramLoading}
            dataScannedHistogramLoading={dataScannedHistogramLoading}
            spillageHistogramLoading={spillageHistogramLoading}
            compileTimeHistogramLoading={compileTimeHistogramLoading}
            filterActive={appliedFilter.conditions.length > 0}
          />
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: errors at `ChartWrapper`'s `notApplicable` prop and `WarehouseAnalysisCharts`'s `filterActive` prop — resolved by Task 13/14.

- [ ] **Step 7: Commit**

```bash
git add src/app/kwo-snowflake-warehouse-analysis/page.tsx
git commit -m "feat: wire applied filter state through page and convert fetches to POST"
```

---

### Task 13: `ChartWrapper` gains a `notApplicable` badge (`TimeSeriesCharts.tsx`)

**Files:**
- Modify: `src/components/charts/TimeSeriesCharts.tsx`

**Interfaces:**
- Produces: `ChartWrapperProps` gains optional `notApplicable?: boolean` — when true, renders a small "Filter not applicable" badge next to the title and does not alter `children`/`totals` rendering. Consumed by Task 12 (Cluster Activity) and Task 14 (Warehouse Usage / Cost per 1000 Queries).

- [ ] **Step 1: Add the prop to `ChartWrapperProps`**

Find:
```ts
interface ChartWrapperProps {
  title: string
  children: React.ReactNode
  isLight: boolean
  height?: number
  totals?: { label: string; value: string }[] | null
  /** When true, replaces the chart body with a skeleton and forces the totals into their loading state. */
  loading?: boolean
  /** Height of the body skeleton shown while loading. Defaults to 220 to match the standard chart height. */
  skeletonHeight?: number
}
```
Replace with:
```ts
interface ChartWrapperProps {
  title: string
  children: React.ReactNode
  isLight: boolean
  height?: number
  totals?: { label: string; value: string }[] | null
  /** When true, replaces the chart body with a skeleton and forces the totals into their loading state. */
  loading?: boolean
  /** Height of the body skeleton shown while loading. Defaults to 220 to match the standard chart height. */
  skeletonHeight?: number
  /** When true, shows a "Filter not applicable" badge next to the title — for charts sourced from tables the custom filter doesn't scope. */
  notApplicable?: boolean
}
```

- [ ] **Step 2: Destructure the new prop and render the badge in both the light and dark branches**

Find:
```tsx
export function ChartWrapper({ title, children, isLight, height, totals, loading, skeletonHeight }: ChartWrapperProps) {
  const effectiveTotals = loading ? null : totals
  if (isLight) {
    return (
      <div style={{
        position: 'relative',
        background: '#FFFFFF',
        boxShadow: '0px 5px 10px rgba(0, 0, 0, 0.05)',
        borderRadius: 15,
        padding: '24px 30px',
        ...(height != null ? { height } : {}),
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{
            fontFamily: 'Exo, sans-serif',
            fontWeight: 500,
            fontSize: 18,
            lineHeight: '24px',
            color: '#051c27',
          }}>{title}</div>
```
Replace with:
```tsx
export function ChartWrapper({ title, children, isLight, height, totals, loading, skeletonHeight, notApplicable }: ChartWrapperProps) {
  const effectiveTotals = loading ? null : totals
  if (isLight) {
    return (
      <div style={{
        position: 'relative',
        background: '#FFFFFF',
        boxShadow: '0px 5px 10px rgba(0, 0, 0, 0.05)',
        borderRadius: 15,
        padding: '24px 30px',
        ...(height != null ? { height } : {}),
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              fontFamily: 'Exo, sans-serif',
              fontWeight: 500,
              fontSize: 18,
              lineHeight: '24px',
              color: '#051c27',
            }}>{title}</div>
            {notApplicable && (
              <span
                data-testid="chart-not-applicable-badge"
                style={{
                  fontFamily: 'IBM Plex Sans, sans-serif',
                  fontSize: 10,
                  fontWeight: 500,
                  color: 'var(--muted-foreground)',
                  background: 'var(--muted)',
                  borderRadius: 4,
                  padding: '2px 6px',
                }}
              >
                Filter not applicable
              </span>
            )}
          </div>
```

Note: this closes an extra `</div>` that must be added right before the existing totals block's closing — check the full `if (isLight)` branch's JSX after this edit with `npx tsc --noEmit` (Step 4) to confirm the tag balance; the wrapping `<div style={{ display: 'flex', ... }}>` introduced above must have its own closing `</div>` inserted immediately after the `{notApplicable && (...)}` block, before the existing `{effectiveTotals !== undefined && (...)}` block.

Apply the equivalent edit to the dark-mode (`else`) branch below it — find its title `<div>` (styled for dark mode, immediately following the `if (isLight) { ... }` block's closing `return`) and wrap it the same way with the same `notApplicable` badge markup.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors; confirms JSX tag balance from Step 2.

- [ ] **Step 4: Commit**

```bash
git add src/components/charts/TimeSeriesCharts.tsx
git commit -m "feat: add notApplicable badge to ChartWrapper"
```

---

### Task 14: Exemption badge for Warehouse Usage / Cost per 1000 Queries (`WarehouseAnalysisCharts.tsx`)

**Files:**
- Modify: `src/components/charts/WarehouseAnalysisCharts.tsx`
- Modify: `src/components/charts/__tests__/WarehouseAnalysisCharts.test.tsx`

**Interfaces:**
- Consumes: `ChartWrapper`'s `notApplicable` prop (Task 13).
- Produces: `WarehouseAnalysisChartsProps` gains `filterActive?: boolean` (set from Task 12's `page.tsx`).

- [ ] **Step 1: Add `filterActive` to the props interface and destructuring**

Find:
```tsx
interface WarehouseAnalysisChartsProps {
  points: WarehouseAnalysisPoint[]
  histogramBuckets: HistogramBucket[]
  dataScannedHistogramBuckets: HistogramBucket[]
  spillageHistogramBuckets: HistogramBucket[]
  compileTimeHistogramBuckets?: HistogramBucket[]
  /** Timeseries-driven charts (usage, volume, execution/queue time, scanned/spillage totals, failed queries). */
  loading?: boolean
  histogramLoading?: boolean
  dataScannedHistogramLoading?: boolean
  spillageHistogramLoading?: boolean
  compileTimeHistogramLoading?: boolean
}
```
Replace with:
```tsx
interface WarehouseAnalysisChartsProps {
  points: WarehouseAnalysisPoint[]
  histogramBuckets: HistogramBucket[]
  dataScannedHistogramBuckets: HistogramBucket[]
  spillageHistogramBuckets: HistogramBucket[]
  compileTimeHistogramBuckets?: HistogramBucket[]
  /** Timeseries-driven charts (usage, volume, execution/queue time, scanned/spillage totals, failed queries). */
  loading?: boolean
  histogramLoading?: boolean
  dataScannedHistogramLoading?: boolean
  spillageHistogramLoading?: boolean
  compileTimeHistogramLoading?: boolean
  /** True when a custom query-level filter is applied — flags Warehouse Usage and Cost per 1000 Queries as not applicable, since both are sourced from warehouse_metering_history_tf, not query_history_view_tf. */
  filterActive?: boolean
}
```

Find the function signature destructuring `export function WarehouseAnalysisCharts({ points, histogramBuckets, dataScannedHistogramBuckets, spillageHistogramBuckets, ... })` and add `filterActive,` to the destructured params list (matching whichever exact parameter order/formatting is already there).

- [ ] **Step 2: Add `notApplicable={filterActive}` to the two exempt `ChartWrapper` instances**

Find:
```tsx
      <ChartWrapper title="Warehouse Usage" isLight={isLight} totals={totalsUsage} loading={loading}>
```
Replace with:
```tsx
      <ChartWrapper title="Warehouse Usage" isLight={isLight} totals={totalsUsage} loading={loading} notApplicable={filterActive}>
```

Find:
```tsx
      <ChartWrapper
        title="Cost per 1000 Queries"
        isLight={isLight}
        totals={totalsCostPer1000}
        loading={loading}
      >
```
Replace with:
```tsx
      <ChartWrapper
        title="Cost per 1000 Queries"
        isLight={isLight}
        totals={totalsCostPer1000}
        loading={loading}
        notApplicable={filterActive}
      >
```

Do **not** add `notApplicable` to "Query Concurrency" — it is filter-affected (Task 8 splices the filter into `run_windows_filtered`), so it must render normally like every other chart in this file.

- [ ] **Step 3: Extend `src/components/charts/__tests__/WarehouseAnalysisCharts.test.tsx`**

Add a test verifying the badge appears only on the two exempt charts when `filterActive` is true. Read the existing test file's setup/render helper first (it already renders `<WarehouseAnalysisCharts />` with mock props) and add:

```tsx
it('shows "Filter not applicable" only on Warehouse Usage and Cost per 1000 Queries when a filter is active', () => {
  render(<WarehouseAnalysisCharts {...baseProps} filterActive />)
  const badges = screen.getAllByTestId('chart-not-applicable-badge')
  expect(badges).toHaveLength(2)
})

it('shows no "Filter not applicable" badges when no filter is active', () => {
  render(<WarehouseAnalysisCharts {...baseProps} filterActive={false} />)
  expect(screen.queryByTestId('chart-not-applicable-badge')).toBeNull()
})
```

(Adapt `baseProps` to whatever the existing test file's mock-props object is actually named — check the file's existing `describe` block before inserting.)

- [ ] **Step 4: Run the full chart test suite**

Run: `npx vitest run src/components/charts/__tests__/WarehouseAnalysisCharts.test.tsx`
Expected: PASS, including the 2 new cases.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/charts/WarehouseAnalysisCharts.tsx src/components/charts/__tests__/WarehouseAnalysisCharts.test.tsx
git commit -m "feat: flag Warehouse Usage and Cost per 1000 Queries as filter-not-applicable"
```

---

### Task 15: Manual end-to-end verification

**Files:** none (manual verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Full type-check and lint pass**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Full test suite**

Run: `npx vitest run` (or the repo's actual `npm test` script per Task 0)
Expected: all tests pass, including the new `filterCompiler`, `FilterConditionBuilder`, `FilterPanel`, and extended `WarehouseAnalysisCharts` suites.

- [ ] **Step 4: Manual browser walkthrough**

At `http://localhost:4000/kwo-snowflake-warehouse-analysis`:
1. Select a customer and warehouse with query history data.
2. Confirm charts render with no filter applied and no "Filter not applicable" badges are visible.
3. Open the Filters panel (trigger button next to Warehouse dropdown), add a condition (e.g. `Query Type = SELECT`), click Apply.
4. Confirm the trigger button shows the active-filter dot.
5. Confirm Total Queries, Execution Time, Query Concurrency, and other query-level charts update to reflect only `SELECT` queries.
6. Confirm Warehouse Usage, Cost per 1000 Queries, and Cluster Activity show the "Filter not applicable" badge and their values are unchanged by the filter.
7. Add a nested OR group (e.g. `Error Code is not null OR Execution Time > 10000`), Apply, confirm results change again.
8. Click Cancel after making draft-only changes — confirm the applied filter and charts are unaffected.
9. Click Clear all, Apply — confirm charts revert to the unfiltered view and the active-filter dot disappears.
10. Test an autocomplete field (e.g. `Warehouse Size IN [...]`) — confirm the value dropdown populates from `/api/kwo-snowflake-warehouse-analysis/distinct-values`.
11. Reload the page — confirm the filter resets to empty (session-only persistence, no URL sync, per spec).

- [ ] **Step 5: Diff behavior against main**

Run: `git diff main --stat` to confirm only the files listed in the File Structure table above changed, with no unrelated modifications.

---

## Self-Review

**Spec coverage:**
- ✅ Static 27-field registry — Task 2.
- ✅ Recursive AND/OR, no `dimension` variant — Task 1, 3, 9.
- ✅ Autocomplete via new org-wide distinct-values endpoint — Task 7.
- ✅ 5 routes switch GET→POST — Tasks 5, 6, 8.
- ✅ `cluster-activity` and `warehouses` routes unaffected — explicitly called out as untouched in Task 12 Step 3.
- ✅ Session-only persistence, no URL sync — `appliedFilter` is plain `useState` in `page.tsx` (Task 12), no `URLSearchParams`/localStorage read/write anywhere in the plan.
- ✅ Trigger button + slide-down panel UI — Task 10.
- ✅ "Filter not applicable" indication on charts not impacted by filter — Tasks 13, 14, and Task 12 Step 4 (Cluster Activity).
- ✅ SQL injection safety (field validated against registry, values bound as params) — Task 3's `buildFilterWhereClause` throws on unknown field; Task 7's `getDistinctFieldValues` column comes only from a registry lookup, never raw user input.
- ✅ `NUMERIC`/`BIGNUMERIC` `Number(...)` wrapping lesson — no new numeric response fields are introduced by this feature (filter values are inputs, not outputs), so this doesn't newly apply; confirmed no violation.
- ✅ Reuse existing `Dropdown` component instead of building a parallel one — Task 9 uses `Dropdown` for field/operator/value selectors.
- ✅ Query Concurrency CTE gap — resolved explicitly in Global Constraints and Task 8 (filter splices into `run_windows_filtered` too; chart is filter-affected, not exempt).

**Placeholder scan:** No "TBD"/"implement later" strings anywhere in the plan; every step has literal code or an exact command with expected output.

**Type consistency check:**
- `FilterGroup`/`FilterCondition`/`FilterFieldType`/`FilterOperator` (Task 1) are the single source of type truth, imported identically in `filterFields.ts`, `filterCompiler.ts`, `histogramRoute.ts`, `timeseries/route.ts`, `FilterConditionBuilder.tsx`, `FilterPanel.tsx`, `WarehouseAnalysisFilters.tsx`, `page.tsx`.
- `buildFilterWhereClause(group: FilterGroup): { sql, params, types }` signature is identical everywhere it's consumed (Task 5, Task 8).
- `runQuery<T>(query, params, types?)`'s new 3rd parameter (Task 5 Step 2) is consistently passed by both call sites that need it (Task 5's histogram handler, Task 8's timeseries handler) and consistently omitted (2-arg call) everywhere else in the codebase that already calls `runQuery` — no existing call site breaks since the new parameter defaults to `{}`.
- `ChartWrapper`'s `notApplicable` prop (Task 13) is consumed with the exact same name in Task 12 (Cluster Activity) and Task 14 (Warehouse Usage / Cost per 1000 Queries) — no naming drift (e.g. no `filterNotApplicable` vs `notApplicable` mismatch).
- `WarehouseAnalysisCharts`'s new `filterActive` prop (Task 14) matches the name passed from `page.tsx` in Task 12 Step 5.
- `WarehouseAnalysisFilters`'s new `appliedFilter`/`onFilterApply` props (Task 11) match the names passed from `page.tsx` in Task 12 Step 4.

No gaps found requiring a new task.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-22-snowflake-warehouse-custom-filter.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
