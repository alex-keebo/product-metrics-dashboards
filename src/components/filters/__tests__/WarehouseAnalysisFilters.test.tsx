import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('react-day-picker/style.css', () => ({}))

import { WarehouseAnalysisFilters } from '../WarehouseAnalysisFilters'

const baseProps = {
  customers: [{ org_id: '90402', name: 'Acme Corp' }],
  selectedCustomer: null,
  onCustomerChange: vi.fn(),
  startDate: '2026-07-01',
  endDate: '2026-07-07',
  onRangeChange: vi.fn(),
  granularity: 'day' as const,
  onGranularityChange: vi.fn(),
  warehouses: [],
  selectedWarehouse: null,
  onWarehouseChange: vi.fn(),
  warehousesDisabled: true,
  warehousesError: null,
  appliedFilter: { id: 'root', match: 'AND' as const, conditions: [] },
  onFilterApply: vi.fn(),
}

describe('WarehouseAnalysisFilters', () => {
  it('renders Group By options including Hour', () => {
    render(<WarehouseAnalysisFilters {...baseProps} />)
    fireEvent.click(screen.getByText('Group By'))
    expect(screen.getByText('Hour')).toBeInTheDocument()
  })

  it('disables the Warehouse select until a Customer is chosen', () => {
    render(<WarehouseAnalysisFilters {...baseProps} />)
    const warehouseButton = screen.getByTestId('warehouse-select-trigger')
    expect(warehouseButton).toBeDisabled()
  })

  it('calls onWarehouseChange(null) when Customer changes', () => {
    const onWarehouseChange = vi.fn()
    const onCustomerChange = vi.fn()
    render(
      <WarehouseAnalysisFilters
        {...baseProps}
        selectedCustomer="90402"
        warehousesDisabled={false}
        onCustomerChange={onCustomerChange}
        onWarehouseChange={onWarehouseChange}
      />
    )
    fireEvent.click(screen.getByText('Customer'))
    const options = screen.getAllByText('Acme Corp')
    fireEvent.click(options[options.length - 1])
    expect(onCustomerChange).toHaveBeenCalledWith('90402')
    expect(onWarehouseChange).toHaveBeenCalledWith(null)
  })

  it('renders the Filters trigger from FilterPanel', () => {
    render(<WarehouseAnalysisFilters {...baseProps} />)
    expect(screen.getByTestId('filter-trigger')).toBeInTheDocument()
  })
})
