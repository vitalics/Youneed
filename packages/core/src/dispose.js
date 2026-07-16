// Disposal helpers — bridging plain cleanup functions to JS `using` /
// `await using` and the TC39 explicit-resource-management protocol
// (`Symbol.dispose` / `Symbol.asyncDispose`). Originated in @youneed/test's
// fixture teardown; shared here so any package can build/consume disposables.
export function dispose(a, b) {
    const value = (typeof b === "function" ? a : {});
    const cleanup = (b ?? a);
    const isAsync = cleanup.constructor?.name === "AsyncFunction";
    const key = isAsync ? Symbol.asyncDispose : Symbol.dispose;
    Object.defineProperty(value, key, { value: () => cleanup(), configurable: true, writable: true });
    return value;
}
/** Whether `v` carries a sync or async disposer. */
export function isDisposable(v) {
    if (v == null || (typeof v !== "object" && typeof v !== "function"))
        return false;
    const o = v;
    return typeof o[Symbol.asyncDispose] === "function" || typeof o[Symbol.dispose] === "function";
}
/** Call a value's async or sync disposer (awaiting either; no-op if neither). */
export async function disposeValue(v) {
    if (!isDisposable(v))
        return;
    const o = v;
    const fn = o[Symbol.asyncDispose] ?? o[Symbol.dispose];
    if (typeof fn === "function")
        await fn.call(v);
}
