import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { FilterSortTable, type FilterSortColumn } from '../FilterSortTable'
import { textCell, numberCell } from '@/lib/table-filter'

interface Row { id: string; name: string; priority: number }

const ROWS: Row[] = [
  { id: '1', name: 'Bravo', priority: 10 },
  { id: '2', name: 'alpha', priority: 30 },
  { id: '3', name: 'Charlie', priority: 20 },
]

const COLUMNS: FilterSortColumn<Row>[] = [
  { key: 'name', label: 'Name', type: 'text', getCell: (r) => textCell(r.name), render: (r) => r.name },
  { key: 'priority', label: 'Priority', type: 'number', getCell: (r) => numberCell(r.priority), render: (r) => String(r.priority) },
]

function renderTable() {
  return render(<FilterSortTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />)
}

function rowNames() {
  return screen.getAllByTestId('fst-row').map((row) => within(row).getAllByRole('cell')[0].textContent)
}

describe('FilterSortTable', () => {
  it('renders rows in the given order by default (no sort applied)', () => {
    renderTable()
    expect(rowNames()).toEqual(['Bravo', 'alpha', 'Charlie'])
  })

  it('sorts A to Z when chosen from a column menu', () => {
    renderTable()
    fireEvent.click(screen.getByTestId('fst-filter-btn-name'))
    fireEvent.click(screen.getByText('Sort A to Z'))
    expect(rowNames()).toEqual(['alpha', 'Bravo', 'Charlie'])
  })

  it('replaces an existing sort when a different column is sorted', () => {
    renderTable()
    fireEvent.click(screen.getByTestId('fst-filter-btn-name'))
    fireEvent.click(screen.getByText('Sort A to Z'))

    fireEvent.click(screen.getByTestId('fst-filter-btn-priority'))
    fireEvent.click(screen.getByText('Sort Z to A'))

    const priorities = screen.getAllByTestId('fst-row').map((row) => within(row).getAllByRole('cell')[1].textContent)
    expect(priorities).toEqual(['30', '20', '10'])
  })

  it('applies a text filter-by-condition after OK', () => {
    renderTable()
    fireEvent.click(screen.getByTestId('fst-filter-btn-name'))
    fireEvent.click(screen.getByText('Filter by condition'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'contains' } })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ar' } })
    fireEvent.click(screen.getByText('OK'))

    expect(rowNames()).toEqual(['Charlie'])
  })

  it('discards pending changes on Cancel', () => {
    renderTable()
    fireEvent.click(screen.getByTestId('fst-filter-btn-name'))
    fireEvent.click(screen.getByText('Filter by condition'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'contains' } })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ar' } })
    fireEvent.click(screen.getByText('Cancel'))

    expect(rowNames()).toEqual(['Bravo', 'alpha', 'Charlie'])
  })

  it('shows "No data" when filters exclude every row', () => {
    renderTable()
    fireEvent.click(screen.getByTestId('fst-filter-btn-name'))
    fireEvent.click(screen.getByText('Filter by condition'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'contains' } })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'zzz' } })
    fireEvent.click(screen.getByText('OK'))

    expect(screen.getByText('No data for the current filters')).toBeInTheDocument()
  })

  it('resets to page 1 and shows matching rows when a filter shrinks the result set below the current page', () => {
    const manyRows: Row[] = Array.from({ length: 25 }, (_, i) => ({
      id: String(i + 1),
      name: `Item${String(i + 1).padStart(2, '0')}`,
      priority: i + 1,
    }))
    render(<FilterSortTable columns={COLUMNS} rows={manyRows} rowKey={(r) => r.id} />)

    // Default page size is 10, so 25 rows span 3 pages. Navigate to the last page (index 2).
    fireEvent.click(screen.getByText('›'))
    fireEvent.click(screen.getByText('›'))
    expect(rowNames()).toEqual(['Item21', 'Item22', 'Item23', 'Item24', 'Item25'])

    // Apply a filter that only matches a row on page 1 — the result set (1 row) is now
    // smaller than page * pageSize (20), which previously left `paged` empty.
    fireEvent.click(screen.getByTestId('fst-filter-btn-name'))
    fireEvent.click(screen.getByText('Filter by condition'))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'contains' } })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Item01' } })
    fireEvent.click(screen.getByText('OK'))

    expect(screen.queryByText('No data for the current filters')).not.toBeInTheDocument()
    expect(rowNames()).toEqual(['Item01'])
  })
})
