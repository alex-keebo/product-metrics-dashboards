import { describe, it, expect } from 'vitest'
import {
  textCell,
  numberCell,
  dateCell,
  multiCell,
  matchesCondition,
  matchesValueFilter,
  compareCells,
  type ColumnCondition,
} from '../table-filter'

describe('cell builders', () => {
  it('textCell marks null/empty as isEmpty', () => {
    expect(textCell(null).isEmpty).toBe(true)
    expect(textCell('').isEmpty).toBe(true)
    expect(textCell('hi')).toMatchObject({ text: 'hi', isEmpty: false })
  })

  it('multiCell joins values into text and keeps individual values', () => {
    const cell = multiCell(['KWO for Databricks', 'KWO for Snowflake'])
    expect(cell.text).toBe('KWO for Databricks, KWO for Snowflake')
    expect(cell.values).toEqual(['KWO for Databricks', 'KWO for Snowflake'])
    expect(cell.isEmpty).toBe(false)
  })

  it('multiCell treats null/empty array as empty', () => {
    expect(multiCell(null).isEmpty).toBe(true)
    expect(multiCell([]).isEmpty).toBe(true)
  })

  it('numberCell and dateCell propagate null', () => {
    expect(numberCell(null)).toMatchObject({ number: null, isEmpty: true })
    expect(numberCell(420)).toMatchObject({ number: 420, isEmpty: false })
    expect(dateCell(null)).toMatchObject({ date: null, isEmpty: true })
    expect(dateCell('2026-07-08')).toMatchObject({ date: '2026-07-08', isEmpty: false })
  })
})

describe('matchesCondition — text', () => {
  const cell = textCell('KWO for Databricks')
  it('contains / not_contains', () => {
    expect(matchesCondition(cell, { type: 'contains', value: 'databricks' })).toBe(true)
    expect(matchesCondition(cell, { type: 'not_contains', value: 'databricks' })).toBe(false)
  })
  it('starts_with / ends_with / is_exactly', () => {
    expect(matchesCondition(cell, { type: 'starts_with', value: 'KWO' })).toBe(true)
    expect(matchesCondition(cell, { type: 'ends_with', value: 'databricks' })).toBe(true)
    expect(matchesCondition(cell, { type: 'is_exactly', value: 'kwo for databricks' })).toBe(true)
  })
  it('is_empty / is_not_empty / none', () => {
    expect(matchesCondition(textCell(''), { type: 'is_empty' })).toBe(true)
    expect(matchesCondition(cell, { type: 'is_not_empty' })).toBe(true)
    expect(matchesCondition(cell, { type: 'none' })).toBe(true)
  })
})

describe('matchesCondition — number', () => {
  const cell = numberCell(420)
  const cases: [ColumnCondition, boolean][] = [
    [{ type: 'gt', value: '400' }, true],
    [{ type: 'gte', value: '420' }, true],
    [{ type: 'lt', value: '420' }, false],
    [{ type: 'lte', value: '420' }, true],
    [{ type: 'eq', value: '420' }, true],
    [{ type: 'neq', value: '420' }, false],
    [{ type: 'between', value: '400', value2: '500' }, true],
    [{ type: 'between', value: '500', value2: '600' }, false],
  ]
  it.each(cases)('%o -> %s', (condition, expected) => {
    expect(matchesCondition(cell, condition)).toBe(expected)
  })
  it('empty cell never matches numeric comparisons', () => {
    expect(matchesCondition(numberCell(null), { type: 'gt', value: '0' })).toBe(false)
  })
})

describe('matchesCondition — date', () => {
  const cell = dateCell('2026-07-08')
  const cases: [ColumnCondition, boolean][] = [
    [{ type: 'date_is', value: '2026-07-08' }, true],
    [{ type: 'date_before', value: '2026-07-09' }, true],
    [{ type: 'date_after', value: '2026-07-07' }, true],
    [{ type: 'date_on_or_before', value: '2026-07-08' }, true],
    [{ type: 'date_on_or_after', value: '2026-07-08' }, true],
    [{ type: 'date_before', value: '2026-07-08' }, false],
  ]
  it.each(cases)('%o -> %s', (condition, expected) => {
    expect(matchesCondition(cell, condition)).toBe(expected)
  })
})

describe('matchesValueFilter', () => {
  it('undefined selection means no restriction', () => {
    expect(matchesValueFilter(multiCell(['A']), undefined)).toBe(true)
  })
  it('matches if any individual value is selected', () => {
    expect(matchesValueFilter(multiCell(['A', 'B']), ['B', 'C'])).toBe(true)
    expect(matchesValueFilter(multiCell(['A']), ['C'])).toBe(false)
  })
  it('matches numberCell against its display value', () => {
    expect(matchesValueFilter(numberCell(420), ['420'])).toBe(true)
    expect(matchesValueFilter(numberCell(420), ['500'])).toBe(false)
  })
  it('matches dateCell against its display value', () => {
    expect(matchesValueFilter(dateCell('2026-07-08'), ['2026-07-08'])).toBe(true)
    expect(matchesValueFilter(dateCell('2026-07-08'), ['2026-01-01'])).toBe(false)
  })
})

describe('compareCells', () => {
  it('compares numbers numerically', () => {
    expect(compareCells('number', numberCell(1), numberCell(2))).toBeLessThan(0)
  })
  it('compares text lexically, case-insensitively', () => {
    expect(compareCells('text', textCell('apple'), textCell('Banana'))).toBeLessThan(0)
  })
  it('compares dates as ISO strings', () => {
    expect(compareCells('date', dateCell('2026-01-01'), dateCell('2026-02-01'))).toBeLessThan(0)
  })
  it('sorts empty numbers/dates to the end regardless of direction', () => {
    expect(compareCells('number', numberCell(null), numberCell(1))).toBeGreaterThan(0)
  })
})
