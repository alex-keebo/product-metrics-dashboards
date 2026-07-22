import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterConditionBuilder, newGroup, newCondition } from '../FilterConditionBuilder'
import { FILTER_FIELDS, FIELD_SECTIONS } from '@/lib/filterFields'
import { isFilterGroup } from '@/lib/types'

describe('FilterConditionBuilder', () => {
  it('renders one condition row for a freshly created group', () => {
    render(<FilterConditionBuilder group={newGroup()} orgId="abc123" onChange={vi.fn()} />)
    expect(screen.getAllByTestId('filter-condition-row')).toHaveLength(1)
  })

  it('adds a new condition row when "+ Add condition" is clicked', () => {
    const group = newGroup()
    const onChange = vi.fn()
    render(<FilterConditionBuilder group={group} orgId="abc123" onChange={onChange} />)
    fireEvent.click(screen.getByText('+ Add condition'))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ conditions: expect.arrayContaining([expect.anything(), expect.anything()]) })
    )
    const updated = onChange.mock.calls[0][0]
    expect(updated.conditions).toHaveLength(2)
  })

  it('adds a nested group when "+ Add group" is clicked', () => {
    const group = newGroup()
    const onChange = vi.fn()
    render(<FilterConditionBuilder group={group} orgId="abc123" onChange={onChange} />)
    fireEvent.click(screen.getByText('+ Add group'))
    const updated = onChange.mock.calls[0][0]
    expect(updated.conditions).toHaveLength(2)
    expect(updated.conditions[1]).toHaveProperty('match')
  })

  it('removes a condition row when Remove is clicked', () => {
    const group = newGroup()
    const onChange = vi.fn()
    render(<FilterConditionBuilder group={group} orgId="abc123" onChange={onChange} />)
    fireEvent.click(screen.getByText('Remove'))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ conditions: [] }))
  })

  it('renders all fields from FILTER_FIELDS in the field dropdown (no hardcoded count)', () => {
    render(<FilterConditionBuilder group={newGroup()} orgId="abc123" onChange={vi.fn()} />)
    fireEvent.click(screen.getByText('Field'))
    const expectedFieldCount = Object.keys(FILTER_FIELDS).length
    const expectedFromSections = FIELD_SECTIONS.reduce((sum, s) => sum + s.keys.length, 0)
    expect(expectedFieldCount).toBe(expectedFromSections)
    // every field label from the registry should appear as an option
    for (const key of Object.keys(FILTER_FIELDS)) {
      expect(screen.getAllByText(FILTER_FIELDS[key].label).length).toBeGreaterThan(0)
    }
  })

  it('shows an operator dropdown and value input once a field is selected', () => {
    const onChange = vi.fn()
    const group = newGroup()
    render(<FilterConditionBuilder group={group} orgId="abc123" onChange={onChange} />)
    fireEvent.click(screen.getByText('Field'))
    const numberFieldKey = Object.keys(FILTER_FIELDS).find((k) => FILTER_FIELDS[k].type === 'number')!
    fireEvent.click(screen.getByText(FILTER_FIELDS[numberFieldKey].label))
    const updated = onChange.mock.calls[0][0]
    const cond = updated.conditions[0]
    expect(cond.field).toBe(numberFieldKey)
    expect(cond.operator).toBe('=')
  })

  it('renders nested groups recursively', () => {
    const inner = newCondition()
    const nestedGroup = newGroup()
    nestedGroup.conditions = [inner]
    const outer = newGroup()
    outer.conditions = [newCondition(), nestedGroup]
    render(<FilterConditionBuilder group={outer} orgId="abc123" onChange={vi.fn()} />)
    expect(screen.getAllByTestId('filter-group')).toHaveLength(2)
    expect(screen.getAllByTestId('filter-condition-row')).toHaveLength(2)
    expect(isFilterGroup(nestedGroup)).toBe(true)
  })

  it('passes null orgId through without crashing', () => {
    render(<FilterConditionBuilder group={newGroup()} orgId={null} onChange={vi.fn()} />)
    expect(screen.getAllByTestId('filter-condition-row')).toHaveLength(1)
  })
})
