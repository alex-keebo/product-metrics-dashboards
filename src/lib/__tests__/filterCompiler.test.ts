import { describe, it, expect } from 'vitest'
import { buildFilterWhereClause } from '../filterCompiler'
import type { FilterGroup } from '../types'

const emptyGroup: FilterGroup = { id: 'root', match: 'AND', conditions: [] }

describe('buildFilterWhereClause', () => {
  it('returns empty sql and params for an empty group', () => {
    const result = buildFilterWhereClause(emptyGroup)
    expect(result).toEqual({ sql: '', params: {}, types: {} })
  })

  it('compiles a single string equality condition', () => {
    const group: FilterGroup = {
      id: 'root',
      match: 'AND',
      conditions: [{ id: 'c1', field: 'query_type', operator: '=', value: 'SELECT' }],
    }
    const result = buildFilterWhereClause(group)
    expect(result.sql).toBe('QUERY_TYPE = @p_0')
    expect(result.params).toEqual({ p_0: 'SELECT' })
  })

  it('compiles a numeric comparison condition', () => {
    const group: FilterGroup = {
      id: 'root',
      match: 'AND',
      conditions: [{ id: 'c1', field: 'execution_time', operator: '>=', value: '1000' }],
    }
    const result = buildFilterWhereClause(group)
    expect(result.sql).toBe('EXECUTION_TIME >= @p_0')
    expect(result.params).toEqual({ p_0: 1000 })
  })

  it('compiles a boolean equality condition', () => {
    const group: FilterGroup = {
      id: 'root',
      match: 'AND',
      conditions: [{ id: 'c1', field: 'is_client_generated', operator: '=', value: 'true' }],
    }
    const result = buildFilterWhereClause(group)
    expect(result.sql).toBe('IS_CLIENT_GENERATED_STATEMENT = @p_0')
    expect(result.params).toEqual({ p_0: true })
  })

  it('compiles contains/starts with/ends with as LIKE', () => {
    const contains = buildFilterWhereClause({
      id: 'root',
      match: 'AND',
      conditions: [{ id: 'c1', field: 'error_message', operator: 'contains', value: 'timeout' }],
    })
    expect(contains.sql).toBe('ERROR_MESSAGE LIKE @p_0')
    expect(contains.params).toEqual({ p_0: '%timeout%' })

    const startsWith = buildFilterWhereClause({
      id: 'root',
      match: 'AND',
      conditions: [{ id: 'c1', field: 'error_message', operator: 'starts with', value: 'timeout' }],
    })
    expect(startsWith.params).toEqual({ p_0: 'timeout%' })

    const endsWith = buildFilterWhereClause({
      id: 'root',
      match: 'AND',
      conditions: [{ id: 'c1', field: 'error_message', operator: 'ends with', value: 'timeout' }],
    })
    expect(endsWith.params).toEqual({ p_0: '%timeout' })
  })

  it('compiles IN with a list value', () => {
    const group: FilterGroup = {
      id: 'root',
      match: 'AND',
      conditions: [{ id: 'c1', field: 'query_type', operator: 'IN', value: ['SELECT', 'INSERT'] }],
    }
    const result = buildFilterWhereClause(group)
    expect(result.sql).toBe('QUERY_TYPE IN UNNEST(@p_0)')
    expect(result.params).toEqual({ p_0: ['SELECT', 'INSERT'] })
  })

  it('compiles NOT IN with a list value', () => {
    const group: FilterGroup = {
      id: 'root',
      match: 'AND',
      conditions: [{ id: 'c1', field: 'query_type', operator: 'NOT IN', value: ['SELECT'] }],
    }
    const result = buildFilterWhereClause(group)
    expect(result.sql).toBe('QUERY_TYPE NOT IN UNNEST(@p_0)')
  })

  it('compiles is null / is not null with no bound param', () => {
    const isNull = buildFilterWhereClause({
      id: 'root',
      match: 'AND',
      conditions: [{ id: 'c1', field: 'error_code', operator: 'is null', value: '' }],
    })
    expect(isNull.sql).toBe('ERROR_CODE IS NULL')
    expect(isNull.params).toEqual({})

    const isNotNull = buildFilterWhereClause({
      id: 'root',
      match: 'AND',
      conditions: [{ id: 'c1', field: 'error_code', operator: 'is not null', value: '' }],
    })
    expect(isNotNull.sql).toBe('ERROR_CODE IS NOT NULL')
  })

  it('combines multiple conditions with AND', () => {
    const group: FilterGroup = {
      id: 'root',
      match: 'AND',
      conditions: [
        { id: 'c1', field: 'query_type', operator: '=', value: 'SELECT' },
        { id: 'c2', field: 'execution_time', operator: '>', value: '500' },
      ],
    }
    const result = buildFilterWhereClause(group)
    expect(result.sql).toBe('(QUERY_TYPE = @p_0 AND EXECUTION_TIME > @p_1)')
    expect(result.params).toEqual({ p_0: 'SELECT', p_1: 500 })
  })

  it('combines multiple conditions with OR', () => {
    const group: FilterGroup = {
      id: 'root',
      match: 'OR',
      conditions: [
        { id: 'c1', field: 'query_type', operator: '=', value: 'SELECT' },
        { id: 'c2', field: 'query_type', operator: '=', value: 'INSERT' },
      ],
    }
    const result = buildFilterWhereClause(group)
    expect(result.sql).toBe('(QUERY_TYPE = @p_0 OR QUERY_TYPE = @p_1)')
  })

  it('compiles nested groups recursively', () => {
    const group: FilterGroup = {
      id: 'root',
      match: 'AND',
      conditions: [
        { id: 'c1', field: 'query_type', operator: '=', value: 'SELECT' },
        {
          id: 'g1',
          match: 'OR',
          conditions: [
            { id: 'c2', field: 'error_code', operator: 'is not null', value: '' },
            { id: 'c3', field: 'execution_time', operator: '>', value: '10000' },
          ],
        },
      ],
    }
    const result = buildFilterWhereClause(group)
    expect(result.sql).toBe('(QUERY_TYPE = @p_0 AND (ERROR_CODE IS NOT NULL OR EXECUTION_TIME > @p_1))')
    expect(result.params).toEqual({ p_0: 'SELECT', p_1: 10000 })
  })

  it('throws on an unknown field key', () => {
    const group: FilterGroup = {
      id: 'root',
      match: 'AND',
      conditions: [{ id: 'c1', field: 'not_a_real_field', operator: '=', value: 'x' }],
    }
    expect(() => buildFilterWhereClause(group)).toThrow(/unknown filter field/i)
  })

  it('a single-condition nested empty group is dropped (no dangling parens)', () => {
    const group: FilterGroup = {
      id: 'root',
      match: 'AND',
      conditions: [
        { id: 'c1', field: 'query_type', operator: '=', value: 'SELECT' },
        { id: 'g1', match: 'OR', conditions: [] },
      ],
    }
    const result = buildFilterWhereClause(group)
    expect(result.sql).toBe('QUERY_TYPE = @p_0')
  })
})
