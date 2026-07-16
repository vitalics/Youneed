# @youneed/test-plugin-rbac

Deterministic authorization in [`@youneed/test`](../test). RBAC is stateful, and
state leaks between tests: one case calls `setRole(...)` to grant `editor` a new
permission, the next inherits it, and now your suite passes or fails by order.
This package gives every test a **fresh** [`RBAC`](../rbac) engine (role tweaks
wiped between cases), ergonomic `Subject` builders, throwing `expectCan` /
`expectCannot` assertions, and a scoped `withRole(...)` for role experiments.

```ts
import { Test, TestApplication } from "@youneed/test";
import { rbacFixture, subject, expectCan, expectCannot, withRole } from "@youneed/test-plugin-rbac";
import { owns, type RBAC } from "@youneed/rbac";

const Rbac = rbacFixture((role) => {
  role("viewer").can("read", "post");
  role("editor")
    .inherits("viewer")
    .can(["create", "update"], "post")
    .can("delete", "post", owns("authorId")); // only own posts
});

class Posts extends Test() {
  @Test.use(Rbac) rbac!: RBAC; // …or decorator-free: rbac = Rbac.get();

  @Test.it("editor can update, viewer cannot") perms() {
    expectCan(this.rbac, subject(["editor"]), "update", "post");
    expectCannot(this.rbac, subject(["viewer"]), "update", "post");
  }

  @Test.it("ownership condition") owned() {
    const editor = subject(["editor"], { id: "u1" });
    expectCan(this.rbac, editor, "delete", "post", { authorId: "u1" }); // owns it
    expectCannot(this.rbac, editor, "delete", "post", { authorId: "u2" }); // not owner
  }

  @Test.it("setRole applies for THIS test only") mutate() {
    this.rbac.setRole({ name: "viewer", permissions: [{ action: "delete", resource: "post" }] });
    expectCan(this.rbac, subject(["viewer"]), "delete", "post");
    // the next test gets a fresh engine — no leak.
  }

  @Test.it("scoped role experiment restores after the block") scoped() {
    withRole(this.rbac, { name: "viewer", permissions: [{ action: "delete", resource: "post" }] }, () => {
      expectCan(this.rbac, subject(["viewer"]), "delete", "post"); // granted inside
    });
    expectCannot(this.rbac, subject(["viewer"]), "delete", "post"); // restored
  }
}

TestApplication().addTests(Posts).run();
```

`rbacFixture` is scoped `"test"` by default, so a new engine is constructed for
every case — any `setRole(...)` a test applies is **gone** for the next one, no
manual reset needed. Consume it with `@Test.use(Fix)` or decorator-free via
`Fix.get()`, exactly like any other `@youneed/test` fixture.

| API | meaning |
| --- | --- |
| `rbacFixture(defs?, opts?)` | a `@youneed/test` fixture providing a fresh `RBAC` per test; resets role tweaks between tests |
| `subject(roles, extra?)` | build a `Subject` — `subject(["editor"], { id: "u1" })`; a single string wraps to a one-element `roles[]` |
| `asSubject(subject)` | normalize anything Subject-ish into a `Subject` (identity for a real one) |
| `expectCan(rbac, subject, action, resource, instance?)` | throw an `AssertionError` unless access is granted |
| `expectCannot(rbac, subject, action, resource, instance?)` | throw unless access is denied |
| `withRole(rbac, def, fn)` | run `fn` with `def` applied (add/override a role), restoring the prior role set after (sync + async, even on throw) |

| `rbacFixture` option | default | meaning |
| --- | --- | --- |
| `name` | `"rbac"` | fixture display name |
| `scope` | `"test"` | fixture scope; keep `"test"` for per-case isolation (`"suite"`/`"run"` share one engine, teardown restores the original role set when the scope ends) |

### `withRole` restore semantics

An existing role is restored to its exact prior definition. A role **newly**
introduced by `def` is neutralized back to an empty-permission role after the
block (so it grants nothing, as if absent — the engine exposes no delete API).
