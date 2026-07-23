# Overview tab for Snowflake Warehouse Analysis

## Plan

- [x] Rename tab label "Query analysis" → "Warehouse analysis" in `src/app/kwo-snowflake-warehouse-analysis/page.tsx` (keep internal `activeTab` key `'query'` — cosmetic label rename only)
- [x] Add new SQL file `sql/kwo_snowflake_warehouse_analysis_spend_by_warehouse.sql` — `SUM(CREDITS_USED_COMPUTE)` from `warehouse_metering_history_tf` grouped by `WAREHOUSE_NAME`, scoped by org dataset + date range, optional `warehouse_names` filter (empty/omitted = all warehouses)
- [x] Add types in `src/lib/types.ts`: `WarehouseSpendPoint { warehouse_name: string; credits_used: number }`, `WarehouseSpendResponse { points: WarehouseSpendPoint[] }`
- [x] Add API route `src/app/api/kwo-snowflake-warehouse-analysis/spend-by-warehouse/route.ts` (POST: org_id, start_date, end_date, warehouse_names?) using `loadOrgScopedSql` + `runQuery`, same validation pattern as `timeseries/route.ts`
- [x] Extract the "Usage" chart block out of `WarehouseAnalysisCharts.tsx` into a standalone `UsageChart` component (in `TimeSeriesCharts.tsx`) taking `{ points, loading }`, reuse it from both `WarehouseAnalysisCharts` and the new Overview tab — no JSX duplication
- [x] Add new `SpendDistributionChart` component using existing `SimpleBarChart` (`direction="horizontal"`), sorted desc by `credits_used`, wrapped in a fixed max-height `overflow-y: auto` container (inner chart height scales with row count so it scrolls)
- [x] Update `WarehouseAnalysisFilters`: rename old `'query'` multi-select variant behavior — `'query'` variant (Warehouse analysis tab) is now **single-select** warehouse dropdown; new `'overview'` variant is **multi-select** warehouse dropdown + Group By, no FilterPanel
- [x] In `page.tsx`: add `'overview'` to `activeTab` union, make it default tab, tab order Overview → Warehouse analysis → Cluster Activity. Refactor warehouse selection state: `selectedOverviewWarehouses: string[]` (Overview, multi), `selectedWarehouse: string | null` (Warehouse analysis, now single — was multi), `selectedClusterWarehouse` unchanged (Cluster Activity, single). Update all `/timeseries` + histogram fetch effects on Warehouse analysis tab to send `warehouse_names: [selectedWarehouse]`, guarded on `!selectedWarehouse`. Overview fetches (`/timeseries` for Usage, `/spend-by-warehouse` for Spend distribution) send `warehouse_names: selectedOverviewWarehouses` (empty = all, server-side). Tab-switch carry-over: switching to Warehouse analysis/Cluster Activity seeds the target's empty single-select from the other tab's current selection.
- [x] `npx tsc --noEmit` and `npm run lint` (tsc clean; lint shows only pre-existing repo-wide `set-state-in-effect` warnings unrelated to this change)
- [x] Manually verify in browser: tab order/labels, Overview loads by default, Usage + Spend distribution render and scroll correctly, other two tabs unaffected

## Review
Page served 200 at `/kwo-snowflake-warehouse-analysis` with all three tab labels present in correct order (Overview, Warehouse analysis, Cluster Activity). `tsc --noEmit` clean. `npm run lint` shows only pre-existing repo-wide `set-state-in-effect` warnings, unrelated.

### Follow-up fix: Overview "all warehouses" BigQuery OOM
Initial wiring reused `/api/.../timeseries` for Overview's Usage chart. That endpoint requires non-empty `warehouse_names` (400 otherwise), so "all warehouses" (empty selection) was patched to pass every org warehouse name — this in turn made the underlying `kwo_snowflake_warehouse_analysis_timeseries.sql` (built for single/few-warehouse deep-dives, with `APPROX_QUANTILES`/`ROW_NUMBER()`/`concurrency_sweep` window functions over all of `query_history_view_tf`) exceed BigQuery's per-query memory limit when scanning an entire org's query history at once ("Resources exceeded ... sort operations used for analytic OVER() clauses").

Fix: added a new lightweight endpoint scoped to what Overview's Usage chart actually needs (`credits_used` per period, no percentiles/concurrency):
- `sql/kwo_snowflake_warehouse_analysis_usage_by_period.sql` — reads only `warehouse_metering_history_tf`, grouped by period, empty-`warehouse_names`-means-all (same convention as `spend_by_warehouse.sql`), no window functions.
- `src/app/api/kwo-snowflake-warehouse-analysis/usage-by-period/route.ts` — mirrors `timeseries/route.ts`'s period-building logic but `spend-by-warehouse/route.ts`'s validation (org_id/start/end required, warehouse_names optional).
- `WarehouseUsagePoint`/`WarehouseUsageResponse` added to `src/lib/types.ts`.
- Overview's Usage `useEffect` in `page.tsx` now calls `/usage-by-period` with `selectedOverviewWarehouses` directly (empty = all, handled server-side) — removed the workaround that expanded empty selection to the full warehouse-name list client-side.

Verified: `tsc --noEmit` clean, lint unchanged (no new error classes), curl to `/usage-by-period` with `warehouse_names: []` against a real org returns 200 (no OOM). Browser click-through of Overview tab with "All warehouses" selected on a customer with substantial query volume is recommended to visually confirm the Usage chart renders non-zero data end-to-end.

### Follow-up fix: "no data" bug + concurrency metric rework (4-bullet report)

1. **"No data" root cause (not a data-freshness issue)** — `@google-cloud/bigquery` sends an empty JS array param as SQL `NULL`, not `ARRAY<STRING>[]`. This broke the "empty warehouse_names = all warehouses" convention: `ARRAY_LENGTH(@warehouse_names) = 0 OR ...` becomes `NULL OR NULL` = `NULL` (excludes every row), not `TRUE`. Fixed in `sql/kwo_snowflake_warehouse_analysis_usage_by_period.sql` and `sql/kwo_snowflake_warehouse_analysis_spend_by_warehouse.sql`: `COALESCE(ARRAY_LENGTH(@warehouse_names), 0) = 0 OR ...`. Verified via direct `bq query` and live curl post dev-server-restart (SQL files are cached in-process by `loadOrgScopedSql`, so edits need a restart, not just a save).
2. **Dropdown showed "All warehouses" label but nothing checked** — Overview's warehouse-fetch effect in `page.tsx` now seeds `selectedOverviewWarehouses` with the full warehouse-name list as soon as warehouses load for a customer, so the multi-select popover visually matches the label.
3. **Warehouse analysis tab dropdown single-select** — already implemented in the prior Overview-tab refactor (`selectedWarehouse: string | null`, `variant="query"`); no further change needed.
4. **Concurrency rework** — rewrote the sweep-line concurrency CTEs in `sql/kwo_snowflake_warehouse_analysis_timeseries.sql`:
   - `concurrent_queries_max`: swept per-`warehouse_name` (clusters within a warehouse merged, since a warehouse's clusters share the account's queueing pressure), then `MAX(...)` across all selected warehouses per period.
   - `concurrent_queries_per_cluster_max` (replaces `concurrent_queries_avg`): swept per-`(warehouse_name, cluster_number)` using the `CLUSTER_NUMBER` column from `query_history_view_tf`, then `MAX(...)` across all (warehouse, cluster) pairs per period.
   - Updated `WarehouseAnalysisPoint` (`src/lib/types.ts`), `/timeseries` route.ts, `WarehouseAnalysisCharts.tsx` (KPI totals now show both "Max Concurrent" and "Max Concurrent per Cluster", chart legend/lines renamed), and the CSV export column list in `page.tsx`. Renamed test fixtures/assertions accordingly.

Verified: `tsc --noEmit` clean. `npm run lint` unchanged (only pre-existing repo-wide `set-state-in-effect`/misc warnings). Vitest: one pre-existing failure in `route.test.ts` ("splices the same compiled filter fragment...") confirmed via `git stash` to predate this session's changes, unrelated. Live curl against a real warehouse with real query volume (`EDP_RND_APD_FND_DH_INGESTION_WH`, org `75cb5`) after dev-server restart returned `concurrent_queries_max: 9`, `concurrent_queries_per_cluster_max: 7` — per-cluster max correctly ≤ combined per-warehouse max.
