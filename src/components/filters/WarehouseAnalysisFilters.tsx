'use client'

import { Dropdown } from './Dropdown'
import { DateRangePicker } from './DateRangePicker'
import { Badge } from '@/components/ui/badge'
import type { Granularity, WarehouseOption } from '@/lib/types'

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Calendar Week' },
  { value: 'month', label: 'Calendar Month' },
  { value: 'rolling7', label: '7-Day Rolling' },
  { value: 'hour', label: 'Hour' },
]

interface WarehouseAnalysisFiltersProps {
  customers: { org_id: string; name: string }[]
  selectedCustomer: string | null
  onCustomerChange: (orgId: string | null) => void
  startDate: string
  endDate: string
  onRangeChange: (start: string, end: string) => void
  granularity: Granularity
  onGranularityChange: (g: Granularity) => void
  warehouses: WarehouseOption[]
  selectedWarehouse: string | null
  onWarehouseChange: (warehouseName: string | null) => void
  warehousesDisabled: boolean
  warehousesError: string | null
}

export function WarehouseAnalysisFilters({
  customers,
  selectedCustomer,
  onCustomerChange,
  startDate,
  endDate,
  onRangeChange,
  granularity,
  onGranularityChange,
  warehouses,
  selectedWarehouse,
  onWarehouseChange,
  warehousesDisabled,
  warehousesError,
}: WarehouseAnalysisFiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Dropdown
        mode="single"
        label="Customer"
        options={customers.map((c) => ({ value: c.org_id, label: c.name }))}
        value={selectedCustomer ?? ''}
        onChange={(value) => {
          onCustomerChange(value || null)
          onWarehouseChange(null)
        }}
        placeholder="Select customer ..."
      />
      <DateRangePicker startDate={startDate} endDate={endDate} onRangeChange={onRangeChange} />
      <Dropdown
        mode="single"
        label="Group By"
        options={GRANULARITY_OPTIONS}
        value={granularity}
        onChange={(value) => onGranularityChange(value as Granularity)}
      />
      <div className="flex flex-col gap-1">
        <Dropdown
          mode="single"
          label="Warehouse"
          options={warehouses.map((w) => ({
            value: w.warehouse_name,
            label: w.warehouse_name,
            badge: w.cost_saving_enabled ? <Badge variant="secondary">Optimized</Badge> : undefined,
            meta: { costSavingEnabled: w.cost_saving_enabled },
          }))}
          value={selectedWarehouse ?? ''}
          onChange={(value) => onWarehouseChange(value || null)}
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
        {warehousesError && <span className="text-xs text-destructive">{warehousesError}</span>}
      </div>
    </div>
  )
}
