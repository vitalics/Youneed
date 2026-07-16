/// <reference types="node" />
// @youneed/test — a class + decorator test framework in the same paradigm as
// @youneed/dom (Component) and @youneed/server (Application): a factory returns
// a base class you extend, TC39 decorators register members into per-class
// registries (via addInitializer), and a fluent builder (TestApplication) wires
// it all up and runs it.
//
//   class MathTest extends Test() {
//     @Test.use(CalcFixture) calc!: Calc;          // fixture injection (decorator)
//     db = DbFixture.get();                         // …or decorator-free (field init)
//     @Test.beforeEach() reset() { this.calc.clear(); }
//     @Test.it("adds") add() { expect(this.calc.add(2, 3)).toBe(5); }
//   }
//   TestApplication().addTests(MathTest).run();

// ── shared types ─────────────────────────────────────────────────────────────
import { createRegistry, ctorOf, isDisposable, disposeValue } from "@youneed/core";
export type { MaybePromise } from "@youneed/core";
import type { MaybePromise } from "@youneed/core";
// Mocking (fn / spyOn / mock) lives in its own module; re-exported here, and the
// runner restores spies after each test via `restoreAllSpies`.
export * from "./mock.ts";
import { getMockState, restoreAllSpies } from "./mock.ts";
type AnyCtor = abstract new (...args: any[]) => any;
type Meta = Record<string, unknown>;

// Brands let the pattern loader recognize exported suites/fixtures/reporters.
const BRAND_SUITE = Symbol.for("youneed.test.suite");
const BRAND_FIXTURE = Symbol.for("youneed.test.fixture");
const BRAND_REPORTER = Symbol.for("youneed.test.reporter");

const isBranded = (v: unknown, brand: symbol): boolean =>
  typeof v === "function" && (v as unknown as Record<symbol, unknown>)[brand] === true;

// ── metadata accessors ───────────────────────────────────────────────────────
interface TestCase {
  name: string;
  key: string;
  skip?: boolean | SkipPredicate;
  only?: boolean;
  /** Data-driven input: a thunk producing the value passed as the body's FIRST
   *  argument (from `@Test.it({ input })` or one row of `@Test.each`). */
  input?: () => unknown;
  /** Per-case timeout (ms); overrides the run-level default. `0`/undefined = none. */
  timeout?: number;
}
interface SuiteMeta {
  tests: TestCase[];
  beforeAll: string[];
  afterAll: string[];
  beforeEach: string[];
  afterEach: string[];
}
interface InjectEntry {
  key: string;
  fixture: FixtureClass;
}
interface EventEntry {
  event: ReporterEventName;
  key: string;
  priority: number;
}

// Registries keyed by the class constructor. Decorators populate them from a
// `ctx.addInitializer` callback (which runs during construction, where `this`
// gives us the constructor) — the same mechanism @youneed/server uses for
// routes. This works under esbuild/tsx, where Symbol.metadata is not emitted.
// Registration is deduped by member key so re-constructing a suite is harmless.
const suiteRegistry = createRegistry<SuiteMeta>(() => ({ tests: [], beforeAll: [], afterAll: [], beforeEach: [], afterEach: [] }));
const injectRegistry = createRegistry<InjectEntry[]>(() => []);
const eventRegistry = createRegistry<EventEntry[]>(() => []);

const suiteMetaOf = (ctor: Function): SuiteMeta => suiteRegistry.for(ctor);
const injectsOf = (ctor: Function): InjectEntry[] => injectRegistry.for(ctor);
const eventsOf = (ctor: Function): EventEntry[] => eventRegistry.for(ctor);

const readSuiteMeta = (ctor: AnyCtor): SuiteMeta | undefined => suiteRegistry.read(ctor);
const readInjects = (ctor: AnyCtor): InjectEntry[] => injectRegistry.read(ctor) ?? [];
const readEvents = (ctor: AnyCtor): EventEntry[] => eventRegistry.read(ctor) ?? [];

// ── Fixture ──────────────────────────────────────────────────────────────────
export type FixtureScope = "test" | "suite" | "run";

export interface FixtureOptions {
  /** Display name (defaults to the class name). */
  name?: string;
  /** How long the resolved value is cached/shared (default `"test"`). */
  scope?: FixtureScope;
}

/** A class produced by `Fixture<T>()` — produces a `T` via `setup()`. */
export interface FixtureClass<T = unknown> {
  new (): { setup(): MaybePromise<T>; teardown?(value: T): MaybePromise<void> };
  scope: FixtureScope;
  fixtureName: string;
  [BRAND_FIXTURE]: true;
}

// A field initialized with `x = SomeFixture.get()` holds this marker until the
// runner replaces it with the resolved value. It records WHICH fixture so the
// runner can register an injection keyed by the field name — same per-test,
// scope-aware resolution as `@Test.use`, without a decorator.
const FIXTURE_GET = Symbol("youneed.test.fixtureGet");
interface FixtureGetMarker {
  [FIXTURE_GET]: FixtureClass;
}
function isGetMarker(v: unknown): v is FixtureGetMarker {
  return typeof v === "object" && v !== null && FIXTURE_GET in v;
}

/**
 * Base class for a fixture — a reusable, scoped setup/teardown that provides a
 * value to tests (and to other fixtures via `Fixture.use`).
 */
export function Fixture<T = unknown>(options?: FixtureOptions) {
  abstract class FixtureBase {
    static [BRAND_FIXTURE] = true as const;
    static scope: FixtureScope = options?.scope ?? "test";
    static fixtureName: string = options?.name ?? "fixture";

    /**
     * Field-initializer injection (decorator-free):
     *   class T extends Test() { db = DbFixture.get(); }
     * Returns a marker the runner swaps for the resolved value before each test
     * (respecting the fixture's scope) — the alternative to `@Test.use(DbFixture)`.
     */
    static get<G>(this: { new (): { setup(): MaybePromise<G> } }): G {
      return { [FIXTURE_GET]: this as unknown as FixtureClass } as unknown as G;
    }

    /** Build and return the value injected into dependents. */
    abstract setup(): MaybePromise<T>;
    // Cleanup, called in reverse order when the scope ends, comes from either:
    //   • an optional `teardown(value: T)` method (duck-typed — declared here so
    //     subclasses can add it without an `override` modifier), and/or
    //   • the value implementing `Symbol.dispose` / `Symbol.asyncDispose`
    //     (e.g. one built with the `dispose(...)` helper).
  }
  return FixtureBase;
}

// `dispose` / `Disposer` now live in @youneed/core (shared with fixture-style
// teardown elsewhere); re-exported here so `@youneed/test`'s public API is intact.
export { dispose } from "@youneed/core";
export type { Disposer } from "@youneed/core";

/** Field decorator: inject the resolved value of `fixture` into this member. */
function makeUse() {
  return function use<T>(fixture: FixtureClass<T>) {
    return function (_value: undefined, ctx: ClassFieldDecoratorContext<unknown, T>) {
      ctx.addInitializer(function (this: unknown) {
        const arr = injectsOf(ctorOf(this));
        const key = String(ctx.name);
        if (!arr.some((i) => i.key === key)) arr.push({ key, fixture: fixture as FixtureClass });
      });
    };
  };
}
Fixture.use = makeUse();

// ── Test ─────────────────────────────────────────────────────────────────────
export interface TestOptions {
  /** Suite display name (defaults to the class name). */
  name?: string;
}
/** A runtime skip decision: return `true` (or a string reason) to skip the case.
 *  Evaluated with the test's `TestContext`, so it can branch on `ctx.run` (lane/
 *  shard), `ctx.metadata` (run params from `.context()`), env, etc. */
export type SkipPredicate = (ctx: TestContext) => boolean | string;

export interface CaseOptions<T = unknown> {
  /**
   * Display name (defaults to the method name). Either:
   *   • a typed function `(input, index) => string` — `input` is typed from the
   *     `input` thunk's return, so it's fully type-checked; or
   *   • a string template interpolating the input: `$1`/`$2`… (1-based positional
   *     for an array/tuple input; `$1` is the whole value otherwise), `$#` (the
   *     case index), `$prop` (a property), `$$` (a literal `$`).
   */
  name?: string | ((input: T, index: number) => string);
  /** Skip the case: `true`, or a predicate `(ctx) => boolean | string` evaluated
   *  at run time (a string is recorded as the skip reason). */
  skip?: boolean | SkipPredicate;
  only?: boolean;
  /** Data-driven test: a thunk producing the value passed as the test method's
   *  FIRST argument (the `TestContext` then shifts to the second). Resolved once,
   *  when suites are collected (so it runs at run start, not at import). */
  input?: () => T;
  /** Fail the case if it runs longer than `timeout` ms (and abort `ctx.signal`).
   *  Overrides the run-level default set via `TestApplication().timeout(ms)`.
   *  `0` (or omitted with no run-level default) means no timeout. */
  timeout?: number;
}

/** Base class for a test suite. Decorate methods with `@Test.it` / hooks. */
export function Test(options?: TestOptions) {
  abstract class Suite {
    static [BRAND_SUITE] = true as const;
    static suiteName: string | undefined = options?.name;
  }
  return Suite;
}

type MethodDec = (value: unknown, ctx: ClassMethodDecoratorContext) => void;
const pushHook =
  (kind: "beforeAll" | "afterAll" | "beforeEach" | "afterEach") =>
  (): MethodDec =>
  (_v, ctx) => {
    ctx.addInitializer(function (this: unknown) {
      const arr = suiteMetaOf(ctorOf(this))[kind];
      const key = String(ctx.name);
      if (!arr.includes(key)) arr.push(key);
    });
  };

/** Register the method `key` on suite `ctor` as a test case (idempotent;
 *  find-or-update). The building block behind `@Test.it` — exported so EXTENSION
 *  decorators (e.g. `@Benchmark` from `@youneed/test-plugin-benchmark`) can stand alone
 *  and still register a runnable case. */
function fmtToken(v: unknown): string {
  if (v === undefined) return "";
  return typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
}

/** Interpolate `$1`/`$#`/`$prop`/`$$` placeholders in a name template. `$N` is
 *  1-based positional for array/tuple inputs (`$1` is the whole value otherwise);
 *  `$#` is the case index; `$prop` reads a property; `$$` is a literal `$`. */
function interpolateName(template: string, value: unknown, index: number): string {
  return template.replace(/\$(\$|#|\d+|[A-Za-z_]\w*)/g, (_m, tok: string) => {
    if (tok === "$") return "$";
    if (tok === "#") return String(index);
    if (/^\d+$/.test(tok)) {
      const n = Number(tok);
      return fmtToken(Array.isArray(value) ? value[n - 1] : n === 1 ? value : undefined);
    }
    return fmtToken((value as Record<string, unknown> | null | undefined)?.[tok]);
  });
}

/** Resolve a case name from a string template or a `(value, index)` function. */
function caseName(
  name: string | ((value: any, index: number) => string) | undefined,
  value: unknown,
  index: number,
  fallback: string,
): string {
  if (typeof name === "function") return name(value, index);
  if (typeof name === "string") return interpolateName(name, value, index);
  return fallback;
}

/** Register the method `key` on suite `ctor` as a test case (idempotent;
 *  find-or-update). The building block behind `@Test.it` — exported so EXTENSION
 *  decorators (e.g. `@Benchmark` from `@youneed/test-plugin-benchmark`) can stand alone
 *  and still register a runnable case. (Name is already resolved to a string.) */
export function registerTestCase(
  ctor: Function,
  key: string,
  opts?: { name?: string; skip?: boolean | SkipPredicate; only?: boolean; input?: () => unknown; timeout?: number },
): void {
  const m = suiteMetaOf(ctor);
  const existing = m.tests.find((t) => t.key === key);
  if (existing) {
    if (opts?.name) existing.name = opts.name;
    if (opts?.skip) existing.skip = opts.skip; // preserve a predicate, not just `true`
    if (opts?.only) existing.only = true;
    if (opts?.input) existing.input = opts.input;
    if (opts?.timeout !== undefined) existing.timeout = opts.timeout;
  } else {
    m.tests.push({ name: opts?.name ?? key, key, skip: opts?.skip, only: opts?.only, input: opts?.input, timeout: opts?.timeout });
  }
}

/**
 * Mark a method as a test case. Accepts a name, an options object, or both:
 *   @Test.it("adds")
 *   @Test.test({ name: (v) => `doubles ${v}`, input: () => makeData() })  // data-driven
 *
 * With `input`, the value is the body's first arg (ctx shifts to second), and the
 * `name` can interpolate it (`"qwe($1)"`) or be a typed `(value, i) => string`.
 */
Test.it = function <T = unknown>(nameOrOpts?: string | CaseOptions<T>, opts?: CaseOptions<T>): MethodDec {
  const o: CaseOptions<T> = typeof nameOrOpts === "string" ? { name: nameOrOpts, ...opts } : (nameOrOpts ?? {});
  return (_v, ctx) => {
    ctx.addInitializer(function (this: unknown) {
      const key = String(ctx.name);
      if (!o.input) {
        registerTestCase(ctorOf(this), key, { name: typeof o.name === "string" ? o.name : undefined, skip: o.skip, only: o.only, timeout: o.timeout });
        return;
      }
      // Resolve the input once, at collection — so the name can interpolate it and
      // a looping plugin (benchmark) reuses the same value. A throw becomes a
      // run-time failure (not a collection crash).
      let resolved: T;
      let name: string;
      let input: () => unknown;
      try {
        resolved = o.input();
        name = caseName(o.name, resolved, 0, key);
        input = () => resolved;
      } catch (err) {
        name = caseName(o.name, undefined, 0, key);
        input = () => {
          throw err;
        };
      }
      registerTestCase(ctorOf(this), key, { name, skip: o.skip, only: o.only, input, timeout: o.timeout });
    });
  };
};
/** `@Test.it` alias. */
Test.test = Test.it;

/**
 * Table-driven tests: generate ONE case per row, passing the row as the body's
 * first argument (the `TestContext` shifts to the second). The table can be an
 * array or a thunk (resolved once at collection time). Name rows with a
 * `(row, index) => string` function, or a string: a template with placeholders
 * (`"$1 + $2"`) is interpolated per row, a plain string gets `" [i]"` appended.
 *
 *   @Test.each([[1, 1, 2], [2, 3, 5]], "$1 + $2")
 *   adds([a, b, sum]: number[]) { expect(a + b).toBe(sum); }
 */
Test.each = function <T>(
  table: readonly T[] | (() => readonly T[]),
  name?: string | ((row: T, index: number) => string),
): MethodDec {
  return (_v, ctx) => {
    ctx.addInitializer(function (this: unknown) {
      const m = suiteMetaOf(ctorOf(this));
      const key = String(ctx.name);
      const rows = typeof table === "function" ? table() : table;
      rows.forEach((row, index) => {
        const rowName =
          typeof name === "function"
            ? name(row, index)
            : typeof name === "string"
              ? /\$/.test(name)
                ? interpolateName(name, row, index) // a template → per-row
                : `${name} [${index}]` // a plain base → keep rows unique
              : `${key} [${index}]`;
        // Dedup by (key, name) so re-collecting the suite is idempotent.
        if (!m.tests.some((t) => t.key === key && t.name === rowName)) {
          m.tests.push({ name: rowName, key, input: () => row });
        }
      });
    });
  };
};

/** Mark a test as the only one(s) to run. */
Test.only = (name?: string): MethodDec => Test.it(name, { only: true });
/** Skip a test. */
Test.skip = (name?: string): MethodDec => Test.it(name, { skip: true });

/** Run a named, timed step in the CURRENT test (nestable) — the ambient form of
 *  `ctx.step(...)`, for when you don't have `ctx` threaded in. */
Test.step = function <T>(name: string, fn: () => MaybePromise<T>): Promise<T> {
  if (!activeContext) throw new Error("Test.step() must be called inside a running test");
  return activeContext.step(name, fn);
};

Test.beforeAll = pushHook("beforeAll");
Test.afterAll = pushHook("afterAll");
Test.beforeEach = pushHook("beforeEach");
Test.afterEach = pushHook("afterEach");

/** Field decorator: inject a fixture value into the suite (same as Fixture.use). */
Test.use = makeUse();

// ── Reporter ─────────────────────────────────────────────────────────────────
/** Built-in lifecycle events. Plugins may emit and reporters may subscribe to
 *  ANY string event too (e.g. `"onBenchmarkStart"` from `@youneed/test-plugin-benchmark`)
 *  — hence the open `(string & {})`. */
export type ReporterEventName =
  | "onRunStart"
  | "onSuiteStart"
  | "onTestStart"
  | "onTestEnd"
  | "onSuiteEnd"
  | "onRunEnd"
  | (string & {});

export interface ReporterOptions {
  name: string;
}

/** The abstract base class `Reporter()` returns. Annotated explicitly so the
 *  module-private brand symbol doesn't leak into the emitted declarations —
 *  letting reporters live in their own packages (`@youneed/test-reporter-*`)
 *  that `extends Reporter(...)` with `declaration: true`. */
export type ReporterClass = (abstract new (...args: any[]) => object) & { readonly reporterName: string };

/** Base class for a reporter. Decorate handlers with `@Reporter.event(...)`. */
export function Reporter(options: ReporterOptions): ReporterClass {
  abstract class ReporterBase {
    static [BRAND_REPORTER] = true as const;
    static reporterName = options.name;
  }
  return ReporterBase;
}

/**
 * Method decorator: subscribe to a lifecycle event. Handlers across all
 * reporters run in ascending `priority` (lower = earlier), default `0`.
 */
Reporter.event = function (event: ReporterEventName, opts?: { priority?: number }): MethodDec {
  return (_v, ctx) => {
    ctx.addInitializer(function (this: unknown) {
      const arr = eventsOf(ctorOf(this));
      const key = String(ctx.name);
      if (!arr.some((e) => e.key === key && e.event === event)) arr.push({ event, key, priority: opts?.priority ?? 0 });
    });
  };
};

// ── run payloads ───────────────────────────────────────────────────────────────
export interface TestInfo {
  suite: string;
  name: string;
}

/** A label attached to a test (e.g. an issue link, a tag, a Cucumber step). */
export interface TestAnnotation {
  type: string;
  description?: string;
}

/** Arbitrary data attached to a test — a log, screenshot, etc. Use `path` for a
 *  file on disk or `body` for inline text (both survive the blob reporter). */
export interface TestAttachment {
  name: string;
  contentType?: string;
  path?: string;
  body?: string;
}

/**
 * Report-facing metadata for a test (à la Playwright). A free-form key/value bag
 * — set anything on it (CI/git info, custom fields) — that always carries the
 * test's `attachments`. It's serialized onto the `TestResult` (blob-safe), unlike
 * the in-process `TestContext.data`.
 */
export interface TestMetadata {
  /** Attachments (logs, screenshots, …) — files via `path` or inline `body`. */
  attachments: TestAttachment[];
  /** Arbitrary report-facing fields. */
  [key: string]: unknown;
}

/** One recorded `ctx.step(...)` — a named, timed sub-section of a test. Nestable
 *  (à la Playwright `test.step`). `error` holds the message if the step threw. */
export interface StepResult {
  name: string;
  durationMs: number;
  error?: string;
  steps: StepResult[];
}

export type TestStatus = "passed" | "failed" | "skipped";
export interface TestResult extends TestInfo {
  status: TestStatus;
  durationMs: number;
  error?: Error;
  /** Annotations collected during the test (via `ctx.annotate`). */
  annotations?: TestAnnotation[];
  /** Report-facing metadata + attachments (via `ctx.metadata` / `ctx.attach`).
   *  Plugins stash their per-test output here too (e.g. `metadata.benchmark`). */
  metadata?: TestMetadata;
  /** Named, timed steps recorded via `ctx.step` / `Test.step` (nestable). */
  steps?: StepResult[];
}

/**
 * Mutable per-test context, created for each case and threaded through its
 * lifecycle: `beforeEach`, the test body, and `afterEach` all receive the SAME
 * instance as their argument, and reporters get it on `onTestStart`. It's the
 * extension point for plugins and integrations (e.g. a Cucumber "World"):
 *
 *   class Steps extends Test() {
 *     @Test.beforeEach() setup(ctx: TestContext) { ctx.data.set("world", new World()); }
 *     @Test.it() step(ctx: TestContext) {
 *       const world = ctx.data.get("world") as World;
 *       ctx.annotate("tag", "@smoke");
 *     }
 *   }
 *
 * `annotations` and `metadata` (which holds `attachments`) are surfaced on the
 * final `TestResult` and survive the blob reporter; `data` is live, in-process
 * state for the current test only.
 */
export interface TestContext extends TestInfo {
  /** Free-form, plugin-owned storage shared across this test's hooks + body
   *  (e.g. a Cucumber World, accumulated step state). Not serialized. */
  readonly data: Map<string | symbol, unknown>;
  /** Annotations added so far (also placed on the `TestResult`). */
  readonly annotations: TestAnnotation[];
  /** Report-facing metadata (à la Playwright) — set arbitrary fields on it, and
   *  it always carries `attachments`. Surfaced on the `TestResult`. */
  readonly metadata: TestMetadata;
  /** Which lane/worker/shard this test runs in — for progress UIs. */
  readonly run: RunContext;
  /**
   * Aborted when the test ends — on timeout, on failure, or once the body (plus
   * `afterEach`/teardown) has finished. Thread it into anything that outlives a
   * single assertion so it's torn down with the test (à la Playwright/Vitest):
   *
   *   @Test.it("fetches", { timeout: 2000 })
   *   async fetches(ctx: TestContext) {
   *     const res = await fetch(url, { signal: ctx.signal }); // cancelled on timeout
   *     window.addEventListener("x", fn, { signal: ctx.signal }); // auto-removed
   *   }
   *
   * On timeout the abort `reason` is a `TimeoutError`; otherwise a plain "test
   * finished" Error. Check `ctx.signal.aborted` to bail out of long loops early.
   */
  readonly signal: AbortSignal;
  /** Recorded steps so far (the nested tree, surfaced on the `TestResult`). */
  readonly steps: StepResult[];
  /** Add an annotation, e.g. `ctx.annotate("issue", "JIRA-123")`. */
  annotate(type: string, description?: string): void;
  /** Add an attachment — shorthand for `ctx.metadata.attachments.push(...)`. */
  attach(attachment: TestAttachment): void;
  /** Run `fn` as a named, timed step (nestable). Returns `fn`'s result; a throw
   *  is recorded on the step and re-thrown. Also available as `Test.step(...)`. */
  step<T>(name: string, fn: () => MaybePromise<T>): Promise<T>;
}

/** Where a test runs in a parallel/sharded run — handed to reporters so an
 *  interactive one can show per-lane progress (which test is running where). */
export interface RunContext {
  /** `"sequential"` (single lane), `"parallel"` (in-process lane), or
   *  `"worker"` (forked process). */
  mode: "sequential" | "parallel" | "worker";
  /** 0-based lane/worker index (`0` when sequential). */
  lane: number;
  /** Total lanes/workers (`1` when sequential). */
  lanes: number;
  /** The CI shard, if `.shard("i/n")` / `YOUNEED_SHARD` is in effect. */
  shard?: { current: number; total: number };
}

/**
 * A LIVE progress event (`onProgress`), emitted as each test starts and ends —
 * even during a `.parallel()` run, where the canonical onTest* events are
 * buffered and replayed only at the end. Lets an interactive reporter show the
 * current status per lane. `@youneed/test-reporter-progress` consumes it.
 */
export interface ProgressEvent {
  run: RunContext;
  phase: "testStart" | "testEnd";
  suite: string;
  name: string;
  /** Present on `"testEnd"`. */
  status?: TestStatus;
}

export interface SuiteInfo {
  suite: string;
  total: number;
}
export interface RunSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  results: TestResult[];
}

// ── plugins (extensions) ──────────────────────────────────────────────────────
/**
 * What a plugin's `runTest` receives. It wraps the execution of ONE test case:
 * call `next()` to run the body once, or LOOP it (that's how `@youneed/test-plugin-benchmark`
 * measures). Use `emit` to fire custom reporter events, `suite`/`key` to look up
 * your own per-case metadata (set by your decorator), and `ctx.metadata` to stash
 * output onto the result.
 */
export interface TestExecution {
  ctx: TestContext;
  /** The constructed suite instance — read injected fixtures (`exec.instance.db`)
   *  or call suite methods. Typed loosely; cast to your suite. */
  instance: Record<string, unknown>;
  /** The suite class — for a plugin to read its own per-case metadata. */
  suite: Function;
  /** The test method key on the suite. */
  key: string;
  /** Emit a (possibly custom) reporter event. */
  emit(event: string, payload?: unknown): Promise<void>;
  /** Run the test body once (or the next plugin's wrapper). */
  next(): Promise<void>;
}

/** Handed to a plugin's run-level `setup`/`teardown` hooks. */
export interface PluginApi {
  /** Emit a (possibly custom) reporter event. */
  emit(event: string, payload?: unknown): Promise<void>;
}

/**
 * A test-framework extension. Register with `TestApplication().use(plugin)`.
 *   • `setup` runs once before the run's tests, `teardown` once after (reverse
 *     order across plugins) — for run-global resources (start/stop a container,
 *     coverage, …). In worker/parallel runs they fire per worker / once per
 *     in-process run.
 *   • `runTest` is middleware around each case — plugins compose in registration
 *     order, innermost being the actual test body.
 */
export interface TestPlugin {
  name: string;
  setup?(api: PluginApi): void | Promise<void>;
  teardown?(api: PluginApi): void | Promise<void>;
  runTest?(exec: TestExecution): void | Promise<void>;
}

// ── webServer (precondition) ──────────────────────────────────────────────────
/**
 * Start a web server before the tests run and stop it after (à la Playwright's
 * `webServer` config). Use it for E2E/integration suites that hit a real
 * endpoint: the server boots, the run waits until it's reachable, the tests run,
 * then it's torn down.
 */
export interface WebServerOptions {
  /** Command to start the server, run through the shell (e.g. `"npm start"`). */
  command: string;
  /** Poll this URL until it responds (any HTTP status, even 4xx/5xx, counts as
   *  "up" — only a refused/failed connection is "not yet"). Give this OR `port`. */
  url?: string;
  /** Wait until this TCP port accepts a connection. Give this OR `url`. */
  port?: number;
  /** Working directory for the command (default `process.cwd()`). */
  cwd?: string;
  /** Extra env vars merged onto `process.env`. */
  env?: Record<string, string>;
  /** How long to wait for readiness before failing the run (default `60000`). */
  timeout?: number;
  /** If the target is ALREADY responding, reuse it instead of spawning (and
   *  don't kill it on teardown). Defaults to `true` outside CI, `false` on CI
   *  (`process.env.CI`) — the same heuristic as Playwright. */
  reuseExistingServer?: boolean;
  /** Pipe the server's stdout/stderr to this process (default `false` — quiet). */
  stdout?: boolean;
}

function tcpOpen(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return import("node:net").then(
    (net) =>
      new Promise<boolean>((resolve) => {
        const s = net.connect({ host, port }, () => {
          s.destroy();
          resolve(true);
        });
        s.on("error", () => resolve(false));
        s.setTimeout(timeoutMs, () => {
          s.destroy();
          resolve(false);
        });
      }),
  );
}

/** Is the target (url or port) currently responding? */
async function webServerUp(opts: WebServerOptions): Promise<boolean> {
  if (opts.url) {
    try {
      await fetch(opts.url, { signal: AbortSignal.timeout(1500) });
      return true; // any response (even 4xx/5xx) means it's listening
    } catch {
      return false;
    }
  }
  if (opts.port) return tcpOpen("127.0.0.1", opts.port);
  return false;
}

/**
 * A plugin that runs a web server as a precondition for the whole test run.
 * Register it with `TestApplication().use(webServer({ command, url }))` or the
 * `.webServer(...)` shorthand. `setup` boots + waits; `teardown` kills it.
 */
export function webServer(opts: WebServerOptions): TestPlugin {
  if (!opts.url && !opts.port) throw new Error("webServer: provide `url` or `port`");
  const reuse = opts.reuseExistingServer ?? !process.env.CI;
  const timeout = opts.timeout ?? 60_000;
  let child: import("node:child_process").ChildProcess | undefined;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  return {
    name: "webServer",
    async setup() {
      if (reuse && (await webServerUp(opts))) return; // already running → reuse it

      const { spawn } = await import("node:child_process");
      child = spawn(opts.command, {
        cwd: opts.cwd ?? process.cwd(),
        env: { ...process.env, ...opts.env },
        shell: true,
        detached: true, // own process group, so we can kill the whole tree
        stdio: opts.stdout ? "inherit" : "ignore",
      });
      let exited: number | null = null;
      child.on("exit", (code) => (exited = code));

      const target = opts.url ?? `port ${opts.port}`;
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (exited !== null) throw new Error(`webServer command exited (code ${exited}) before becoming ready: ${opts.command}`);
        if (await webServerUp(opts)) return;
        await sleep(200);
      }
      await this.teardown!({} as PluginApi);
      throw new Error(`webServer did not become ready at ${target} within ${timeout}ms`);
    },
    async teardown() {
      if (!child || child.exitCode !== null) return;
      try {
        if (child.pid !== undefined) process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
      // Give it a moment to exit, then force-kill the group.
      for (let i = 0; i < 25 && child.exitCode === null; i++) await sleep(80);
      if (child.exitCode === null && child.pid !== undefined) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {}
      }
      child = undefined;
    },
  };
}

// ── assertions ──────────────────────────────────────────────────────────────
export class AssertionError extends Error {
  override name = "AssertionError";
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Meta)[k], (b as Meta)[k]));
}

const show = (v: unknown): string => {
  try {
    return typeof v === "string" ? JSON.stringify(v) : Array.isArray(v) || (v && typeof v === "object") ? JSON.stringify(v) : String(v);
  } catch {
    return String(v);
  }
};

export interface Matchers<T> {
  toBe(expected: T): void;
  toEqual(expected: T): void;
  toBeDefined(): void;
  toBeUndefined(): void;
  toBeNull(): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toBeGreaterThan(n: number): void;
  toBeLessThan(n: number): void;
  toContain(item: unknown): void;
  toHaveLength(n: number): void;
  toThrow(message?: string | RegExp): void;
  // ── mock matchers (actual must be a `fn`/`spyOn` mock) ──
  /** The mock was called at least once. */
  toHaveBeenCalled(): void;
  /** The mock was called exactly `n` times. */
  toHaveBeenCalledTimes(n: number): void;
  /** Some call matched these args (deep-equal). */
  toHaveBeenCalledWith(...args: unknown[]): void;
  /** The most recent call matched these args. */
  toHaveBeenLastCalledWith(...args: unknown[]): void;
  /** The `n`-th call (1-based) matched these args. */
  toHaveBeenNthCalledWith(n: number, ...args: unknown[]): void;
  /** Some call returned a value deep-equal to `value`. */
  toHaveReturnedWith(value: unknown): void;
  readonly not: Matchers<T>;
}

export function expect<T>(actual: T): Matchers<T> {
  return matchers(actual, false);
}

function matchers<T>(actual: T, negated: boolean): Matchers<T> {
  const ok = (pass: boolean, msg: () => string) => {
    if (pass === negated) throw new AssertionError(msg());
  };
  const not = negated ? "not " : "";
  // For the mock matchers: actual must be a fn()/spyOn() mock.
  const mockState = () => {
    const state = getMockState(actual);
    if (!state) throw new AssertionError(`expected a mock function (from fn() / spyOn()), got ${show(actual)}`);
    return state;
  };
  const argsEqual = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  return {
    toBe: (expected) => ok(Object.is(actual, expected), () => `expected ${show(actual)} ${not}to be ${show(expected)}`),
    toEqual: (expected) => ok(deepEqual(actual, expected), () => `expected ${show(actual)} ${not}to equal ${show(expected)}`),
    toBeDefined: () => ok(actual !== undefined, () => `expected value ${not}to be defined`),
    toBeUndefined: () => ok(actual === undefined, () => `expected ${show(actual)} ${not}to be undefined`),
    toBeNull: () => ok(actual === null, () => `expected ${show(actual)} ${not}to be null`),
    toBeTruthy: () => ok(Boolean(actual), () => `expected ${show(actual)} ${not}to be truthy`),
    toBeFalsy: () => ok(!actual, () => `expected ${show(actual)} ${not}to be falsy`),
    toBeGreaterThan: (n) => ok(Number(actual) > n, () => `expected ${show(actual)} ${not}to be > ${n}`),
    toBeLessThan: (n) => ok(Number(actual) < n, () => `expected ${show(actual)} ${not}to be < ${n}`),
    toContain: (item) =>
      ok(
        typeof actual === "string" ? actual.includes(item as string) : Array.isArray(actual) && actual.includes(item),
        () => `expected ${show(actual)} ${not}to contain ${show(item)}`,
      ),
    toHaveLength: (n) => ok((actual as { length?: number })?.length === n, () => `expected length ${not}to be ${n}, got ${(actual as { length?: number })?.length}`),
    toThrow: (message) => {
      let threw: Error | undefined;
      try {
        (actual as () => unknown)();
      } catch (e) {
        threw = e as Error;
      }
      const matched =
        !!threw &&
        (message === undefined ||
          (message instanceof RegExp ? message.test(threw.message) : threw.message.includes(message)));
      ok(matched, () => `expected function ${not}to throw${message ? ` ${show(message)}` : ""}${threw ? ` (threw ${show(threw.message)})` : ""}`);
    },
    toHaveBeenCalled: () => ok(mockState().calls.length > 0, () => `expected mock ${not}to have been called`),
    toHaveBeenCalledTimes: (n) => {
      const count = mockState().calls.length;
      ok(count === n, () => `expected mock ${not}to have been called ${n} time(s) (was ${count})`);
    },
    toHaveBeenCalledWith: (...args) =>
      ok(mockState().calls.some((c) => argsEqual(c, args)), () => `expected mock ${not}to have been called with ${show(args)}`),
    toHaveBeenLastCalledWith: (...args) => {
      const last = mockState().lastCall;
      ok(!!last && argsEqual(last, args), () => `expected mock's last call ${not}to be ${show(args)} (was ${show(last)})`);
    },
    toHaveBeenNthCalledWith: (n, ...args) => {
      const call = mockState().calls[n - 1];
      ok(!!call && argsEqual(call, args), () => `expected mock's call #${n} ${not}to be ${show(args)} (was ${show(call)})`);
    },
    toHaveReturnedWith: (value) =>
      ok(
        mockState().results.some((r) => r.type === "return" && deepEqual(r.value, value)),
        () => `expected mock ${not}to have returned ${show(value)}`,
      ),
    get not() {
      return matchers(actual, !negated);
    },
  };
}

// ── fixture resolution ─────────────────────────────────────────────────────────
interface ScopeCache {
  values: Map<FixtureClass, unknown>;
  teardowns: Array<() => MaybePromise<void>>;
}
const newScopeCache = (): ScopeCache => ({ values: new Map(), teardowns: [] });

interface ScopeCaches {
  run: ScopeCache;
  suite: ScopeCache;
  test: ScopeCache;
}

async function resolveFixture(Fix: FixtureClass, caches: ScopeCaches, stack: Set<FixtureClass>): Promise<unknown> {
  const cache = caches[Fix.scope];
  if (cache.values.has(Fix)) return cache.values.get(Fix);
  if (stack.has(Fix)) {
    const cycle = [...stack, Fix].map((f) => f.fixtureName ?? (f as { name?: string }).name).join(" → ");
    throw new Error(`fixture dependency cycle: ${cycle}`);
  }
  stack.add(Fix);
  const instance = new Fix();
  for (const dep of readInjects(Fix)) {
    (instance as Meta)[dep.key] = await resolveFixture(dep.fixture, caches, stack);
  }
  const value = await instance.setup();
  cache.values.set(Fix, value);
  // Teardown = the explicit `teardown(value)` hook (if any) AND the value's own
  // disposal (Symbol.dispose / Symbol.asyncDispose), so a fixture can just
  // return a disposable resource (e.g. one made with `dispose(...)`).
  const teardown = (instance as { teardown?: (v: unknown) => MaybePromise<void> }).teardown;
  if (typeof teardown === "function" || isDisposable(value)) {
    cache.teardowns.push(async () => {
      if (typeof teardown === "function") await teardown.call(instance, value);
      await disposeValue(value);
    });
  }
  stack.delete(Fix);
  return value;
}

async function teardownScope(cache: ScopeCache, onError: (e: unknown) => void): Promise<void> {
  for (let i = cache.teardowns.length - 1; i >= 0; i--) {
    try {
      await cache.teardowns[i]();
    } catch (e) {
      onError(e);
    }
  }
  cache.teardowns.length = 0;
  cache.values.clear();
}

// ── event dispatcher ──────────────────────────────────────────────────────────
class Dispatcher {
  #handlers = new Map<ReporterEventName, Array<{ fn: (payload: unknown) => MaybePromise<void>; priority: number }>>();

  add(reporter: object): void {
    for (const reg of readEvents(reporter.constructor as AnyCtor)) {
      const fn = (reporter as Record<string, unknown>)[reg.key];
      if (typeof fn !== "function") continue;
      const list = this.#handlers.get(reg.event) ?? [];
      list.push({ fn: (fn as (p: unknown) => MaybePromise<void>).bind(reporter), priority: reg.priority });
      this.#handlers.set(reg.event, list);
    }
  }

  seal(): void {
    for (const list of this.#handlers.values()) list.sort((a, b) => a.priority - b.priority);
  }

  async emit(event: ReporterEventName, payload: unknown): Promise<void> {
    for (const h of this.#handlers.get(event) ?? []) await h.fn(payload);
  }
}

// ── default reporter ──────────────────────────────────────────────────────────
/**
 * The built-in fallback reporter, used when no reporter is registered. Quiet by
 * design: it prints failures, benchmark results, and a final summary — no
 * per-passing-test spam, no colors, no dependencies.
 *
 * Richer / alternative output lives in independent, pluggable packages named
 * `@youneed/test-reporter-<name>`:
 *   • `@youneed/test-reporter-console` — colored, per-test/suite + benchmarks
 *   • `@youneed/test-reporter-html`    — writes an HTML report file
 *   • `@youneed/test-plugin-benchmark`        — the benchmark extension + its reporter
 * Register one with `.reporter(new ConsoleReporter())`.
 */
export class DefaultReporter extends Reporter({ name: "default" }) {
  @Reporter.event("onTestEnd")
  test(r: TestResult) {
    if (r.status !== "failed") return; // quiet on pass/skip
    console.log(`✗ ${r.suite} › ${r.name}`);
    console.log(`  ${r.error?.message ?? "failed"}`);
  }

  @Reporter.event("onRunEnd")
  end(s: RunSummary) {
    const parts = [`${s.passed} passed`];
    if (s.failed) parts.push(`${s.failed} failed`);
    if (s.skipped) parts.push(`${s.skipped} skipped`);
    console.log(`${parts.join(", ")} (${s.total} total, ${s.durationMs.toFixed(0)}ms)`);
  }
}

/**
 * A reporter that subscribes to nothing and prints nothing. Register it to fully
 * silence a run — handy when driving tests programmatically and reading the
 * returned `RunSummary` (registering ANY reporter suppresses the DefaultReporter):
 *
 *   const summary = await TestApplication().addTests(S).reporter(new NoopReporter()).run();
 */
export class NoopReporter extends Reporter({ name: "noop" }) {}

// ── blob reporter (for parallel / sharded runs) ──────────────────────────────
// A blob records the raw event stream to disk instead of rendering it, so that
// the shards of a parallel run can be merged and replayed through real reporters
// afterwards (à la Playwright's blob reporter + `merge-reports`).
interface BlobRecord {
  event: ReporterEventName;
  payload: unknown;
}
interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}

// `Error` isn't JSON-serializable; round-trip the `error` on a TestResult.
function encodeResult(r: TestResult): TestResult & { error?: SerializedError } {
  if (!r.error) return r;
  return { ...r, error: { name: r.error.name, message: r.error.message, stack: r.error.stack } };
}
function decodeResult(r: TestResult & { error?: SerializedError }): TestResult {
  if (!r.error) return r;
  const e = new Error(r.error.message);
  e.name = r.error.name;
  e.stack = r.error.stack;
  return { ...r, error: e };
}

const DEFAULT_BLOB_DIR = "blob-report";

export interface BlobOptions {
  /** Directory the blob file is written to (default `"blob-report"`). */
  dir?: string;
  /** Shard label used in the file name (default from `YOUNEED_SHARD` or pid). */
  shard?: string;
}

/**
 * Records the event stream to `<dir>/shard-<shard>.jsonl`. Add it on each shard
 * of a parallel run, then `mergeReports({ dir })` to produce the final report.
 */
export class BlobReporter extends Reporter({ name: "blob" }) {
  #records: BlobRecord[] = [];
  #dir: string;
  #shard: string;

  constructor(opts?: BlobOptions) {
    super();
    this.#dir = opts?.dir ?? process.env.YOUNEED_BLOB_DIR ?? DEFAULT_BLOB_DIR;
    this.#shard = (opts?.shard ?? process.env.YOUNEED_SHARD ?? String(process.pid)).replace(/\//g, "-of-");
  }

  @Reporter.event("onSuiteStart") s1(i: SuiteInfo) {
    this.#records.push({ event: "onSuiteStart", payload: i });
  }
  @Reporter.event("onTestStart") s2(i: TestInfo) {
    // Only identity is recorded: the live TestContext (Map + methods) can't cross
    // a process. Its serializable outcome (annotations/attachments) rides on the
    // TestResult in onTestEnd instead.
    this.#records.push({ event: "onTestStart", payload: { suite: i.suite, name: i.name } satisfies TestInfo });
  }
  @Reporter.event("onTestEnd") s3(r: TestResult) {
    this.#records.push({ event: "onTestEnd", payload: encodeResult(r) });
  }
  @Reporter.event("onSuiteEnd") s4(i: SuiteInfo) {
    this.#records.push({ event: "onSuiteEnd", payload: i });
  }

  @Reporter.event("onRunEnd")
  async flush() {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    await mkdir(this.#dir, { recursive: true });
    const file = join(this.#dir, `shard-${this.#shard}.jsonl`);
    await writeFile(file, this.#records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  }
}

/**
 * Like {@link BlobReporter}, but buffers the event stream in memory instead of
 * writing it to disk. Used internally by in-process parallel runs: each lane
 * records into its own array, then the streams are merged in lane order and
 * replayed through the real reporters as one coherent run.
 */
class MemoryReporter extends Reporter({ name: "memory" }) {
  #records: BlobRecord[];
  constructor(records: BlobRecord[]) {
    super();
    this.#records = records;
  }
  @Reporter.event("onSuiteStart") s1(i: SuiteInfo) {
    this.#records.push({ event: "onSuiteStart", payload: i });
  }
  @Reporter.event("onTestStart") s2(i: TestInfo) {
    this.#records.push({ event: "onTestStart", payload: i });
  }
  @Reporter.event("onTestEnd") s3(r: TestResult) {
    this.#records.push({ event: "onTestEnd", payload: r });
  }
  @Reporter.event("onSuiteEnd") s4(i: SuiteInfo) {
    this.#records.push({ event: "onSuiteEnd", payload: i });
  }
}

export interface MergeOptions {
  /** Directory containing the shard blobs (default `"blob-report"`). */
  dir?: string;
  /** Reporters to replay the merged stream through (default `DefaultReporter`). */
  reporters?: ReporterRef[];
}

/** Read every blob in `dir`, merge the streams, and replay through reporters. */
export async function mergeReports(opts?: MergeOptions, runOpts?: RunOptions): Promise<RunSummary> {
  const { readdir, readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const dir = opts?.dir ?? DEFAULT_BLOB_DIR;

  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(".jsonl")).sort();
  const records: BlobRecord[] = [];
  for (const f of files) {
    const text = await readFile(join(dir, f), "utf8");
    for (const line of text.split("\n")) if (line.trim()) records.push(JSON.parse(line) as BlobRecord);
  }

  const dispatcher = buildDispatcher(opts?.reporters);
  return replayRecords(records, dispatcher, runOpts);
}

/**
 * Replay a recorded event stream (blob files, or in-memory parallel lanes),
 * synthesizing exactly one run start/end + summary. Pass `durationMs` to report
 * real wall-clock time (parallel lanes); otherwise the test durations are summed.
 */
async function replayRecords(
  records: BlobRecord[],
  dispatcher: Dispatcher,
  opts?: RunOptions,
  durationMs?: number,
): Promise<RunSummary> {
  const results: TestResult[] = [];
  await dispatcher.emit("onRunStart", undefined);
  for (const rec of records) {
    const payload = rec.event === "onTestEnd" ? decodeResult(rec.payload as TestResult & { error?: SerializedError }) : rec.payload;
    if (rec.event === "onTestEnd") results.push(payload as TestResult);
    // Plugin output (e.g. benchmark stats) rides on TestResult.metadata, so it
    // survives the merge automatically — a benchmark reporter reads it in onTestEnd.
    await dispatcher.emit(rec.event, payload);
  }
  const summary = summarize(results, durationMs ?? results.reduce((d, r) => d + r.durationMs, 0));
  await dispatcher.emit("onRunEnd", summary);
  if ((opts?.setExitCode ?? true) && summary.failed > 0) process.exitCode = 1;
  return summary;
}

// ── pattern loading ────────────────────────────────────────────────────────────
function globToRegExp(glob: string): RegExp {
  const g = glob.replace(/^\.\//, "");
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*") {
      if (g[i + 1] === "*") {
        re += "(?:.*/)?";
        i++;
        if (g[i + 1] === "/") i++;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if ("\\^$+.()|[]{}".includes(c)) re += "\\" + c;
    else re += c;
  }
  return new RegExp(`(^|/)${re}$`);
}

async function loadPattern(pattern: string): Promise<AnyCtor[]> {
  const { readdir } = await import("node:fs/promises");
  const { resolve, join } = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  const re = globToRegExp(pattern);
  const root = resolve(process.cwd());
  const found: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else {
        const rel = full.slice(root.length + 1).split(/[\\/]/).join("/");
        if (re.test(rel)) found.push(full);
      }
    }
  }
  await walk(root);

  const suites: AnyCtor[] = [];
  for (const file of found.sort()) {
    const mod = await import(pathToFileURL(file).href);
    for (const value of Object.values(mod)) {
      if (isBranded(value, BRAND_SUITE)) suites.push(value as AnyCtor);
    }
  }
  return suites;
}

// ── builder ─────────────────────────────────────────────────────────────────
export interface RunOptions {
  /** Set `process.exitCode = 1` when any test fails (default `true`). */
  setExitCode?: boolean;
}

type ReporterRef = (abstract new (...args: never[]) => object) | object;

class TestAppBuilder {
  #suites: AnyCtor[] = [];
  #patterns: string[] = [];
  #reporters: ReporterRef[] = [];
  #shardCount = 0;
  #parallel = 0;
  #shardSpec?: { current: number; total: number };
  #wantBlob = false;
  #blobDir = DEFAULT_BLOB_DIR;
  #plugins: TestPlugin[] = [];
  #context: Record<string, unknown> = {};
  #defaultTimeout = 0;

  /** Register one or more suite classes (extending `Test()`). */
  addTests(...suites: AnyCtor[]): this {
    this.#suites.push(...suites);
    return this;
  }

  /** Seed run-level params into every test's `ctx.metadata` (à la Playwright
   *  project params) — e.g. `.context({ browser: "firefox" })`. Available to
   *  conditional `skip` predicates and surfaced on each `TestResult.metadata`. */
  context(seed: Record<string, unknown>): this {
    Object.assign(this.#context, seed);
    return this;
  }

  /** Register an extension plugin (e.g. `benchmark()` from
   *  `@youneed/test-plugin-benchmark`). Plugins wrap test execution via `runTest`. */
  use(...plugins: TestPlugin[]): this {
    this.#plugins.push(...plugins);
    return this;
  }

  /** Start a web server before the run and stop it after — a precondition for
   *  E2E/integration suites (à la Playwright's `webServer`). Shorthand for
   *  `.use(webServer(opts))`. Accepts one config or an array. */
  webServer(opts: WebServerOptions | WebServerOptions[]): this {
    for (const o of Array.isArray(opts) ? opts : [opts]) this.#plugins.push(webServer(o));
    return this;
  }

  /** Default per-test timeout in ms — a case running longer fails and its
   *  `ctx.signal` is aborted. `@Test.it(name, { timeout })` overrides it per case.
   *  `0` (the default) disables timeouts. (à la Playwright's global timeout.) */
  timeout(ms: number): this {
    this.#defaultTimeout = Math.max(0, Math.floor(ms));
    return this;
  }

  /** Discover suites by glob (relative to cwd), e.g. all `*.test.ts` files. */
  addPattern(...patterns: string[]): this {
    this.#patterns.push(...patterns);
    return this;
  }

  /** Register a reporter — a class (auto-instantiated) or an instance. */
  reporter(reporter: ReporterRef): this {
    this.#reporters.push(reporter);
    return this;
  }

  /** Also write a blob of the event stream (for distributed/manual merges). */
  blob(opts?: BlobOptions): this {
    this.#wantBlob = true;
    if (opts?.dir) this.#blobDir = opts.dir;
    return this;
  }

  /** Run across `n` worker *processes*, then merge their blobs into one report.
   *  True parallelism (separate event loops); each worker gets its own "run"
   *  scope. Use for CPU-bound suites. See {@link parallel} for the in-process
   *  variant. (`shards` is kept as an alias.) */
  workers(n: number): this {
    this.#shardCount = Math.max(1, Math.floor(n));
    return this;
  }
  /** @deprecated Alias for {@link workers}. */
  shards(n: number): this {
    return this.workers(n);
  }

  /** Run suites across `n` in-process async *lanes* that execute concurrently —
   *  no child processes. Ideal for I/O-bound async tests. Each lane buffers its
   *  events; they're merged in lane order and replayed as one run, so reporter
   *  output isn't interleaved. Each lane gets its own "run" scope. */
  parallel(n: number): this {
    this.#parallel = Math.max(1, Math.floor(n));
    return this;
  }

  /** Run only shard `current` of `total` (1-based), e.g. `.shard("2/4")` — for
   *  splitting a suite set across CI jobs. Unlike the `YOUNEED_SHARD` env (which
   *  forces blob-only worker mode), this is a normal run of the subset, so you
   *  can keep per-job reporters; pair with `.blob()` and `mergeReports()`. */
  shard(spec: string | { current: number; total: number }): this {
    this.#shardSpec = typeof spec === "string" ? parseShard(spec) : spec;
    return this;
  }

  async run(opts?: RunOptions): Promise<RunSummary> {
    const shardEnv = process.env.YOUNEED_SHARD;

    // (1) Worker process: run only our shard, emit a blob, nothing human-facing.
    if (shardEnv) {
      const [i, n] = shardEnv.split("/").map(Number);
      const suites = await this.#collectSuites();
      const runCtx: RunContext = { mode: "worker", lane: i - 1, lanes: n, shard: this.#shardSpec };
      return runSuites(selectShard(suites, i, n), buildDispatcher([new BlobReporter()]), opts, this.#plugins, runCtx, this.#context, this.#defaultTimeout);
    }

    // (2) Coordinator: fork workers, then merge their blobs into the report.
    if (this.#shardCount > 1) {
      const { rm } = await import("node:fs/promises");
      await rm(this.#blobDir, { recursive: true, force: true });
      const codes = await forkShards(this.#shardCount, this.#blobDir);
      const summary = await mergeReports({ dir: this.#blobDir, reporters: this.#reporters }, opts);
      // A worker that crashed before recording its failures still fails the run.
      if ((opts?.setExitCode ?? true) && codes.some((c) => c !== 0)) process.exitCode = 1;
      return summary;
    }

    // (3) Normal single-process run (optionally a shard subset and/or parallel).
    let suites = await this.#collectSuites();
    if (this.#shardSpec) suites = selectShard(suites, this.#shardSpec.current, this.#shardSpec.total);
    const reporters = [...this.#reporters];
    if (this.#wantBlob) reporters.push(new BlobReporter({ dir: this.#blobDir }));
    if (this.#parallel > 1) return runSuitesParallel(suites, reporters, this.#parallel, opts, this.#plugins, this.#shardSpec, this.#context, this.#defaultTimeout);
    const runCtx: RunContext = { mode: "sequential", lane: 0, lanes: 1, shard: this.#shardSpec };
    return runSuites(suites, buildDispatcher(reporters), opts, this.#plugins, runCtx, this.#context, this.#defaultTimeout);
  }

  async #collectSuites(): Promise<AnyCtor[]> {
    for (const p of this.#patterns) this.#suites.push(...(await loadPattern(p)));
    return [...new Set(this.#suites)]; // a suite may be both explicit and pattern-matched
  }
}

/** Entry point — build a test run fluently, then `.run()`. */
export function TestApplication(): TestAppBuilder {
  return new TestAppBuilder();
}

/** Instantiate + register reporters (defaulting to DefaultReporter) and seal. */
function buildDispatcher(refs?: ReporterRef[]): Dispatcher {
  const dispatcher = new Dispatcher();
  for (const ref of refs && refs.length ? refs : [DefaultReporter]) {
    dispatcher.add(typeof ref === "function" ? new (ref as new () => object)() : ref);
  }
  dispatcher.seal();
  return dispatcher;
}

/** Deterministically pick suite `i` of `n` (1-based), sorted by class name. */
function selectShard(suites: AnyCtor[], i: number, n: number): AnyCtor[] {
  return [...suites]
    .sort((a, b) => (a as { name: string }).name.localeCompare((b as { name: string }).name))
    .filter((_, idx) => idx % n === i - 1);
}

/** Parse a `"current/total"` shard spec (1-based) into its parts. */
function parseShard(spec: string): { current: number; total: number } {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(spec);
  if (!m) throw new Error(`invalid shard "${spec}", expected "current/total" (e.g. "2/4")`);
  const current = Number(m[1]);
  const total = Number(m[2]);
  if (current < 1 || total < 1 || current > total) throw new Error(`shard ${current}/${total} is out of range`);
  return { current, total };
}

/** Fork `n` worker processes (re-exec this entry) and await their exit codes. */
async function forkShards(n: number, blobDir: string): Promise<number[]> {
  const { spawn } = await import("node:child_process");
  const entry = process.argv[1];
  const extra = process.argv.slice(2);
  const run = (i: number) =>
    new Promise<number>((resolve) => {
      const child = spawn(process.execPath, [...process.execArgv, entry, ...extra], {
        env: { ...process.env, YOUNEED_SHARD: `${i}/${n}`, YOUNEED_BLOB_DIR: blobDir },
        stdio: "inherit",
      });
      child.on("exit", (code) => resolve(code ?? 0));
    });
  return Promise.all(Array.from({ length: n }, (_, k) => run(k + 1)));
}

// ── runner ─────────────────────────────────────────────────────────────────
// A constructed suite. A test method is called as `(ctx)`, or `(input, ctx)` for
// a data-driven case; hooks get `(ctx)`. Old `foo() {}` methods ignore the args.
type SuiteInstance = Record<string, (...args: unknown[]) => MaybePromise<void>>;

interface Prepared {
  Suite: AnyCtor;
  instance: SuiteInstance;
  meta: SuiteMeta;
  suiteName: string;
}

const SEQUENTIAL: RunContext = { mode: "sequential", lane: 0, lanes: 1 };

// The context of the currently-running test — lets `Test.step(...)` work without
// threading `ctx`. Set around the body in executeSuites.
let activeContext: TestContext | undefined;

/** Build the mutable per-test context shared by hooks + body + reporters, plus
 *  the `AbortController` backing `ctx.signal` (the runner aborts it on timeout /
 *  when the test ends). `seed` pre-fills `metadata` with run-level params. */
function createTestContext(
  suite: string,
  name: string,
  run: RunContext,
  seed?: Record<string, unknown>,
): { ctx: TestContext; controller: AbortController } {
  const annotations: TestAnnotation[] = [];
  const metadata: TestMetadata = { attachments: [], ...seed };
  const steps: StepResult[] = [];
  const stack: StepResult[] = []; // open (parent) steps, for nesting
  const controller = new AbortController();
  const ctx: TestContext = {
    suite,
    name,
    run,
    signal: controller.signal,
    data: new Map<string | symbol, unknown>(),
    annotations,
    metadata,
    steps,
    annotate(type, description) {
      annotations.push({ type, description });
    },
    attach(attachment) {
      metadata.attachments.push(attachment);
    },
    async step(stepName, fn) {
      const node: StepResult = { name: stepName, durationMs: 0, steps: [] };
      (stack.length ? stack[stack.length - 1].steps : steps).push(node);
      stack.push(node);
      const t0 = performance.now();
      try {
        return await fn();
      } catch (e) {
        node.error = (e as Error)?.message ?? String(e);
        throw e;
      } finally {
        node.durationMs = performance.now() - t0;
        stack.pop();
      }
    },
  };
  return { ctx, controller };
}

/**
 * Construct each suite once — that runs the decorators' initializers, which
 * populate the registries — and keep the ones that actually declare tests. The
 * instance is reused to run that suite's cases.
 */
function prepareSuites(suites: AnyCtor[]): Prepared[] {
  return suites
    .map((Suite): Prepared | undefined => {
      const instance = new (Suite as new () => SuiteInstance)();
      // Field-initializer injection: a field holding a `Fixture.get()` marker is
      // registered as an injection (by its field name), so the per-test resolver
      // fills it just like an `@Test.use` field.
      for (const key of Object.keys(instance)) {
        const v = (instance as Meta)[key];
        if (isGetMarker(v)) {
          const arr = injectsOf(Suite as Function);
          if (!arr.some((i) => i.key === key)) arr.push({ key, fixture: v[FIXTURE_GET] });
        }
      }
      const meta = readSuiteMeta(Suite);
      if (!meta || meta.tests.length === 0) return undefined;
      const suiteName = (Suite as { suiteName?: string }).suiteName ?? (Suite as { name: string }).name;
      return { Suite, instance, meta, suiteName };
    })
    .filter((p): p is Prepared => p !== undefined);
}

/** `only`: if any case anywhere is marked `only`, restrict the run to those. */
const computeHasOnly = (prepared: Prepared[]): boolean => prepared.some((p) => p.meta.tests.some((t) => t.only));

/** Run plugins' run-level `setup` (in registration order). */
async function pluginSetup(plugins: TestPlugin[], api: PluginApi): Promise<void> {
  for (const p of plugins) await p.setup?.(api);
}
/** Run plugins' run-level `teardown` (reverse order, like a resource stack). */
async function pluginTeardown(plugins: TestPlugin[], api: PluginApi): Promise<void> {
  for (let i = plugins.length - 1; i >= 0; i--) {
    try {
      await plugins[i].teardown?.(api);
    } catch (e) {
      console.error("plugin teardown failed:", e);
    }
  }
}

/** Run the plugin `runTest` middleware chain around the test body. Plugins
 *  compose in registration order; innermost is the body. A plugin that doesn't
 *  care just calls `next()` once (a benchmark plugin loops it). */
function runWithPlugins(
  plugins: TestPlugin[],
  base: Omit<TestExecution, "next">,
  body: () => Promise<void>,
): Promise<void> {
  const dispatch = (i: number): Promise<void> => {
    for (let j = i; j < plugins.length; j++) {
      const plugin = plugins[j];
      if (!plugin.runTest) continue;
      const exec: TestExecution = { ...base, next: () => dispatch(j + 1) };
      return Promise.resolve(plugin.runTest(exec)).then(() => {});
    }
    return body();
  };
  return dispatch(0);
}

/** Race `p` against a `ms` deadline. On timeout, abort `controller` with a
 *  `TimeoutError` reason (so `ctx.signal` consumers cancel) and reject with it.
 *  `ms <= 0` means no timeout — `p` is returned unwrapped. */
function withTimeout<T>(p: Promise<T>, ms: number, controller: AbortController): Promise<T> {
  if (!ms || ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`test timed out after ${ms}ms`);
      err.name = "TimeoutError";
      controller.abort(err);
      reject(err);
    }, ms);
    if (typeof (timer as { unref?: () => void }).unref === "function") (timer as { unref: () => void }).unref();
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Execute prepared suites against a dispatcher. Owns one "run"-scope cache, so
 * each call (sequential run, parallel lane, or worker) gets its own run scope —
 * exactly like Playwright's worker-scoped fixtures. Emits suite/test events
 * only; the caller frames the run with onRunStart / onRunEnd + the summary.
 */
async function executeSuites(
  prepared: Prepared[],
  dispatcher: Dispatcher,
  hasOnly: boolean,
  plugins: TestPlugin[] = [],
  runCtx: RunContext = SEQUENTIAL,
  // LIVE channel for onProgress. In parallel, `dispatcher` is a per-lane buffer
  // (replayed at the end), so progress is emitted here to the REAL reporters
  // instead — letting an interactive reporter show per-lane status as it happens.
  live: (event: string, payload?: unknown) => Promise<void> = (event, payload) => dispatcher.emit(event, payload),
  seed?: Record<string, unknown>,
  defaultTimeout = 0,
): Promise<{ results: TestResult[]; teardownErrors: unknown[] }> {
  const results: TestResult[] = [];
  const runCache = newScopeCache();
  const teardownErrors: unknown[] = [];
  const onTeardownError = (e: unknown) => teardownErrors.push(e);

  for (const { Suite, instance, meta, suiteName } of prepared) {
    const cases = meta.tests.filter((t) => !hasOnly || t.only);
    if (cases.length === 0) continue;

    await dispatcher.emit("onSuiteStart", { suite: suiteName, total: cases.length } satisfies SuiteInfo);

    const suiteCache = newScopeCache();
    const injects = readInjects(Suite);

    const beforeAllOk = await runHooks(instance, meta.beforeAll);
    for (const tc of cases) {
      const info: TestInfo = { suite: suiteName, name: tc.name };
      // One mutable context per test, shared by beforeEach → body → afterEach and
      // handed to reporters on onTestStart (the extension point for plugins).
      const { ctx, controller } = createTestContext(suiteName, tc.name, runCtx, seed);
      await dispatcher.emit("onTestStart", ctx);
      await live("onProgress", { run: runCtx, phase: "testStart", suite: suiteName, name: tc.name } satisfies ProgressEvent);
      const testCache = newScopeCache();
      const t0 = performance.now();
      let status: TestStatus = "passed";
      let error: Error | undefined;

      // Conditional skip: a `skip` predicate runs now, with the context (so it can
      // branch on ctx.run / ctx.metadata params / env). A thrown predicate fails.
      let skip = false;
      let skipReason = "";
      try {
        const decision = typeof tc.skip === "function" ? tc.skip(ctx) : tc.skip ?? false;
        if (typeof decision === "string") {
          skip = decision.length > 0;
          skipReason = decision;
        } else {
          skip = !!decision;
        }
      } catch (e) {
        status = "failed";
        error = e as Error;
      }

      if (status === "failed") {
        // skip predicate threw → already failed; don't run the body.
      } else if (skip || beforeAllOk !== true) {
        status = skip ? "skipped" : "failed";
        error = skip ? undefined : (beforeAllOk as Error);
        if (skip && skipReason) ctx.annotate("skip", skipReason);
      } else {
        try {
          const caches: ScopeCaches = { run: runCache, suite: suiteCache, test: testCache };
          for (const inj of injects) (instance as Meta)[inj.key] = await resolveFixture(inj.fixture, caches, new Set());
          await runOrThrow(instance, meta.beforeEach, ctx);
          // Data-driven case → call with (input, ctx); resolve the input once so a
          // looping plugin (benchmark) reuses the same value across iterations.
          const args = tc.input ? [tc.input(), ctx] : [ctx];
          // The body runs through the plugin middleware chain (no plugins → it
          // just runs once). A plugin (e.g. @youneed/test-plugin-benchmark) may loop it.
          activeContext = ctx; // so Test.step(...) targets this test
          try {
            // A per-case `timeout` (or the run-level default) bounds the whole body
            // — including any plugin loop (benchmark) — and aborts `ctx.signal`.
            await withTimeout(
              runWithPlugins(
                plugins,
                // Plugin events use the LIVE channel (like onProgress), so a plugin's
                // custom events fire in real time even during a parallel run.
                { ctx, instance: instance as Record<string, unknown>, suite: Suite, key: tc.key, emit: live },
                async () => {
                  await instance[tc.key](...args);
                },
              ),
              tc.timeout ?? defaultTimeout,
              controller,
            );
          } finally {
            activeContext = undefined;
          }
        } catch (e) {
          status = "failed";
          error = e as Error;
        }
        // afterEach + test-scope teardown always run.
        try {
          await runOrThrow(instance, meta.afterEach, ctx);
        } catch (e) {
          if (status === "passed") {
            status = "failed";
            error = e as Error;
          }
        }
        await teardownScope(testCache, onTeardownError);
        restoreAllSpies(); // un-patch any spyOn() left active by this test
      }

      // The test is done: abort `ctx.signal` (unless a timeout already did) so
      // anything tied to it — fetches, listeners, intervals — is torn down.
      if (!controller.signal.aborted) controller.abort(new Error("test finished"));

      const result: TestResult = { ...info, status, durationMs: performance.now() - t0, error };
      if (ctx.annotations.length) result.annotations = ctx.annotations;
      if (ctx.steps.length) result.steps = ctx.steps;
      // metadata rides on the result only when it carries something (attachments,
      // plugin output like metadata.benchmark, or any custom field) — keeps lean
      // results and small blobs.
      if (ctx.metadata.attachments.length || Object.keys(ctx.metadata).length > 1) result.metadata = ctx.metadata;
      results.push(result);
      await dispatcher.emit("onTestEnd", result);
      await live("onProgress", { run: runCtx, phase: "testEnd", suite: suiteName, name: tc.name, status } satisfies ProgressEvent);
    }
    await runHooks(instance, meta.afterAll);
    await teardownScope(suiteCache, onTeardownError);
    await dispatcher.emit("onSuiteEnd", { suite: suiteName, total: cases.length } satisfies SuiteInfo);
  }

  await teardownScope(runCache, onTeardownError);
  return { results, teardownErrors };
}

/** Sequential, single-lane run (also used by each forked worker). */
async function runSuites(
  suites: AnyCtor[],
  dispatcher: Dispatcher,
  opts?: RunOptions,
  plugins: TestPlugin[] = [],
  runCtx: RunContext = SEQUENTIAL,
  seed?: Record<string, unknown>,
  defaultTimeout = 0,
): Promise<RunSummary> {
  const prepared = prepareSuites(suites);
  const hasOnly = computeHasOnly(prepared);
  const runStart = performance.now();
  await dispatcher.emit("onRunStart", undefined);
  const api: PluginApi = { emit: (e, p) => dispatcher.emit(e, p) };
  await pluginSetup(plugins, api);
  try {
    // Single lane → the dispatcher IS the live channel, so onProgress fires live.
    const { results, teardownErrors } = await executeSuites(prepared, dispatcher, hasOnly, plugins, runCtx, undefined, seed, defaultTimeout);
    for (const e of teardownErrors) console.error("fixture teardown failed:", e);
    const summary = summarize(results, performance.now() - runStart);
    await dispatcher.emit("onRunEnd", summary);
    if ((opts?.setExitCode ?? true) && summary.failed > 0) process.exitCode = 1;
    return summary;
  } finally {
    await pluginTeardown(plugins, api);
  }
}

/** Split `items` into `n` lanes round-robin (caller pre-sorts for determinism). */
function partition<T>(items: T[], n: number): T[][] {
  const lanes: T[][] = Array.from({ length: n }, () => []);
  items.forEach((item, i) => lanes[i % n].push(item));
  return lanes;
}

/**
 * In-process parallel run: suites are split across `n` async lanes that execute
 * concurrently (no child processes — great for I/O-bound async tests). Each lane
 * buffers its canonical events in memory; afterwards they're merged in lane order
 * and replayed through the real reporters as ONE coherent run, so the per-test
 * output isn't interleaved. Meanwhile a LIVE `onProgress` event is emitted to the
 * real reporters as each test starts/ends, tagged with its lane — so an
 * interactive reporter can show what's running where in real time. Each lane has
 * its own "run"-scope cache.
 */
async function runSuitesParallel(
  suites: AnyCtor[],
  reporters: ReporterRef[],
  n: number,
  opts?: RunOptions,
  plugins: TestPlugin[] = [],
  shard?: { current: number; total: number },
  seed?: Record<string, unknown>,
  defaultTimeout = 0,
): Promise<RunSummary> {
  const prepared = prepareSuites(suites).sort((a, b) => a.suiteName.localeCompare(b.suiteName));
  const hasOnly = computeHasOnly(prepared);
  const lanes = partition(prepared, n).filter((lane) => lane.length > 0);
  const live = buildDispatcher(reporters); // the REAL reporters

  const start = performance.now();
  await live.emit("onRunStart", undefined);
  const api: PluginApi = { emit: (e, p) => live.emit(e, p) };
  await pluginSetup(plugins, api); // once, before all lanes (shared run-global resources)
  try {
    const laneOut = await Promise.all(
      lanes.map(async (lane, i) => {
        const records: BlobRecord[] = [];
        const dispatcher = new Dispatcher();
        dispatcher.add(new MemoryReporter(records));
        dispatcher.seal();
        const runCtx: RunContext = { mode: "parallel", lane: i, lanes: lanes.length, shard };
        // canonical events → buffered; onProgress → live (real reporters).
        const { teardownErrors } = await executeSuites(lane, dispatcher, hasOnly, plugins, runCtx, (e, p) => live.emit(e, p), seed, defaultTimeout);
        return { records, teardownErrors };
      }),
    );

    for (const lane of laneOut) for (const e of lane.teardownErrors) console.error("fixture teardown failed:", e);

    // Replay the buffered streams in lane order for clean, ordered onTest* output
    // (onRunStart was already emitted live above; don't repeat it).
    const results: TestResult[] = [];
    for (const rec of laneOut.flatMap((lane) => lane.records)) {
      const payload = rec.event === "onTestEnd" ? decodeResult(rec.payload as TestResult & { error?: SerializedError }) : rec.payload;
      if (rec.event === "onTestEnd") results.push(payload as TestResult);
      await live.emit(rec.event, payload);
    }
    const summary = summarize(results, performance.now() - start);
    await live.emit("onRunEnd", summary);
    if ((opts?.setExitCode ?? true) && summary.failed > 0) process.exitCode = 1;
    return summary;
  } finally {
    await pluginTeardown(plugins, api);
  }
}

function summarize(results: TestResult[], durationMs: number): RunSummary {
  return {
    total: results.length,
    passed: results.filter((r) => r.status === "passed").length,
    failed: results.filter((r) => r.status === "failed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    durationMs,
    results,
  };
}

/** Run hooks, swallowing nothing — returns `true` or the first Error thrown.
 *  `ctx` is passed to per-test hooks (beforeEach/afterEach); suite hooks get none. */
async function runHooks(instance: SuiteInstance, keys: string[], ctx?: TestContext): Promise<true | Error> {
  try {
    await runOrThrow(instance, keys, ctx);
    return true;
  } catch (e) {
    return e as Error;
  }
}
async function runOrThrow(instance: SuiteInstance, keys: string[], ctx?: TestContext): Promise<void> {
  for (const key of keys) await instance[key](ctx);
}
