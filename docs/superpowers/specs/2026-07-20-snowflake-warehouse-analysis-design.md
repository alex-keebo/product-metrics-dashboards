# Warehouse Optimization / Snowflake Warehouse Analysis

**Date:** 2026-07-20
**Status:** Approved

## Overview

Add a new page, **Snowflake Warehouse Analysis**, under the existing "Warehouse Optimization" nav group, alongside KWO for Snowflake and KWO for Databricks. Unlike KWO for Snowflake (multi-customer, cost/savings aggregate view), this page is a **single-customer, single-warehouse query-performance drill-down** sourced from Snowflake's `QUERY_HISTORY` export data. Time series only — no snapshot/weekly-comparison tab.

## Navigation

`src/components/layout/Sidebar.tsx` — add to the existing "Warehouse Optimization" group:

```ts
{ label: 'Snowflake Warehouse Analysis', href: '/kwo-snowflake-warehouse-analysis' },
```

## Filters

Order (top to bottom / left to right): **Customer → Date Range → Group By → Warehouse**.

1. **Customer** — single-select. Sourced from `data/customers.json` (all customers — no Contract Type filter on this page).
2. **Date Range** — date picker, no artificial restriction (see Group By / Hour note below).
3. **Group By** — single-select granularity: Day / Calendar Week / Calendar Month / 7-day rolling / **Hour** (new `Granularity` value, added to `src/lib/types.ts`).
4. **Warehouse** — single-select, **dependent on Customer**: disabled/empty until a Customer is selected, then populated with that customer's warehouses only. Selecting a new Customer resets the Warehouse selection to empty (same dependent-filter pattern as Contract Type → Customer on the existing KWO for Snowflake page).

### Hour + long date ranges

Hourly granularity is only meaningful up to a 14-day span. The date range picker is **not** restricted. Instead: when Group By = Hour and the selected range exceeds 14 days, the API falls back to Day granularity for that request, and the page shows an inline notice above the charts: *"Hourly granularity supports up to a 14-day range — showing daily data instead."*

## Data Source

`keebo-portal.k3o_prd_<org_id>_000_tf.query_history_view_tf` — Snowflake's `QUERY_HISTORY` account-usage view, exported per-org. `dt` and partition columns are added by our export pipeline; all other columns match Snowflake's documented schema ([QUERY_HISTORY reference](https://docs.snowflake.com/en/sql-reference/account-usage/query_history)):

| Field used | Snowflake column | Purpose |
|---|---|---|
| Query type | `query_type` | Total Queries breakdown |
| Execution time | `execution_time` (ms) | Execution Time avg/p95/p99 |
| Queue time | `queued_provisioning_time` + `queued_repair_time` + `queued_overload_time` (ms) | Queued Queries count, Queue Time avg/p95/p99 |
| Spillage | `bytes_spilled_to_local_storage`, `bytes_spilled_to_remote_storage` | Spillage chart |
| Failure | `execution_status` (= `'fail'`), `error_code` | Failed Queries breakdown |

Warehouse list: `database_warehouses` (existing table, already joined elsewhere in the codebase for warehouse-name lookups), filtered by `org_id`.

## Backend

### New SQL file: `sql/kwo_snowflake_warehouse_analysis_timeseries.sql`

CTE-organized, matching the style of the existing `kwo_snowflake_snapshot.sql`:

- `base` — rows filtered by `warehouse_name` + date range, with a computed period-bucket column (`dt` truncated per granularity; for `hour`, truncate the hourly timestamp instead of `dt`)
- `query_volume` — `COUNT(*)` grouped by period + `query_type`
- `latency` — `APPROX_QUANTILES(execution_time, 100)` → avg/p50/p95/p99, grouped by period
- `queue` — same quantile pattern over `queued_provisioning_time + queued_repair_time + queued_overload_time`; `COUNTIF(... > 0)` for queued-query count
- `spillage` — `SUM(bytes_spilled_to_local_storage)`, `SUM(bytes_spilled_to_remote_storage)`, grouped by period
- `errors` — `COUNT(*)` WHERE `execution_status = 'fail'`, grouped by period + `error_code`, ranked to top 10 per period + collapsed `"Other"`
- Final `SELECT` joins all CTEs on period — one row per period returned.

### New API routes

- `GET /api/kwo-snowflake-warehouse-analysis/timeseries?org_id=&warehouse_name=&start_date=&end_date=&granularity=` — runs the above query, applies the Hour/14-day fallback rule, returns `{ granularity_used, points: [...] }`.
- `GET /api/kwo-snowflake-warehouse-analysis/warehouses?org_id=` — `SELECT DISTINCT warehouse_id, warehouse_name FROM database_warehouses WHERE org_id = @org_id`, returns the list for the Warehouse dropdown.

Both reuse existing `runQuery`, `PROJECT`, `SNF_DATASET`, `AdcAuthError` patterns from `src/lib/bigquery.ts`.

### Types

`src/lib/types.ts` — add `'hour'` to the `Granularity` union. `src/lib/dates.ts` — add an `'hour'` case to `formatPeriodLabel`, `formatCompactPeriodLabel`, `buildPeriods`, `snapToGranularityBoundaries`.

## Frontend

`src/app/kwo-snowflake-warehouse-analysis/page.tsx` — client component, single time-series view (no snapshot tab):

1. **Total Queries** — stacked bar chart, one series per `query_type`
2. **Execution Time** — area chart, 3 series (avg / p95 / p99, ms)
3. **Queued Queries** — bar chart, count per period
4. **Queue Time** — area chart, 3 series (avg / p95 / p99, ms)
5. **Spillage** — stacked bar chart, 2 series (local / remote bytes, human-readable formatting e.g. MB/GB)
6. **Failed Queries** — stacked bar chart, top-10 `error_code` series + "Other"

Below the charts: one `DataTable` with all raw per-period values, sortable (existing `DataTable` component/pattern).

## Error Handling & Edge Cases

- **ADC auth error**: reuse existing `AdcAuthError`/`isAdcAuthError` banner pattern.
- **No Customer selected**: empty-state prompt to select one (reuse existing pattern).
- **Customer selected, no Warehouse yet**: empty-state prompt to select a warehouse.
- **No data for the selected warehouse+range**: charts/table show "No query history for this warehouse in the selected range" instead of rendering blank/broken.
- **Warehouse list fetch failure**: dropdown shows a disabled state with an inline error, not a full-page crash.
- **Hour + range > 14 days**: falls back to Day granularity server-side with an inline notice (see Filters section) — never blocks the date picker.
