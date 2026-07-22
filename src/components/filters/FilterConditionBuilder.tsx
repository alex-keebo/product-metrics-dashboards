'use client'

import { useEffect, useState } from 'react'
import { Dropdown } from './Dropdown'
import { FILTER_FIELDS, OPERATORS_BY_TYPE, FIELD_SECTIONS } from '@/lib/filterFields'
import { isFilterGroup, type FilterCondition, type FilterGroup, type FilterOperator } from '@/lib/types'

let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

export function newCondition(): FilterCondition {
  return { id: nextId('cond'), field: '', operator: '=', value: '' }
}

export function newGroup(match: 'AND' | 'OR' = 'AND'): FilterGroup {
  return { id: nextId('group'), match, conditions: [newCondition()] }
}

const FIELD_OPTIONS = FIELD_SECTIONS.flatMap((section) =>
  section.keys.map((key) => ({ value: key, label: FILTER_FIELDS[key].label }))
)

function needsValueInput(operator: FilterOperator): boolean {
  return operator !== 'is null' && operator !== 'is not null'
}

function isListOperator(operator: FilterOperator): boolean {
  return operator === 'IN' || operator === 'NOT IN'
}

function ConditionRow({
  condition,
  orgId,
  onChange,
  onRemove,
}: {
  condition: FilterCondition
  orgId: string | null
  onChange: (next: FilterCondition) => void
  onRemove: () => void
}) {
  const fieldDef = condition.field ? FILTER_FIELDS[condition.field] : undefined
  const operatorOptions = fieldDef ? OPERATORS_BY_TYPE[fieldDef.type] : []
  const [autocompleteValues, setAutocompleteValues] = useState<string[]>([])

  useEffect(() => {
    if (!fieldDef?.autocomplete || !orgId) {
      setAutocompleteValues([])
      return
    }
    const controller = new AbortController()
    fetch(`/api/kwo-snowflake-warehouse-analysis/distinct-values?org_id=${orgId}&field=${condition.field}`, {
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((body: { values?: string[] }) => setAutocompleteValues(body.values ?? []))
      .catch(() => setAutocompleteValues([]))
    return () => controller.abort()
  }, [fieldDef?.autocomplete, orgId, condition.field])

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="filter-condition-row">
      <Dropdown
        mode="single"
        label="Field"
        options={FIELD_OPTIONS}
        value={condition.field}
        placeholder="Select field ..."
        onChange={(field) => {
          const def = FILTER_FIELDS[field]
          onChange({ ...condition, field, operator: OPERATORS_BY_TYPE[def.type][0], value: '' })
        }}
      />
      {fieldDef && (
        <Dropdown
          mode="single"
          label="Operator"
          options={operatorOptions.map((op) => ({ value: op, label: op }))}
          value={condition.operator}
          onChange={(operator) =>
            onChange({
              ...condition,
              operator: operator as FilterOperator,
              value: isListOperator(operator as FilterOperator) ? [] : '',
            })
          }
        />
      )}
      {fieldDef && needsValueInput(condition.operator) && fieldDef.type === 'boolean' && (
        <Dropdown
          mode="single"
          label="Value"
          options={[
            { value: 'true', label: 'True' },
            { value: 'false', label: 'False' },
          ]}
          value={typeof condition.value === 'string' ? condition.value : ''}
          onChange={(value) => onChange({ ...condition, value })}
        />
      )}
      {fieldDef && needsValueInput(condition.operator) && fieldDef.type !== 'boolean' && isListOperator(condition.operator) && (
        <Dropdown
          mode="multi"
          label="Value"
          options={autocompleteValues.map((v) => ({ value: v, label: v }))}
          selected={Array.isArray(condition.value) ? condition.value : []}
          onChange={(value) => onChange({ ...condition, value })}
          placeholder="Select values ..."
        />
      )}
      {fieldDef &&
        needsValueInput(condition.operator) &&
        fieldDef.type !== 'boolean' &&
        !isListOperator(condition.operator) &&
        (fieldDef.autocomplete ? (
          <Dropdown
            mode="single"
            label="Value"
            options={autocompleteValues.map((v) => ({ value: v, label: v }))}
            value={typeof condition.value === 'string' ? condition.value : ''}
            onChange={(value) => onChange({ ...condition, value })}
            placeholder="Select value ..."
          />
        ) : (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium" htmlFor={`${condition.id}-value`}>
              Value
            </label>
            <input
              id={`${condition.id}-value`}
              className="border border-border rounded px-2 py-1.5 text-sm bg-card text-foreground"
              type={fieldDef.type === 'number' ? 'number' : 'text'}
              value={typeof condition.value === 'string' ? condition.value : ''}
              onChange={(e) => onChange({ ...condition, value: e.target.value })}
            />
          </div>
        ))}
      <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={onRemove}>
        Remove
      </button>
    </div>
  )
}

export function FilterConditionBuilder({
  group,
  orgId,
  onChange,
}: {
  group: FilterGroup
  orgId: string | null
  onChange: (next: FilterGroup) => void
}) {
  function updateNode(index: number, next: FilterCondition | FilterGroup) {
    const conditions = [...group.conditions]
    conditions[index] = next
    onChange({ ...group, conditions })
  }

  function removeNode(index: number) {
    const conditions = group.conditions.filter((_, i) => i !== index)
    onChange({ ...group, conditions })
  }

  return (
    <div className="flex flex-col gap-2 pl-2 border-l border-border" data-testid="filter-group">
      <div className="flex items-center gap-2">
        <Dropdown
          mode="single"
          label="Match"
          options={[
            { value: 'AND', label: 'AND' },
            { value: 'OR', label: 'OR' },
          ]}
          value={group.match}
          onChange={(match) => onChange({ ...group, match: match as 'AND' | 'OR' })}
        />
      </div>
      {group.conditions.map((node, index) =>
        isFilterGroup(node) ? (
          <FilterConditionBuilder
            key={node.id}
            group={node}
            orgId={orgId}
            onChange={(next) => updateNode(index, next)}
          />
        ) : (
          <ConditionRow
            key={node.id}
            condition={node}
            orgId={orgId}
            onChange={(next) => updateNode(index, next)}
            onRemove={() => removeNode(index)}
          />
        )
      )}
      <div className="flex gap-3">
        <button
          type="button"
          className="text-xs text-primary"
          onClick={() => onChange({ ...group, conditions: [...group.conditions, newCondition()] })}
        >
          + Add condition
        </button>
        <button
          type="button"
          className="text-xs text-primary"
          onClick={() => onChange({ ...group, conditions: [...group.conditions, newGroup()] })}
        >
          + Add group
        </button>
      </div>
    </div>
  )
}
