import { Column, objectOf, textOf } from "./types";

export interface AvailableColumn { name: string; displayName: string; type: string; }
export interface AddedColumn { name: string; displayName: string; type?: string; }
export interface ColumnSettings { order: string[]; added: AddedColumn[]; hidden: string[]; }

const LOGICAL_NAME = /^[a-z_][a-z0-9_]*$/;
// Attribute types that cannot be shown as a grid column
const EXCLUDED_TYPES = new Set(["virtual", "entityname", "calendarrules", "managedproperty", "partylist", "uniqueidentifier", "image", "file"]);

function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function label(value: unknown): string { return text(objectOf(objectOf(value)?.UserLocalizedLabel)?.Label); }
function flag(value: unknown): boolean { const object = objectOf(value); return (object ? object.Value : value) === true; }

/** Columns that can be added: readable, searchable (IsValidForAdvancedFind) and not a helper column of another attribute. */
export function parseSearchableAttributes(raw: unknown): AvailableColumn[] {
    const items = objectOf(raw)?.value;
    if (!Array.isArray(items)) return [];
    const result: AvailableColumn[] = [];
    for (const item of items) {
        const attribute = objectOf(item);
        if (!attribute) continue;
        const name = text(attribute.LogicalName);
        const type = text(attribute.AttributeType);
        const typeName = text(objectOf(attribute.AttributeTypeName)?.Value);
        if (!LOGICAL_NAME.test(name) || attribute.AttributeOf) continue;
        if (!flag(attribute.IsValidForAdvancedFind) || attribute.IsValidForRead === false) continue;
        const isMultiSelect = typeName.toLowerCase() === "multiselectpicklisttype";
        if (EXCLUDED_TYPES.has(type.toLowerCase()) && !isMultiSelect) continue;
        result.push({ name, displayName: label(attribute.DisplayName) || name, type: isMultiSelect ? "MultiSelectPicklist" : type });
    }
    return result.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function clientUrl(): string {
    const xrm = (window as unknown as { Xrm?: { Utility?: { getGlobalContext?: () => { getClientUrl?: () => string } } } }).Xrm;
    try {
        const url = xrm?.Utility?.getGlobalContext?.().getClientUrl?.();
        if (url) return url.replace(/\/$/, "");
    } catch { /* fall back to the page origin */ }
    return window.location.origin;
}

export async function loadSearchableAttributes(entityName: string, signal?: AbortSignal): Promise<AvailableColumn[]> {
    if (!LOGICAL_NAME.test(entityName)) throw new Error(`Invalid table name "${entityName}".`);
    const select = "LogicalName,DisplayName,AttributeType,AttributeTypeName,IsValidForAdvancedFind,IsValidForRead,AttributeOf";
    const url = `${clientUrl()}/api/data/v9.2/EntityDefinitions(LogicalName='${entityName}')/Attributes?$select=${select}`;
    const response = await fetch(url, {
        credentials: "same-origin",
        signal,
        headers: { Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" }
    });
    if (!response.ok) throw new Error(`Column metadata could not be loaded (HTTP ${response.status}).`);
    return parseSearchableAttributes(await response.json());
}

function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && LOGICAL_NAME.test(v)) : []; }

export function parseSettings(raw: unknown): ColumnSettings {
    const object = objectOf(raw);
    const added = Array.isArray(object?.added) ? object.added.map(objectOf).filter((a): a is Record<string, unknown> => !!a && typeof a.name === "string" && LOGICAL_NAME.test(a.name))
        .map(a => ({ name: a.name as string, displayName: text(a.displayName) || (a.name as string), type: text(a.type) || undefined })) : [];
    return { order: strings(object?.order), added, hidden: strings(object?.hidden) };
}

const STORAGE_PREFIX = "gm-universal-grid:";
export function readSettings(scope: string, state: unknown): ColumnSettings {
    try {
        const stored = window.localStorage.getItem(STORAGE_PREFIX + scope);
        if (stored) return parseSettings(JSON.parse(stored));
    } catch { /* storage unavailable: use the control state */ }
    return parseSettings(state);
}
export function writeSettings(scope: string, settings: ColumnSettings): void {
    try { window.localStorage.setItem(STORAGE_PREFIX + scope, JSON.stringify(settings)); } catch { /* storage unavailable */ }
}

/** Moves (or inserts) name to index; index is clamped, undefined appends. */
export function insertName(names: string[], name: string, index?: number): string[] {
    const rest = names.filter(n => n !== name);
    const at = index === undefined ? rest.length : Math.max(0, Math.min(index, rest.length));
    rest.splice(at, 0, name);
    return rest;
}

// Metadata AttributeType -> PCF dataset dataType (used when the host returns no dataType for added columns)
const DATASET_TYPES: Record<string, string> = {
    string: "SingleLine.Text", memo: "Multiple", integer: "Whole.None", bigint: "Whole.None", decimal: "Decimal", double: "FP",
    money: "Currency", datetime: "DateAndTime.DateAndTime", boolean: "TwoOptions", picklist: "OptionSet", state: "OptionSet",
    status: "OptionSet", multiselectpicklist: "MultiSelectPicklist", lookup: "Lookup.Simple", customer: "Lookup.Customer", owner: "Lookup.Owner"
};
export function datasetType(attributeType: string | undefined): string { return DATASET_TYPES[textOf(attributeType).toLowerCase()] ?? ""; }

/**
 * Columns shown by the grid: view columns plus added columns, minus hidden ones, in the saved order.
 * Columns added with dataset.addColumn are not part of the view (order -1), so they are matched by name.
 * The host may return them without dataType/displayName: these are filled from the settings or the table metadata (types).
 */
export function arrangeColumns(columns: Column[], settings: ColumnSettings, types?: Map<string, string>): Column[] {
    const added = new Map(settings.added.map(a => [a.name, a]));
    const hidden = new Set(settings.hidden);
    const shown = columns
        .filter(c => !hidden.has(c.name) && (added.has(c.name) || (!c.isHidden && c.order >= 0)))
        .map(c => {
            const extra = added.get(c.name);
            const displayName = textOf(c.displayName);
            const dataType = textOf(c.dataType);
            if (dataType && displayName && !(extra && displayName === c.name)) return c;
            return {
                ...c,
                displayName: (extra && (!displayName || displayName === c.name) ? extra.displayName : displayName) || c.name,
                dataType: dataType || datasetType(extra?.type ?? types?.get(c.name))
            };
        });
    const base = (c: Column) => c.order >= 0 ? c.order : 10000 + settings.added.findIndex(a => a.name === c.name);
    const position = (c: Column) => { const index = settings.order.indexOf(c.name); return index < 0 ? settings.order.length + base(c) : index; };
    return shown.sort((a, b) => position(a) - position(b) || base(a) - base(b));
}
