# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **product metrics dashboard** for Keebo's internal use. It aggregates KPIs from BigQuery and PostHog into a single web application with multiple dashboards across Keebo's product lines.

### Dashboards

1. **KWO for Snowflake** — Keebo Warehouse Optimization metrics for the Snowflake product
2. **KWO for Databricks** — Keebo Warehouse Optimization metrics for the Databricks product
3. **PostHog dashboards** — Multiple views of PostHog product analytics data

### Data Sources

- **BigQuery** — primary store for product KPIs; all warehouse optimization metrics are queried from here
- **PostHog** — product analytics; accessed via the PostHog REST API (no BigQuery export)

## Tech Stack (to be finalized)

Stack decisions have not been made yet. When implementing, prefer:
- A framework with good BigQuery client support (e.g. Next.js + Node, or Python/FastAPI backend)
- Environment variables for all credentials (`GOOGLE_APPLICATION_CREDENTIALS` or `BIGQUERY_SERVICE_ACCOUNT_JSON`, `POSTHOG_API_KEY`, etc.)
- No credentials committed to the repo

## Development Setup

```bash
# First-time setup
gcloud auth application-default login
cp .env.local.example .env.local   # values are already correct for keebo-portal

# Run locally
npm run dev        # starts at http://localhost:3000

# Type check
npx tsc --noEmit

# Lint
npm run lint
```

## KWO for Databricks Dashboard — Spec

Full detailed specification in [design_specs.md](design_specs.md).

### Filters

**Date range picker** + **Date granularity dropdown** (applied together):
- Group by: Day, Calendar Week (Sun-Sat), Calendar Month, 7-day rolling interval
- 7-day rolling rolls forward from the start date
- Calendar Week and Calendar Month show partial periods at range boundaries (no clipping)

**Contract type** (multi-select, drives customer filter):
- Options: Consumption, Subscription, Trials, Churned, Lost Trials
- Selecting contract types populates the customer dropdown with the union of matching customers
- Changing the contract type selection resets any manual customer deselections
- If no contract type is selected, the customer dropdown shows no customers

**Customer** (multi-select, downstream of contract type):
- Shows only customers matching the selected contract types
- Manual deselections within the list are valid but reset when contract type changes

**All multi-select dropdowns share this behaviour:**
- Explicit "Select All" option at the top
- Unchecking "Select All" clears all individual selections; user must re-select manually

### KPIs

All KPIs are computed from `keebo-portal.k3o_dbx_gold_tf.savings_history_tf` joined to the customers file on `org_id`, filtered by the selected date range and contract type.

| Metric | Query logic |
|---|---|
| Savings (DBUs) | `SUM(saved_dbus)` WHERE `active = true` |
| Savings (%) | `SUM(saved_dbus) / (SUM(actual_dbus) + SUM(saved_dbus)) * 100` WHERE `active = true` — savings as % of gross potential spend |
| Avg Across Customers (%) | Per-`org_id` Savings (%), then simple unweighted mean across orgs — e.g. (12% + 30% + 18%) / 3 = 20% |
| Warehouses (#) | `COUNT(DISTINCT warehouse_id)` from `savings_history_tf` within date range |
| Unoptimized Spend (DBUs) | `SUM(actual_dbus)` WHERE `active = false` |
| Total Spend (DBUs) | `SUM(actual_dbus)` across all rows (active and inactive) |

### BigQuery Tables

| Table | Purpose |
|---|---|
| `keebo-portal.k3o_dbx_gold_tf.savings_history_tf` | Core savings data — has `date`, `org_id`, `warehouse_id`, `workspace_id`, `account_id`, `actual_dbus`, `saved_dbus`, `active` |
| `keebo-portal.k3o_dbx_gold_tf.connected_workspace_history` | Workspace connection history |
| `keebo-portal.k3o_dbx_gold_tf.connected_warehouse_history` | Warehouse configuration history; `cost_savings_enabled` indicates whether Keebo is optimizing a warehouse |

### Customer Data

Stored as a **JSON file** in `data/customers.json` (not in BigQuery). Schema:

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

- Multiple entries per `org_id` represent contract type transitions over time
- `valid_to: null` means the current active contract
- Up to ~2000 records total

### Contract Type Filter Behaviour

- Contract type is resolved **against the selected date range**, not the customer's current type
- A customer appears under a given contract type only if their `valid_from`–`valid_to` window overlaps the selected date range
- **Mid-range contract type changes**: data is split by contract period. A customer who was trial Jan 1–15 and subscription Jan 16–31 will appear under "trial" for Jan 1–15 and under "subscription" for Jan 16–31 — their `savings_history_tf` rows are partitioned by the `valid_from`/`valid_to` boundaries in `customers.json`

### Architecture Notes

- Backend should abstract data fetching behind a thin API layer so dashboards are not tightly coupled to BigQuery query logic
- Each dashboard should be a self-contained module/route with its own data-fetching and visualization components
- PostHog data is fetched via the PostHog REST API — there is no BigQuery export
