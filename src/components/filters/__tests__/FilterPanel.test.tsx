import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterPanel } from '../FilterPanel'
import type { FilterGroup } from '@/lib/types'

const emptyGroup: FilterGroup = { id: 'root', match: 'AND', conditions: [] }

describe('FilterPanel', () => {
  it('does not show the active-filter dot when no filter is applied', () => {
    render(<FilterPanel appliedFilter={emptyGroup} onApply={vi.fn()} orgId="abc123" />)
    expect(screen.queryByTestId('filter-active-dot')).toBeNull()
  })

  it('shows the active-filter dot when a filter is applied', () => {
    const applied: FilterGroup = {
      id: 'root',
      match: 'AND',
      conditions: [{ id: 'c1', field: 'query_type', operator: '=', value: 'SELECT' }],
    }
    render(<FilterPanel appliedFilter={applied} onApply={vi.fn()} orgId="abc123" />)
    expect(screen.getByTestId('filter-active-dot')).toBeInTheDocument()
  })

  it('opens the panel on trigger click', () => {
    render(<FilterPanel appliedFilter={emptyGroup} onApply={vi.fn()} orgId="abc123" />)
    fireEvent.click(screen.getByTestId('filter-trigger'))
    expect(screen.getByTestId('filter-panel')).toBeInTheDocument()
  })

  it('calls onApply with the draft when Apply is clicked', () => {
    const onApply = vi.fn()
    render(<FilterPanel appliedFilter={emptyGroup} onApply={onApply} orgId="abc123" />)
    fireEvent.click(screen.getByTestId('filter-trigger'))
    fireEvent.click(screen.getByText('+ Add condition'))
    fireEvent.click(screen.getByText('Apply'))
    expect(onApply).toHaveBeenCalled()
  })

  it('discards draft changes on Cancel', () => {
    const onApply = vi.fn()
    render(<FilterPanel appliedFilter={emptyGroup} onApply={onApply} orgId="abc123" />)
    fireEvent.click(screen.getByTestId('filter-trigger'))
    fireEvent.click(screen.getByText('+ Add condition'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(onApply).not.toHaveBeenCalled()
  })
})
