'use client'

import { useState } from 'react'
import { FilterConditionBuilder, newGroup } from './FilterConditionBuilder'
import type { FilterGroup } from '@/lib/types'

function isEmpty(group: FilterGroup): boolean {
  return group.conditions.length === 0
}

export function FilterPanel({
  appliedFilter,
  onApply,
  orgId,
}: {
  appliedFilter: FilterGroup
  onApply: (next: FilterGroup) => void
  orgId: string | null
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<FilterGroup>(appliedFilter)

  const hasActiveFilter = !isEmpty(appliedFilter)
  const isDirty = JSON.stringify(draft) !== JSON.stringify(appliedFilter)

  function handleOpen() {
    setDraft(appliedFilter)
    setOpen(true)
  }

  function handleApply() {
    onApply(draft)
    setOpen(false)
  }

  function handleCancel() {
    setDraft(appliedFilter)
    setOpen(false)
  }

  function handleClearAll() {
    const cleared = newGroup()
    cleared.conditions = []
    setDraft(cleared)
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="relative flex items-center gap-2 border border-border rounded px-3 py-2 text-sm bg-background"
        onClick={() => (open ? setOpen(false) : handleOpen())}
        data-testid="filter-trigger"
      >
        Filters
        {hasActiveFilter && (
          <span
            className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-primary"
            data-testid="filter-active-dot"
          />
        )}
      </button>
      {open && (
        <div
          className="absolute z-10 mt-2 p-4 rounded-lg border border-border bg-background shadow-lg min-w-[480px]"
          data-testid="filter-panel"
        >
          <FilterConditionBuilder group={draft} orgId={orgId} onChange={setDraft} />
          <div className="flex justify-between items-center mt-4 pt-3 border-t border-border">
            <button type="button" className="text-xs text-muted-foreground" onClick={handleClearAll}>
              Clear all
            </button>
            <div className="flex gap-2">
              <button type="button" className="text-xs px-3 py-1.5 rounded border border-border" onClick={handleCancel}>
                Cancel
              </button>
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground disabled:opacity-50"
                onClick={handleApply}
                disabled={!isDirty}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
