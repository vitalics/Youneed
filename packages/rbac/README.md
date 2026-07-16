# @youneed/rbac

A tiny, **framework-agnostic** authorization engine. Role-based (RBAC) with
ownership/attribute conditions (a dash of ABAC), in the CASL/Casbin spirit but
dependency-free and **synchronous**. A subject has roles; roles grant permissions
(`action × resource`, optionally conditioned on the resource instance); role
inheritance composes them; **explicit `deny` beats `allow`**.

```ts
import { createRBAC, owns, attr } from "@youneed/rbac";

const rbac = createRBAC((role) => {
  role("admin").can("*", "*");                          // superuser
  role("viewer").can("read", "post");
  role("editor")
    .inherits("viewer")                                 // + everything viewer can
    .can(["create", "update"], "post")
    .can("delete", "post", owns("authorId"))            // only own posts
    .cannot("update", "post", attr("locked", true));    // never edit locked posts
});

rbac.can({ roles: ["editor"], id: "u1" }, "delete", "post", { authorId: "u1" }); // true
rbac.can({ roles: ["editor"], id: "u1" }, "delete", "post", { authorId: "u2" }); // false
rbac.can({ roles: ["viewer"] }, "delete", "post");                               // false
rbac.check({ roles: ["editor"] }, "update", "post", { locked: true });           // { granted:false, reason:"DENY" }
```

## Model

- **`Subject`** — `{ roles, id?, attributes? }`.
- **`Permission`** — `{ action, resource, effect?, when?, conditions?, fields? }`.
  `action`/`resource` accept a single value, an array, or `"*"`. `effect` is
  `"allow"` (default) or `"deny"` (wins). `when(ctx)` is a predicate; `conditions`
  is an attribute map the instance must match; `fields` restrict field-level access.
- **`RoleDefinition`** — `{ name, inherits?, permissions }`. `inherits` composes
  roles transitively (cycle-safe).
- **`AccessContext`** — `{ subject, action, resource, instance? }` passed to conditions.

## Engine

`createRBAC(defs | builder)` → `RBAC`:

- `can(subject, action, resource, instance?)` / `cannot(...)` — the yes/no check.
- `check(...)` → `{ granted, reason: "ALLOW"|"DENY"|"NO_MATCH", by? }` — for debugging / devtools.
- `permittedFields(subject, action, resource)` → `string[] | "*"` — field-level.
- `rolesOf(subject)` — effective roles (self + inherited). `roles()` / `setRole(def)`.

## Conditions

- **`owns(field = "ownerId")`** — the subject owns the instance (`instance[field] === subject.id`).
- **`attr(field, value)`** — the instance's `field` equals `value` (or is in the array).
- Or write any `(ctx) => boolean`.

## Integrations

- **`@youneed/server-plugin-rbac`** — an `authorize(action, resource)` guard + `this.can` on controllers + a devtools tab (roles/permissions matrix + a check tester).
- **`@youneed/dom-provider-rbac`** — `this.can(action, resource)` in components for UI gating (reactive).
- **`@youneed/test-plugin-rbac`** — set roles / assert access deterministically in tests.
