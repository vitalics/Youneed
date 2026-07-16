export type Disposer = () => void | Promise<void>;
/**
 * Turn a cleanup function into a disposable. An async cleanup gets
 * `[Symbol.asyncDispose]`, a sync one `[Symbol.dispose]` — so it works with JS
 * `using` / `await using` and with disposable-aware runners. Pass a `value` to
 * make that value disposable in place (e.g. return it from a setup function).
 */
export declare function dispose(cleanup: Disposer): Disposable | AsyncDisposable;
export declare function dispose<T extends object>(value: T, cleanup: Disposer): T;
/** Whether `v` carries a sync or async disposer. */
export declare function isDisposable(v: unknown): boolean;
/** Call a value's async or sync disposer (awaiting either; no-op if neither). */
export declare function disposeValue(v: unknown): Promise<void>;
