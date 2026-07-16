// Mocking — spy/stub functions and method spies, in the same spirit as the rest
// of @youneed/test: small, explicit, no globals to configure.
//
//   const send = fn((to: string) => true);   // a standalone mock function
//   send("a"); send("b");
//   expect(send).toHaveBeenCalledTimes(2);
//   expect(send).toHaveBeenLastCalledWith("b");
//
//   const spy = spyOn(mailer, "send").mockReturnValue(true);   // wrap a method
//   ...                                                        // auto-restored
//                                                              // after each test
//
// Spies created with `spyOn` are restored automatically once the current test
// finishes (the runner calls `restoreAllSpies()` in its per-test cleanup), so a
// patched object never leaks into the next test. Set spies up in a test body or
// `@Test.beforeEach()` — not `@Test.beforeAll()` — if you rely on that.

/** Brands a value as a mock function so matchers can recognize it. */
const IS_MOCK = Symbol("youneed.test.mock");

export interface MockResult {
  /** Whether the call returned a value or threw. */
  type: "return" | "throw";
  /** The returned value, or the thrown error. */
  value: unknown;
}

/** The recorded history of a mock function. */
export interface MockState<A extends unknown[] = unknown[], R = unknown> {
  /** Arguments of every call, in order. */
  calls: A[];
  /** Outcome (return value or thrown error) of every call, in order. */
  results: MockResult[];
  /** `this` receiver for every call (e.g. the constructed instance for `new`). */
  instances: unknown[];
  /** The most recent call's arguments, or `undefined` if never called. */
  readonly lastCall: A | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

/** A callable mock: invoke it like the function it stands in for, then inspect
 *  `.mock`, or configure its behaviour with the `mock*` methods. */
export interface MockFn<F extends AnyFn = AnyFn> {
  (...args: Parameters<F>): ReturnType<F>;
  /** Recorded calls / results / instances. */
  readonly mock: MockState<Parameters<F>, ReturnType<F>>;
  /** Replace the implementation run on every call. */
  mockImplementation(impl: F): this;
  /** Use `impl` for the next call only (queued FIFO, ahead of the default). */
  mockImplementationOnce(impl: F): this;
  /** Always return `value`. */
  mockReturnValue(value: ReturnType<F>): this;
  /** Return `value` on the next call only. */
  mockReturnValueOnce(value: ReturnType<F>): this;
  /** Always return `Promise.resolve(value)`. */
  mockResolvedValue(value: Awaited<ReturnType<F>>): this;
  mockResolvedValueOnce(value: Awaited<ReturnType<F>>): this;
  /** Always return `Promise.reject(reason)`. */
  mockRejectedValue(reason: unknown): this;
  mockRejectedValueOnce(reason: unknown): this;
  /** Forget recorded calls/results/instances; keep the implementation. */
  mockClear(): this;
  /** `mockClear()` + drop the implementation (and queued once-impls). */
  mockReset(): this;
  /** Restore the spied-on method (for `spyOn`); for a bare `fn`, same as reset. */
  mockRestore(): this;
  readonly [IS_MOCK]: true;
}

/** Live `spyOn` patches, restored by the runner after each test. */
const liveSpies = new Set<{ restore(): void }>();

/**
 * A standalone mock function. Pass an implementation to call through to it (and
 * record what happened); omit it for a recorder that returns `undefined`.
 */
export function fn<F extends AnyFn = (...args: unknown[]) => unknown>(implementation?: F): MockFn<F> {
  let impl: F | undefined = implementation;
  const onceImpls: F[] = [];
  const calls: Parameters<F>[] = [];
  const results: MockResult[] = [];
  const instances: unknown[] = [];
  const state: MockState<Parameters<F>, ReturnType<F>> = {
    calls,
    results,
    instances,
    get lastCall() {
      return calls[calls.length - 1];
    },
  };

  const mockFn = function (this: unknown, ...args: Parameters<F>): ReturnType<F> {
    calls.push(args);
    instances.push(this);
    const use = onceImpls.length ? (onceImpls.shift() as F) : impl;
    if (!use) {
      results.push({ type: "return", value: undefined });
      return undefined as ReturnType<F>;
    }
    try {
      const value = use.apply(this, args) as ReturnType<F>;
      results.push({ type: "return", value });
      return value;
    } catch (e) {
      results.push({ type: "throw", value: e });
      throw e;
    }
  } as unknown as MockFn<F>;

  Object.defineProperty(mockFn, IS_MOCK, { value: true });
  Object.defineProperty(mockFn, "mock", { value: state });

  mockFn.mockImplementation = (f: F) => ((impl = f), mockFn);
  mockFn.mockImplementationOnce = (f: F) => (onceImpls.push(f), mockFn);
  mockFn.mockReturnValue = (v) => mockFn.mockImplementation((() => v) as F);
  mockFn.mockReturnValueOnce = (v) => mockFn.mockImplementationOnce((() => v) as F);
  mockFn.mockResolvedValue = (v) => mockFn.mockImplementation((() => Promise.resolve(v)) as F);
  mockFn.mockResolvedValueOnce = (v) => mockFn.mockImplementationOnce((() => Promise.resolve(v)) as F);
  mockFn.mockRejectedValue = (r) => mockFn.mockImplementation((() => Promise.reject(r)) as F);
  mockFn.mockRejectedValueOnce = (r) => mockFn.mockImplementationOnce((() => Promise.reject(r)) as F);
  mockFn.mockClear = () => ((calls.length = results.length = instances.length = 0), mockFn);
  mockFn.mockReset = () => (mockFn.mockClear(), (impl = undefined), (onceImpls.length = 0), mockFn);
  mockFn.mockRestore = () => mockFn.mockReset();

  return mockFn;
}

/** Keys of `O` whose value is a function. */
type FunctionKeys<O> = {
  [K in keyof O]: O[K] extends AnyFn ? K : never;
}[keyof O];

/**
 * Replace `obj[key]` with a mock that, by default, still calls through to the
 * original (so it records without changing behaviour). Chain `.mockReturnValue`
 * / `.mockImplementation` to stub it instead, and `.mockRestore()` (or let the
 * runner's per-test cleanup) put the original back.
 */
export function spyOn<O extends object, K extends FunctionKeys<O>>(
  obj: O,
  key: K,
): MockFn<O[K] extends AnyFn ? O[K] : never> {
  const original = obj[key];
  if (typeof original !== "function") {
    throw new TypeError(`spyOn: ${String(key)} is not a function`);
  }
  const spy = fn(original as AnyFn) as MockFn<O[K] extends AnyFn ? O[K] : never>;

  let restored = false;
  const entry = {
    restore() {
      if (restored) return;
      restored = true;
      obj[key] = original;
      liveSpies.delete(entry);
    },
  };
  liveSpies.add(entry);
  spy.mockRestore = () => (entry.restore(), spy);
  // Also usable with `using` (TC39 explicit resource management).
  Object.defineProperty(spy, Symbol.dispose, { value: () => entry.restore(), configurable: true });

  obj[key] = spy as unknown as O[K];
  return spy;
}

/** Restore every live `spyOn` patch. Called by the runner after each test. */
export function restoreAllSpies(): void {
  for (const entry of [...liveSpies]) entry.restore();
  liveSpies.clear();
}

/** Whether `v` is a mock function created by `fn`/`spyOn`. */
export function isMockFunction(v: unknown): v is MockFn {
  return typeof v === "function" && (v as unknown as Record<symbol, unknown>)[IS_MOCK] === true;
}

/** The recorded state of a mock, or `undefined` if `v` isn't a mock. */
export function getMockState(v: unknown): MockState | undefined {
  return isMockFunction(v) ? (v as MockFn).mock : undefined;
}

/** Grouped entry point — `mock.fn(...)`, `mock.spyOn(...)`, `mock.restoreAll()`. */
export const mock = {
  fn,
  spyOn,
  restoreAll: restoreAllSpies,
};
