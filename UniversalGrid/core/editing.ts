import { Column, FieldMetadata, RecordRow, kindOf, textOf } from "./types";

type EditValue = string | number | boolean | number[] | Date | ComponentFramework.EntityReference | null;
interface EditableRecord extends RecordRow {
    setValue?: (columnName: string, value: EditValue) => Promise<void>;
    save?: () => Promise<void>;
}
export function canEdit(row: RecordRow, column: Column, metadata: FieldMetadata | undefined): boolean {
    const record = row as EditableRecord;
    const kind = kindOf(column);
    return !!metadata?.writable && !column.name.includes(".") && !["unsupported", "lookup", "choices"].includes(kind)
        && (kind !== "date" || metadata.dateBehavior === "DateOnly")
        && (kind !== "choice" || metadata.options.length > 0)
        && typeof record.setValue === "function" && typeof record.save === "function";
}
export function parseEdit(value: string, column: Column, metadata: FieldMetadata): EditValue {
    if (!value && metadata.required) throw new Error(`${column.displayName} is required.`);
    if (!value) return kindOf(column) === "text" ? "" : null;
    switch (kindOf(column)) {
        case "text":
            if (metadata.maxLength !== undefined && value.length > metadata.maxLength) throw new Error(`Maximum length is ${metadata.maxLength}.`);
            return value;
        case "number": {
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) throw new Error("Enter a valid number.");
            if (/whole|integer/i.test(textOf(column.dataType)) && !Number.isInteger(numeric)) throw new Error("Enter a whole number.");
            if ((metadata.min !== undefined && numeric < metadata.min) || (metadata.max !== undefined && numeric > metadata.max)) throw new Error("Value is outside the permitted range.");
            return numeric;
        }
        case "boolean":
            if (!["true", "false"].includes(value)) throw new Error("Choose Yes or No.");
            return value === "true";
        case "choice":
            if (!metadata.options.some(option => String(option.value) === value)) throw new Error("Choose a valid option.");
            return Number(value);
        case "date": {
            if (metadata.dateBehavior !== "DateOnly" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Only DateOnly fields can be edited here. Use the record form for time-zone-aware fields.");
            const date = new Date(`${value}T00:00:00.000Z`);
            if (!Number.isFinite(date.getTime()) || date.toISOString().substring(0, 10) !== value) throw new Error("Enter a valid calendar date.");
            return date;
        }
        default: throw new Error("Use the record form to edit this field type.");
    }
}
export async function saveCell(row: RecordRow, column: Column, metadata: FieldMetadata, value: string): Promise<void> {
    const record = row as EditableRecord;
    if (!canEdit(row, column, metadata) || !record.setValue || !record.save) throw new Error("This field is not editable in the current host.");
    await record.setValue(column.name, parseEdit(value, column, metadata));
    await record.save();
}
export function editText(row: RecordRow, column: Column): string {
    const value = row.getValue(column.name);
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toISOString().substring(0, 10);
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}
