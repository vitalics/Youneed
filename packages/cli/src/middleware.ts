// @youneed/cli — the command middleware contract.
//
// This is the CLI twin of @youneed/dom's component `providers`: a middleware is
// a small object with an `install(ctx)` method that augments the command
// instance with a new typed member (`this.logger`, `this.color`, `this.env`).
// Its phantom `__contributes` type is folded into the command's `this` so the
// member is typed without any declaration on the user's part. Installation
// happens after options are parsed and before `execute` runs, so middleware can
// react to flags (e.g. `--no-color`, `--verbose`).

import type { UnionToIntersection } from "./types.ts";

/** What a middleware's `install` receives. */
export interface MiddlewareContext {
  /** The command instance — augment it via {@link contribute}. */
  readonly command: object;
  /** Parsed options for this run (same object as `this.options`). */
  readonly options: Record<string, unknown>;
  /** Positional arguments for this run. */
  readonly args: readonly string[];
  /** Program-level facts middleware may want (name, version). */
  readonly program: { readonly name: string; readonly version?: string };
  /** Register a teardown to run after the command settles (LIFO order). */
  onCleanup(fn: () => void | Promise<void>): void;
  /**
   * Track a `Disposable`/`AsyncDisposable` so it's disposed at teardown, and
   * return it — e.g. `const log = ctx.use(createLogger())`. Sugar over
   * {@link MiddlewareContext.onCleanup} for resources that already implement
   * the disposal protocol.
   */
  use<T extends Disposable | AsyncDisposable>(resource: T): T;
}

/**
 * A command middleware. `Contributes` is the shape this middleware adds to the
 * command instance — e.g. `CliMiddleware<{ readonly logger: Logger }>`.
 */
export interface CliMiddleware<Contributes = {}> {
  /** Optional name, for diagnostics. */
  readonly name?: string;
  /**
   * Install onto a fresh command instance for one run. May return a
   * `Disposable`/`AsyncDisposable` (disposed at teardown) — handy when the
   * contributed value itself owns the resource (e.g. a logger that closes its
   * transports). Use {@link MiddlewareContext.onCleanup}/`use` for anything more.
   */
  install(ctx: MiddlewareContext): void | Disposable | AsyncDisposable;
  /** Phantom: the members this middleware adds. Never read at runtime. */
  readonly __contributes?: Contributes;
}

type ContribOf<M> = M extends CliMiddleware<infer C> ? C : {};

/** The intersection of every middleware's contribution (`{}` when there are none). */
export type MiddlewareContributions<M extends readonly CliMiddleware[]> = M extends readonly []
  ? {}
  : UnionToIntersection<ContribOf<M[number]>>;

/**
 * Attach a contributed member to a command instance. Non-enumerable, like the
 * dom provider pattern, so it doesn't leak into `Object.keys`/serialization.
 * Returns the value for convenience.
 */
export function contribute<T>(command: object, key: string, value: T): T {
  Object.defineProperty(command, key, { configurable: true, value });
  return value;
}
