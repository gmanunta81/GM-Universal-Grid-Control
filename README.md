# GM Universal Grid (PCF)

A Power Apps Component Framework (PCF) **dataset control for model-driven apps** that replaces the standard read-only grid of a view or subgrid with a feature-rich, editable grid.

> Not an official Microsoft grid. It is a custom virtual (React) dataset control. It runs entirely in the browser, calls **no external service** and is therefore **not a premium control**.

## Features

- **Sorting and paging** driven by the host dataset (active view, subgrid relationship and security are always respected).
- **Search** across the supported view columns, combined with column filters.
- **Typed filters** with nested AND/OR conditions (text, number, date, lookup, choice, yes/no, null checks).
- **Inline editing** of supported field types (text, whole/decimal number, yes/no, choice, date). Secured, calculated or unsupported fields stay read-only. Can be turned off with a property.
- **Lookup navigation** (including polymorphic references) and **colored choice badges** from table metadata.
- **Column drag & drop** directly on the header (no need to click sort first) plus ◀/▶ buttons; order is remembered per table + view in the browser.
- **Row drag & drop** (visual effect only, nothing is saved to Dataverse).
- **Columns panel**: two panes (columns in the grid / available columns), responsive, drag & drop from right to left, search and type chips. Besides the view columns you can add any **searchable column of the table** (read from the table metadata); added columns load data and can be sorted, filtered and exported.
- **Row selection** on the current page, integrated with the command bar.
- **Export to CSV and real XLSX** (selected or all filtered records) with a configurable record limit. Export is **disabled by default** and must be enabled by an administrator.
- Keyboard accessible, high-contrast friendly.

See [Docs/Parity.md](Docs/Parity.md) for what is and is not covered compared to the native grid and [Docs/Architecture.md](Docs/Architecture.md) for the design decisions.

## Control properties

| Property | Type | Default | Description |
|---|---|---|---|
| `records` | Dataset | – | The view / subgrid records (bound automatically). |
| `enableEditing` | Yes/No | Yes | Enable inline editing of supported columns. |
| `allowExport` | Yes/No | No | Enable CSV/XLSX export (review your DLP and export policies first). |
| `maxRecords` | Whole number | 10000 | Safety limit for operations on the full filtered view. |

## Install (managed solution — recommended)

1. Download `GMUniversalGrid_<version>_managed.zip` from the [`releases`](releases) folder or the [GitHub Releases](https://github.com/gmanunta81/GM-Universal-Grid-Control/releases) page.
2. In [make.powerapps.com](https://make.powerapps.com) select the environment → **Solutions** → **Import solution** → upload the zip → **Next** → **Import**.
3. Configure the control:
   - **Classic view/subgrid**: open the form or the app in the designer, select the subgrid (or the view's grid) → **Components** → **Add component** → **Universal Grid** (`GM.Controls.UniversalGrid`) → choose it for Web → set the properties → **Save** and **Publish**.
   - Modern app designer: select the table's grid / subgrid → **Components** → add **Universal Grid**.
4. Open the app and test.

Use the `_unmanaged.zip` only in development environments. Do not mix managed and unmanaged installs of the same solution in one environment.

### Requirements and licensing

- Power Apps model-driven app on Dataverse (PCF code components are supported by default in model-driven apps).
- Users need the standard Power Apps / Dynamics 365 license required to use the model-driven app. The control itself needs **no additional license** and uses no external service (`external-service-usage` is disabled).
- Import permission: *System Customizer* or *System Administrator*.
- Browser support: the same evergreen browsers supported by model-driven apps.

## Build from source

```powershell
npm ci
npm run lint
npm run build            # output in out/controls
```

Build the solution package (requires .NET SDK / MSBuild):

```powershell
dotnet build Solution\Solution.cdsproj -c Release /p:SolutionPackageType=Both
```

The zips are created in `Solution\bin\Release\` (`*_managed.zip` and the unmanaged one).

Release flow: bump the version in `UniversalGrid/ControlManifest.Input.xml` and `Solution/src/Other/Solution.xml`, update `CHANGELOG.md`, rebuild, copy the zips into `releases/` with a versioned name and attach them to a GitHub Release `vX.Y.Z`.

Acceptance checklist for a sandbox environment: [Docs/Acceptance.md](Docs/Acceptance.md).

## Dependencies

| Package | License | Notes |
|---|---|---|
| React 16.14 | MIT | Provided by the platform (platform library), not bundled |
| [ExcelJS](https://github.com/exceljs/exceljs) 4.4 | MIT | Bundled, used for XLSX export |

## Known limitations

- Tested in model-driven apps only; canvas apps and Power Pages are not targeted.
- Native grouping/aggregation, Excel Online templates, shared view editing, offline and mobile parity are not implemented.
- Cross-page selection through the command bar must be verified in your environment.
- `npm audit` reports a moderate advisory in `uuid` (transitive dependency of ExcelJS, only exploitable when a caller passes a custom buffer); it does not affect this control's use.

## Author

[Giovanni Manunta](https://github.com/gmanunta81)

## License

MIT – see [LICENSE](LICENSE).
