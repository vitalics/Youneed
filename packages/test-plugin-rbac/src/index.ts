// ── @youneed/test-plugin-rbac — deterministic RBAC in @youneed/test ──
//
// Authorization is stateful, and state leaks between tests: one case calls
// `setRole(...)` to grant `editor` a new permission, the next inherits it, and
// now your suite passes or fails depending on order. This package makes RBAC
// DETERMINISTIC per test — a fresh `RBAC` engine each case, so any `setRole(...)`
// a test applies is GONE for the next one — plus ergonomic `Subject` builders,
// throwing `expectCan` / `expectCannot` assertions, and a scoped `withRole(...)`
// for role experiments that restore afterwards.
//
//   import { Test, TestApplication } from "@youneed/test";
//   import { rbacFixture, subject, expectCan, expectCannot, withRole } from "@youneed/test-plugin-rbac";
//   import { owns, type RBAC } from "@youneed/rbac";
//
//   const Rbac = rbacFixture((role) => {
//     role("viewer").can("read", "post");
//     role("editor").inherits("viewer").can("update", "post");
//   });
//
//   class Posts extends Test() {
//     @Test.use(Rbac) rbac!: RBAC;   // …or: rbac = Rbac.get();
//
//     @Test.it("editor can update, viewer cannot") perms() {
//       expectCan(this.rbac, subject(["editor"]), "update", "post");
//       expectCannot(this.rbac, subject(["viewer"]), "update", "post");
//     }
//
//     @Test.it("a scoped role experiment restores after the block") scoped() {
//       withRole(this.rbac, { name: "viewer", permissions: [{ action: "delete", resource: "post" }] }, () => {
//         expectCan(this.rbac, subject(["viewer"]), "delete", "post"); // granted inside
//       });
//       expectCannot(this.rbac, subject(["viewer"]), "delete", "post"); // restored
//     }
//   }
//
//   TestApplication().addTests(Posts).run();

import { AssertionError, Fixture, type FixtureClass, type FixtureScope } from "@youneed/test";
import {
  createRBAC,
  RBAC,
  type Action,
  type Condition,
  type Resource,
  type RoleBuilder,
  type RoleDefinition,
  type Subject,
} from "@youneed/rbac";

/** The `createRBAC` builder callback shape — `(role) => { role("x").can(...); }`. */
export type RBACBuilder = (role: (name: string) => RoleBuilder) => void;

export interface RBACFixtureOptions {
  /** Display name (defaults to `"rbac"`). */
  name?: string;
  /**
   * Fixture scope (default `"test"`). Keep `"test"` for determinism — every case
   * gets a brand-new engine, so any `setRole(...)` a test applies can NEVER leak
   * into the next test. A wider scope (`"suite"`/`"run"`) shares one engine; the
   * `teardown` restores the original role set when that scope ends, but cases
   * within it share state.
   */
  scope?: FixtureScope;
}

/**
 * Build a {@link https://…|@youneed/test} fixture that provides a fresh
 * {@link RBAC} engine to each test. Consume it with `@Test.use(Fix)` or
 * decorator-free via `Fix.get()`.
 *
 * Because the default scope is `"test"`, a new engine is constructed for every
 * case — so any `setRole(...)` a test applies is GONE for the next one, no manual
 * reset needed. `teardown` additionally restores the original role definitions on
 * the resolved engine (belt-and-braces, and the meaningful reset when you opt into
 * a wider scope).
 *
 * @param defs Role definitions or a `createRBAC` builder callback the engine
 *             starts with. A fresh engine is built per resolution, so tests never
 *             share state.
 */
export function rbacFixture(
  defs: RoleDefinition[] | RBACBuilder = [],
  opts: RBACFixtureOptions = {},
): FixtureClass<RBAC> {
  // Snapshot the ORIGINAL role set once so teardown can restore a shared-scope
  // engine to its pristine shape regardless of what a case mutated.
  const original = () => cloneRoles(createRBAC(defs as never).roles());

  class RBACFixture extends Fixture<RBAC>({
    name: opts.name ?? "rbac",
    scope: opts.scope ?? "test",
  }) {
    override setup(): RBAC {
      // A brand-new engine per resolution: role defs are rebuilt from scratch —
      // the root of the per-test determinism guarantee.
      return createRBAC(defs as never);
    }

    teardown(rbac: RBAC): void {
      // Restore the original role set. For test-scope this is redundant (the
      // instance is discarded), but it's the real reset for wider scopes and
      // keeps the contract honest regardless of scope.
      restoreRoles(rbac, original());
    }
  }
  return RBACFixture as unknown as FixtureClass<RBAC>;
}

// ── Subject builders ──────────────────────────────────────────────────────────

/** Normalize anything Subject-ish into a {@link Subject} (identity for a real one). */
export function asSubject(subject: Subject): Subject {
  return subject;
}

/** Extra optional {@link Subject} fields beyond its roles. */
export interface SubjectExtra {
  id?: string;
  attributes?: Record<string, unknown>;
}

/**
 * Ergonomic {@link Subject} builder for tests:
 *
 *   subject(["editor"], { id: "u1" });
 *   subject("admin");                          // single role → one-element roles[]
 *   subject(["viewer"], { attributes: { plan: "pro" } });
 */
export function subject(roles: string | string[], extra: SubjectExtra = {}): Subject {
  return {
    roles: Array.isArray(roles) ? [...roles] : [roles],
    ...(extra.id !== undefined ? { id: extra.id } : {}),
    ...(extra.attributes !== undefined ? { attributes: extra.attributes } : {}),
  };
}

// ── assertions ────────────────────────────────────────────────────────────────

const describe = (subject: Subject, action: Action, resource: Resource, instance?: Record<string, unknown>): string =>
  `${JSON.stringify(subject.roles)}${subject.id ? ` (id ${subject.id})` : ""} → ${action} on ${resource}` +
  (instance ? ` ${JSON.stringify(instance)}` : "");

/**
 * Ergonomic assertion: throw an `AssertionError` unless `rbac.can(...)` grants.
 * Sugar over `expect(rbac.can(...)).toBeTruthy()` with a message that names the
 * subject/action/resource and the engine's decision `reason`.
 *
 * `@youneed/test`'s `expect` matcher set is fixed (extra matchers come from
 * swapping the `expect` import, not a register API), so this is a plain
 * `AssertionError`-throwing helper rather than a custom matcher — usable inside
 * any `@Test.it` regardless of which `expect` is imported.
 */
export function expectCan(
  rbac: RBAC,
  subject: Subject,
  action: Action,
  resource: Resource,
  instance?: Record<string, unknown>,
): void {
  const result = rbac.check(subject, action, resource, instance);
  if (!result.granted) {
    throw new AssertionError(
      `expected access GRANTED for ${describe(subject, action, resource, instance)}, but it was denied (reason: ${result.reason})`,
    );
  }
}

/** The inverse of {@link expectCan}: throw unless `rbac.can(...)` is denied. */
export function expectCannot(
  rbac: RBAC,
  subject: Subject,
  action: Action,
  resource: Resource,
  instance?: Record<string, unknown>,
): void {
  const result = rbac.check(subject, action, resource, instance);
  if (result.granted) {
    throw new AssertionError(
      `expected access DENIED for ${describe(subject, action, resource, instance)}, but it was granted (reason: ${result.reason}${result.by ? `, by role "${result.by.role}"` : ""})`,
    );
  }
}

// ── scoped role experiments ─────────────────────────────────────────────────────

/**
 * Run `fn` with `def` applied to `rbac` (adding a new role or overriding an
 * existing one), restoring the PRIOR role set afterwards — even if `fn` throws.
 *
 * A role that existed before is restored to its exact prior definition; a role
 * that was newly introduced by `def` is neutralized back to an empty-permission
 * role (so it grants nothing, as if absent — the engine exposes no delete API).
 *
 * Synchronous `fn` runs and restores synchronously; an async `fn` (returning a
 * Promise) is awaited and restored in a `finally`. The return type follows `fn`.
 *
 *   withRole(rbac, { name: "auditor", permissions: [{ action: "read", resource: "*" }] }, () => { … });
 *   await withRole(rbac, def, async () => { … });
 */
export function withRole<R>(rbac: RBAC, def: RoleDefinition, fn: () => R): R;
export function withRole<R>(rbac: RBAC, def: RoleDefinition, fn: () => Promise<R>): Promise<R>;
export function withRole<R>(rbac: RBAC, def: RoleDefinition, fn: () => R | Promise<R>): R | Promise<R> {
  const before = cloneRoles(rbac.roles());
  const existedBefore = before.some((r) => r.name === def.name);
  const restore = () => {
    if (existedBefore) restoreRoles(rbac, before);
    // Role was newly introduced by `def`: neutralize it (no delete API), so it
    // grants nothing on subsequent checks — behaviourally as if it never existed.
    else rbac.setRole({ name: def.name, permissions: [] });
  };

  rbac.setRole(cloneRole(def));

  let result: R | Promise<R>;
  try {
    result = fn();
  } catch (err) {
    restore();
    throw err;
  }
  if (result instanceof Promise) {
    return result.then(
      (v) => {
        restore();
        return v;
      },
      (err) => {
        restore();
        throw err;
      },
    );
  }
  restore();
  return result;
}

// ── internals ─────────────────────────────────────────────────────────────────

/** Deep-ish clone of a role def so callers can't mutate the engine's copy. */
function cloneRole(role: RoleDefinition): RoleDefinition {
  return {
    name: role.name,
    ...(role.inherits ? { inherits: [...role.inherits] } : {}),
    permissions: role.permissions.map((p) => ({ ...p })),
  };
}

const cloneRoles = (roles: RoleDefinition[]): RoleDefinition[] => roles.map(cloneRole);

/** Re-set every role in `snapshot` onto `rbac`, restoring its prior definitions. */
function restoreRoles(rbac: RBAC, snapshot: RoleDefinition[]): void {
  for (const role of snapshot) rbac.setRole(cloneRole(role));
}

export { RBAC, createRBAC };
export type { Action, Condition, Resource, RoleBuilder, RoleDefinition, Subject };
