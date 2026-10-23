export type DataSet = ComponentFramework.PropertyTypes.DataSet;
export type Column = ComponentFramework.PropertyHelper.DataSetApi.Column;
export type RecordRow = ComponentFramework.PropertyHelper.DataSetApi.EntityRecord;
export type FilterExpression = ComponentFramework.PropertyHelper.DataSetApi.FilterExpression;
export type FieldKind = "text" | "number" | "date" | "lookup" | "choice" | "choices" | "boolean" | "unsupported";
export interface Option { value: number; label: string; color?: string; }
export interface FieldMetadata {
    name: string;
    writable: boolean;
    required: boolean;
    options: Option[];
    targets: string[];
    dateBehavior?: string;
    maxLength?: number;
    min?: number;
    max?: number;
}
export type Metadata = Record<string, FieldMetadata>;
export type Operator = "contains" | "notContains" | "eq" | "ne" | "gt" | "ge" | "lt" | "le" | "on" | "before" | "after" | "null" | "notNull" | "today" | "yesterday" | "thisWeek" | "thisMonth";
export interface Condition { id: string; type: "condition"; column: string; operator: Operator; value: string; }
export interface FilterGroup { id: string; type: "group"; join: "and" | "or"; children: FilterNode[]; }
export type FilterNode = Condition | FilterGroup;
export function kindOf(column: Column): FieldKind {
    const type = textOf(column.dataType).toLowerCase();
    if (type.includes("multiselect")) return "choices";
    if (type.includes("optionset")) return "choice";
    if (type.includes("twooptions")) return "boolean";
    if (type.includes("lookup") || type === "customer" || type === "owner") return "lookup";
    if (type.includes("date")) return "date";
    if (/decimal|currency|whole|fp|floating|integer/.test(type)) return "number";
    if (/singleline|multiple|memo|string/.test(type)) return "text";
    return "unsupported";
}
// The host can return null for dataType, displayName or formatted values (e.g. columns added with addColumn).
export function textOf(value: unknown): string { return typeof value === "string" ? value : ""; }
export function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : typeof error === "string" ? error : "The operation failed. Please refresh and try again.";
}
export function objectOf(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
export function normalizeId(id: string): string { return id.replace(/[{}]/g, "").toLowerCase(); }
export function visibleColumns(columns: Column[]): Column[] { return columns.filter(c => !c.isHidden && c.order >= 0).sort((a, b) => a.order - b.order); }
