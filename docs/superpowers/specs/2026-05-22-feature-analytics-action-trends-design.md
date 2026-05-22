# Feature Analytics — User Actions Charts

**Date:** 2026-05-22  
**Status:** Approved

## Overview

Add a "User Actions" section to the per-module tabs in the Feature Analytics dashboard. Each tracked action gets its own area chart showing daily click/event count over the selected date range. Covers KWO for Databricks (autocapture + data-attr) and KWO for Snowflake (named custom events) initially; KWI for Snowflake and Platform have no meaningful events yet.

## Event Definitions Config

New file: `src/lib/feature-action-defs.ts`

Two action kinds:
- `{ kind: 'autocapture'; dataAttr: string; label: string }` — `$autocapture` events filtered by CSS selector on `elements_chain`
- `{ kind: 'custom'; event: string; label: string }` — named custom events

```ts
export type AutocaptureAction = { kind: 'autocapture'; dataAttr: string; label: string }
export type CustomAction      = { kind: 'custom'; event: string; label: string }
export type ActionDef         = AutocaptureAction | CustomAction

export const MODULE_ACTIONS: Record<string, ActionDef[]> = {
  'databricks-warehouse-optimization': [
    // Warehouse
    { kind: 'autocapture', dataAttr: 'dbx-warehouse-edit',                      label: 'Warehouse: Edit' },
    { kind: 'autocapture', dataAttr: 'dbx-warehouse-edit-idle-time',             label: 'Warehouse: Idle time' },
    { kind: 'autocapture', dataAttr: 'dbx-warehouse-edit-downsizing',            label: 'Warehouse: Downsizing' },
    { kind: 'autocapture', dataAttr: 'dbx-warehouse-edit-save',                  label: 'Warehouse: Save' },
    { kind: 'autocapture', dataAttr: 'dbx-warehouse-edit-cancel',                label: 'Warehouse: Cancel edit' },
    { kind: 'autocapture', dataAttr: 'dbx-warehouse-add',                        label: 'Warehouse: Add' },
    { kind: 'autocapture', dataAttr: 'dbx-warehouse-toggle-status',              label: 'Warehouse: Toggle status' },
    { kind: 'autocapture', dataAttr: 'dbx-warehouse-filter',                     label: 'Warehouse: Filter' },
    { kind: 'autocapture', dataAttr: 'dbx-warehouse-error-help',                 label: 'Warehouse: Error help' },
    { kind: 'autocapture', dataAttr: 'dbx-warehouse-permissions-dialog-verify',  label: 'Verify permissions' },
    // Account / Workspace
    { kind: 'autocapture', dataAttr: 'dbx-add-account',              label: 'Add account' },
    { kind: 'autocapture', dataAttr: 'dbx-add-workspace',            label: 'Add workspace' },
    { kind: 'autocapture', dataAttr: 'dbx-account-picker',           label: 'Account picker' },
    { kind: 'autocapture', dataAttr: 'dbx-account-filter',           label: 'Account filter' },
    { kind: 'autocapture', dataAttr: 'dbx-workspace-picker',         label: 'Workspace picker' },
    { kind: 'autocapture', dataAttr: 'dbx-workspace-filter',         label: 'Workspace filter' },
    { kind: 'autocapture', dataAttr: 'dbx-workspace-dialog-cancel',  label: 'Workspace dialog: Cancel' },
    // Guardrails
    { kind: 'autocapture', dataAttr: 'dbx-guardrails-edit',             label: 'Guardrails: Edit' },
    { kind: 'autocapture', dataAttr: 'dbx-guardrails-mode-custom',      label: 'Guardrails: Custom mode' },
    { kind: 'autocapture', dataAttr: 'dbx-guardrails-mode-autoguard',   label: 'Guardrails: Autoguard' },
    { kind: 'autocapture', dataAttr: 'dbx-guardrails-dialog-cancel',    label: 'Guardrails: Cancel' },
    { kind: 'autocapture', dataAttr: 'dbx-guardrails-chart-date-range', label: 'Guardrails: Chart date range' },
    // Settings
    { kind: 'autocapture', dataAttr: 'dbx-settings-warehouse-permissions-button', label: 'Settings: Warehouse permissions' },
    { kind: 'autocapture', dataAttr: 'dbx-settings-workspace-permissions-button', label: 'Settings: Workspace permissions' },
    { kind: 'autocapture', dataAttr: 'dbx-settings-service-principal-button',     label: 'Settings: Service principal' },
    { kind: 'autocapture', dataAttr: 'dbx-settings-schema-config-button',         label: 'Settings: Schema config' },
    // Onboarding (named custom events)
    { kind: 'custom', event: 'databricks_onboarding_started',              label: 'Onboarding: Started' },
    { kind: 'custom', event: 'databricks_onboarding_account_connected',    label: 'Onboarding: Account connected' },
    { kind: 'custom', event: 'databricks_onboarding_workspace_connected',  label: 'Onboarding: Workspace connected' },
    { kind: 'custom', event: 'databricks_onboarding_warehouses_connected', label: 'Onboarding: Warehouses connected' },
    { kind: 'custom', event: 'databricks_onboarding_schema_verified',      label: 'Onboarding: Schema verified' },
    { kind: 'custom', event: 'databricks_onboarding_complete',             label: 'Onboarding: Complete' },
    { kind: 'custom', event: 'databricks_onboarding_abandoned',            label: 'Onboarding: Abandoned' },
    // Dialogs (named custom events)
    { kind: 'custom', event: 'databricks_account_dialog_opened',    label: 'Account dialog: Opened' },
    { kind: 'custom', event: 'databricks_account_added',            label: 'Account added' },
    { kind: 'custom', event: 'databricks_warehouse_dialog_opened',  label: 'Warehouse dialog: Opened' },
    { kind: 'custom', event: 'databricks_warehouse_added',          label: 'Warehouse added' },
    { kind: 'custom', event: 'databricks_warehouse_failed',         label: 'Warehouse: Failed' },
    { kind: 'custom', event: 'databricks_workspace_dialog_opened',  label: 'Workspace dialog: Opened' },
  ],
  'warehouse-optimization': [
    { kind: 'custom', event: 'settings_warehouse_optimization_toggled', label: 'Optimization toggled' },
    { kind: 'custom', event: 'settings_warehouse_dialog_opened',        label: 'Warehouse dialog: Opened' },
    { kind: 'custom', event: 'settings_warehouse_dialog_closed',        label: 'Warehouse dialog: Closed' },
    { kind: 'custom', event: 'settings_aggressiveness_slider_changed',  label: 'Aggressiveness slider' },
    { kind: 'custom', event: 'settings_guardrails_updated',             label: 'Guardrails updated' },
    { kind: 'custom', event: 'settings_bulk_operation_performed',       label: 'Bulk operation' },
    { kind: 'custom', event: 'settings_advanced_filters_applied',       label: 'Advanced filters' },
  ],
}
```

Modules not listed (`workload-iq`, `platform`) have no events yet — the UI simply omits the section for those tabs.

## API Route

**`GET /api/feature-analytics/action-trends`**

Query params: `module`, `start` (YYYY-MM-DD), `end` (YYYY-MM-DD), `user_type` (`external` | `internal` | `all`), `project` (`portal` | `integration`).

Returns 400 if `module` has no action definitions. Returns 1-hour cached response (Next.js `revalidate: 3600`).

**Response:**
```ts
{
  series: Array<{
    key: string      // data-attr value or event name
    label: string    // human-readable label from config
    data: Array<{ date: string; count: number }>
  }>
  period: { start: string; end: string }
}
```

Series are ordered by total count DESC (highest-volume action first), so charts render most-used first.

The route splits the module's `ActionDef[]` into two lists — autocapture and custom — and runs up to two queries in parallel, then merges results.

### HogQL — autocapture actions

Runs only when the module has at least one `kind: 'autocapture'` entry. Extracts `data-attr` from `elements_chain` in a single pass:

```sql
SELECT
  toDate(timestamp) AS date,
  extract(elements_chain, 'data-attr="([^"]+)"') AS data_attr,
  count() AS cnt
FROM events
WHERE event = '$autocapture'
  AND toDate(timestamp) >= '{start}' AND toDate(timestamp) <= '{end}'
  AND {user_filter}
  AND match(elements_chain, 'data-attr="({attrs_alternation})"')
GROUP BY date, data_attr
ORDER BY date, data_attr
```

`{attrs_alternation}` is the pipe-joined list of all `dataAttr` values for the module (e.g. `dbx-warehouse-edit|dbx-add-account|...`).

### HogQL — named custom events

Runs only when the module has at least one `kind: 'custom'` entry:

```sql
SELECT
  toDate(timestamp) AS date,
  event,
  count() AS cnt
FROM events
WHERE event IN ('{event1}', '{event2}', ...)
  AND toDate(timestamp) >= '{start}' AND toDate(timestamp) <= '{end}'
  AND {user_filter}
GROUP BY date, event
ORDER BY date, event
```

Both queries run via `Promise.all` when a module has both kinds (e.g. KWO-DBX). Results are merged into a single series array, sorted by total count DESC.

`user_filter` is the same helper as in existing routes:
- `external` → `person.properties.is_internal_user != true`
- `internal` → `person.properties.is_internal_user = true`
- `all` → `1 = 1`

## UI Changes

### New component: `ActionTrendCard`

Same structure as `PageDauCard` with:
- Title: action `label`
- Y-axis / tooltip unit: **"Clicks"** (not "DAU")
- Data key: `count` (not `dau`)
- No `padDateRange` needed — backend already returns daily rows; frontend pads zeros the same way

### New section in `DetailTab`

Below the existing DAU grid, add a "User Actions" section when `actionSeries` is non-empty:

```
[section divider]
User Actions                          ← small heading, text-sm font-semibold
[2-column grid of ActionTrendCards]
```

If the module has no action definitions (KWI-SF, Platform), the section is simply not rendered.

### State & fetching in `FeatureAnalyticsPage`

New parallel fetch `fetchActionTrends` alongside existing `fetchDauTrends`:
- New state: `actionTrends: Record<string, ActionSeries[] | null>`, `actionTrendsLoading`, `actionTrendsError`
- Fetches once per module that has definitions, on same filter change trigger as DAU trends
- Passed into `DetailTab` as new props `actionSeries`, `actionLoading`, `actionError`

## Files Changed

| File | Change |
|---|---|
| `src/lib/feature-action-defs.ts` | New — event definitions config |
| `src/app/api/feature-analytics/action-trends/route.ts` | New — API route |
| `src/app/feature-analytics/page.tsx` | Add fetch, state, pass props to `DetailTab`; add `ActionTrendCard` and section in `DetailTab` |
