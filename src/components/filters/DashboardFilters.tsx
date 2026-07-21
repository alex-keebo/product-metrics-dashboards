'use client'

import { Dropdown } from './Dropdown'
import { DateRangePicker } from './DateRangePicker'
import { ContractType, Granularity } from '@/lib/types'

const CONTRACT_TYPE_OPTIONS = [
  { value: 'consumption', label: 'Consumption' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'trial', label: 'Trials' },
  { value: 'churn', label: 'Churned' },
  { value: 'lost_trial', label: 'Lost Trials' },
  { value: 'internal', label: 'Internal' },
]

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Calendar Week (Sun–Sat)' },
  { value: 'month', label: 'Calendar Month' },
  { value: 'rolling7', label: '7-Day Rolling' },
]

interface Customer {
  org_id: string
  name: string
}

interface DashboardFiltersProps {
  // Global filters
  contractTypes: ContractType[]
  onContractTypesChange: (v: ContractType[]) => void
  availableCustomers: Customer[]
  selectedOrgIds: string[] | null
  onOrgIdsChange: (v: string[] | null) => void

  // Time series only
  granularity?: Granularity
  onGranularityChange?: (v: Granularity) => void
  showGranularity?: boolean
  startDate?: string
  endDate?: string
  onRangeChange?: (start: string, end: string) => void
}

export function DashboardFilters({
  contractTypes,
  onContractTypesChange,
  availableCustomers,
  selectedOrgIds,
  onOrgIdsChange,
  granularity,
  onGranularityChange,
  showGranularity,
  startDate,
  endDate,
  onRangeChange,
}: DashboardFiltersProps) {
  const customerOptions = availableCustomers.map((c) => ({ value: c.org_id, label: c.name }))

  return (
    <div className="flex flex-wrap items-end gap-4">
      <Dropdown
        mode="multi"
        label="Contract Type"
        options={CONTRACT_TYPE_OPTIONS}
        selected={contractTypes}
        onChange={(v) => {
          onContractTypesChange(v as ContractType[])
          onOrgIdsChange(null)
        }}
      />

      <Dropdown
        mode="multi"
        label="Customer"
        options={customerOptions}
        selected={selectedOrgIds ?? customerOptions.map((o) => o.value)}
        onChange={(values) => {
          // When all options are re-selected, go back to the "all" sentinel so
          // new customers added by a contract-type change are auto-included.
          if (values.length === customerOptions.length && customerOptions.length > 0) {
            onOrgIdsChange(null)
          } else {
            onOrgIdsChange(values)
          }
        }}
        disabled={contractTypes.length === 0}
        placeholder={contractTypes.length === 0 ? 'Select contract type first' : 'None selected'}
      />

      {startDate !== undefined && endDate !== undefined && onRangeChange && (
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onRangeChange={onRangeChange}
        />
      )}

      {showGranularity && granularity && onGranularityChange && (
        <Dropdown
          mode="single"
          label="Group By"
          options={GRANULARITY_OPTIONS}
          value={granularity}
          onChange={(v) => onGranularityChange(v as Granularity)}
        />
      )}
    </div>
  )
}
