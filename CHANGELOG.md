# Changelog

## 1.0.0 (solution 1.0.4.0)

- First public release.
- Fix: `Cannot read properties of null (reading 'toLowerCase')` when a column added from table metadata had no data type / display name.
- Manifest display name and description are now readable text.

## 0.0.4

- The **Select all matching** button is hidden (the header checkbox selects the current page).
- New two-pane **Columns** panel: *Columns in grid* (left) and *Available columns* (right) with search and type chips, responsive layout, drag & drop from right to left, ▲/▼ reordering.

## 0.0.3

- Columns can be moved by dragging the header (or its grip) immediately, without having to click sort first.
- Visual-only row drag & drop (nothing is saved to Dataverse).
- Add searchable table columns not present in the view, using entity metadata.

## 0.0.1 – 0.0.2

- Initial dataset grid: sorting, paging, search, nested AND/OR filters, inline editing, lookup navigation, choice colors, row selection, CSV/XLSX export.
