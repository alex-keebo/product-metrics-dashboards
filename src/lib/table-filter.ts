export type ColumnType = 'text' | 'number' | 'date' | 'multi'

export interface CellData {
  text: string
  values: string[]
  number: number | null
  date: string | null
  isEmpty: boolean
}

export type ConditionType =
  | 'none'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'is_exactly'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'eq'
  | 'neq'
  | 'between'
  | 'date_is'
  | 'date_before'
  | 'date_after'
  | 'date_on_or_before'
  | 'date_on_or_after'
  | 'is_empty'
  | 'is_not_empty'

export interface ColumnCondition {
  type: ConditionType
  value?: string
  value2?: string
}

export interface ColumnFilter {
  condition?: ColumnCondition
  values?: string[]
}

export type SortDirection = 'asc' | 'desc'

export interface SortState {
  columnKey: string
  direction: SortDirection
}

export const CONDITIONS_BY_TYPE: Record<ColumnType, ConditionType[]> = {
  text: ['none', 'contains', 'not_contains', 'starts_with', 'ends_with', 'is_exactly', 'is_empty', 'is_not_empty'],
  multi: ['none', 'contains', 'not_contains', 'starts_with', 'ends_with', 'is_exactly', 'is_empty', 'is_not_empty'],
  number: ['none', 'gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'between', 'is_empty', 'is_not_empty'],
  date: ['none', 'date_is', 'date_before', 'date_after', 'date_on_or_before', 'date_on_or_after', 'is_empty', 'is_not_empty'],
}

export function textCell(value: string | null | undefined): CellData {
  const text = value ?? ''
  return { text, values: text ? [text] : [], number: null, date: null, isEmpty: text.length === 0 }
}

export function numberCell(value: number | null | undefined): CellData {
  const number = value ?? null
  return { text: number === null ? '' : String(number), values: number !== null ? [String(number)] : [], number, date: null, isEmpty: number === null }
}

export function dateCell(value: string | null | undefined): CellData {
  const date = value ?? null
  return { text: date ?? '', values: date !== null ? [date] : [], number: null, date, isEmpty: date === null }
}

export function multiCell(values: string[] | null | undefined): CellData {
  const list = values ?? []
  return { text: list.join(', '), values: list, number: null, date: null, isEmpty: list.length === 0 }
}

export function matchesCondition(cell: CellData, condition: ColumnCondition): boolean {
  switch (condition.type) {
    case 'none':
      return true
    case 'is_empty':
      return cell.isEmpty
    case 'is_not_empty':
      return !cell.isEmpty
    case 'contains':
      return cell.text.toLowerCase().includes((condition.value ?? '').toLowerCase())
    case 'not_contains':
      return !cell.text.toLowerCase().includes((condition.value ?? '').toLowerCase())
    case 'starts_with':
      return cell.text.toLowerCase().startsWith((condition.value ?? '').toLowerCase())
    case 'ends_with':
      return cell.text.toLowerCase().endsWith((condition.value ?? '').toLowerCase())
    case 'is_exactly':
      return cell.text.toLowerCase() === (condition.value ?? '').toLowerCase()
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
    case 'eq':
    case 'neq':
    case 'between': {
      if (cell.number === null) return false
      const v = Number(condition.value)
      if (condition.type === 'gt') return cell.number > v
      if (condition.type === 'gte') return cell.number >= v
      if (condition.type === 'lt') return cell.number < v
      if (condition.type === 'lte') return cell.number <= v
      if (condition.type === 'eq') return cell.number === v
      if (condition.type === 'neq') return cell.number !== v
      const v2 = Number(condition.value2)
      return cell.number >= v && cell.number <= v2
    }
    case 'date_is':
    case 'date_before':
    case 'date_after':
    case 'date_on_or_before':
    case 'date_on_or_after': {
      if (cell.date === null || !condition.value) return false
      if (condition.type === 'date_is') return cell.date === condition.value
      if (condition.type === 'date_before') return cell.date < condition.value
      if (condition.type === 'date_after') return cell.date > condition.value
      if (condition.type === 'date_on_or_before') return cell.date <= condition.value
      return cell.date >= condition.value
    }
    default:
      return true
  }
}

export function matchesValueFilter(cell: CellData, selected: string[] | undefined): boolean {
  if (!selected) return true
  return cell.values.some((v) => selected.includes(v))
}

export function compareCells(type: ColumnType, a: CellData, b: CellData): number {
  if (type === 'number') {
    if (a.number === null && b.number === null) return 0
    if (a.number === null) return 1
    if (b.number === null) return -1
    return a.number - b.number
  }
  if (type === 'date') {
    if (a.date === null && b.date === null) return 0
    if (a.date === null) return 1
    if (b.date === null) return -1
    return a.date.localeCompare(b.date)
  }
  return a.text.toLowerCase().localeCompare(b.text.toLowerCase())
}
