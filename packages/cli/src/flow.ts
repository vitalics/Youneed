// @youneed/cli — control-flow directives, the terminal port of @youneed/dom's
// `flow`. The whole point: a command's `render()` reads like the dom one, so a
// migration is near-seamless.
//
//   render() {
//     return text`
//   ${flow.if(this.options.verbose, () => text`verbose mode`)}
//   ${flow.switch(this.status, { ok: () => "✓", fail: () => "✗", default: () => "?" })}
//   ${flow.await(this.config, { pending: () => "loading…", then: (c) => c.name })}
//   `;
//   }
//
// The pure helpers (`when`/`If`/`Switch`/`For`/`While`/`map`) are plain functions —
// only the taken branch runs, and they return values the template stringifies.
// `flow.await` is the one stateful directive: it tracks a promise against the
// current render host (see context.ts), repainting when it settles.

import { currentHost } from "./context.ts";
import { TASK_BRAND, type ReactiveHost } from "./task.ts";

// ── Pure branching ───────────────────────────────────────────────────────────

/** Conditional render — lazy, only the taken branch runs. Alias of {@link If}. */
export function when<T>(condition: unknown, then: () => T, otherwise?: () => T): T | "" {
  return condition ? then() : otherwise ? otherwise() : "";
}

/** The if/else of a template (capitalised — `if` is reserved). Lazy. */
export function If<T>(condition: unknown, then: () => T, otherwise?: () => T): T | "" {
  return condition ? then() : otherwise ? otherwise() : "";
}

/** The switch of a template: match `value` against `cases`, else `default`. Lazy. */
export function Switch<K extends PropertyKey, T>(
  value: K,
  cases: Partial<Record<K, () => T>> & { default?: () => T },
): T | "" {
  const branch = (cases as Record<PropertyKey, (() => T) | undefined>)[value] ?? cases.default;
  return branch ? branch() : "";
}

/** Render a numeric range — the for-loop of a template. */
export function For<T>(start: number, end: number, produce: (index: number) => T): T[];
export function For<T>(
  start: number,
  end: number,
  step: number,
  produce: (index: number) => T,
): T[];
export function For<T>(
  start: number,
  end: number,
  stepOrProduce: number | ((index: number) => T),
  produce?: (index: number) => T,
): T[] {
  const step = typeof stepOrProduce === "number" ? stepOrProduce : 1;
  const fn = (typeof stepOrProduce === "number" ? produce : stepOrProduce) as (i: number) => T;
  const out: T[] = [];
  if (step === 0) return out;
  for (let i = start; step > 0 ? i < end : i > end; i += step) out.push(fn(i));
  return out;
}

/** Render while a predicate holds — the while-loop of a template (guarded at 1e6). */
export function While<T>(condition: (index: number) => unknown, produce: (index: number) => T): T[] {
  const out: T[] = [];
  for (let i = 0; condition(i); i++) {
    if (i >= 1_000_000) {
      throw new RangeError("While: exceeded 1e6 iterations — is the condition ever false?");
    }
    out.push(produce(i));
  }
  return out;
}

/** Map an iterable to results (non-keyed). */
export function map<T>(
  items: Iterable<T> | null | undefined,
  fn: (item: T, index: number) => unknown,
): unknown[] {
  const out: unknown[] = [];
  if (items) {
    let i = 0;
    for (const item of items) out.push(fn(item, i++));
  }
  return out;
}

// ── await: render a promise's settled state ──────────────────────────────────

/** Branches for the three states of an awaited value. Lazy — only one runs. */
export interface AwaitHandlers<T = unknown, R = unknown> {
  /** Resolved — receives the awaited value. */
  then?: (value: T) => R;
  /** Not settled yet — the loading state. */
  pending?: () => R;
  /** Rejected — receives the error. */
  catch?: (error: unknown) => R;
}

/** Brand for an {@link Await} result; resolved by the template stringifier. */
const AWAIT: unique symbol = Symbol.for("@youneed/cli.await");

/** The directive object returned by {@link Await}. */
export interface AwaitResult {
  readonly [AWAIT]: true;
  readonly input: unknown;
  readonly handlers: AwaitHandlers;
}

/** True if `value` is an {@link AwaitResult}. */
export function isAwaitResult(value: unknown): value is AwaitResult {
  return typeof value === "object" && value !== null && (value as AwaitResult)[AWAIT] === true;
}

/**
 * Type-level guard rejecting a {@link Task}: a task self-renders, so awaiting it
 * loops. Read `task.pending`/`value`/`error` (e.g. with `flow.if`) instead, or
 * await a plain stored promise.
 */
type RejectTask<T> = T extends { readonly [TASK_BRAND]: unknown }
  ? {
      readonly ["✗ flow.await does not accept a Task — read task.pending/value/error instead, or await a plain stored promise."]: never;
    }
  : unknown;

/**
 * Render a promise's settled state inline — the `await` of a template. Shows
 * `pending()` until it settles, then `then(value)` or `catch(error)`. Tracks the
 * promise against the current render host: it repaints when it settles and keeps
 * the command's run alive until then. Pass a *stable* promise (a field, or
 * `task.run()`'s stored result) — a fresh promise per render re-subscribes.
 */
export function Await<T, R = unknown>(
  input: T & RejectTask<T>,
  handlers: AwaitHandlers<Awaited<T>, R>,
): AwaitResult {
  return { [AWAIT]: true, input, handlers: handlers as AwaitHandlers };
}

interface AwaitState {
  status: "pending" | "fulfilled" | "rejected";
  value?: unknown;
  error?: unknown;
}

const HOST_STATES = new WeakMap<ReactiveHost, WeakMap<object, AwaitState>>();

function isTaskLike(value: unknown): boolean {
  return (
    value != null &&
    (typeof value === "object" || typeof value === "function") &&
    (value as Record<PropertyKey, unknown>)[TASK_BRAND] === true
  );
}

/**
 * Resolve an {@link AwaitResult} to the renderable for its current state,
 * subscribing on first sight. Called by the template stringifier — not part of
 * the public API. Returns the pending branch (untracked) when there's no host.
 */
export function resolveAwait(result: AwaitResult): unknown {
  const { input, handlers } = result;
  if (isTaskLike(input)) {
    throw new Error(
      "flow.await: received a Task. A task triggers its own re-renders, so awaiting it loops — " +
        "read its pending/value/error directly (e.g. with flow.if), or await a plain stored promise.",
    );
  }

  const host = currentHost();
  const thenable =
    typeof input === "object" && input !== null && typeof (input as PromiseLike<unknown>).then === "function";

  // No host (used outside a render) or a non-thenable value: best-effort.
  if (!host || !thenable) {
    if (!thenable) return handlers.then?.(input);
    return handlers.pending?.();
  }

  let cache = HOST_STATES.get(host);
  if (!cache) HOST_STATES.set(host, (cache = new WeakMap()));
  let state = cache.get(input as object);
  if (!state) {
    state = { status: "pending" };
    cache.set(input as object, state);
    const tracker = {
      get pending(): boolean {
        return state!.status === "pending";
      },
    };
    host.registerTask?.(tracker);
    Promise.resolve(input as PromiseLike<unknown>)
      .then(
        (value) => {
          state!.value = value;
          state!.status = "fulfilled";
        },
        (error) => {
          state!.error = error;
          state!.status = "rejected";
        },
      )
      .finally(() => host.requestUpdate());
  }

  if (state.status === "pending") return handlers.pending?.();
  if (state.status === "rejected") return handlers.catch?.(state.error);
  return handlers.then?.(state.value);
}

/**
 * The control-flow helpers under their natural keyword names — `flow.if`,
 * `flow.switch`, `flow.while`, `flow.for` work because reserved words are legal
 * as property names. One import, dom-compatible spelling.
 */
export const flow = {
  when,
  map,
  if: If,
  switch: Switch,
  while: While,
  for: For,
  await: Await,
} as const;
