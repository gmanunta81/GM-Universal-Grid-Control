# Acceptance and deployment

## Recovery note

Historical note: the work was resumed after a workstation crash; the Fluent UI scaffold was removed and the control depends only on the React platform library and ExcelJS.

## Local gates (must pass before every publish)

```powershell
npm run lint
npm run build
```

## Publish to the test environment

Target: your own sandbox environment, e.g. `https://<your-org>.crm4.dynamics.com/`

```powershell
pac auth create --url https://<your-org>.crm4.dynamics.com/
pac auth list
pac pcf push --publisher-prefix gm
```

`pac pcf push` creates/updates the temporary solution `PowerAppsTools_gm` with the control `GM.Controls.UniversalGrid`. Bump `version` in `ControlManifest.Input.xml` before every push so the host picks up the new bundle.

Preferred: build and import the solution `GMUniversalGrid` (project in `Solution\`):

```powershell
dotnet build Solution\Solution.cdsproj -c Release /p:SolutionPackageType=Both
pac solution import --environment https://<your-org>.crm4.dynamics.com/ --path Solution\bin\Release\Solution.zip --publish-changes
```

If `pac` reports `AADSTS70043` (expired refresh token), either run `pac auth create --environment https://<your-org>.crm4.dynamics.com/` again or import through the Web API (`ImportSolution` + `PublishAllXml`) with an `az account get-access-token` token.

After the push: open a model-driven app, edit a view or subgrid, add component **UniversalGrid**, set the properties (`Enable inline editing`, `Allow file exports`, `Full-view operation record limit`), save and publish.

## Sandbox acceptance checklist

Tick each item in the target environment; nothing below has been proven locally.

- [ ] View boundary: records shown match the native grid for the same view (main grid and subgrid).
- [ ] Sorting: ascending/descending on text, number, date, choice; columns with `disableSorting` are not sortable.
- [ ] Paging: previous/next, page size change, record count footer.
- [ ] Search: matches records beyond the first page; error shown when the view has no text column.
- [ ] Filters: nested AND/OR, every operator per type, lookup GUID, Choice values, empty/not empty, date operators (verify time-zone behavior).
- [ ] Filter composition: view filter, search and custom filter are all applied together; clearing returns to the native view result.
- [ ] Inline editing: text, whole/decimal number, Yes/No, Choice, DateOnly. Secured, calculated, related and lookup fields stay read-only. Server validation errors surface in the grid.
- [ ] Editing capability: if `setValue`/`save` are not exposed by the host, all cells are read-only and no error is thrown.
- [ ] Lookup navigation: single-target and polymorphic (customer/owner) references open the correct form.
- [ ] Choice colors: badge colors match column metadata; missing colors fall back to neutral.
- [ ] Column order: dragging a header (or its ⋮⋮ grip) moves the column **immediately**, without clicking sort; ◀/▶ buttons do the same. Drop target is highlighted. Order persists per table+view in the browser (localStorage) and does not leak across views.
- [ ] Row order (visual only): drag the ⋮⋮ grip shown on row hover; the row moves immediately. Nothing is saved to Dataverse. **Reset row order** restores the view order; paging, sorting or filtering also resets it.
- [ ] Columns panel: **Columns** opens a responsive two-pane panel (stacked on narrow screens). Left: **Columns in grid**, reorder by drag (blue insertion line) or ▲/▼, ✕ removes; dragging an item onto the right pane removes it. Right: **Available columns** with search, type chips, and a green **View** chip for removed view columns, plus the searchable table columns (metadata `IsValidForAdvancedFind`, readable, not virtual/helper). Drag from right to left to insert at that position; double-click or ＋ appends. Added columns load data and can be sorted, filtered and exported. **Reset to view** restores view columns and order. Settings persist per table+view in the browser.
- [ ] Selection: page checkbox, single rows, external selection changes, command bar acts on selected records.
- [ ] Select all matching: the button is hidden in the toolbar (0.0.4); header checkbox selects the current page only.
- [ ] Export (only with `Allow file exports` = Yes): page/selected/all in CSV and XLSX, cancel, limit error, DLP review confirmed by an administrator.
- [ ] Accessibility: keyboard-only navigation, screen reader announcements for status/errors, high-contrast mode.
- [ ] Destroy: navigating away during a full-view operation does not leave errors in the console.
