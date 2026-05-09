# KWO for Databricks Dashboard — Design Specification

## Audience & Goals

- **Users**: Keebo product and leadership teams (internal only)
- **Primary job**: see savings trends and weekly metrics in under 10 seconds
- **Secondary jobs**: analyze by contract type and granularity; run underlying SQL manually in BigQuery

---

## App Structure

- Persistent sidebar navigation
  - "Warehouse Optimization" group: KWO for Databricks, KWO for Snowflake
  - "PostHog" group (future dashboards)
- Desktop-only
- No authentication for initial local use; Cloud Run + Google OAuth (`@keebo.ai`) for future deployment
- BigQuery auth via `gcloud auth application-default login`; project config in `.env.local`

---

## Filters

Filters are global and apply to both Part 1 and Part 2.

### Contract Type (multi-select)
- Options: Consumption, Subscription, Trials, Churned, Lost Trials
- Drives the customer dropdown — customer dropdown shows the union of customers matching all selected contract types
- Changing contract type selection resets any manual customer deselections
- If no contract type is selected, customer dropdown shows no customers
- Contract type is resolved against the **selected date range**, not the customer's current type
- If a customer changes contract type mid-range, their data is **split** at the boundary — e.g. trial Jan 1–15 and subscription Jan 16–31 appear under their respective types for each sub-period

### Customer (multi-select)
- Populated from the union of customers matching selected contract types
- Manual deselections are valid but reset when contract type selection changes
- `org_id` values missing from `customers.json` are labelled "Unknown" and included in all aggregations

### All Multi-select Dropdowns
- Explicit "Select All" option at the top
- Unchecking "Select All" clears all individual selections; user must re-select manually

---

## Dashboard Layout

Two sections (tabs or clearly separated sections):

### Part 1 — Weekly Snapshot

Fixed time window — no date or granularity controls.

- **Time window**: last complete Sun-Sat calendar week vs the week before it (e.g. if today is Thu May 8, last week = Apr 27–May 3, prior week = Apr 20–26)
- **6 KPI tiles** with week-over-week comparison:
  - Current week value displayed prominently
  - Delta below: absolute change + directional arrow (e.g. "+120 DBUs ↑")
  - Color coding: green = improvement (savings up, spend down); red = deterioration (savings down, spend up)
- **Per-customer breakdown table**:
  - Columns: Customer Name, Contract Type, Savings (DBUs), Savings (%), Warehouses (#), Unoptimized Spend (DBUs), Total Spend (DBUs)
  - Sortable by any column header (click to sort, click again to reverse)
  - Default sort: Savings (DBUs) descending
  - CSV export

### Part 2 — Time Series

Controlled by date range and granularity filters (in addition to global contract type and customer filters).

- **Default view**: last ~13 complete Sun-Sat weeks (90 days snapped to full weeks so first and last intervals are always complete)
- **Granularity options**: Day, Calendar Week (Sun-Sat), Calendar Month, 7-day rolling interval (forward from start date)
- Partial periods shown at range boundaries — no clipping

#### Charts (5 total, all aggregated across selected customers)

| Chart | Type |
|---|---|
| Savings (%) | Line |
| Savings (DBUs) | Bar |
| Unoptimized Spend (DBUs) | Bar |
| Total Spend (DBUs) | Bar |
| Warehouses (#) | Line |

- Missing periods: gaps in line charts, omitted bars — **no zero-filling**

#### Data Table

- One row per period per customer
- **Period column** label and format adapts to granularity:
  - Daily → `Date` (e.g. `2026-05-08`)
  - Calendar Week or 7-day interval → `Period` (e.g. `2026-05-01 – 2026-05-07`)
  - Calendar Month → `Month` (e.g. `2025-01`)
- Columns: Period, Customer Name, Contract Type, Savings (DBUs), Savings (%), Warehouses (#), Unoptimized Spend (DBUs), Total Spend (DBUs)
- Sortable by any column header
- Default sort: period descending, then Savings (DBUs) descending
- Pagination: 10 / 20 / 100 rows per page
- CSV export

---

## KPI Definitions

All computed from `keebo-portal.k3o_dbx_gold_tf.savings_history_tf` joined to `customers.json` on `org_id`, filtered by the selected date range and contract type.

| KPI | Formula |
|---|---|
| Savings (DBUs) | `SUM(saved_dbus)` WHERE `active = true` |
| Total Spend (DBUs) | `SUM(actual_dbus)` — all rows (active and inactive) |
| Savings (%) | `SUM(saved_dbus) / (SUM(actual_dbus) + SUM(saved_dbus)) * 100` WHERE `active = true` |
| Unoptimized Spend (DBUs) | `SUM(actual_dbus)` WHERE `active = false` |
| Warehouses (#) | `COUNT(DISTINCT warehouse_id)` WHERE `active = true` |
| Avg Across Customers (%) | Unweighted mean of per-`org_id` Savings (%); customers with no `active = true` rows in the period are excluded from the average |

---

## Data Sources

### BigQuery Tables

| Table | Purpose |
|---|---|
| `keebo-portal.k3o_dbx_gold_tf.savings_history_tf` | Core savings data — grain: one row per warehouse per day. Columns: `date`, `org_id`, `warehouse_id`, `workspace_id`, `account_id`, `actual_dbus`, `saved_dbus`, `active` |
| `keebo-portal.k3o_dbx_gold_tf.connected_workspace_history` | Workspace connection history |
| `keebo-portal.k3o_dbx_gold_tf.connected_warehouse_history` | Warehouse configuration history |

### customers.json

Stored at `data/customers.json`. Maintained manually. Up to ~2000 records.

```json
[
  {
    "org_id": "string",
    "name": "string",
    "valid_from": "YYYY-MM-DD",
    "valid_to": "YYYY-MM-DD | null",
    "contract_type": "trial | lost_trial | subscription | consumption | churn"
  }
]
```

- Multiple entries per `org_id` represent contract type transitions
- `valid_to: null` = current active contract
- `org_id` values in `savings_history_tf` not present in `customers.json` are shown as "Unknown" in tables and included in all aggregations

### SQL Files

Stored in `sql/`. One `.sql` file per query, parameterised with comments explaining parameters. Intended to be runnable directly in BigQuery.

---

## Data Freshness

- No caching layer — live BigQuery queries on every page load
- "Data as of [date]" timestamp displayed on dashboard, derived from `MAX(date)` in `savings_history_tf`

---

## UX & Error Handling

- Per-section loading spinners (not full-page block)
- Inline error message per section if a query fails — rest of dashboard continues to render
- Default dashboard state on load: last ~13 complete weeks, Calendar Week granularity, all contract types selected

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js (React + API routes) |
| Styling | Tailwind CSS |
| Components | shadcn/ui |
| Charts | Recharts |
| BigQuery client | `@google-cloud/bigquery` (Node.js) |
| Auth | Application Default Credentials (`gcloud auth application-default login`) |
| Config | `.env.local` for `BIGQUERY_PROJECT_ID` and `BIGQUERY_DATASET` |
