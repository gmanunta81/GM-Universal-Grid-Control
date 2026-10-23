import { Column, FilterExpression, FilterGroup, FilterNode, Metadata, Operator, kindOf } from "./types";

let nextId = 0;
export function newGroup(): FilterGroup { return { id: `filter-${++nextId}`, type: "group", join: "and", children: [] }; }
export function newCondition(column: Column): FilterNode {
    return { id: `filter-${++nextId}`, type: "condition", column: column.name, operator: operatorsFor(column)[0], value: "" };
}
export const operatorLabels: Record<Operator, string> = {
    contains: "Contains", notContains: "Does not contain", eq: "Equals", ne: "Does not equal",
    gt: "Greater than", ge: "Greater than or equal", lt: "Less than", le: "Less than or equal",
    on: "On", before: "On or before", after: "On or after", null: "Is empty", notNull: "Is not empty",
    today: "Today", yesterday: "Yesterday", thisWeek: "This week", thisMonth: "This month"
};
export function needsValue(operator: Operator): boolean { return !["null", "notNull", "today", "yesterday", "thisWeek", "thisMonth"].includes(operator); }
export function operatorsFor(column: Column): Operator[] {
    switch (kindOf(column)) {
        case "text": return ["contains", "notContains", "eq", "ne", "null", "notNull"];
        case "number": return ["eq", "ne", "gt", "ge", "lt", "le", "null", "notNull"];
        case "date": return ["on", "before", "after", "today", "yesterday", "thisWeek", "thisMonth", "null", "notNull"];
        case "lookup": case "choice": case "boolean": return ["eq", "ne", "null", "notNull"];
        default: return ["null", "notNull"];
    }
}
const codes = { eq: 0, ne: 1, gt: 2, lt: 3, ge: 4, le: 5, contains: 6, notContains: 7, null: 12, notNull: 13, yesterday: 14, today: 15, thisWeek: 20, thisMonth: 23, on: 25, before: 26, after: 27 } as const;
export function compileFilter(node: FilterNode, columns: Column[], metadata: Metadata): FilterExpression | undefined {
    if (node.type === "group") {
        const filters = node.children.map(child => compileFilter(child, columns, metadata)).filter((x): x is FilterExpression => !!x);
        return filters.length ? { filterOperator: node.join === "and" ? 0 : 1, conditions: [], filters } : undefined;
    }
    const column = columns.find(c => c.name === node.column);
    if (!column || !operatorsFor(column).includes(node.operator)) throw new Error("A filter uses an unavailable column or operator.");
    let value = node.value.trim();
    const kind = kindOf(column);
    if (needsValue(node.operator)) {
        if (!value) throw new Error(`Enter a filter value for ${column.displayName}.`);
        if (kind === "number" && !Number.isFinite(Number(value))) throw new Error("Enter a valid numeric filter value.");
        if (kind === "lookup" && !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.replace(/[{}]/g, ""))) throw new Error("Choose a lookup record or enter its GUID.");
        if (kind === "boolean" && !["0", "1"].includes(value)) throw new Error("Choose Yes or No.");
        if (kind === "choice" && !metadata[column.name]?.options.some(o => String(o.value) === value)) throw new Error("Choose an available Choice value.");
        if (kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Choose a calendar date.");
        if (node.operator === "contains" || node.operator === "notContains") value = `%${value.replace(/\[/g, "[[]").replace(/%/g, "[%]").replace(/_/g, "[_]")}%`;
    } else value = "";
    const separator = column.name.indexOf(".");
    const condition = {
        attributeName: separator < 0 ? column.name : column.name.substring(separator + 1),
        conditionOperator: codes[node.operator] as ComponentFramework.PropertyHelper.DataSetApi.Types.ConditionOperator,
        value,
        ...(separator < 0 ? {} : { entityAliasName: column.name.substring(0, separator) })
    };
    return { filterOperator: 0, conditions: [condition] };
}
export function combineFilters(base: FilterExpression | undefined, custom: FilterExpression | undefined): FilterExpression {
    return { filterOperator: 0, conditions: [], filters: [base, custom].filter((x): x is FilterExpression => !!x && (!!x.conditions.length || !!x.filters?.length)) };
}
export function cloneFilter(filter: FilterExpression | undefined | null): FilterExpression | undefined {
    return filter ? JSON.parse(JSON.stringify(filter)) as FilterExpression : undefined;
}
/** Stable signature of a filter that ignores host-added properties, ordering of keys and empty nodes. */
export function filterSignature(filter: FilterExpression | undefined | null): string {
    const normalize = (f: FilterExpression | undefined | null): unknown => {
        if (!f) return null;
        const conditions = (f.conditions ?? []).map(c => [c.attributeName, Number(c.conditionOperator), JSON.stringify(c.value ?? null), c.entityAliasName ?? ""]);
        const filters = (f.filters ?? []).map(normalize).filter(x => x !== null);
        if (!conditions.length && !filters.length) return null;
        return [Number(f.filterOperator ?? 0), conditions, filters];
    };
    return JSON.stringify(normalize(filter));
}
