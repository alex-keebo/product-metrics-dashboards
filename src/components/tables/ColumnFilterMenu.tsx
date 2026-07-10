'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ColumnCondition, ColumnFilter, ColumnType, ConditionType } from '@/lib/table-filter'
import { CONDITIONS_BY_TYPE } from '@/lib/table-filter'

const CONDITION_LABELS: Record<ConditionType, string> = {
  none: 'None',
  contains: 'Text contains',
  not_contains: 'Text does not contain',
  starts_with: 'Text starts with',
  ends_with: 'Text ends with',
  is_exactly: 'Text is exactly',
  gt: 'Greater than',
  gte: 'Greater than or equal to',
  lt: 'Less than',
  lte: 'Less than or equal to',
  eq: 'Equal to',
  neq: 'Not equal to',
  between: 'Between',
  date_is: 'Date is',
  date_before: 'Date is before',
  date_after: 'Date is after',
  date_on_or_before: 'Date is on or before',
  date_on_or_after: 'Date is on or after',
  is_empty: 'Is empty',
  is_not_empty: 'Is not empty',
}

const NEEDS_ONE_INPUT: ConditionType[] = [
  'contains', 'not_contains', 'starts_with', 'ends_with', 'is_exactly',
  'gt', 'gte', 'lt', 'lte', 'eq', 'neq',
  'date_is', 'date_before', 'date_after', 'date_on_or_before', 'date_on_or_after',
]

export interface ColumnFilterMenuProps {
  columnType: ColumnType
  uniqueValues: string[]
  filter: ColumnFilter
  sortDirection: 'asc' | 'desc' | null
  onApply: (filter: ColumnFilter) => void
  onSort: (direction: 'asc' | 'desc') => void
  onClose: () => void
}

function inputType(columnType: ColumnType): string {
  if (columnType === 'number') return 'number'
  if (columnType === 'date') return 'date'
  return 'text'
}

export function ColumnFilterMenu({
  columnType,
  uniqueValues,
  filter,
  onApply,
  onSort,
  onClose,
}: ColumnFilterMenuProps) {
  const [condition, setCondition] = useState<ColumnCondition>(filter.condition ?? { type: 'none' })
  const [conditionOpen, setConditionOpen] = useState(Boolean(filter.condition && filter.condition.type !== 'none'))
  const [valuesOpen, setValuesOpen] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set(filter.values ?? uniqueValues))

  const conditions = CONDITIONS_BY_TYPE[columnType]
  const visibleValues = useMemo(
    () => uniqueValues.filter((v) => v.toLowerCase().includes(search.toLowerCase())),
    [uniqueValues, search]
  )

  function toggleValue(value: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  function handleOk() {
    const values = selected.size === uniqueValues.length ? undefined : Array.from(selected)
    onApply({
      condition: condition.type === 'none' ? undefined : condition,
      values,
    })
    onClose()
  }

  return (
    <div className="w-72 rounded-lg bg-popover p-2 text-popover-foreground shadow-md ring-1 ring-foreground/10 text-sm">
      <div className="flex flex-col">
        <button
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-accent hover:text-accent-foreground"
          onClick={() => onSort('asc')}
        >
          Sort A to Z
        </button>
        <button
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-accent hover:text-accent-foreground"
          onClick={() => onSort('desc')}
        >
          Sort Z to A
        </button>
      </div>

      <div className="my-1.5 h-px bg-border" />

      <button
        className="flex w-full items-center justify-between px-1.5 py-1 font-medium"
        onClick={() => setConditionOpen((v) => !v)}
      >
        Filter by condition
        <span className={cn('transition-transform', conditionOpen ? 'rotate-180' : '')}>▾</span>
      </button>
      {conditionOpen && (
        <div className="flex flex-col gap-1.5 px-1.5 pb-2">
          <select
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            value={condition.type}
            onChange={(e) => setCondition({ type: e.target.value as ConditionType })}
          >
            {conditions.map((c) => (
              <option key={c} value={c}>{CONDITION_LABELS[c]}</option>
            ))}
          </select>
          {NEEDS_ONE_INPUT.includes(condition.type) && (
            <input
              type={inputType(columnType)}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm"
              value={condition.value ?? ''}
              onChange={(e) => setCondition({ ...condition, value: e.target.value })}
            />
          )}
          {condition.type === 'between' && (
            <input
              type={inputType(columnType)}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm"
              value={condition.value2 ?? ''}
              onChange={(e) => setCondition({ ...condition, value2: e.target.value })}
            />
          )}
        </div>
      )}

      <div className="my-1.5 h-px bg-border" />

      <button
        className="flex w-full items-center justify-between px-1.5 py-1 font-medium"
        onClick={() => setValuesOpen((v) => !v)}
      >
        Filter by values
        <span className={cn('transition-transform', valuesOpen ? 'rotate-180' : '')}>▾</span>
      </button>
      {valuesOpen && (
        <div className="flex flex-col gap-1.5 px-1.5 pb-2">
          <div className="flex items-center justify-between text-xs">
            <button className="text-primary hover:underline" onClick={() => setSelected(new Set(uniqueValues))}>
              Select all {uniqueValues.length}
            </button>
            <button className="text-primary hover:underline" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
          <div className="text-xs text-muted-foreground">Displaying {visibleValues.length}</div>
          <input
            type="text"
            placeholder="Search values"
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-40 overflow-y-auto flex flex-col gap-0.5">
            {visibleValues.map((value) => (
              <label key={value} className="flex items-center gap-1.5 px-1 py-0.5 hover:bg-accent hover:text-accent-foreground rounded-md">
                <input
                  type="checkbox"
                  checked={selected.has(value)}
                  onChange={() => toggleValue(value)}
                />
                <span className="truncate">{value}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="my-1.5 h-px bg-border" />

      <div className="flex justify-end gap-2 px-1.5 pt-1">
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={handleOk}>OK</Button>
      </div>
    </div>
  )
}
