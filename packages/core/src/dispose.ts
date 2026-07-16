// Disposal helpers — bridging plain cleanup functions to JS `using` /
// `await using` and the TC39 explicit-resource-management protocol
// (`Symbol.dispose` / `Symbol.asyncDispose`). Originated in @youneed/test's
// fixture teardown; shared here so any package can build/consume disposables.

export type Disposer = () => void | Promise<void>;

/**
 * Turn a cleanup function into a disposable. An async cleanup gets
 * `[Symbol.asyncDispose]`, a sync one `[Symbol.dispose]` — so it works with JS
 * `using` / `await using` and with disposable-aware runners. Pass a `value` to
 * make that value disposable in place (e.g. return it from a setup function).
 */
export function dispose(cleanup: Disposer): Disposable | AsyncDisposable;
export function dispose<T extends object>(value: T, cleanup: Disposer): T;
export function dispose(a: object | Disposer, b?: Disposer): object {
  const value = (typeof b === "function" ? a : {}) as Record<symbol, unknown>;
  const cleanup = (b ?? a) as Disposer;
  const isAsync = cleanup.constructor?.name === "AsyncFunction";
  const key = isAsync ? Symbol.asyncDispose : Symbol.dispose;
  Object.defineProperty(value, key, { value: () => cleanup(), configurable: true, writable: true });
  return value;
}

/** Whether `v` carries a sync or async disposer. */
export function isDisposable(v: unknown): boolean {
  if (v == null || (typeof v !== "object" && typeof v !== "function")) return false;
  const o = v as Record<symbol, unknown>;
  return typeof o[Symbol.asyncDispose] === "function" || typeof o[Symbol.dispose] === "function";
}

/** Call a value's async or sync disposer (awaiting either; no-op if neither). */
export async function disposeValue(v: unknown): Promise<void> {
  if (!isDisposable(v)) return;
  const o = v as Record<symbol, (() => unknown) | undefined>;
  const fn = o[Symbol.asyncDispose] ?? o[Symbol.dispose];
  if (typeof fn === "function") await fn.call(v);
}
