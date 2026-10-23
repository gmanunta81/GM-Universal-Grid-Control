import { IInputs, IOutputs } from "./generated/ManifestTypes";
import * as React from "react";
import { Grid, GridProps, ExportScope, Status } from "./Grid";
import { AvailableColumn, ColumnSettings, arrangeColumns, insertName, loadSearchableAttributes, readSettings, writeSettings } from "./core/columns";
import { Column, DataSet, FilterGroup, Metadata, RecordRow, kindOf, messageOf, normalizeId, visibleColumns } from "./core/types";
import { compileFilter, newGroup } from "./core/filters";
import { DatasetReader, QueryController } from "./core/dataset";
import { MetadataCache } from "./core/metadata";
import { saveCell } from "./core/editing";
import { ExportFormat, exportRows } from "./core/export";

type SortStatus = ComponentFramework.PropertyHelper.DataSetApi.SortStatus;
type Context = ComponentFramework.Context<IInputs>;

class PropsStore {
    private props: GridProps | undefined;
    private readonly listeners = new Set<() => void>();
    public get(): GridProps | undefined { return this.props; }
    public set(props: GridProps, notify: boolean): void { this.props = props; if (notify) this.listeners.forEach(listener => listener()); }
    public subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
}

function GridHost(host: { store: PropsStore; props: GridProps }): React.ReactElement {
    const [, force] = React.useReducer((x: number) => x + 1, 0);
    React.useEffect(() => host.store.subscribe(force), [host.store]);
    return React.createElement(Grid, host.store.get() ?? host.props);
}

export class UniversalGrid implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    private context: Context;
    private state: ComponentFramework.Dictionary = {};
    private readonly reader = new DatasetReader();
    private readonly query = new QueryController();
    private readonly metadataCache = new MetadataCache();
    private metadata: Metadata = {};
    private metadataKey = "";
    private scope = "";
    private search = "";
    private filter: FilterGroup | undefined;
    private selectedIds: string[] = [];
    private status: Status | undefined;
    private abort: AbortController | undefined;
    private destroyed = false;
    private settings: ColumnSettings = { order: [], added: [], hidden: [] };
    private readonly pendingColumns = new Set<string>();
    private available: { entity: string; columns: AvailableColumn[] } | undefined;
    private availableError: string | undefined;
    private availableAbort: AbortController | undefined;
    private availableLoading: string | undefined;
    private readonly store = new PropsStore();

    public init(context: Context, _notifyOutputChanged: () => void, state: ComponentFramework.Dictionary): void {
        this.context = context;
        this.state = state ?? {};
    }

    public updateView(context: Context): React.ReactElement {
        this.context = context;
        const dataset = context.parameters.records;
        const scope = `${dataset.getTargetEntityType()}|${dataset.getViewId()}`;
        if (this.query.observe(dataset, scope)) {
            if (scope !== this.scope) {
                this.scope = scope; this.search = ""; this.filter = undefined; this.status = undefined;
                this.settings = readSettings(scope, this.state[this.stateKey()]);
                this.pendingColumns.clear();
            }
            this.selectedIds = [];
        }
        if (!this.abort) this.selectedIds = dataset.getSelectedRecordIds().slice();
        this.reader.accept(dataset, context.updatedProperties.includes("dataset") || context.updatedProperties.includes("records"));
        this.ensureAddedColumns(dataset);
        this.loadMetadata(dataset);
        const props = this.buildProps(dataset);
        this.store.set(props, false);
        return React.createElement(GridHost, { store: this.store, props });
    }

    private buildProps(dataset: DataSet): GridProps {
        const context = this.context;
        const columns = this.displayColumns(dataset);
        const shown = new Set(columns.map(c => c.name));
        const rows = dataset.sortedRecordIds.map(id => dataset.records[id]).filter(Boolean);
        const busy = !!this.abort;
        const status: Status | undefined = this.status ?? (dataset.error ? { kind: "error", text: dataset.errorMessage || "The dataset could not be loaded." } : undefined);
        const hiddenNames = new Set(this.settings.hidden);
        const entityName = dataset.getTargetEntityType();
        const available = this.available?.entity === entityName ? this.available.columns : undefined;
        return {
            entityName,
            columns, rows, metadata: this.metadata,
            loading: dataset.loading, busy, status,
            selectedIds: this.selectedIds,
            search: this.search,
            filter: this.filter,
            sorting: dataset.sorting,
            paging: {
                page: dataset.paging.lastPageNumber || 1,
                hasPrevious: dataset.paging.hasPreviousPage,
                hasNext: dataset.paging.hasNextPage,
                total: dataset.paging.totalResultCount,
                pageSize: dataset.paging.pageSize
            },
            enableEditing: context.parameters.enableEditing.raw !== false,
            allowExport: context.parameters.allowExport.raw === true,
            maxRecords: this.maxRecords(),
            columnChooser: {
                canAdd: typeof dataset.addColumn === "function",
                available: available?.filter(a => !shown.has(a.name)),
                availableError: this.availableError,
                hidden: visibleColumns(dataset.columns).filter(c => hiddenNames.has(c.name)),
                customized: this.settings.order.length > 0 || this.settings.added.length > 0 || this.settings.hidden.length > 0
            },
            onSort: column => this.sort(dataset, column),
            onSearch: search => { this.search = search; this.applyQuery(dataset); },
            onApplyFilter: filter => { this.filter = filter; this.applyQuery(dataset); },
            onSelect: ids => { this.selectedIds = ids; dataset.setSelectedRecordIds(ids); this.rerender(); },
            onSelectAll: () => void this.selectAll(dataset),
            onCancel: () => this.abort?.abort(),
            onPage: direction => { this.status = undefined; if (direction < 0) dataset.paging.loadPreviousPage(); else dataset.paging.loadNextPage(); },
            onPageSize: size => { dataset.paging.setPageSize(size); dataset.paging.reset(); },
            onOpenRecord: row => dataset.openDatasetItem(row.getNamedReference()),
            onOpenLookup: reference => this.openLookup(reference),
            onEdit: (row, column, value) => this.edit(dataset, row, column, value),
            onReorder: names => this.saveSettings({ ...this.settings, order: names }),
            onLoadAvailableColumns: () => void this.loadAvailable(entityName),
            onAddColumn: (column, index) => this.addColumn(dataset, column, index),
            onHideColumn: name => this.hideColumn(name),
            onShowColumn: (name, index) => this.saveSettings({
                ...this.settings,
                hidden: this.settings.hidden.filter(n => n !== name),
                order: index === undefined ? this.settings.order : insertName(this.displayColumns(dataset).map(c => c.name), name, index)
            }),
            onResetColumns: () => this.saveSettings({ order: [], added: [], hidden: [] }),
            onExport: (format, scope) => void this.export(dataset, format, scope),
            onRefresh: () => { this.status = undefined; dataset.refresh(); }
        };
    }

    public getOutputs(): IOutputs { return {}; }

    public destroy(): void {
        this.destroyed = true;
        this.abort?.abort();
        this.availableAbort?.abort();
        this.reader.dispose();
        this.metadataCache.clear();
    }

    // notifyOutputChanged does not guarantee a new updateView for dataset controls:
    // push fresh props straight to the mounted React tree instead.
    private rerender(): void {
        if (this.destroyed || !this.context) return;
        this.store.set(this.buildProps(this.context.parameters.records), true);
    }

    private maxRecords(): number {
        const raw = this.context.parameters.maxRecords.raw;
        return typeof raw === "number" && raw > 0 ? Math.floor(raw) : 10000;
    }

    private stateKey(): string { return `columns:${this.scope}`; }

    private displayColumns(dataset: DataSet): Column[] {
        const entity = dataset.getTargetEntityType();
        const known = this.available?.entity === entity ? new Map(this.available.columns.map(a => [a.name, a.type])) : undefined;
        const columns = arrangeColumns(dataset.columns, this.settings, known);
        // Columns saved before 0.0.5 have no stored type: load the table metadata once to resolve it
        if (!known && !this.availableError && entity && columns.some(c => !c.dataType)) void this.loadAvailable(entity);
        return columns;
    }

    private saveSettings(settings: ColumnSettings): void {
        this.settings = settings;
        this.state = { ...this.state, [this.stateKey()]: settings };
        this.context.mode.setControlState(this.state);
        writeSettings(this.scope, settings);
        this.rerender();
    }

    private ensureAddedColumns(dataset: DataSet): void {
        if (typeof dataset.addColumn !== "function") return;
        const present = new Set(dataset.columns.map(c => c.name));
        for (const name of Array.from(this.pendingColumns)) if (present.has(name)) this.pendingColumns.delete(name);
        const missing = this.settings.added.filter(a => !present.has(a.name) && !this.pendingColumns.has(a.name));
        if (!missing.length) return;
        for (const column of missing) { this.pendingColumns.add(column.name); dataset.addColumn(column.name); }
        dataset.refresh();
    }

    private async loadAvailable(entityName: string): Promise<void> {
        if (this.available?.entity === entityName || this.availableLoading === entityName) return;
        this.availableAbort?.abort();
        const abort = new AbortController();
        this.availableAbort = abort;
        this.availableLoading = entityName;
        this.availableError = undefined;
        try {
            const columns = await loadSearchableAttributes(entityName, abort.signal);
            if (abort.signal.aborted) return;
            this.available = { entity: entityName, columns };
        } catch (error) {
            if (abort.signal.aborted) return;
            this.availableError = messageOf(error);
        } finally {
            if (this.availableAbort === abort) this.availableLoading = undefined;
        }
        this.rerender();
    }

    private addColumn(dataset: DataSet, column: AvailableColumn, index?: number): void {
        if (typeof dataset.addColumn !== "function") { this.status = { kind: "error", text: "This host does not support adding columns." }; this.rerender(); return; }
        const settings = this.settings;
        const order = insertName(this.displayColumns(dataset).map(c => c.name), column.name, index);
        this.saveSettings({
            order,
            added: [...settings.added.filter(a => a.name !== column.name), { name: column.name, displayName: column.displayName, type: column.type }],
            hidden: settings.hidden.filter(n => n !== column.name)
        });
        if (!dataset.columns.some(c => c.name === column.name)) {
            this.pendingColumns.add(column.name);
            dataset.addColumn(column.name);
            dataset.refresh();
        }
    }

    private hideColumn(name: string): void {
        const settings = this.settings;
        const added = settings.added.some(a => a.name === name);
        this.saveSettings({
            order: settings.order,
            added: settings.added.filter(a => a.name !== name),
            hidden: added ? settings.hidden : [...settings.hidden.filter(n => n !== name), name]
        });
    }
    private loadMetadata(dataset: DataSet): void {
        const entity = dataset.getTargetEntityType();
        const names = dataset.columns.map(c => c.name).filter(name => !name.includes("."));
        if (!entity || !names.length) return;
        const key = `${entity}|${names.slice().sort().join(",")}`;
        if (key === this.metadataKey) return;
        this.metadataKey = key;
        this.metadataCache.get(key, () => this.context.utils.getEntityMetadata(entity, names))
            .then(metadata => { if (this.metadataKey === key) { this.metadata = metadata; this.rerender(); } return undefined; })
            .catch((error: unknown) => { if (this.metadataKey === key) { this.metadataKey = ""; this.metadata = {}; this.status = { kind: "error", text: `Metadata unavailable, cells are read-only: ${messageOf(error)}` }; this.rerender(); } });
    }

    private sort(dataset: DataSet, column: Column): void {
        const current = dataset.sorting.find(s => s.name === column.name);
        const next: SortStatus = { name: column.name, sortDirection: current && current.sortDirection === 0 ? 1 : 0 };
        dataset.sorting.splice(0, dataset.sorting.length, next);
        this.status = undefined;
        dataset.refresh();
    }

    private applyQuery(dataset: DataSet): void {
        try {
            const columns = this.displayColumns(dataset);
            const root = newGroup();
            const needle = this.search.trim();
            if (needle) {
                const textColumns = columns.filter(c => kindOf(c) === "text");
                if (!textColumns.length) throw new Error("Search needs at least one text column in the view. Formatted values of other column types are not searchable.");
                root.children.push({ ...newGroup(), join: "or", children: textColumns.map(c => ({ id: `search-${c.name}`, type: "condition", column: c.name, operator: "contains", value: needle })) });
            }
            if (this.filter) root.children.push(this.filter);
            const compiled = root.children.length ? compileFilter(root, columns, this.metadata) : undefined;
            this.status = undefined;
            this.selectedIds = [];
            this.query.apply(dataset, compiled);
        } catch (error) {
            this.status = { kind: "error", text: messageOf(error) };
            this.rerender();
        }
    }

    private async traverse(dataset: DataSet, label: string): Promise<RecordRow[] | undefined> {
        if (this.abort) { this.status = { kind: "error", text: "Another full-view operation is still running." }; this.rerender(); return undefined; }
        const abort = new AbortController();
        this.abort = abort;
        const limit = this.maxRecords();
        this.status = { kind: "progress", text: `${label}: loading records…` };
        this.rerender();
        try {
            const rows = await this.reader.all(abort.signal, limit, count => { this.status = { kind: "progress", text: `${label}: ${count.toLocaleString()} of up to ${limit.toLocaleString()} records loaded…` }; this.rerender(); });
            this.status = undefined;
            return rows;
        } catch (error) {
            this.status = { kind: "error", text: messageOf(error) };
            return undefined;
        } finally {
            this.abort = undefined;
            try { dataset.paging.loadExactPage(1); } catch { dataset.paging.reset(); }
            this.rerender();
        }
    }

    private async selectAll(dataset: DataSet): Promise<void> {
        const rows = await this.traverse(dataset, "Select all");
        if (!rows) return;
        const ids = rows.map(row => row.getRecordId());
        this.selectedIds = ids;
        dataset.setSelectedRecordIds(ids);
        this.status = { kind: "info", text: `${ids.length.toLocaleString()} records selected. Verify command-bar behavior for records outside the current page.` };
        this.rerender();
    }

    private async export(dataset: DataSet, format: ExportFormat, scope: ExportScope): Promise<void> {
        if (this.context.parameters.allowExport.raw !== true) return;
        const columns = this.displayColumns(dataset);
        const pageRows = dataset.sortedRecordIds.map(id => dataset.records[id]).filter(Boolean);
        let rows: RecordRow[] | undefined;
        if (scope === "page") rows = pageRows;
        else if (scope === "selected") {
            if (!this.selectedIds.length) { this.status = { kind: "error", text: "Select at least one record to export." }; this.rerender(); return; }
            const wanted = new Set(this.selectedIds.map(normalizeId));
            const onPage = pageRows.filter(row => wanted.has(normalizeId(row.getRecordId())));
            rows = onPage.length === wanted.size ? onPage : (await this.traverse(dataset, "Export selected"))?.filter(row => wanted.has(normalizeId(row.getRecordId())));
            if (rows && rows.length !== wanted.size) { this.status = { kind: "error", text: `${wanted.size - rows.length} selected records are no longer in the view. Export cancelled; no partial file was created.` }; this.rerender(); return; }
        } else rows = await this.traverse(dataset, "Export all");
        if (!rows) return;
        try {
            await exportRows(rows, columns, format, dataset.getTargetEntityType());
            this.status = { kind: "info", text: `Exported ${rows.length.toLocaleString()} records to ${format.toUpperCase()}.` };
        } catch (error) {
            this.status = { kind: "error", text: `Export failed: ${messageOf(error)}` };
        }
        this.rerender();
    }

    private async edit(dataset: DataSet, row: RecordRow, column: Column, value: string): Promise<void> {
        const field = this.metadata[column.name];
        if (!field) throw new Error("Field metadata is not loaded. Wait for the grid to finish loading.");
        await saveCell(row, column, field, value);
        this.status = undefined;
        dataset.refresh();
    }

    private openLookup(reference: ComponentFramework.EntityReference): void {
        const entityName = reference.etn;
        if (!entityName) { this.status = { kind: "error", text: "The lookup target table is unknown. Open the record form instead." }; this.rerender(); return; }
        this.context.navigation.openForm({ entityName, entityId: reference.id.guid }).catch((error: unknown) => {
            this.status = { kind: "error", text: messageOf(error) };
            this.rerender();
        });
    }
}
