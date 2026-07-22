# Custom Filter — KWO Snowflake Warehouse Analysis

## Goal

Port the "custom filter" condition builder from `dimension-editor-and-workload-analysis`'s
Workload Analysis page onto the KWO Snowflake Warehouse Analysis dashboard, with all
dimension-related concepts removed (this dashboard has no dimension system). Users can build
an arbitrary AND/OR tree of conditions over `query_history_view_tf` columns and apply it to
the query-level charts.

## Reference source

`/Users/alex/Keebo/Keebo-code/dimension-editor-and-workload-analysis`:
- `src/components/DashboardFilterPanel.tsx`, `src/components/ConditionBuilder.tsx` (UI)
- `src/types/filterTypes.ts` (data model)
- `server/repositories/snowflake.repository.ts::buildFilterWhereClause` (SQL compiler)

Explicitly **not** porting: `FieldRef.type: 'dimension'`, the grouped/tree field picker
(`fieldSections`), `/v2/snowflake/navigation`, `buildDimCond`'s `EXISTS (UNNEST(q.dimensions))`
logic, or anything from `DimensionEditor.tsx`/`QueryBuilder.tsx` (a separate, unrelated feature
in that repo).

## Scope decisions (confirmed with user)

- **Fields**: static, curated list of 27 columns from `query_history_view_tf` (confirmed live
  schema, org `00a27`) — see Field Registry below. Includes `HASH_USER_NAME`/`HASH_ROLE_NAME`
  as exact-match-only fields (hashed, not human-readable, no autocomplete).
- **Logic**: full recursive AND/OR nested groups (matches ref repo), not a flat list.
- **Value input**: autocomplete for categorical fields, backed by a new distinct-values
  endpoint, **org-wide** scope (not scoped to warehouse/date selection).
- **Applies to**: all query-level endpoints — the 4 histogram routes (fully filterable) and
  the timeseries route (partially — only the query-level metrics, not usage/cost). Does
  **not** apply to Cluster Activity or the Warehouse dropdown (different source tables,
  no shared filterable columns).
- **Unaffected charts**: get a static "Filter not applicable" indicator when a filter is
  active, rather than silently ignoring it.
- **Transport**: the 5 affected routes switch from GET+query-params to POST+JSON body (a
  nested filter tree doesn't fit a query string).
- **Persistence**: session-only React state, resets on reload/nav-away. No URL sync, no
  saved filters.
- **UI placement**: trigger button + slide-down panel (like ref repo), not inline in the
  existing filter bar.

## Data model

`src/lib/types.ts` additions:

```ts
type FilterFieldType = 'string' | 'number' | 'boolean';

type FilterOperator =
  | '=' | '!=' | '<' | '<=' | '>' | '>='
  | 'contains' | 'starts with' | 'ends with'
  | 'IN' | 'NOT IN' | 'is null' | 'is not null';

interface FilterCondition {
  id: string;
  field: string;               // key into FILTER_FIELDS registry
  operator: FilterOperator;
  value: string | string[];    // string[] only for IN / NOT IN
}

interface FilterGroup {
  id: string;
  match: 'AND' | 'OR';
  conditions: (FilterCondition | FilterGroup)[];
}
```

`rootGroup.conditions.length === 0` means "no filter" (equivalent to ref repo's "All queries").

### Field registry

Shared module (`src/lib/filterFields.ts`) used by both frontend (labels, operator lists,
autocomplete eligibility) and backend (column-name validation — this is the injection guard,
same pattern as `ORG_ID_PATTERN`):

```ts
const FILTER_FIELDS: Record<string, { label: string; column: string; type: FilterFieldType; autocomplete?: boolean }> = {
  query_type:            { label: 'Query Type',            column: 'QUERY_TYPE',              type: 'string', autocomplete: true },
  execution_status:      { label: 'Execution Status',      column: 'EXECUTION_STATUS',         type: 'string', autocomplete: true },
  error_code:            { label: 'Error Code',            column: 'ERROR_CODE',               type: 'string', autocomplete: true },
  error_message:         { label: 'Error Message',          column: 'ERROR_MESSAGE',            type: 'string' },
  database_name:         { label: 'Database Name',          column: 'DATABASE_NAME',            type: 'string', autocomplete: true },
  warehouse_size:        { label: 'Warehouse Size',          column: 'WAREHOUSE_SIZE',           type: 'string', autocomplete: true },
  warehouse_type:        { label: 'Warehouse Type',          column: 'WAREHOUSE_TYPE',           type: 'string', autocomplete: true },
  query_tag:             { label: 'Query Tag',               column: 'QUERY_TAG',                type: 'string', autocomplete: true },
  is_client_generated:  { label: 'Client-Generated Statement', column: 'IS_CLIENT_GENERATED_STATEMENT', type: 'boolean' },
  hash_user_name:        { label: 'User (hashed)',           column: 'HASH_USER_NAME',           type: 'string' },
  hash_role_name:        { label: 'Role (hashed)',           column: 'HASH_ROLE_NAME',           type: 'string' },

  total_elapsed_time:    { label: 'Total Elapsed Time',      column: 'TOTAL_ELAPSED_TIME',        type: 'number' },
  execution_time:        { label: 'Execution Time',          column: 'EXECUTION_TIME',            type: 'number' },
  compilation_time:      { label: 'Compilation Time',        column: 'COMPILATION_TIME',          type: 'number' },
  bytes_scanned:         { label: 'Bytes Scanned',            column: 'BYTES_SCANNED',             type: 'number' },
  bytes_written:         { label: 'Bytes Written',            column: 'BYTES_WRITTEN',             type: 'number' },
  rows_produced:         { label: 'Rows Produced',            column: 'ROWS_PRODUCED',             type: 'number' },
  rows_inserted:         { label: 'Rows Inserted',            column: 'ROWS_INSERTED',             type: 'number' },
  rows_updated:          { label: 'Rows Updated',             column: 'ROWS_UPDATED',              type: 'number' },
  rows_deleted:          { label: 'Rows Deleted',             column: 'ROWS_DELETED',              type: 'number' },
  partitions_scanned:    { label: 'Partitions Scanned',       column: 'PARTITIONS_SCANNED',         type: 'number' },
  partitions_total:      { label: 'Partitions Total',         column: 'PARTITIONS_TOTAL',           type: 'number' },
  bytes_spilled_local:   { label: 'Bytes Spilled (Local)',    column: 'BYTES_SPILLED_TO_LOCAL_STORAGE', type: 'number' },
  bytes_spilled_remote:  { label: 'Bytes Spilled (Remote)',   column: 'BYTES_SPILLED_TO_REMOTE_STORAGE', type: 'number' },
  queued_provisioning_time: { label: 'Queued Provisioning Time', column: 'QUEUED_PROVISIONING_TIME', type: 'number' },
  queued_repair_time:    { label: 'Queued Repair Time',       column: 'QUEUED_REPAIR_TIME',         type: 'number' },
  queued_overload_time:  { label: 'Queued Overload Time',     column: 'QUEUED_OVERLOAD_TIME',       type: 'number' },
  credits_used_cloud_services: { label: 'Credits Used (Cloud Services)', column: 'CREDITS_USED_CLOUD_SERVICES', type: 'number' },
  query_load_percent:    { label: 'Query Load %',             column: 'QUERY_LOAD_PERCENT',         type: 'number' },
  pct_scanned_from_cache: { label: '% Scanned From Cache',    column: 'PERCENTAGE_SCANNED_FROM_CACHE', type: 'number' },
};
```

### Operators per type

- `string`: `=`, `!=`, `contains`, `starts with`, `ends with`, `IN`, `NOT IN`, `is null`, `is not null`
- `number`: `=`, `!=`, `<`, `<=`, `>`, `>=`, `is null`, `is not null`
- `boolean`: `=` only (value is a true/false toggle)

## Backend

### `src/lib/filterCompiler.ts`

`buildFilterWhereClause(group: FilterGroup): { sql: string; params: Record<string, unknown>; types: Record<string, string> }`

- Recursively walks the tree (`buildGroup`/`buildCondition`), joining children with the
  group's `match` (`AND`/`OR`), wrapping each nested group in parens.
- Every leaf validates `field` against `FILTER_FIELDS` (unknown key → throw `400`) — this is
  the sole injection guard, so the resolved BigQuery column name is only ever inserted from
  the trusted registry, never from user input.
- Params are always bound (`@p_0`, `@p_1`, ...), never string-interpolated — same convention
  as existing `warehouse_name`/`start_date`/`end_date` params.
- Empty group (`conditions.length === 0`) → returns `{ sql: '', params: {}, types: {} }`
  (no-op, spliced as `AND (1=1)` or omitted entirely).

### Route changes

- `src/lib/histogramRoute.ts`: `createHistogramRouteHandler` switches from reading
  `request.nextUrl.searchParams` to reading a POST JSON body (`{ org_id, warehouse_name,
  start_date, end_date, filter_conditions }`). Calls `buildFilterWhereClause`, splices the
  fragment into each `.sql` file's `WHERE` clause at a new `{{FILTER_CLAUSE}}` marker
  (default `1=1` when no filter).
- The 4 histogram `.sql` files (`sql/kwo_snowflake_warehouse_*_histogram.sql`) each get the
  `{{FILTER_CLAUSE}}` marker added to their existing `WHERE`.
- `src/app/api/kwo-snowflake-warehouse-analysis/timeseries/route.ts`: switches to POST, same
  `filter_conditions` handling, but the compiled fragment is spliced only into the `base` CTE
  in `sql/kwo_snowflake_warehouse_analysis_timeseries.sql` (query-level metrics). The
  usage/cost CTEs (from `warehouse_metering_history_tf`) are untouched.
- `cluster-activity` and `warehouses` routes are unchanged (no filterable shared columns).

### New route: distinct values

`GET /api/kwo-snowflake-warehouse-analysis/distinct-values?org_id=...&field=...`

- Validates `field` against `FILTER_FIELDS` and that it's a categorical (`type: 'string'`)
  field with `autocomplete: true`.
- Runs `SELECT DISTINCT <column> FROM query_history_view_tf WHERE <column> IS NOT NULL LIMIT
  200` against the org's dataset (org-wide, no warehouse/date scoping).
- Frontend calls this lazily, once per field, when that field is selected in a condition row
  (cached client-side per field for the session).

## Frontend

### `src/components/filters/FilterConditionBuilder.tsx`

Ported/simplified `ConditionBuilder.tsx`:
- Flat field dropdown (no tree/sections — 27-entry static registry, grouped visually into
  "Query Info" / "Performance" / "Data Volume" optgroups for readability only, not a
  navigation feature).
- Operator dropdown filtered by the selected field's `type`.
- Value input: text/number input for scalar operators; chip multi-input for `IN`/`NOT IN`;
  no input for `is null`/`is not null`; autocomplete dropdown (via distinct-values endpoint)
  for fields with `autocomplete: true`.
- Recursive row rendering for nested `FilterGroup`s: "+ Add condition", "+ Add condition
  group", per-row delete, group `match` AND/OR toggle (shown when a group has ≥2 children).

### `src/components/filters/FilterPanel.tsx`

Ported/simplified `DashboardFilterPanel.tsx`:
- Trigger button in the existing `WarehouseAnalysisFilters` bar — shows a dot badge when
  `appliedFilter` is non-empty.
- Slide-down panel containing `FilterConditionBuilder`, with draft (`filterGroup`) vs applied
  (`appliedFilter`) diffing (`JSON.stringify` compare, same as ref repo).
- Apply (disabled until all draft conditions are complete), Cancel (discard draft), Clear all
  (resets both draft and applied to an empty root group).

### Page wiring (`src/app/kwo-snowflake-warehouse-analysis/page.tsx`)

- New state: `appliedFilter: FilterGroup` (default: empty root group), session-only.
- The 5 affected fetch effects (timeseries, 4 histograms) switch from `fetch(url +
  '?' + params)` GET calls to `fetch(url, { method: 'POST', body: JSON.stringify({ ...existing
  params, filter_conditions: appliedFilter }) })`.
- `appliedFilter` added to each effect's dependency array so changing the filter refetches.

### Chart-level "not applicable" indication

Static exemption list (frontend constant, not derived from API):
```ts
const FILTER_EXEMPT_CHARTS = ['usage', 'costPer1000Queries', 'clusterActivity'];
```
When `appliedFilter` is non-empty, `ChartWrapper` instances for these charts render a small
"Filter not applicable" badge/tooltip next to the title. No backend flag is needed since the
exemption is structural (different source table), not data-dependent.

## Testing

- `src/lib/__tests__/filterCompiler.test.ts`: one leaf condition per operator × type
  combination, nested AND/OR group compilation, unknown-field rejection (throws), empty-group
  no-op.
- Extend `src/components/charts/__tests__/WarehouseAnalysisCharts.test.tsx` and add
  `FilterPanel`/`FilterConditionBuilder` component tests: open/apply/cancel/clear-all, draft
  vs applied diffing, add/remove condition/group, operator list changes per field type.
- Manual verification: apply a filter with a nested AND/OR condition, confirm the 4
  histograms + timeseries query-level charts change; confirm Usage, Cost/1000 Queries, and
  Cluster Activity show "Filter not applicable" and are visually unchanged.
