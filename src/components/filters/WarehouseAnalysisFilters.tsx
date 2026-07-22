'use client'

import { Dropdown } from './Dropdown'
import { DateRangePicker } from './DateRangePicker'
import { FilterPanel } from './FilterPanel'
import { Badge } from '@/components/ui/badge'
import type { FilterGroup, Granularity, WarehouseOption } from '@/lib/types'

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: 'hour', label: 'Hour' },
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Calendar Week' },
  { value: 'month', label: 'Calendar Month' },
  { value: 'rolling7', label: '7-Day Rolling' },
]

interface CommonProps {
  customers: { org_id: string; name: string }[]
  selectedCustomer: string | null
  onCustomerChange: (orgId: string | null) => void
  startDate: string
  endDate: string
  onRangeChange: (start: string, end: string) => void
  warehouses: WarehouseOption[]
  warehousesDisabled: boolean
  warehousesError: string | null
}

type WarehouseAnalysisFiltersProps =
  | (CommonProps & {
      variant: 'query'
      granularity: Granularity
      onGranularityChange: (g: Granularity) => void
      selectedWarehouses: string[]
      onWarehousesChange: (names: string[]) => void
      appliedFilter: FilterGroup
      onFilterApply: (next: FilterGroup) => void
    })
  | (CommonProps & {
      variant: 'cluster'
      selectedWarehouse: string | null
      onWarehouseChange: (warehouseName: string | null) => void
    })

export function WarehouseAnalysisFilters(props: WarehouseAnalysisFiltersProps) {
  const {
    customers,
    selectedCustomer,
    onCustomerChange,
    startDate,
    endDate,
    onRangeChange,
    warehouses,
    warehousesDisabled,
    warehousesError,
  } = props

  const warehouseOptions = warehouses.map((w) => ({
    value: w.warehouse_name,
    label: w.warehouse_name,
    badge: w.cost_saving_enabled ? <Badge variant="secondary">Optimized</Badge> : undefined,
    meta: { costSavingEnabled: w.cost_saving_enabled },
  }))

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Dropdown
        mode="single"
        label="Customer"
        options={customers.map((c) => ({ value: c.org_id, label: c.name }))}
        value={selectedCustomer ?? ''}
        onChange={(value) => onCustomerChange(value || null)}
        placeholder="Select customer ..."
      />
      <DateRangePicker startDate={startDate} endDate={endDate} onRangeChange={onRangeChange} />
      {props.variant === 'query' && (
        <Dropdown
          mode="single"
          label="Group By"
          options={GRANULARITY_OPTIONS}
          value={props.granularity}
          onChange={(value) => props.onGranularityChange(value as Granularity)}
        />
      )}
      <div className="flex flex-col gap-1">
        {props.variant === 'query' ? (
          <Dropdown
            mode="multi"
            label="Warehouse"
            options={warehouseOptions}
            selected={props.selectedWarehouses}
            onChange={props.onWarehousesChange}
            disabled={warehousesDisabled}
            testId="warehouse-select-trigger"
            placeholder="Select warehouse ..."
            showFilter={{
              key: 'costSavingEnabled',
              trueLabel: 'Optimized',
              falseLabel: 'Unoptimized',
              predicate: (opt) => opt.meta?.costSavingEnabled === true,
            }}
          />
        ) : (
          <Dropdown
            mode="single"
            label="Warehouse"
            options={warehouseOptions}
            value={props.selectedWarehouse ?? ''}
            onChange={(value) => props.onWarehouseChange(value || null)}
            disabled={warehousesDisabled}
            testId="warehouse-select-trigger"
            placeholder="Select warehouse ..."
            showFilter={{
              key: 'costSavingEnabled',
              trueLabel: 'Optimized',
              falseLabel: 'Unoptimized',
              predicate: (opt) => opt.meta?.costSavingEnabled === true,
            }}
          />
        )}
        {warehousesError && <span className="text-xs text-destructive">{warehousesError}</span>}
      </div>
      {props.variant === 'query' && (
        <FilterPanel appliedFilter={props.appliedFilter} onApply={props.onFilterApply} orgId={selectedCustomer} />
      )}
    </div>
  )
}
