import { FILTER_FIELDS } from './filterFields'
import { isFilterGroup, type FilterCondition, type FilterGroup } from './types'

export interface CompiledFilter {
  sql: string
  params: Record<string, unknown>
  types: Record<string, string | string[]>
}

function coerceValue(fieldType: 'string' | 'number' | 'boolean', raw: string): string | number | boolean {
  if (fieldType === 'number') return Number(raw)
  if (fieldType === 'boolean') return raw === 'true'
  return raw
}

function compileCondition(
  cond: FilterCondition,
  params: Record<string, unknown>,
  types: Record<string, string | string[]>
): string {
  const def = FILTER_FIELDS[cond.field]
  if (!def) {
    throw new Error(`unknown filter field: ${cond.field}`)
  }

  if (cond.operator === 'is null') return `${def.column} IS NULL`
  if (cond.operator === 'is not null') return `${def.column} IS NOT NULL`

  const paramName = `p_${Object.keys(params).length}`

  if (cond.operator === 'IN' || cond.operator === 'NOT IN') {
    const values = (Array.isArray(cond.value) ? cond.value : [cond.value]).map((v) => coerceValue(def.type, v))
    params[paramName] = values
    const bqType = def.type === 'number' ? 'FLOAT64' : def.type === 'boolean' ? 'BOOL' : 'STRING'
    types[paramName] = [bqType]
    return `${def.column} ${cond.operator} UNNEST(@${paramName})`
  }

  const rawValue = Array.isArray(cond.value) ? cond.value[0] ?? '' : cond.value

  if (cond.operator === 'contains' || cond.operator === 'starts with' || cond.operator === 'ends with') {
    const pattern =
      cond.operator === 'contains'
        ? `%${rawValue}%`
        : cond.operator === 'starts with'
          ? `${rawValue}%`
          : `%${rawValue}`
    params[paramName] = pattern
    return `${def.column} LIKE @${paramName}`
  }

  params[paramName] = coerceValue(def.type, rawValue)
  return `${def.column} ${cond.operator} @${paramName}`
}

function compileGroup(
  group: FilterGroup,
  params: Record<string, unknown>,
  types: Record<string, string | string[]>
): string {
  const parts = group.conditions
    .map((node) => (isFilterGroup(node) ? compileGroup(node, params, types) : compileCondition(node, params, types)))
    .filter((s) => s.length > 0)

  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  return `(${parts.join(` ${group.match} `)})`
}

export function buildFilterWhereClause(group: FilterGroup): CompiledFilter {
  const params: Record<string, unknown> = {}
  const types: Record<string, string | string[]> = {}
  const sql = compileGroup(group, params, types)
  return { sql, params, types }
}
