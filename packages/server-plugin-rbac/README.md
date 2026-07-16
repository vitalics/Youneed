# @youneed/server-plugin-rbac

Wire a [`@youneed/rbac`](../rbac) authorization engine into
[`@youneed/server`](../server): a **`ServerPlugin`** (introspection routes + an
`inspect()` for the devtools tab), a **guard factory** `authorize(action, resource)`
to gate routes, and a **controller provider** that gives a controller a
**request-scoped `this.can`** — every check runs against the `Subject` derived
from the in-flight request (the authenticated principal on `ctx.state.user`).

```ts
import { Application, Controller } from "@youneed/server";
import { createRBAC, owns, rbac, rbacProvider, authorizeWith } from "@youneed/server-plugin-rbac";

const engine = createRBAC((role) => {
  role("admin").can("*", "*");
  role("editor").inherits("viewer").can(["create", "update"], "post").can("delete", "post", owns("authorId"));
  role("viewer").can("read", "post");
});

// Bind the engine once so route guards need not carry it.
const authorize = authorizeWith(engine);

class PostController extends Controller("/posts", {
  providers: [rbacProvider(engine)],
}) {
  @Controller.guard(authorize("update", "post"))
  @Controller.put("/:id")
  update() {
    /* only reached if the current subject may update a post */
  }

  @Controller.get()
  list() {
    // `this.can` is bound to the current request's subject
    return this.can("read", "post") ? loadPosts() : [];
  }
}

const app = Application(PostController).plugin(rbac(engine));
app.listen(3000);
```

## The subject

Every check needs a `Subject` (`{ roles, id?, attributes? }`). By default it is
derived from the authenticated principal parked on the request by your auth
middleware — `ctx.user` or `ctx.state.user` — via `defaultSubject`:

```ts
{ roles: user?.roles ?? [], id: user?.id, attributes: user }
```

Override with a `subject` resolver anywhere it is accepted (plugin, provider,
guard):

```ts
const subject = (ctx: Context) => ({ roles: ctx.state.user?.roles ?? [], id: ctx.state.user?.sub });
app.plugin(rbac(engine, { subject }));
```

## The guard — `authorize(action, resource)`

`authorize(...)` builds a guard matching the `@youneed/server` guard contract
(`(ctx) => boolean | void` — returning `false` ⇒ **403 Forbidden**). Bind the
engine once with `authorizeWith(engine)`:

```ts
const authorize = authorizeWith(engine);

@Controller.guard(authorize("update", "post"))                 // role check
@Controller.guard(authorize("delete", "post", {               // + ownership
  instance: (ctx) => loadPost(ctx.params.id),                  // resolve the resource
}))
```

`opts.instance(ctx)` (sync or async) loads the concrete resource so
ownership/attribute conditions (`owns(...)`, `attr(...)`) can be evaluated. A bare
`authorize(...)` used without an engine **fails closed** (500) — always go through
`authorizeWith(engine)`.

## The provider — `this.can`

`rbacProvider(engine, { subject? })` is a controller provider (like
[`ormProvider`](../orm-sql) / [`flagsProvider`](../server-plugin-feature-flags)):
it contributes private, typed members **bound to the current request's subject**:

- **`this.can(action, resource, instance?)`** — yes/no.
- **`this.cannot(...)`** — negation.
- **`this.check(...)`** — full `AccessResult` (`granted` + `reason` + deciding `by`).
- **`this.permittedFields(action, resource)`** — fields the subject may touch (`"*"` = all).
- **`this.rbac`** — the engine (pass an explicit subject).
- **`this.subject`** — the request's resolved subject (a live getter).

The subject is read lazily per call via async-local storage, so one installed
provider serves every request. `requestRBAC(engine, resolve, ctx?)` is exported as
the pure facade builder (used in tests with a fake request).

## The plugin

`rbac(engine, { basePath?, exposeDevtools?, subject? })` is a `ServerPlugin`. It
mounts introspection routes under `basePath` (default `/__rbac`):

- **`GET /`** and **`GET /roles`** — the roles × permissions matrix.
- **`GET /check?roles=&action=&resource=&instance=`** (or `?subject=<json>`) — run
  an ad-hoc access check (the devtools tester); returns the full `AccessResult`.
- **`GET /subject`** — the current request's resolved subject (debug).

`inspect()` returns `{ kind: "rbac", roleCount, endpoints }` for the devtools tab.
Set `exposeDevtools: false` to mount no routes.

## Devtools

With [`@youneed/server-plugin-devtools`](../server-plugin-devtools) mounted, the
engine gets an **RBAC** panel (under Infra): a **roles × permissions matrix**
(role / inherits / action / resource / effect / condition) and a **check tester**
(roles csv + action + resource + optional instance JSON → granted + reason + by).
The panel fetches live over the routes above. Registered by importing
`@youneed/server-plugin-rbac/devtools` into the devtools web bundle.
