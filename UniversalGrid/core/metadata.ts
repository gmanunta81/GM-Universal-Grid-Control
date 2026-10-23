import { FieldMetadata, Metadata, Option, objectOf } from "./types";

function list(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    const object = objectOf(value);
    if (!object) return [];
    // Host collections (e.g. EntityMetadata.Attributes) expose different shapes depending on the host:
    // try the known accessors before falling back to the plain object values.
    for (const accessor of ["getAll", "get"]) {
        const fn = object[accessor];
        if (typeof fn === "function") {
            try {
                const items = list((fn as () => unknown).call(value));
                if (items.some(item => { const o = objectOf(item); return !!o && (typeof o.LogicalName === "string" || !!o.attributeDescriptor || typeof o.Value === "number"); })) return items;
            } catch { /* accessor needs arguments in this host */ }
        }
    }
    const collection = objectOf(object._collection);
    if (collection) return Object.values(collection);
    return Object.values(object).filter(item => typeof item !== "function");
}
function label(value: unknown): string {
    if (typeof value === "string") return value;
    const object = objectOf(value);
    const local = objectOf(object?.UserLocalizedLabel);
    if (typeof local?.Label === "string") return local.Label;
    return "";
}
function flag(value: unknown): unknown { return objectOf(value)?.Value ?? value; }
function number(value: unknown): number | undefined { return typeof value === "number" ? value : undefined; }
const dateBehaviors: Record<number, string> = { 1: "UserLocal", 2: "DateOnly", 3: "TimeZoneIndependent" };
export function parseMetadata(raw: unknown): Metadata {
    const entity = objectOf(raw);
    const result: Metadata = {};
    for (const entry of list(entity?.Attributes)) {
        const wrapper = objectOf(entry);
        // Model-driven hosts wrap the raw attribute metadata in "attributeDescriptor"
        const attribute = wrapper ? { ...wrapper, ...(objectOf(wrapper.attributeDescriptor) ?? {}) } : undefined;
        if (!attribute || typeof attribute.LogicalName !== "string") continue;
        const name = attribute.LogicalName;
        const optionSet = objectOf(attribute.OptionSet);
        const options: Option[] = [];
        for (const item of list(attribute.Options ?? optionSet?.Options ?? attribute.OptionSet)) {
            const option = objectOf(item);
            if (!option || typeof option.Value !== "number") continue;
            options.push({ value: option.Value, label: label(option.Label) || String(option.Value), color: typeof option.Color === "string" ? option.Color : undefined });
        }
        const required = flag(attribute.RequiredLevel);
        const targets = list(attribute.Targets).filter((target): target is string => typeof target === "string");
        const behaviorFlag = flag(attribute.DateTimeBehavior ?? attribute.Behavior);
        const behavior = typeof behaviorFlag === "number" ? dateBehaviors[behaviorFlag] : behaviorFlag;
        const field: FieldMetadata = {
            name,
            writable: flag(attribute.IsValidForUpdate) === true && attribute.IsSecured !== true && (attribute.SourceType === undefined || attribute.SourceType === 0),
            required: required === 1 || required === 2 || required === "SystemRequired" || required === "ApplicationRequired",
            options, targets,
            dateBehavior: typeof behavior === "string" ? behavior : undefined,
            maxLength: number(attribute.MaxLength), min: number(attribute.MinValue), max: number(attribute.MaxValue)
        };
        result[name] = field;
    }
    return result;
}
export class MetadataCache {
    private entries = new Map<string, Promise<Metadata>>();
    public get(key: string, load: () => Promise<unknown>): Promise<Metadata> {
        const cached = this.entries.get(key);
        if (cached) return cached;
        const pending = load().then(parseMetadata).catch((error: unknown) => { this.entries.delete(key); throw error; });
        this.entries.set(key, pending);
        return pending;
    }
    public clear(): void { this.entries.clear(); }
}
