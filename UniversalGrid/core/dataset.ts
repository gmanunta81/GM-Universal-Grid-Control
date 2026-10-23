import { Column, DataSet, FilterExpression, RecordRow, normalizeId, textOf } from "./types";
import { cloneFilter, combineFilters, filterSignature } from "./filters";

export function querySignature(dataset: DataSet): string {
    return JSON.stringify([dataset.getTargetEntityType(), dataset.getViewId(), filterSignature(dataset.filtering.getFilter()), dataset.sorting]);
}
export function matchesSearch(row: RecordRow, columns: Column[], search: string, locale?: string): boolean {
    const needle = search.trim().toLocaleLowerCase(locale);
    return !needle || columns.some(column => textOf(row.getFormattedValue(column.name)).toLocaleLowerCase(locale).includes(needle));
}
export class QueryController {
    private base: FilterExpression | undefined;
    private applied: string | undefined;
    private scope = "";
    public observe(dataset: DataSet, scope: string): boolean {
        const current = dataset.filtering.getFilter() as FilterExpression | undefined;
        const signature = filterSignature(current);
        if (scope !== this.scope || (this.applied !== undefined && signature !== this.applied)) {
            this.scope = scope;
            this.base = cloneFilter(current);
            this.applied = signature;
            return true;
        }
        if (this.applied === undefined) { this.base = cloneFilter(current); this.applied = signature; }
        return false;
    }
    public apply(dataset: DataSet, custom: FilterExpression | undefined): void {
        const combined = combineFilters(this.base, custom);
        this.applied = filterSignature(combined);
        if (combined.filters?.length) dataset.filtering.setFilter(combined);
        else dataset.filtering.clearFilter();
        dataset.clearSelectedRecordIds();
        dataset.refresh();
    }
}
interface Page { rows: RecordRow[]; hasNext: boolean; }
interface Pending {
    page: number;
    signature: string;
    resolve: (page: Page) => void;
    reject: (reason: Error) => void;
    dispose: () => void;
}
export class DatasetReader {
    private dataset: DataSet | undefined;
    private pending: Pending | undefined;
    private busy = false;
    public accept(dataset: DataSet, dataChanged: boolean): void {
        this.dataset = dataset;
        const pending = this.pending;
        if (!pending || !dataChanged || dataset.loading) return;
        if (querySignature(dataset) !== pending.signature) { this.fail(new Error("The view or filters changed. Retry the operation.")); return; }
        if (dataset.error) { this.fail(new Error(dataset.errorMessage || "Dataset loading failed.")); return; }
        if (dataset.paging.lastPageNumber !== pending.page) return;
        this.pending = undefined;
        pending.dispose();
        pending.resolve({ rows: dataset.sortedRecordIds.map(id => dataset.records[id]).filter(Boolean), hasNext: dataset.paging.hasNextPage });
    }
    private fail(error: Error): void {
        const pending = this.pending;
        this.pending = undefined;
        if (pending) { pending.dispose(); pending.reject(error); }
    }
    private page(page: number, signal: AbortSignal): Promise<Page> {
        const dataset = this.dataset;
        if (!dataset) return Promise.reject(new Error("The dataset is not ready."));
        if (signal.aborted) return Promise.reject(new Error("Operation cancelled."));
        return new Promise<Page>((resolve, reject) => {
            const abort = () => this.fail(new Error("Operation cancelled."));
            const timer = setTimeout(() => this.fail(new Error("Loading timed out. Retry after the dataset has finished loading.")), 45000);
            signal.addEventListener("abort", abort, { once: true });
            this.pending = { page, signature: querySignature(dataset), resolve, reject, dispose: () => { clearTimeout(timer); signal.removeEventListener("abort", abort); } };
            try { if (page === 1) dataset.paging.reset(); else dataset.paging.loadNextPage(); }
            catch (error) { this.fail(error instanceof Error ? error : new Error("Unable to load dataset page.")); }
        });
    }
    public async all(signal: AbortSignal, limit: number, progress: (count: number) => void): Promise<RecordRow[]> {
        if (this.busy || this.dataset?.loading) throw new Error("Wait for the current dataset operation to finish.");
        this.busy = true;
        const rows = new Map<string, RecordRow>();
        try {
            let next = true;
            let pageNumber = 1;
            while (next) {
                const page = await this.page(pageNumber++, signal);
                const previous = rows.size;
                for (const row of page.rows) rows.set(normalizeId(row.getRecordId()), row);
                if (rows.size > limit) throw new Error(`The operation exceeds the ${limit.toLocaleString()}-record safety limit. Narrow the view or filters; no partial result was used.`);
                if (signal.aborted) throw new Error("Operation cancelled.");
                progress(rows.size);
                if (page.hasNext && rows.size === previous) throw new Error("Paging made no progress. No partial result was used.");
                next = page.hasNext;
            }
            return Array.from(rows.values());
        } finally { this.busy = false; }
    }
    public dispose(): void { this.fail(new Error("Grid closed.")); this.dataset = undefined; }
}
