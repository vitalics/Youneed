// @youneed/test-expect-extra — a richer `expect` for @youneed/test. Swap the
// import (`import { expect } from "@youneed/test-expect-extra"`) to get the core
// matchers PLUS toMatchObject, toBeInstanceOf, toBeCloseTo, toMatch,
// toHaveProperty, toBeNaN, >=/<=, and async `resolves`/`rejects`. Reuses the
// core `AssertionError`, so failures look identical.

import { AssertionError } from "@youneed/test";

const show = (v: unknown): string => {
  try {
    return typeof v === "string" ? JSON.stringify(v) : v && typeof v === "object" ? JSON.stringify(v) : String(v);
  } catch {
    return String(v);
  }
};

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Subset match: every key in `expected` must exist + match in `actual` (deep). */
function deepMatch(actual: unknown, expected: unknown): boolean {
  if (Object.is(actual, expected)) return true;
  if (typeof expected !== "object" || expected === null) return false;
  if (typeof actual !== "object" || actual === null) return false;
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length && expected.every((e, i) => deepMatch(actual[i], e));
  }
  return Object.keys(expected).every(
    (k) => k in (actual as object) && deepMatch((actual as Record<string, unknown>)[k], (expected as Record<string, unknown>)[k]),
  );
}

function getPath(obj: unknown, path: string | string[]): { found: boolean; value: unknown } {
  const parts = Array.isArray(path) ? path : path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || !(p in (cur as object))) return { found: false, value: undefined };
    cur = (cur as Record<string, unknown>)[p];
  }
  return { found: true, value: cur };
}

const MISSING = Symbol("missing");

export interface Matchers<T> {
  toBe(expected: T): void;
  toEqual(expected: T): void;
  toBeDefined(): void;
  toBeUndefined(): void;
  toBeNull(): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toBeNaN(): void;
  toBeGreaterThan(n: number): void;
  toBeGreaterThanOrEqual(n: number): void;
  toBeLessThan(n: number): void;
  toBeLessThanOrEqual(n: number): void;
  toBeCloseTo(n: number, numDigits?: number): void;
  toBeInstanceOf(ctor: abstract new (...a: never[]) => unknown): void;
  toContain(item: unknown): void;
  toHaveLength(n: number): void;
  toMatch(expected: string | RegExp): void;
  toMatchObject(expected: object): void;
  toHaveProperty(path: string | string[], value?: unknown): void;
  toThrow(message?: string | RegExp): void;
  readonly not: Matchers<T>;
}

const SYNC_KEYS = [
  "toBe", "toEqual", "toBeDefined", "toBeUndefined", "toBeNull", "toBeTruthy", "toBeFalsy", "toBeNaN",
  "toBeGreaterThan", "toBeGreaterThanOrEqual", "toBeLessThan", "toBeLessThanOrEqual", "toBeCloseTo",
  "toBeInstanceOf", "toContain", "toHaveLength", "toMatch", "toMatchObject", "toHaveProperty", "toThrow",
] as const;

type AsyncMatchers<T> = { [K in (typeof SYNC_KEYS)[number]]: Matchers<T>[K] extends (...a: infer A) => void ? (...a: A) => Promise<void> : never } & {
  readonly not: AsyncMatchers<T>;
};

function matchers<T>(actual: T, negated: boolean): Matchers<T> {
  const ok = (pass: boolean, msg: () => string) => {
    if (pass === negated) throw new AssertionError(msg());
  };
  const not = negated ? "not " : "";
  return {
    toBe: (e) => ok(Object.is(actual, e), () => `expected ${show(actual)} ${not}to be ${show(e)}`),
    toEqual: (e) => ok(deepEqual(actual, e), () => `expected ${show(actual)} ${not}to equal ${show(e)}`),
    toBeDefined: () => ok(actual !== undefined, () => `expected value ${not}to be defined`),
    toBeUndefined: () => ok(actual === undefined, () => `expected ${show(actual)} ${not}to be undefined`),
    toBeNull: () => ok(actual === null, () => `expected ${show(actual)} ${not}to be null`),
    toBeTruthy: () => ok(Boolean(actual), () => `expected ${show(actual)} ${not}to be truthy`),
    toBeFalsy: () => ok(!actual, () => `expected ${show(actual)} ${not}to be falsy`),
    toBeNaN: () => ok(Number.isNaN(actual), () => `expected ${show(actual)} ${not}to be NaN`),
    toBeGreaterThan: (n) => ok(Number(actual) > n, () => `expected ${show(actual)} ${not}to be > ${n}`),
    toBeGreaterThanOrEqual: (n) => ok(Number(actual) >= n, () => `expected ${show(actual)} ${not}to be >= ${n}`),
    toBeLessThan: (n) => ok(Number(actual) < n, () => `expected ${show(actual)} ${not}to be < ${n}`),
    toBeLessThanOrEqual: (n) => ok(Number(actual) <= n, () => `expected ${show(actual)} ${not}to be <= ${n}`),
    toBeCloseTo: (n, numDigits = 2) =>
      ok(Math.abs(Number(actual) - n) < Math.pow(10, -numDigits) / 2, () => `expected ${show(actual)} ${not}to be close to ${n} (${numDigits} digits)`),
    toBeInstanceOf: (ctor) => ok(actual instanceof (ctor as never), () => `expected ${show(actual)} ${not}to be an instance of ${(ctor as { name?: string }).name ?? "ctor"}`),
    toContain: (item) =>
      ok(
        typeof actual === "string" ? actual.includes(item as string) : Array.isArray(actual) && actual.includes(item),
        () => `expected ${show(actual)} ${not}to contain ${show(item)}`,
      ),
    toHaveLength: (n) => ok((actual as { length?: number })?.length === n, () => `expected length ${not}to be ${n}, got ${(actual as { length?: number })?.length}`),
    toMatch: (e) =>
      ok(
        typeof actual === "string" && (e instanceof RegExp ? e.test(actual) : actual.includes(e)),
        () => `expected ${show(actual)} ${not}to match ${show(e)}`,
      ),
    toMatchObject: (e) => ok(deepMatch(actual, e), () => `expected ${show(actual)} ${not}to match object ${show(e)}`),
    toHaveProperty: (path, value = MISSING) => {
      const { found, value: got } = getPath(actual, path);
      const pass = found && (value === MISSING || deepEqual(got, value));
      ok(pass, () => `expected ${show(actual)} ${not}to have property ${show(path)}${value === MISSING ? "" : ` = ${show(value)}`}`);
    },
    toThrow: (message) => {
      let threw: Error | undefined;
      try {
        (actual as () => unknown)();
      } catch (e) {
        threw = e as Error;
      }
      const matched =
        !!threw && (message === undefined || (message instanceof RegExp ? message.test(threw.message) : threw.message.includes(message)));
      ok(matched, () => `expected function ${not}to throw${message ? ` ${show(message)}` : ""}${threw ? ` (threw ${show(threw.message)})` : ""}`);
    },
    get not() {
      return matchers(actual, !negated);
    },
  };
}

function asyncMatchers<T>(p: Promise<T>, mode: "resolve" | "reject", negated: boolean): AsyncMatchers<T> {
  const out = {} as Record<string, unknown>;
  const apply = async (key: string, args: unknown[]) => {
    let value: unknown;
    let err: unknown;
    let rejected = false;
    try {
      value = await p;
    } catch (e) {
      err = e;
      rejected = true;
    }
    if (mode === "resolve") {
      if (rejected) throw new AssertionError(`expected promise to resolve, but it rejected with ${show((err as Error)?.message ?? err)}`);
      (matchers(value, negated) as unknown as Record<string, (...a: unknown[]) => void>)[key](...args);
    } else {
      if (!rejected) throw new AssertionError(`expected promise to reject, but it resolved with ${show(value)}`);
      // `rejects.toThrow(msg)` matches the rejection's message — feed toThrow a
      // function that throws it; other matchers assert on the rejection value.
      const subject = key === "toThrow" ? matchers(() => { throw err; }, negated) : matchers(err, negated);
      (subject as unknown as Record<string, (...a: unknown[]) => void>)[key](...args);
    }
  };
  for (const key of SYNC_KEYS) out[key] = (...args: unknown[]) => apply(key, args);
  Object.defineProperty(out, "not", { get: () => asyncMatchers(p, mode, !negated) });
  return out as AsyncMatchers<T>;
}

/** Like core `expect`, with extra matchers and async `resolves`/`rejects`. */
export function expect<T>(actual: T): Matchers<T> & { readonly resolves: AsyncMatchers<Awaited<T>>; readonly rejects: AsyncMatchers<unknown> } {
  const base = matchers(actual, false);
  return Object.assign(base, {
    get resolves() {
      return asyncMatchers(Promise.resolve(actual as unknown as Promise<Awaited<T>>), "resolve", false);
    },
    get rejects() {
      return asyncMatchers(Promise.resolve(actual as unknown as Promise<unknown>), "reject", false);
    },
  }) as Matchers<T> & { readonly resolves: AsyncMatchers<Awaited<T>>; readonly rejects: AsyncMatchers<unknown> };
}
