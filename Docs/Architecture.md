# Architecture and integration gates

## Decisions

- React virtual dataset PCF, semantic HTML table with scoped CSS. Paging limits DOM size; no additional grid engine or host DOM access.
- The host dataset is the only source of records. No unrestricted Web API retrieval or reconstruction of the view FetchXML. Search and custom filters are composed with the existing dataset filter. Native view/relationship/security constraints remain owned by the host.
- `EntityRecord.setValue` and `save` are documented for model-driven apps but absent from the installed DefinitelyTyped definitions. A narrow capability-checked adapter isolates this gap. No setters means read-only cells. Metadata-unavailable, secured, calculated, related and unsupported fields fail closed.
- `Utility.getEntityMetadata` supplies options, targets and edit constraints. Color metadata is validated before CSS use. No data is sent to an external service.
- All-result operations traverse dataset pages sequentially with de-duplication, cancellation, timeout, progress and an explicit configurable cap. They do not silently export or select a partial result. Traversal temporarily changes the displayed dataset page and returns to page 1 on completion. The dataset has no transactional snapshot guarantee: concurrent server changes can affect traversal.
- Select All materializes matching IDs only after successful traversal, then uses `setSelectedRecordIds`. Deselection provides exclusions. Selection is cleared on grid-controlled query changes. Host-provided selection is reconciled on updates. Native command behavior for cross-page IDs still requires sandbox verification.
- Export uses ExcelJS 4.4 (MIT) for real XLSX and a separate CSV serializer. Exports are static files, not native Dataverse Excel integration. Export is disabled by default: administrators must opt in after reviewing data-loss-prevention and export authorization policies. A client flag is not an authorization boundary.
- Column order uses `mode.setControlState`, scoped to user/entity/view for the lifetime of a control session; no browser storage or shared-view mutation.

## Blocking production validations

This workspace has no Dataverse environment, solution, or authentication configuration. Therefore native commands, view/subgrid boundaries, field-level permissions, metadata shapes, date/time behavior, record setter persistence and cross-page selection have NOT been proven in a host. Local mocks verify logic only. See Parity.md and Acceptance.md before enabling in production.

Native grouping/aggregation, Excel Online, shared view editing, native bulk edit, offline parity and complete business-rule UI parity are not implemented. Server validation is never bypassed. Unsupported editor types remain read-only rather than accept lossy writes.
