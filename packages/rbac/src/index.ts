// @youneed/rbac — a tiny, framework-agnostic authorization engine.
//
// Role-based (RBAC) with attribute/ownership conditions (a dash of ABAC), in the
// CASL/Casbin spirit but dependency-free and synchronous. A subject has roles;
// roles grant permissions (action × resource, optionally conditioned on the
// resource instance); role inheritance composes them. `can(...)` answers yes/no;
// explicit `deny` beats `allow`.
//
//   const rbac = createRBAC((can, role) => {
//     role("admin").can("*", "*");                       // superuser
//     role("editor").inherits("viewer")
//       .can(["create", "update"], "post")
//       .can("delete", "post", owns("authorId"));        // only own posts
//     role("viewer").can("read", "post");
//   });
//   rbac.can({ roles: ["editor"], id: "u1" }, "delete", "post", { authorId: "u1" }); // true
//   rbac.can({ roles: ["viewer"] }, "delete", "post");                               // false
//
// Integrations layer on top: @youneed/server-plugin-rbac (guards + this.can),
// @youneed/dom-provider-rbac (UI gating), @youneed/test-plugin-rbac.

/** An action verb — `"read"`, `"update"`, `"*"` for any. */
export type Action = string;
/** A resource type — `"post"`, `"user"`, `"*"` for any. */
export type Resource = string;

/** Who is acting: their roles (+ optional id/attributes for conditions). */
export interface Subject {
  roles: string[];
  id?: string;
  attributes?: Record<string, unknown>;
}

/** What a condition sees when deciding a conditioned permission. */
export interface AccessContext {
  subject: Subject;
  action: Action;
  resource: Resource;
  /** The concrete resource instance being acted on (for ownership/attribute checks). */
  instance?: Record<string, unknown>;
}

/** A predicate gating a permission on the subject + resource instance. */
export type Condition = (ctx: AccessContext) => boolean;

/** One grant (or denial) on a role. */
export interface Permission {
  action: Action | Action[];
  resource: Resource | Resource[];
  /** `"deny"` overrides any `"allow"`. Default `"allow"`. */
  effect?: "allow" | "deny";
  /** Predicate condition (ownership, dynamic). */
  when?: Condition;
  /** Attribute condition: every entry must equal the instance's field. */
  conditions?: Record<string, unknown>;
  /** Field-level restriction (which fields the action may touch). `"*"` / omitted = all. */
  fields?: string[];
}

/** A role and the permissions it grants (plus inherited roles). */
export interface RoleDefinition {
  name: string;
  /** Roles whose permissions this role also gets (transitive, cycle-safe). */
  inherits?: string[];
  permissions: Permission[];
}

/** The outcome of a check — `granted` plus a `reason` for debugging/devtools. */
export interface AccessResult {
  granted: boolean;
  reason: "ALLOW" | "DENY" | "NO_MATCH";
  /** The role + permission that decided it, when granted/denied by a rule. */
  by?: { role: string; effect: "allow" | "deny" };
}

// ── condition helpers ─────────────────────────────────────────────────────────

/** A condition: the subject owns the instance (its `field` equals `subject.id`). */
export function owns(field = "ownerId"): Condition {
  return (ctx) => ctx.instance?.[field] !== undefined && ctx.instance[field] === ctx.subject.id;
}

/** A condition: the instance's `field` matches (equals, or is included by an array). */
export function attr(field: string, value: unknown): Condition {
  return (ctx) => (Array.isArray(value) ? value.includes(ctx.instance?.[field] as never) : ctx.instance?.[field] === value);
}

const asArray = <T>(v: T | T[]): T[] => (Array.isArray(v) ? v : [v]);
const matchesList = (list: string[], value: string): boolean => list.includes("*") || list.includes(value);

function conditionOk(perm: Permission, ctx: AccessContext): boolean {
  if (perm.when && !perm.when(ctx)) return false;
  if (perm.conditions) {
    for (const [k, v] of Object.entries(perm.conditions)) {
      if (Array.isArray(v) ? !v.includes(ctx.instance?.[k] as never) : ctx.instance?.[k] !== v) return false;
    }
  }
  return true;
}

// ── the engine ──────────────────────────────────────────────────────────────

/**
 * The authorization engine. Construct from role definitions (or a builder) and
 * ask `can(subject, action, resource, instance?)`. Explicit deny beats allow;
 * role inheritance is expanded transitively.
 */
export class RBAC {
  #roles = new Map<string, RoleDefinition>();
  #expanded = new Map<string, string[]>(); // role → all roles it resolves to (self + inherited)

  constructor(roles: RoleDefinition[] = []) {
    for (const r of roles) this.#roles.set(r.name, r);
    this.#reindex();
  }

  #reindex(): void {
    this.#expanded.clear();
    for (const name of this.#roles.keys()) this.#expanded.set(name, this.#expand(name, new Set()));
  }

  #expand(name: string, seen: Set<string>): string[] {
    if (seen.has(name)) return []; // cycle guard
    seen.add(name);
    const role = this.#roles.get(name);
    if (!role) return [];
    const out = [name];
    for (const parent of role.inherits ?? []) for (const r of this.#expand(parent, seen)) if (!out.includes(r)) out.push(r);
    return out;
  }

  /** Add/replace a role (re-expands inheritance). */
  setRole(role: RoleDefinition): void {
    this.#roles.set(role.name, role);
    this.#reindex();
  }

  /** All role names a subject effectively has (self + inherited). */
  rolesOf(subject: Subject): string[] {
    const out = new Set<string>();
    for (const r of subject.roles) for (const e of this.#expanded.get(r) ?? [r]) out.add(e);
    return [...out];
  }

  /** Full decision with a reason. Deny wins over allow. */
  check(subject: Subject, action: Action, resource: Resource, instance?: Record<string, unknown>): AccessResult {
    const ctx: AccessContext = { subject, action, resource, instance };
    let allow: { role: string } | undefined;
    for (const roleName of this.rolesOf(subject)) {
      const role = this.#roles.get(roleName);
      if (!role) continue;
      for (const perm of role.permissions) {
        if (!matchesList(asArray(perm.action), action) || !matchesList(asArray(perm.resource), resource)) continue;
        if (!conditionOk(perm, ctx)) continue;
        if ((perm.effect ?? "allow") === "deny") return { granted: false, reason: "DENY", by: { role: roleName, effect: "deny" } };
        if (!allow) allow = { role: roleName };
      }
    }
    return allow ? { granted: true, reason: "ALLOW", by: { role: allow.role, effect: "allow" } } : { granted: false, reason: "NO_MATCH" };
  }

  /** Yes/no: may `subject` perform `action` on `resource` (optionally this `instance`)? */
  can(subject: Subject, action: Action, resource: Resource, instance?: Record<string, unknown>): boolean {
    return this.check(subject, action, resource, instance).granted;
  }

  /** Negation of {@link can}. */
  cannot(subject: Subject, action: Action, resource: Resource, instance?: Record<string, unknown>): boolean {
    return !this.can(subject, action, resource, instance);
  }

  /** Fields the subject may touch for an allowed `action`×`resource` (`"*"` = all). */
  permittedFields(subject: Subject, action: Action, resource: Resource): string[] | "*" {
    const fields = new Set<string>();
    for (const roleName of this.rolesOf(subject)) {
      const role = this.#roles.get(roleName);
      if (!role) continue;
      for (const perm of role.permissions) {
        if ((perm.effect ?? "allow") !== "allow") continue;
        if (!matchesList(asArray(perm.action), action) || !matchesList(asArray(perm.resource), resource)) continue;
        if (!perm.fields || perm.fields.includes("*")) return "*";
        for (const f of perm.fields) fields.add(f);
      }
    }
    return [...fields];
  }

  /** All role definitions (for devtools / inspection). */
  roles(): RoleDefinition[] {
    return [...this.#roles.values()];
  }
}

// ── builder ─────────────────────────────────────────────────────────────────

/** Fluent role builder handed to {@link createRBAC}. */
export interface RoleBuilder {
  can(action: Action | Action[], resource: Resource | Resource[], when?: Condition | Record<string, unknown>): RoleBuilder;
  cannot(action: Action | Action[], resource: Resource | Resource[], when?: Condition | Record<string, unknown>): RoleBuilder;
  inherits(...roles: string[]): RoleBuilder;
}

function makeBuilder(defs: Map<string, RoleDefinition>) {
  const role = (name: string): RoleBuilder => {
    const def = defs.get(name) ?? { name, permissions: [] };
    defs.set(name, def);
    const add = (effect: "allow" | "deny", action: Action | Action[], resource: Resource | Resource[], when?: Condition | Record<string, unknown>): RoleBuilder => {
      const perm: Permission = { action, resource, effect };
      if (typeof when === "function") perm.when = when;
      else if (when) perm.conditions = when;
      def.permissions.push(perm);
      return builder;
    };
    const builder: RoleBuilder = {
      can: (a, r, w) => add("allow", a, r, w),
      cannot: (a, r, w) => add("deny", a, r, w),
      inherits: (...roles) => ((def.inherits = [...(def.inherits ?? []), ...roles]), builder),
    };
    return builder;
  };
  return role;
}

/**
 * Build an {@link RBAC} from role definitions or a fluent builder callback.
 *
 *   createRBAC([{ name: "viewer", permissions: [{ action: "read", resource: "post" }] }]);
 *   createRBAC((role) => { role("admin").can("*","*"); });
 */
export function createRBAC(input: RoleDefinition[] | ((role: (name: string) => RoleBuilder) => void) = []): RBAC {
  if (typeof input === "function") {
    const defs = new Map<string, RoleDefinition>();
    input(makeBuilder(defs));
    return new RBAC([...defs.values()]);
  }
  return new RBAC(input);
}
