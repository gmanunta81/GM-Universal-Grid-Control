import * as React from "react";
import { Column, Condition, FieldKind, FilterGroup, FilterNode, Metadata, Operator, RecordRow, kindOf, textOf } from "./core/types";
import { needsValue, newCondition, newGroup, operatorLabels, operatorsFor } from "./core/filters";
import { canEdit, editText } from "./core/editing";
import { ExportFormat } from "./core/export";
import { AvailableColumn } from "./core/columns";

export type ExportScope = "selected" | "page" | "all";
export interface Status { kind: "info" | "error" | "progress"; text: string; }
export interface ColumnChooserState {
    canAdd: boolean;
    available: AvailableColumn[] | undefined;
    availableError: string | undefined;
    hidden: Column[];
    customized: boolean;
}

export interface GridProps {
    entityName: string;
    columns: Column[];
    rows: RecordRow[];
    metadata: Metadata;
    loading: boolean;
    busy: boolean;
    status: Status | undefined;
    selectedIds: string[];
    search: string;
    filter: FilterGroup | undefined;
    sorting: ComponentFramework.PropertyHelper.DataSetApi.SortStatus[];
    paging: { page: number; hasPrevious: boolean; hasNext: boolean; total: number; pageSize: number; };
    enableEditing: boolean;
    allowExport: boolean;
    maxRecords: number;
    columnChooser: ColumnChooserState;
    onSort: (column: Column) => void;
    onSearch: (search: string) => void;
    onApplyFilter: (filter: FilterGroup | undefined) => void;
    onSelect: (ids: string[]) => void;
    onSelectAll: () => void;
    onCancel: () => void;
    onPage: (direction: -1 | 1) => void;
    onPageSize: (size: number) => void;
    onOpenRecord: (row: RecordRow) => void;
    onOpenLookup: (reference: ComponentFramework.EntityReference) => void;
    onEdit: (row: RecordRow, column: Column, value: string) => Promise<void>;
    onReorder: (names: string[]) => void;
    onLoadAvailableColumns: () => void;
    onAddColumn: (column: AvailableColumn, index?: number) => void;
    onHideColumn: (name: string) => void;
    onShowColumn: (name: string, index?: number) => void;
    onResetColumns: () => void;
    onExport: (format: ExportFormat, scope: ExportScope) => void;
    onRefresh: () => void;
}

const colorPattern = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
function safeColor(color: string | undefined): string | undefined { return color && colorPattern.test(color) ? color : undefined; }
function isReference(value: unknown): value is ComponentFramework.EntityReference {
    const candidate = value as ComponentFramework.EntityReference | undefined;
    return !!candidate && typeof candidate === "object" && !!candidate.id && typeof candidate.id.guid === "string";
}
function primaryText(row: RecordRow, column: Column): string {
    const text = textOf(row.getFormattedValue(column.name));
    return text.trim() ? text : "(no name)";
}
function contrast(hex: string): string {
    const full = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
    const r = parseInt(full.substring(1, 3), 16), g = parseInt(full.substring(3, 5), 16), b = parseInt(full.substring(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? "#000" : "#fff";
}

function Badge(props: { label: string; color?: string }): React.ReactElement {
    const color = safeColor(props.color);
    return <span className="ug-badge" style={color ? { backgroundColor: color, color: contrast(color) } : undefined}>{props.label}</span>;
}

function CellValue(props: { row: RecordRow; column: Column; metadata: Metadata; onOpenLookup: GridProps["onOpenLookup"] }): React.ReactElement {
    const { row, column } = props;
    const kind = kindOf(column);
    const formatted = row.getFormattedValue(column.name) || "";
    if (kind === "lookup") {
        const raw = row.getValue(column.name);
        const references = Array.isArray(raw) ? raw.filter(isReference) : isReference(raw) ? [raw] : [];
        if (!references.length) return <span>{formatted}</span>;
        return <>{references.map((reference, index) => (
            <button key={`${reference.id.guid}-${index}`} type="button" className="ug-link" onClick={e => { e.stopPropagation(); props.onOpenLookup(reference); }}>
                {reference.name || formatted}
            </button>))}</>;
    }
    if (kind === "choice" || kind === "choices") {
        const raw = row.getValue(column.name);
        const values = (Array.isArray(raw) ? raw : raw === null || raw === undefined ? [] : [raw]).filter((v): v is number => typeof v === "number");
        const options = props.metadata[column.name]?.options ?? [];
        const labels = formatted.split(";").map(s => s.trim()).filter(Boolean);
        if (!values.length && !labels.length) return <span />;
        const items = values.length ? values.map((value, index) => {
            const option = options.find(o => o.value === value);
            return { key: `${value}-${index}`, label: option?.label ?? labels[index] ?? String(value), color: option?.color };
        }) : labels.map((label, index) => ({ key: `${label}-${index}`, label, color: options.find(o => o.label === label)?.color }));
        return <>{items.map(item => <Badge key={item.key} label={item.label} color={item.color} />)}</>;
    }
    return <span className={kind === "number" ? "ug-number" : undefined}>{formatted}</span>;
}

function CellEditor(props: { row: RecordRow; column: Column; metadata: Metadata; onCommit: (value: string) => void; onCancel: () => void }): React.ReactElement {
    const { column, row } = props;
    const kind = kindOf(column);
    const field = props.metadata[column.name];
    const initial = React.useMemo(() => kind === "boolean" ? String(row.getValue(column.name) === true) : editText(row, column), [row, column, kind]);
    const [value, setValue] = React.useState(initial);
    const ref = React.useRef<HTMLInputElement | HTMLSelectElement>(null);
    // Enter/Escape unmount the editor, which can also fire blur: settle only once
    const settled = React.useRef(false);
    React.useEffect(() => { ref.current?.focus(); }, []);
    const commit = (next: string) => {
        if (settled.current) return;
        settled.current = true;
        if (next === initial) props.onCancel(); else props.onCommit(next);
    };
    const cancel = () => {
        if (settled.current) return;
        settled.current = true;
        props.onCancel();
    };
    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") { e.preventDefault(); commit(value); }
        if (e.key === "Escape") { e.preventDefault(); cancel(); }
    };
    const label = `Edit ${column.displayName}`;
    if (kind === "choice" || kind === "boolean") {
        return <select ref={ref as React.RefObject<HTMLSelectElement>} aria-label={label} value={value} onChange={e => setValue(e.target.value)} onBlur={() => commit(value)} onKeyDown={onKeyDown}>
            {!field?.required && <option value="">--</option>}
            {kind === "boolean" ? <><option value="true">Yes</option><option value="false">No</option></> : field?.options.map(o => <option key={o.value} value={String(o.value)}>{o.label}</option>)}
        </select>;
    }
    return <input ref={ref as React.RefObject<HTMLInputElement>} aria-label={label} type={kind === "number" ? "number" : kind === "date" ? "date" : "text"} value={value}
        maxLength={field?.maxLength} onChange={e => setValue(e.target.value)} onBlur={() => commit(value)} onKeyDown={onKeyDown} />;
}

interface FilterEditorProps { group: FilterGroup; columns: Column[]; metadata: Metadata; onChange: (group: FilterGroup) => void; onRemove?: () => void; depth: number; }
function FilterEditor(props: FilterEditorProps): React.ReactElement {
    const { group, columns } = props;
    const update = (children: FilterNode[]) => props.onChange({ ...group, children });
    const replace = (index: number, node: FilterNode) => update(group.children.map((child, i) => i === index ? node : child));
    const remove = (index: number) => update(group.children.filter((_, i) => i !== index));
    const valueInput = (condition: Condition, column: Column | undefined) => {
        if (!column || !needsValue(condition.operator)) return null;
        const kind: FieldKind = kindOf(column);
        const set = (value: string) => replace(group.children.indexOf(condition), { ...condition, value });
        const label = `Value for ${column.displayName}`;
        if (kind === "choice") return <select aria-label={label} value={condition.value} onChange={e => set(e.target.value)}><option value="">--</option>{props.metadata[column.name]?.options.map(o => <option key={o.value} value={String(o.value)}>{o.label}</option>)}</select>;
        if (kind === "boolean") return <select aria-label={label} value={condition.value} onChange={e => set(e.target.value)}><option value="">--</option><option value="1">Yes</option><option value="0">No</option></select>;
        return <input aria-label={label} type={kind === "number" ? "number" : kind === "date" ? "date" : "text"} placeholder={kind === "lookup" ? "Record GUID" : ""} value={condition.value} onChange={e => set(e.target.value)} />;
    };
    return <fieldset className="ug-filter-group" data-depth={props.depth}>
        <legend>
            <select aria-label="Group operator" value={group.join} onChange={e => props.onChange({ ...group, join: e.target.value as "and" | "or" })}><option value="and">All conditions (AND)</option><option value="or">Any condition (OR)</option></select>
            <button type="button" onClick={() => columns[0] && update([...group.children, newCondition(columns[0])])} disabled={!columns.length}>+ Condition</button>
            {props.depth < 3 && <button type="button" onClick={() => update([...group.children, newGroup()])}>+ Group</button>}
            {props.onRemove && <button type="button" onClick={props.onRemove} aria-label="Remove group">Remove group</button>}
        </legend>
        {group.children.map((child, index) => child.type === "group"
            ? <FilterEditor key={child.id} group={child} columns={columns} metadata={props.metadata} depth={props.depth + 1} onChange={node => replace(index, node)} onRemove={() => remove(index)} />
            : (() => {
                const column = columns.find(c => c.name === child.column);
                return <div key={child.id} className="ug-condition">
                    <select aria-label="Column" value={child.column} onChange={e => { const next = columns.find(c => c.name === e.target.value); if (next) replace(index, { ...child, column: next.name, operator: operatorsFor(next)[0], value: "" }); }}>
                        {columns.map(c => <option key={c.name} value={c.name}>{c.displayName}</option>)}
                    </select>
                    <select aria-label="Operator" value={child.operator} onChange={e => replace(index, { ...child, operator: e.target.value as Operator, value: "" })}>
                        {(column ? operatorsFor(column) : []).map(op => <option key={op} value={op}>{operatorLabels[op]}</option>)}
                    </select>
                    {valueInput(child, column)}
                    <button type="button" onClick={() => remove(index)} aria-label="Remove condition">✕</button>
                </div>;
            })())}
    </fieldset>;
}

interface ChooserItem { name: string; displayName: string; type: string; source: "view" | "table"; }
interface ChooserDrag { from: "shown" | "available"; name: string; }
interface ColumnChooserProps {
    columns: Column[];
    state: ColumnChooserState;
    busy: boolean;
    onAdd: GridProps["onAddColumn"];
    onHide: GridProps["onHideColumn"];
    onShow: GridProps["onShowColumn"];
    onReorder: GridProps["onReorder"];
    onReset: GridProps["onResetColumns"];
    onClose: () => void;
}
const TYPE_LABELS: [RegExp, string][] = [
    [/multiselect/, "Choices"], [/picklist|optionset|^state$|^status$/, "Choice"], [/boolean|twooptions/, "Yes/No"],
    [/lookup|customer|owner/, "Lookup"], [/date/, "Date"], [/money|currency/, "Currency"],
    [/integer|whole|bigint|decimal|double|^fp$|float/, "Number"], [/memo|multiple/, "Multiline"], [/string|singleline|text/, "Text"]
];
function typeLabel(type: string | null | undefined): string {
    const t = textOf(type).toLowerCase();
    return TYPE_LABELS.find(([pattern]) => pattern.test(t))?.[1] ?? textOf(type);
}

function ColumnChooser(props: ColumnChooserProps): React.ReactElement {
    const { state, columns, busy } = props;
    const [query, setQuery] = React.useState("");
    const [drag, setDrag] = React.useState<ChooserDrag | undefined>();
    const dragRef = React.useRef<ChooserDrag | undefined>();
    const [insertAt, setInsertAt] = React.useState<number | undefined>();
    const [overAvailable, setOverAvailable] = React.useState(false);

    const shownNames = new Set(columns.map(c => c.name));
    const hiddenNames = new Set(state.hidden.map(c => c.name));
    const items: ChooserItem[] = [
        ...state.hidden.map(c => ({ name: c.name, displayName: textOf(c.displayName) || c.name, type: textOf(c.dataType), source: "view" as const })),
        ...(state.available ?? []).filter(a => !shownNames.has(a.name) && !hiddenNames.has(a.name)).map(a => ({ ...a, source: "table" as const }))
    ];
    const byName = new Map(items.map(item => [item.name, item]));
    const needle = query.trim().toLocaleLowerCase();
    const matches = items.filter(item => !needle || item.displayName.toLocaleLowerCase().includes(needle) || item.name.includes(needle));
    const MAX = 100;

    const begin = (e: React.DragEvent, item: ChooserDrag) => {
        dragRef.current = item;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", item.name);
        setDrag(item);
    };
    const finish = () => { dragRef.current = undefined; setDrag(undefined); setInsertAt(undefined); setOverAvailable(false); };
    // index = insertion position in the shown list, before the item is removed from its current place
    const place = (item: ChooserDrag, index: number) => {
        if (item.from === "shown") {
            const names = columns.map(c => c.name);
            const from = names.indexOf(item.name);
            if (from < 0 || index === from || index === from + 1) return;
            names.splice(from, 1);
            names.splice(from < index ? index - 1 : index, 0, item.name);
            props.onReorder(names);
            return;
        }
        const source = byName.get(item.name);
        if (!source) return;
        if (source.source === "view") props.onShow(source.name, index);
        else props.onAdd({ name: source.name, displayName: source.displayName, type: source.type }, index);
    };
    const overShown = (e: React.DragEvent, index: number) => {
        if (!dragRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        setOverAvailable(false);
        if (insertAt !== index) setInsertAt(index);
    };
    const overShownItem = (e: React.DragEvent<HTMLLIElement>, index: number) => {
        const rect = e.currentTarget.getBoundingClientRect();
        overShown(e, e.clientY > rect.top + rect.height / 2 ? index + 1 : index);
    };
    const dropShown = (e: React.DragEvent) => {
        const item = dragRef.current;
        const index = insertAt ?? columns.length;
        finish();
        if (!item) return;
        e.preventDefault();
        place(item, index);
    };
    const overAvailablePane = (e: React.DragEvent) => {
        if (dragRef.current?.from !== "shown" || columns.length <= 1) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setInsertAt(undefined);
        if (!overAvailable) setOverAvailable(true);
    };
    const dropAvailable = (e: React.DragEvent) => {
        const item = dragRef.current;
        finish();
        if (item?.from !== "shown" || columns.length <= 1) return;
        e.preventDefault();
        props.onHide(item.name);
    };
    const leave = (e: React.DragEvent, clear: () => void) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) clear(); };

    return <div className="ug-columns" role="dialog" aria-label="Edit columns">
        <div className="ug-columns-head">
            <div>
                <strong>Edit columns</strong>
                <span>Drag a column from the right to the left to add it, drag inside the left list to reorder, drag back to the right to remove.</span>
            </div>
            <div className="ug-columns-head-actions">
                <button type="button" onClick={props.onReset} disabled={busy || !state.customized} title="Restore the view columns and order">Reset to view</button>
                <button type="button" onClick={props.onClose} aria-label="Close">✕</button>
            </div>
        </div>
        <div className="ug-columns-body">
            <section className={`ug-pane${drag?.from === "available" ? " ug-pane-accept" : ""}`} aria-label="Columns in grid"
                onDragOver={e => overShown(e, insertAt ?? columns.length)} onDragLeave={e => leave(e, () => setInsertAt(undefined))} onDrop={dropShown}>
                <header><strong>Columns in grid</strong><span className="ug-count">{columns.length}</span></header>
                <ol className="ug-col-list">
                    {columns.map((column, index) => {
                        const classes = [
                            drag?.from === "shown" && drag.name === column.name ? "ug-dragging" : "",
                            insertAt === index ? "ug-insert-before" : "",
                            insertAt === columns.length && index === columns.length - 1 ? "ug-insert-after" : ""
                        ].filter(Boolean).join(" ");
                        const item: ChooserDrag = { from: "shown", name: column.name };
                        return <li key={column.name} className={classes || undefined} draggable={!busy} title="Drag to reorder, or to the right to remove"
                            onDragStart={e => begin(e, item)} onDragEnd={finish} onDragOver={e => overShownItem(e, index)} onDrop={dropShown}>
                            <span className="ug-grip" aria-hidden="true">⋮⋮</span>
                            <span className="ug-col-name">{column.displayName}<small>{column.name}</small></span>
                            <span className="ug-type">{typeLabel(column.dataType)}</span>
                            <span className="ug-col-actions">
                                <button type="button" onClick={() => place(item, index - 1)} disabled={busy || index === 0} aria-label={`Move ${column.displayName} up`}>▲</button>
                                <button type="button" onClick={() => place(item, index + 2)} disabled={busy || index === columns.length - 1} aria-label={`Move ${column.displayName} down`}>▼</button>
                                <button type="button" onClick={() => props.onHide(column.name)} disabled={busy || columns.length <= 1} aria-label={`Remove ${column.displayName}`} title="Remove from grid">✕</button>
                            </span>
                        </li>;
                    })}
                </ol>
                {drag?.from === "available" && <div className="ug-drop-hint">Drop here to add the column</div>}
            </section>
            <section className={`ug-pane${drag?.from === "shown" && columns.length > 1 ? " ug-pane-remove" : ""}${overAvailable ? " ug-pane-over" : ""}`} aria-label="Available columns"
                onDragOver={overAvailablePane} onDragLeave={e => leave(e, () => setOverAvailable(false))} onDrop={dropAvailable}>
                <header><strong>Available columns</strong><span className="ug-count">{items.length}</span></header>
                <input type="search" aria-label="Find a column" placeholder="Find a searchable column…" value={query} onChange={e => setQuery(e.target.value)} />
                {!state.canAdd && <p className="ug-columns-note">This host does not support adding table columns; only removed view columns are listed.</p>}
                {state.canAdd && state.availableError && <p className="ug-columns-note ug-columns-error">{state.availableError}</p>}
                {state.canAdd && !state.available && !state.availableError && <p className="ug-columns-note">Loading searchable columns…</p>}
                {drag?.from === "shown" && columns.length > 1 ? <div className="ug-drop-hint ug-drop-hint-remove">Drop here to remove the column from the grid</div>
                    : <ul className="ug-col-list">
                        {matches.slice(0, MAX).map(source => {
                            const item: ChooserDrag = { from: "available", name: source.name };
                            return <li key={source.name} className={drag?.name === source.name ? "ug-dragging" : undefined} draggable={!busy}
                                title={`Drag to the left or double-click to add ${source.displayName}`}
                                onDragStart={e => begin(e, item)} onDragEnd={finish} onDoubleClick={() => !busy && place(item, columns.length)}>
                                <span className="ug-grip" aria-hidden="true">⋮⋮</span>
                                <span className="ug-col-name">{source.displayName}<small>{source.name}</small></span>
                                {source.source === "view" && <span className="ug-type ug-type-view">View</span>}
                                <span className="ug-type">{typeLabel(source.type)}</span>
                                <span className="ug-col-actions">
                                    <button type="button" onClick={() => place(item, columns.length)} disabled={busy} aria-label={`Add ${source.displayName}`} title="Add to the grid">＋</button>
                                </span>
                            </li>;
                        })}
                        {!matches.length && (!!state.available || !state.canAdd) && <li className="ug-col-empty">No columns match.</li>}
                    </ul>}
                {matches.length > MAX && <p className="ug-columns-note">{(matches.length - MAX).toLocaleString()} more… refine the search.</p>}
            </section>
        </div>
    </div>;
}
interface DragItem { kind: "column" | "row"; id: string; }
const DRAG_TYPE = "text/x-ug-item";

export function Grid(props: GridProps): React.ReactElement {
    const { columns, metadata } = props;
    const [searchText, setSearchText] = React.useState(props.search);
    const [showFilters, setShowFilters] = React.useState(false);
    const [draft, setDraft] = React.useState<FilterGroup>(() => props.filter ?? newGroup());
    const [editing, setEditing] = React.useState<{ id: string; column: string } | undefined>();
    const [editError, setEditError] = React.useState<string | undefined>();
    const [drag, setDrag] = React.useState<DragItem | undefined>();
    const [dropTarget, setDropTarget] = React.useState<DragItem | undefined>();
    const dragRef = React.useRef<DragItem | undefined>();
    const [showColumns, setShowColumns] = React.useState(false);
    const [rowOrder, setRowOrder] = React.useState<{ key: string; ids: string[] } | undefined>();
    React.useEffect(() => setSearchText(props.search), [props.search]);
    React.useEffect(() => setDraft(props.filter ?? newGroup()), [props.filter]);

    const selected = React.useMemo(() => new Set(props.selectedIds), [props.selectedIds]);
    const pageIds = props.rows.map(r => r.getRecordId());
    const pageKey = pageIds.join("|");
    // Row order is a visual-only arrangement of the current page; it resets when the page content changes
    const rows = React.useMemo(() => {
        if (!rowOrder || rowOrder.key !== pageKey) return props.rows;
        const byId = new Map(props.rows.map(r => [r.getRecordId(), r]));
        return rowOrder.ids.map(id => byId.get(id)).filter((r): r is RecordRow => !!r);
    }, [props.rows, rowOrder, pageKey]);
    const rowsCustomized = !!rowOrder && rowOrder.key === pageKey;
    const allPageSelected = pageIds.length > 0 && pageIds.every(id => selected.has(id));

    const move = (from: number, to: number) => {
        if (from < 0 || to < 0 || to >= columns.length || from === to) return;
        const names = columns.map(c => c.name);
        names.splice(to, 0, names.splice(from, 1)[0]);
        props.onReorder(names);
    };
    const moveRow = (fromId: string, toId: string) => {
        if (fromId === toId) return;
        const ids = rows.map(r => r.getRecordId());
        const from = ids.indexOf(fromId), to = ids.indexOf(toId);
        if (from < 0 || to < 0) return;
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        setRowOrder({ key: pageKey, ids });
    };
    const startDrag = (e: React.DragEvent, item: DragItem, image?: Element | null) => {
        dragRef.current = item;
        e.dataTransfer.effectAllowed = "move";
        // Some browsers do not start a drag operation without data
        e.dataTransfer.setData(DRAG_TYPE, `${item.kind}:${item.id}`);
        e.dataTransfer.setData("text/plain", item.id);
        if (image) e.dataTransfer.setDragImage(image, 16, 16);
        setDrag(item);
    };
    const endDrag = () => { dragRef.current = undefined; setDrag(undefined); setDropTarget(undefined); };
    const overTarget = (e: React.DragEvent, target: DragItem) => {
        const source = dragRef.current;
        if (!source || source.kind !== target.kind) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dropTarget?.kind !== target.kind || dropTarget.id !== target.id) setDropTarget(target);
    };
    const dropOn = (e: React.DragEvent, target: DragItem) => {
        const source = dragRef.current;
        endDrag();
        if (!source || source.kind !== target.kind) return;
        e.preventDefault();
        if (source.kind === "column") move(columns.findIndex(c => c.name === source.id), columns.findIndex(c => c.name === target.id));
        else moveRow(source.id, target.id);
    };
    const toggleColumns = () => { if (!showColumns) props.onLoadAvailableColumns(); setShowColumns(!showColumns); };
    const commitEdit = async (row: RecordRow, column: Column, value: string) => {
        setEditing(undefined);
        try { setEditError(undefined); await props.onEdit(row, column, value); }
        catch (error) { setEditError(error instanceof Error ? error.message : "The change could not be saved."); }
    };
    const sortOf = (column: Column) => props.sorting.find(s => s.name === column.name);
    const filterCount = (node: FilterNode): number => node.type === "group" ? node.children.reduce((sum, child) => sum + filterCount(child), 0) : 1;
    const activeFilters = props.filter ? filterCount(props.filter) : 0;

    return <div className="ug-root" aria-busy={props.loading || props.busy}>
        <div className="ug-toolbar" role="toolbar" aria-label="Grid tools">
            <form className="ug-search" onSubmit={e => { e.preventDefault(); props.onSearch(searchText); }}>
                <input type="search" aria-label="Search visible text columns" placeholder="Search…" value={searchText} onChange={e => setSearchText(e.target.value)} disabled={props.busy} />
                <button type="submit" disabled={props.busy}>Search</button>
                {props.search && <button type="button" onClick={() => { setSearchText(""); props.onSearch(""); }} disabled={props.busy}>Clear</button>}
            </form>
            <button type="button" aria-pressed={showFilters} onClick={() => setShowFilters(!showFilters)} disabled={props.busy}>Filters{activeFilters ? ` (${activeFilters})` : ""}</button>
            <button type="button" aria-pressed={showColumns} onClick={toggleColumns} disabled={props.busy}>Columns</button>
            {rowsCustomized && <button type="button" onClick={() => setRowOrder(undefined)} title="Restore the row order returned by the view">Reset row order</button>}
            {props.selectedIds.length > 0 && <button type="button" onClick={() => props.onSelect([])} disabled={props.busy}>Clear selection ({props.selectedIds.length})</button>}
            {props.allowExport && <span className="ug-export">
                <label>Export <select aria-label="Export" defaultValue="" disabled={props.busy || props.loading} onChange={e => { const [format, scope] = e.target.value.split(":"); e.target.value = ""; if (format) props.onExport(format as ExportFormat, scope as ExportScope); }}>
                    <option value="">Choose…</option>
                    <optgroup label="Excel (.xlsx)"><option value="xlsx:page">Current page</option><option value="xlsx:selected">Selected records</option><option value="xlsx:all">All matching records</option></optgroup>
                    <optgroup label="CSV"><option value="csv:page">Current page</option><option value="csv:selected">Selected records</option><option value="csv:all">All matching records</option></optgroup>
                </select></label>
            </span>}
            <button type="button" onClick={props.onRefresh} disabled={props.busy}>Refresh</button>
            {props.busy && <button type="button" className="ug-cancel" onClick={props.onCancel}>Cancel</button>}
        </div>
        {showFilters && <div className="ug-filters">
            <FilterEditor group={draft} columns={columns} metadata={metadata} depth={0} onChange={setDraft} />
            <div className="ug-filter-actions">
                <button type="button" onClick={() => props.onApplyFilter(draft.children.length ? draft : undefined)} disabled={props.busy}>Apply filters</button>
                <button type="button" onClick={() => { setDraft(newGroup()); props.onApplyFilter(undefined); }} disabled={props.busy}>Clear filters</button>
            </div>
        </div>}
        {showColumns && <ColumnChooser columns={columns} state={props.columnChooser} busy={props.busy} onAdd={props.onAddColumn} onHide={props.onHideColumn}
            onShow={props.onShowColumn} onReorder={props.onReorder} onReset={props.onResetColumns} onClose={() => setShowColumns(false)} />}
        {(props.status ?? editError) && <div className={`ug-status ug-status-${editError ? "error" : props.status?.kind}`} role={editError ?? props.status?.kind === "error" ? "alert" : "status"}>
            {editError ?? props.status?.text}
            {editError && <button type="button" onClick={() => setEditError(undefined)} aria-label="Dismiss">✕</button>}
        </div>}
        <div className="ug-table-wrap">
            <table className="ug-table">
                <thead>
                    <tr>
                        <th scope="col" className="ug-select">
                            <input type="checkbox" aria-label="Select all records on this page" checked={allPageSelected} disabled={!pageIds.length || props.busy}
                                onChange={e => props.onSelect(e.target.checked ? Array.from(new Set([...props.selectedIds, ...pageIds])) : props.selectedIds.filter(id => !pageIds.includes(id)))} />
                        </th>
                        {columns.map((column, index) => {
                            const sort = sortOf(column);
                            const direction = sort ? (sort.sortDirection === 0 ? "ascending" : "descending") : "none";
                            const target: DragItem = { kind: "column", id: column.name };
                            const classes = [drag?.kind === "column" && drag.id === column.name ? "ug-dragging" : "", dropTarget?.kind === "column" && dropTarget.id === column.name && drag?.id !== column.name ? "ug-drop-target" : ""].filter(Boolean).join(" ");
                            return <th key={column.name} scope="col" aria-sort={direction} draggable={!props.busy} className={classes || undefined} title="Drag to move the column"
                                onDragStart={e => startDrag(e, target)} onDragEnter={e => overTarget(e, target)} onDragOver={e => overTarget(e, target)} onDragEnd={endDrag}
                                onDrop={e => dropOn(e, target)}>
                                <div className="ug-header">
                                    <span className="ug-col-handle" aria-hidden="true">⋮⋮</span>
                                    <button type="button" className="ug-sort" onClick={() => props.onSort(column)} disabled={props.busy || column.disableSorting} title={column.disableSorting ? "Sorting is not available for this column" : `Sort by ${column.displayName}`}>
                                        {column.displayName}{direction !== "none" && <span aria-hidden="true">{direction === "ascending" ? " ▲" : " ▼"}</span>}
                                    </button>
                                    <span className="ug-move">
                                        <button type="button" aria-label={`Move ${column.displayName} left`} disabled={index === 0 || props.busy} onClick={() => move(index, index - 1)}>◀</button>
                                        <button type="button" aria-label={`Move ${column.displayName} right`} disabled={index === columns.length - 1 || props.busy} onClick={() => move(index, index + 1)}>▶</button>
                                    </span>
                                </div>
                            </th>;
                        })}
                    </tr>
                </thead>
                <tbody>
                    {!rows.length && <tr><td colSpan={columns.length + 1} className="ug-empty">{props.loading ? "Loading…" : "No records match the current view, search and filters."}</td></tr>}
                    {rows.map(row => {
                        const id = row.getRecordId();
                        const target: DragItem = { kind: "row", id };
                        const classes = [selected.has(id) ? "ug-selected" : "", drag?.kind === "row" && drag.id === id ? "ug-dragging" : "", dropTarget?.kind === "row" && dropTarget.id === id && drag?.id !== id ? "ug-drop-target" : ""].filter(Boolean).join(" ");
                        return <tr key={id} aria-selected={selected.has(id)} className={classes || undefined}
                            onDragEnter={e => overTarget(e, target)} onDragOver={e => overTarget(e, target)} onDrop={e => dropOn(e, target)}>
                            <td className="ug-select"><span className="ug-row-handle" draggable title="Drag to move the row (visual only)" aria-hidden="true"
                                onDragStart={e => startDrag(e, target, e.currentTarget.closest("tr"))} onDragEnd={endDrag}>⋮⋮</span><input type="checkbox" aria-label="Select record" checked={selected.has(id)} disabled={props.busy}
                                onChange={e => props.onSelect(e.target.checked ? [...props.selectedIds, id] : props.selectedIds.filter(x => x !== id))} /></td>
                            {columns.map((column, index) => {
                                const editable = props.enableEditing && !props.busy && canEdit(row, column, metadata[column.name]);
                                const isEditing = editing?.id === id && editing.column === column.name;
                                return <td key={column.name} className={editable ? "ug-editable" : undefined} tabIndex={0}
                                    onDoubleClick={() => editable && setEditing({ id, column: column.name })}
                                    onKeyDown={e => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" && editable) setEditing({ id, column: column.name }); else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); props.onOpenRecord(row); } }}>
                                    {isEditing
                                        ? <CellEditor row={row} column={column} metadata={metadata} onCommit={value => void commitEdit(row, column, value)} onCancel={() => setEditing(undefined)} />
                                        : index === 0 && !column.isPrimary && !columns.some(c => c.isPrimary) || column.isPrimary
                                            ? <button type="button" className="ug-link ug-primary" onClick={() => props.onOpenRecord(row)}>{primaryText(row, column)}</button>
                                            : <CellValue row={row} column={column} metadata={metadata} onOpenLookup={props.onOpenLookup} />}
                                </td>;
                            })}
                        </tr>;
                    })}
                </tbody>
            </table>
        </div>
        <div className="ug-footer">
            <span>{props.paging.total >= 0 ? `${props.paging.total.toLocaleString()} record${props.paging.total === 1 ? "" : "s"}` : "5,000+ records"}{props.selectedIds.length ? ` · ${props.selectedIds.length.toLocaleString()} selected` : ""}</span>
            <span className="ug-pager">
                <label>Rows <select aria-label="Rows per page" value={props.paging.pageSize} onChange={e => props.onPageSize(Number(e.target.value))} disabled={props.busy}>
                    {[25, 50, 100, 250].map(size => <option key={size} value={size}>{size}</option>)}
                </select></label>
                <button type="button" onClick={() => props.onPage(-1)} disabled={!props.paging.hasPrevious || props.busy || props.loading} aria-label="Previous page">‹</button>
                <span>Page {props.paging.page}</span>
                <button type="button" onClick={() => props.onPage(1)} disabled={!props.paging.hasNext || props.busy || props.loading} aria-label="Next page">›</button>
            </span>
        </div>
    </div>;
}
