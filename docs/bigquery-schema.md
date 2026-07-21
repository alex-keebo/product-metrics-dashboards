# BigQuery Schema Reference

**BigQuery** is the primary store for product KPIs; all warehouse optimization metrics are queried from here.

## KWO for Snowflake

A portion of this data is exported from customer Snowflake environments into our BigQuery infrastructure. Customer data in BigQuery is segregated by organization ID (`org_id`).

### Project & Dataset Structure

* **Customer Projects:** Formatted as `k3o_prd_<org_id>_000_tf`
  * *Example (Org ID `90402`):* `k3o_prd_90402_000_tf`
* **Shared Cost/Savings Project:** `k3o_prd_sql_savings_data_tf`
  * Contains tenant-specific analysis tables prefixed with `<org_id>_000_`

### Common Tables (`k3o_prd_sql_savings_data_tf`)

For a given `org_id` (e.g., `90402`), key tables include:
* `<org_id>_000_cost_savings_interval_query_events_transient_tf`
* `<org_id>_000_cost_savings_interval_warehouse_history_transient_tf`
* `<org_id>_000_cost_savings_warehouse_metering_history_transient_tf`
* `<org_id>_000_interval_query_events_transient_tf`
* `<org_id>_000_interval_warehouse_history_transient_tf`
* `<org_id>_000_sql_cost_per_block_breakdown_tf`

### UI & BigQuery Client Reference
* **UI Patterns:** Design components and layouts following the pattern in `/Users/alex/Keebo/pm_operations/product-metrics-dashboards` (specifically the **KWO for Snowflake** section).
* **Data Access:** Reuse existing BigQuery connection and authentication patterns established in `/Users/alex/Keebo/pm_operations/product-metrics-dashboards`.

## KWO for Databricks

All KPIs are computed from `keebo-portal.k3o_dbx_gold_tf.savings_history_tf` joined to the customers file (`data/customers.json`) on `org_id`, filtered by the selected date range and contract type.

### Tables

| Table | Purpose |
|---|---|
| `keebo-portal.k3o_dbx_gold_tf.savings_history_tf` | Core savings data — grain: one row per warehouse per day. Columns: `date`, `org_id`, `warehouse_id`, `workspace_id`, `account_id`, `actual_dbus`, `saved_dbus`, `active` |
| `keebo-portal.k3o_dbx_gold_tf.connected_workspace_history` | Workspace connection history |
| `keebo-portal.k3o_dbx_gold_tf.connected_warehouse_history` | Warehouse configuration history; `cost_savings_enabled` indicates whether Keebo is optimizing a warehouse |

### KPI Query Logic

| Metric | Query logic |
|---|---|
| Savings (DBUs) | `SUM(saved_dbus)` WHERE `active = true` |
| Savings (%) | `SUM(saved_dbus) / (SUM(actual_dbus) + SUM(saved_dbus)) * 100` WHERE `active = true` — savings as % of gross potential spend |
| Avg Across Customers (%) | Per-`org_id` Savings (%), then simple unweighted mean across orgs — e.g. (12% + 30% + 18%) / 3 = 20% |
| Warehouses (#) | `COUNT(DISTINCT warehouse_id)` from `savings_history_tf` within date range |
| Optimization Paused Spend (DBUs) | `SUM(actual_dbus)` WHERE `active = false` (registered warehouses with optimizations paused) |
| Total Spend (DBUs) | `SUM(actual_dbus)` across all rows (active and inactive) |

Full dashboard/filter spec: [design_specs.md](design_specs.md).
