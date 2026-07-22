import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('react-day-picker/style.css', () => ({}))

import { WarehouseAnalysisFilters } from '../WarehouseAnalysisFilters'

const baseProps = {
  variant: 'query' as const,
  customers: [{ org_id: '90402', name: 'Acme Corp' }],
  selectedCustomer: null,
  onCustomerChange: vi.fn(),
  startDate: '2026-07-01',
  endDate: '2026-07-07',
  onRangeChange: vi.fn(),
  granularity: 'day' as const,
  onGranularityChange: vi.fn(),
  warehouses: [],
  selectedWarehouses: [],
  onWarehousesChange: vi.fn(),
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

  it('renders the Filters trigger from FilterPanel', () => {
    render(<WarehouseAnalysisFilters {...baseProps} />)
    expect(screen.getByTestId('filter-trigger')).toBeInTheDocument()
  })

  it('renders Customer, Date Range, and Warehouse but not Group By or Filters on the cluster variant', () => {
    render(
      <WarehouseAnalysisFilters
        variant="cluster"
        customers={baseProps.customers}
        selectedCustomer={baseProps.selectedCustomer}
        onCustomerChange={baseProps.onCustomerChange}
        startDate={baseProps.startDate}
        endDate={baseProps.endDate}
        onRangeChange={baseProps.onRangeChange}
        warehouses={baseProps.warehouses}
        selectedWarehouse={null}
        onWarehouseChange={vi.fn()}
        warehousesDisabled={baseProps.warehousesDisabled}
        warehousesError={baseProps.warehousesError}
      />
    )
    expect(screen.getByText('Customer')).toBeInTheDocument()
    expect(screen.getByTestId('warehouse-select-trigger')).toBeInTheDocument()
    expect(screen.queryByText('Group By')).not.toBeInTheDocument()
    expect(screen.queryByTestId('filter-trigger')).not.toBeInTheDocument()
  })
})
