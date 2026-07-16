# RBAC — @youneed/rbac + server / dom / test integrations

Framework-agnostic, **synchronous**, dependency-free authorization. Roles grant
permissions (`action × resource`, optionally conditioned on the instance); inheritance
composes them; **explicit `deny` beats `allow`**. CASL/Casbin spirit, no dependencies.

## Core engine — `@youneed/rbac`

```ts
import { createRBAC, owns, attr } from "@youneed/rbac";

const rbac = createRBAC((role) => {
  role("admin").can("*", "*");                            // superuser
  role("viewer").can("read", "post");
  role("editor")
    .inherits("viewer")                                   // + everything viewer can
    .can(["create", "update"], "post")
    .can("delete", "post", owns("authorId"))              // only own posts
    .cannot("update", "post", attr("locked", true));      // never edit locked posts
});

rbac.can({ roles: ["editor"], id: "u1" }, "delete", "post", { authorId: "u1" }); // true
rbac.can({ roles: ["editor"], id: "u1" }, "delete", "post", { authorId: "u2" }); // false
rbac.check({ roles: ["editor"] }, "update", "post", { locked: true });           // { granted:false, reason:"DENY" }
```

**Model**
- **`Subject`** — `{ roles, id?, attributes? }`.
- **`Permission`** — `{ action, resource, effect?, when?, conditions?, fields? }`. `action`/
  `resource` take a value, an array, or `"*"`. `effect`: `"allow"` (default) or `"deny"` (wins).
  `when(ctx)` is a predicate; `conditions` an attribute map the instance must match; `fields`
  restrict field-level access.
- **`RoleDefinition`** — `{ name, inherits?, permissions }`; `inherits` is transitive, cycle-safe.
- **`AccessContext`** — `{ subject, action, resource, instance? }` passed to conditions.

**Engine API** — `createRBAC(defs | builder)` → `RBAC`:
- `can(subject, action, resource, instance?)` / `cannot(...)` — yes/no.
- `check(...)` → `{ granted, reason: "ALLOW"|"DENY"|"NO_MATCH", by? }` — debug / devtools.
- `permittedFields(subject, action, resource)` → `string[] | "*"` — field-level.
- `rolesOf(subject)` (effective, self + inherited), `roles()`, `setRole(def)`.

**Conditions:** `owns(field = "ownerId")` (`instance[field] === subject.id`), `attr(field, value)`
(equals, or `includes` for arrays), or any `(ctx) => boolean`.

## Server — `@youneed/server-plugin-rbac`

A `ServerPlugin` (introspection + devtools tab) + a **guard factory** + a **controller
provider** giving request-scoped `this.can`.

```ts
import { createRBAC, owns, rbac, rbacProvider, authorizeWith } from "@youneed/server-plugin-rbac";

const engine = createRBAC((role) => { role("editor").can("update", "post", owns("authorId")); });
const authorize = authorizeWith(engine);   // bind once so guards need not carry the engine

class PostController extends Controller("/posts", { providers: [rbacProvider(engine)] }) {
  @Controller.guard(authorize("update", "post"))
  @Controller.put("/:id") update() { /* only reached if the subject may update */ }

  @Controller.get() list() { return this.can("read", "post") ? loadPosts() : []; }
}
Application(PostController).plugin(rbac(engine)).listen(3000);
```

**The `Subject`** defaults from the authenticated principal (`ctx.user` / `ctx.state.user`)
via `defaultSubject`: `{ roles: user?.roles ?? [], id: user?.id, attributes: user }`. Override
with a `subject` resolver on the plugin, provider, or guard:
```ts
app.plugin(rbac(engine, { subject: (ctx) => ({ roles: ctx.state.user?.roles ?? [], id: ctx.state.user?.sub }) }));
```
`this.can` is bound to the current request's subject — call `this.can(action, resource, instance?)`.

## DOM — `@youneed/dom-provider-rbac`

Gate UI in a template; re-render when the **subject** changes (login / role switch — the
core has no `onChange`, only the subject drives re-render).

```ts
import { provideRBAC, can, setSubject, rbacProvider } from "@youneed/dom-provider-rbac";

provideRBAC(createRBAC((role) => role("editor").can(["create","update"], "post")));
setSubject({ roles: ["editor"], id: "u1" });    // the logged-in user

// app-wide functional form:
class PostView extends Component() {
  render() { return when(can("update", "post", this.post), () => html`<button>Edit</button>`); }
}

// scoped provider (recommended) — this.can bound to the provider's subject, auto re-render:
class PostCard extends Component("post-card", {
  providers: [rbacProvider(engine, { subject: () => currentUser })],
}) {
  render() { return when(this.can.can("update", "post", this.post), () => html`<button>Edit</button>`); }
}
```
`this.can` exposes `can` / `cannot` / `check` / `subject()` / `roles()`, each against the
scoped subject. `withRBAC` offers the same as a base-class mixin.

## Test — `@youneed/test-plugin-rbac`

Fresh engine per case (role tweaks wiped between tests → no order-dependence).

```ts
import { rbacFixture, subject, expectCan, expectCannot, withRole } from "@youneed/test-plugin-rbac";

const Rbac = rbacFixture((role) => {
  role("editor").inherits("viewer").can("delete", "post", owns("authorId"));
});

class Posts extends Test() {
  @Test.use(Rbac) rbac!: RBAC;                          // …or: rbac = Rbac.get()

  @Test.it("perms") perms() {
    expectCan(this.rbac, subject(["editor"], { id: "u1" }), "delete", "post", { authorId: "u1" });
    expectCannot(this.rbac, subject(["viewer"]), "delete", "post");
  }
  @Test.it("scoped experiment restores") scoped() {
    withRole(this.rbac, { name: "viewer", permissions: [{ action: "delete", resource: "post" }] }, () => {
      expectCan(this.rbac, subject(["viewer"]), "delete", "post");                // granted inside
    });
    expectCannot(this.rbac, subject(["viewer"]), "delete", "post");               // restored
  }
}
```
`rbacFixture` is `"test"`-scoped by default. `subject(roles, extra?)` builds a `Subject`;
`expectCan`/`expectCannot` throw on mismatch; `withRole(...)` applies a role for one block.
