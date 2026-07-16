// ── @youneed/dom-provider-rbac — authorization gating inside @youneed/dom ─────────
//
// Evaluate an `@youneed/rbac` engine straight from an `html` template, gating UI
// on what the CURRENT SUBJECT may do, and have the component re-render when the
// subject changes (a login, a role switch):
//
//   import { Component, html, when } from "@youneed/dom";
//   import { createRBAC } from "@youneed/rbac";
//   import { provideRBAC, can, setSubject } from "@youneed/dom-provider-rbac";
//
//   provideRBAC(createRBAC((role) => {
//     role("editor").can(["create", "update"], "post");
//   }));
//   setSubject({ roles: ["editor"], id: "u1" });
//
//   class PostView extends Component() {
//     render() {
//       return when(can("update", "post", this.post), () => html`<button>Edit</button>`);
//     }
//   }
//
// `can(action, resource, instance?)` reads the app-wide engine set by
// `provideRBAC(...)` and evaluates it against the current subject installed by
// `setSubject(...)` — it returns a boolean, so it drops into any template hole.
//
// `@youneed/rbac`'s core has no `onChange`: authorization decisions change when
// the SUBJECT changes (login / role switch), so `setSubject(...)` is what drives
// re-render. Reactivity is opt-in per component via the `rbacProvider` slot
// (recommended) — it puts a scoped `this.can` on the component and re-renders it
// whenever the subject changes, auto-unsubscribing on disconnect.

import type { ComponentProvider } from "@youneed/dom";
import { RBAC, type Action, type Resource, type Subject, type AccessContext, type AccessResult, type Condition, type Permission, type RoleDefinition } from "@youneed/rbac";

export { RBAC };
export type { Action, Resource, Subject, AccessContext, AccessResult, Condition, Permission, RoleDefinition };

/** Minimal host surface `withRbacReactivity` needs — satisfied by any
 *  `@youneed/dom` component (`ReactiveHost`). */
export interface RbacHost {
  requestUpdate(): void;
  onCleanup(teardown: () => void): void;
}

/** An empty subject — no roles, so it can do nothing until `setSubject(...)`. */
const EMPTY_SUBJECT: Subject = { roles: [] };

/**
 * The provider's contribution, exposed as `this.can`. Each method evaluates
 * against the provider's `subject()` — a scoped view of an {@link RBAC} engine
 * that doesn't need the subject threaded through every call.
 */
export interface RbacApi {
  /** Yes/no: may the current subject perform `action` on `resource` (optionally this `instance`)? */
  can(action: Action, resource: Resource, instance?: Record<string, unknown>): boolean;
  /** Negation of {@link RbacApi.can}. */
  cannot(action: Action, resource: Resource, instance?: Record<string, unknown>): boolean;
  /** Full decision with a reason (for debugging / devtools). */
  check(action: Action, resource: Resource, instance?: Record<string, unknown>): AccessResult;
  /** The subject every `this.can.*` call runs against. */
  subject(): Subject;
  /** All role names the current subject effectively has (self + inherited). */
  roles(): string[];
}

// ── the app-wide engine + current subject ─────────────────────────────────────

let currentEngine: RBAC | undefined;
let currentSubject: Subject = EMPTY_SUBJECT;
const subjectListeners = new Set<() => void>();

/** Install the app-wide RBAC engine that `can(...)` / `rbacProvider(...)` read
 *  from. Returns the instance so you can keep a reference. */
export function provideRBAC<T extends RBAC>(instance: T): T {
  currentEngine = instance;
  return instance;
}

/** The active RBAC engine. Throws if `provideRBAC(...)` hasn't run yet. */
export function getRBAC(): RBAC {
  if (!currentEngine) throw new Error("[rbac-dom] no engine — call provideRBAC(...) first");
  return currentEngine;
}

/**
 * Set the current subject (the logged-in user + roles) that the app-wide
 * `can(...)` accessor and every reactive `this.can` evaluate against. Notifies
 * subscribed components so their gated templates re-render. Returns the subject.
 */
export function setSubject(subject: Subject): Subject {
  currentSubject = subject;
  for (const listen of subjectListeners) listen();
  return subject;
}

/** The current app-wide subject (defaults to `{ roles: [] }` until `setSubject`). */
export function getSubject(): Subject {
  return currentSubject;
}

/** Subscribe to subject changes; returns the unsubscribe. */
function onSubjectChange(listener: () => void): () => void {
  subjectListeners.add(listener);
  return () => subjectListeners.delete(listener);
}

// ── template-hole accessors against the current subject ───────────────────────

/** Yes/no gate for `html` template holes: may the current subject perform
 *  `action` on `resource` (optionally this `instance`)? Evaluated against the
 *  app-wide engine + subject: `when(can("update", "post", post), …)`. */
export function can(action: Action, resource: Resource, instance?: Record<string, unknown>): boolean {
  return getRBAC().can(currentSubject, action, resource, instance);
}

/** Negation of {@link can} — for `html` template holes. */
export function cannot(action: Action, resource: Resource, instance?: Record<string, unknown>): boolean {
  return !can(action, resource, instance);
}

/** Full decision (value + reason) for the current subject — for template holes / devtools. */
export function check(action: Action, resource: Resource, instance?: Record<string, unknown>): AccessResult {
  return getRBAC().check(currentSubject, action, resource, instance);
}

/**
 * Subscribe a component to subject changes: every `setSubject(...)` triggers a
 * `requestUpdate()`, so templates that read `can(...)` re-render for the new
 * user. Unsubscribes automatically on disconnect. Call it once, e.g. in the
 * constructor or `onMount`.
 *
 * Returns the unsubscribe (also registered via `host.onCleanup`).
 */
export function withRbacReactivity(host: RbacHost): () => void {
  const off = onSubjectChange(() => host.requestUpdate());
  host.onCleanup(off);
  return off;
}

// ── rbacProvider — a scoped `this.can` as a Component provider ────────────────
//
// `rbacProvider` plugs into the framework's `Component(tag, { providers: [...] })`
// slot — the DOM analogue of a server `Controller`'s `guards` / `interceptors`.
// It adds a `this.can` bound to a given engine AND a `subject()`, and auto-wires
// reactivity (re-render when the subject changes, cleanup on disconnect):
//
//   class PostCard extends Component("post-card", {
//     providers: [rbacProvider(engine, { subject: () => currentUser })],
//   }) {
//     render() {
//       return when(this.can.can("update", "post", this.post), () => html`<button>Edit</button>`);
//     }
//   }

export interface RbacProviderOptions {
  /** The subject every `this.can.*` call runs against. Called per evaluation, so
   *  it may read live state (current user). Default: the app-wide subject set by
   *  `setSubject(...)` (`{ roles: [] }` until then). */
  subject?: () => Subject;
}

/** A composable `Component` provider adding a scoped `this.can` API bound to an
 *  {@link RBAC} engine + a `subject()`, auto-wiring reactivity (re-render when
 *  the subject changes, cleanup on disconnect). */
export function rbacProvider(engine: RBAC, options: RbacProviderOptions = {}): ComponentProvider<{ readonly can: RbacApi }> {
  const subject = options.subject ?? (() => currentSubject);
  return {
    install(host) {
      const api: RbacApi = {
        can: (action, resource, instance) => engine.can(subject(), action, resource, instance),
        cannot: (action, resource, instance) => engine.cannot(subject(), action, resource, instance),
        check: (action, resource, instance) => engine.check(subject(), action, resource, instance),
        subject: () => subject(),
        roles: () => engine.rolesOf(subject()),
      };
      Object.defineProperty(host, "can", { configurable: true, value: api });
      withRbacReactivity(host as unknown as RbacHost);
    },
  };
}

// ── withRBAC — the same contribution as a base-class mixin ────────────────────
//
// Equivalent to a single `rbacProvider`, in `extends withRBAC(Base, engine)`
// form — handy when you're already chaining mixins:
//
//   class PostCard extends withRBAC(Component("post-card"), engine) {
//     render() { return when(this.can.can("update", "post", this.post), …); }
//   }

/** A constructor that may be `abstract` — so the `Component(...)` factory's
 *  abstract result can be used as a mixin base. */
export type AbstractConstructor<T = object> = abstract new (...args: any[]) => T;

/** What the mixin needs from its base: a reactive `@youneed/dom` component. */
type ReactiveBase = HTMLElement & RbacHost;

/**
 * Mix a scoped `this.can` API onto a Component base, bound to an {@link RBAC}
 * engine + a `subject()`, with reactivity auto-wired. Composition mirrors
 * `Component(tag, Base)`: `withRBAC(Component("x"), engine)` returns a base your
 * component `extends`. Chainable with other mixins.
 */
export function withRBAC<TBase extends AbstractConstructor<ReactiveBase>>(
  Base: TBase,
  engine: RBAC,
  options: RbacProviderOptions = {},
): TBase & AbstractConstructor<{ readonly can: RbacApi }> {
  const provider = rbacProvider(engine, options);
  abstract class WithRBAC extends Base {
    constructor(...args: any[]) {
      super(...args);
      provider.install(this as unknown as ReactiveBase & Parameters<typeof provider.install>[0]);
    }
  }
  return WithRBAC as unknown as TBase & AbstractConstructor<{ readonly can: RbacApi }>;
}
