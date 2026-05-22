// src/lib/feature-action-defs.ts

export type AutocaptureAction = { kind: 'autocapture'; dataAttr: string; label: string }
export type CustomAction      = { kind: 'custom'; event: string; label: string }
export type ActionDef         = AutocaptureAction | CustomAction

export const MODULE_ACTIONS: Record<string, ActionDef[]> = {
  'databricks-warehouse-optimization': [
    // Warehouse (autocapture)
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
    // Account / Workspace (autocapture)
    { kind: 'autocapture', dataAttr: 'dbx-add-account',             label: 'Add account' },
    { kind: 'autocapture', dataAttr: 'dbx-add-workspace',           label: 'Add workspace' },
    { kind: 'autocapture', dataAttr: 'dbx-account-picker',          label: 'Account picker' },
    { kind: 'autocapture', dataAttr: 'dbx-account-filter',          label: 'Account filter' },
    { kind: 'autocapture', dataAttr: 'dbx-workspace-picker',        label: 'Workspace picker' },
    { kind: 'autocapture', dataAttr: 'dbx-workspace-filter',        label: 'Workspace filter' },
    { kind: 'autocapture', dataAttr: 'dbx-workspace-dialog-cancel', label: 'Workspace dialog: Cancel' },
    // Guardrails (autocapture)
    { kind: 'autocapture', dataAttr: 'dbx-guardrails-edit',             label: 'Guardrails: Edit' },
    { kind: 'autocapture', dataAttr: 'dbx-guardrails-mode-custom',      label: 'Guardrails: Custom mode' },
    { kind: 'autocapture', dataAttr: 'dbx-guardrails-mode-autoguard',   label: 'Guardrails: Autoguard' },
    { kind: 'autocapture', dataAttr: 'dbx-guardrails-dialog-cancel',    label: 'Guardrails: Cancel' },
    { kind: 'autocapture', dataAttr: 'dbx-guardrails-chart-date-range', label: 'Guardrails: Chart date range' },
    // Settings (autocapture)
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
    { kind: 'custom', event: 'databricks_account_dialog_opened',   label: 'Account dialog: Opened' },
    { kind: 'custom', event: 'databricks_account_added',           label: 'Account added' },
    { kind: 'custom', event: 'databricks_warehouse_dialog_opened', label: 'Warehouse dialog: Opened' },
    { kind: 'custom', event: 'databricks_warehouse_added',         label: 'Warehouse added' },
    { kind: 'custom', event: 'databricks_warehouse_failed',        label: 'Warehouse: Failed' },
    { kind: 'custom', event: 'databricks_workspace_dialog_opened', label: 'Workspace dialog: Opened' },
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
