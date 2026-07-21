# Dropdown search + filtering unification

- [x] Create `src/components/filters/Dropdown.tsx` (unified single/multi component, search, showFilter row)
- [x] Delete `src/components/filters/SingleSelect.tsx`
- [x] Delete `src/components/filters/MultiSelect.tsx`
- [x] Update `src/components/filters/WarehouseAnalysisFilters.tsx` (Customer + Warehouse -> Dropdown, Warehouse gets showFilter)
- [x] Update `src/components/filters/DashboardFilters.tsx` (Contract Type, Customer, Group By -> Dropdown)
- [x] Update `src/app/platform-usage/page.tsx` (Module -> Dropdown)
- [x] `npx tsc --noEmit` (clean)
- [x] `npm run lint` (clean on all touched files; 1 pre-existing unrelated error in platform-usage/page.tsx:248 confirmed present on HEAD before this change)
- [x] Manual verification in browser (dev server)

## Review

Verified via headless Chromium (Playwright, driven ad hoc since `chromium-cli` wasn't installed) against `npm run dev` on port 4000:

- **Snowflake Warehouse Analysis** (`/kwo-snowflake-warehouse-analysis`):
  - Customer dropdown: search box shown (69 customers, > 5 threshold), selecting a customer works, enables Warehouse dropdown.
  - Warehouse dropdown (customer Acxiom, 5104 warehouses): Show row renders All (5104)/Optimized/Unoptimized; unchecking Optimized unchecks All and filters list to unoptimized-only; unchecking both shows "No results"; re-checking All re-checks both sub-boxes — linked-checkbox logic matches spec exactly. Search box present, filters by substring (e.g. "XSMALL" → 196 rows). Clicking a row selects it (single-select — no per-item checkboxes, no Select All) and closes the popover.
  - One test-only observation: toggling a Show checkbox causes a brief (~500ms) transient render where the option count reads 0 before settling — an artifact of re-rendering ~5100 unvirtualized `<button>` rows, not a logic bug (final state is always correct). Worth virtualizing the list if warehouse counts grow further, but out of scope for this change.
- **KWO for Snowflake dashboard** (`/kwo-snowflake`): Contract Type multi-select — Select All + per-item checkboxes render, search box shown (6 options), toggling an option works.
- **Platform Usage** (`/platform-usage`): Module multi-select — Select All + per-item checkboxes render, search box correctly hidden (3 options, ≤ 5 threshold).
- No console errors or page errors observed on any of the above pages.

Dev server (port 4000) and the scratchpad Playwright install are being torn down now that verification is complete.
