import { Workbook } from "exceljs";
import { Column, RecordRow, textOf } from "./types";

export type ExportFormat = "csv" | "xlsx";

function cellText(row: RecordRow, column: Column): string {
    const formatted = textOf(row.getFormattedValue(column.name));
    if (formatted) return formatted;
    const value = row.getValue(column.name);
    if (value === null || value === undefined) return "";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
    if (value instanceof Date) return value.toISOString();
    return "";
}

function csvEscape(text: string): string {
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, "\"\"")}"` : safe;
}

export function toCsv(rows: RecordRow[], columns: Column[]): string {
    const lines = [columns.map(c => csvEscape(textOf(c.displayName) || c.name)).join(",")];
    for (const row of rows) lines.push(columns.map(c => csvEscape(cellText(row, c))).join(","));
    return `\uFEFF${lines.join("\r\n")}`;
}

export async function toXlsx(rows: RecordRow[], columns: Column[], sheetName: string): Promise<ArrayBuffer> {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet(sheetName.replace(/[\\/*?:[\]]/g, "_").substring(0, 31) || "Export");
    sheet.columns = columns.map(c => ({ header: textOf(c.displayName) || c.name, key: c.name, width: Math.min(60, Math.max(12, (textOf(c.displayName) || c.name).length + 2)) }));
    for (const row of rows) sheet.addRow(columns.map(c => cellText(row, c)));
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    return workbook.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

export async function exportRows(rows: RecordRow[], columns: Column[], format: ExportFormat, baseName: string): Promise<void> {
    const name = `${baseName.replace(/[^\w-]+/g, "_") || "export"}-${new Date().toISOString().substring(0, 19).replace(/[:T]/g, "")}`;
    const blob = format === "csv"
        ? new Blob([toCsv(rows, columns)], { type: "text/csv;charset=utf-8" })
        : new Blob([await toXlsx(rows, columns, baseName)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    try {
        const link = document.createElement("a");
        link.href = url;
        link.download = `${name}.${format}`;
        link.rel = "noopener";
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } finally {
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
}
