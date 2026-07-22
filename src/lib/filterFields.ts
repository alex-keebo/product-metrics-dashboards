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
