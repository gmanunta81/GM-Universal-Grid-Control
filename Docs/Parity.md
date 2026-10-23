# Modern Power Apps grid parity

Target: editable model-driven main grids and subgrids. This is a custom dataset PCF, not the Microsoft grid implementation. Status below is an acceptance checklist, not a claim of host-tested parity.

| Capability | Implementation target | Host acceptance requirement |
|---|---|---|
| View and subgrid boundaries | Use only the host dataset; never retrieve an unrestricted table | Verify active view, parent relationship, security and external filters |
| Sorting and paging | Dataset sorting and paging | Ascending/descending, multi-page views, refresh |
| Inline editing | Supported dataset record setters and save; unsupported/secured fields remain read-only | Validation, business rules, concurrency, all configured field types |
| Search | OR across supported view columns; AND with column filters | Records beyond first page; explicitly disclose unsupported formatted-value searches |
| Filters | Typed condition tree with nested AND/OR | Date/time behavior, lookups, Choices, nulls |
| Lookup navigation | Entity references and supported navigation API | Single-target and polymorphic references |
| Choice colors | Attribute metadata and filled badges | Local/global/multi-select Choices and missing metadata |
| Column order | Drag/drop and keyboard buttons; session-scoped preferences | View switches and isolated users/instances |
| Selection | Page checkboxes and all matching records, with explicit bounded materialization | Command bar integration and external selection changes |
| Export | CSV and actual XLSX, selected or all filtered records | Paging, permissions, throttling, cancellation and size limits |
| Accessibility | Semantic table, named controls, keyboard interaction and high contrast | Screen reader and keyboard testing in both hosts |
| Native view management | Host responsibility | Confirm host selector and refresh behavior |
| Native create/delete and commands | Host responsibility; no custom destructive actions | Verify selection-based commands individually |
| Native grouping/aggregation | Not implemented in initial delivery | Separate feature work required |
| Excel Online/templates/dynamic worksheets | Not replicated | Custom static file export only |
| Native personalization and offline/mobile parity | Not guaranteed | Separate host-specific acceptance required |

## Required gates

No Dataverse environment is assumed available. Local build/tests do not validate host parity. Do not release as a drop-in equivalent until this matrix has been exercised in a sandbox. Any unsupported behavior must remain visible and documented, not silently approximated.
