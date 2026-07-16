# @youneed/dom-provider-rbac

Use [`@youneed/rbac`](../rbac) inside [`@youneed/dom`](../dom) components — gate
UI straight in an `html` template on what the current subject may do, and have
the component re-render when the subject changes (a login, a role switch).

```ts
import { Component, html, when } from "@youneed/dom";
import { createRBAC } from "@youneed/rbac";
import { provideRBAC, can, setSubject } from "@youneed/dom-provider-rbac";

provideRBAC(createRBAC((role) => {
  role("editor").can(["create", "update"], "post");
}));
setSubject({ roles: ["editor"], id: "u1" }); // the logged-in user

class PostView extends Component() {
  render() {
    return when(can("update", "post", this.post), () => html`<button>Edit</button>`);
  }
}
```

`can(action, resource, instance?)` reads the app-wide engine installed by
`provideRBAC(...)` and evaluates it against the current subject set by
`setSubject(...)`; it returns a boolean, so it drops into any template hole.

`@youneed/rbac`'s core has no `onChange` — an authorization decision only changes
when the **subject** changes (login / role switch), so `setSubject(...)` is what
drives re-render.

## Scoped `this.can` — the `providers` slot (recommended)

`Component(tag, { providers: [...] })` is the DOM analogue of a server
`Controller`'s `{ guards, interceptors }`: an array of orthogonal extensions that
augment `this`. `rbacProvider(engine, { subject })` adds a **scoped** `this.can`
— every call evaluates against the provider's `subject()` (default: the app-wide
subject) — AND automatic re-render when the subject changes (no boilerplate). It
composes with other providers (i18n, feature-flags, a11y, …) in the same array:

```ts
import { Component, html, when } from "@youneed/dom";
import { rbacProvider } from "@youneed/dom-provider-rbac";

class PostCard extends Component("post-card", {
  providers: [rbacProvider(engine, { subject: () => currentUser })],
}) {
  render() {
    return when(this.can.can("update", "post", this.post), () => html`<button>Edit</button>`);
    //                ^ evaluated against the provider's subject, re-renders on setSubject
  }
}
```

`this.can` exposes `can(action, resource, instance?)`, `cannot(...)`,
`check(...)` (full decision + reason), `subject()`, and `roles()` (the subject's
effective role names) — each bound to the scoped subject.

## `withRBAC` — the same, as a base-class mixin

Equivalent to a single `rbacProvider`, in `extends withRBAC(Base, engine)` form —
handy when you're already chaining mixins:

```ts
import { withRBAC } from "@youneed/dom-provider-rbac";
class PostCard extends withRBAC(Component("post-card"), engine) {
  render() { return when(this.can.can("update", "post", this.post), () => html`<button>Edit</button>`); }
}
```

## API

| API | meaning |
| --- | --- |
| `provideRBAC(engine)` | install the app-wide RBAC engine; returns it |
| `getRBAC()` | the active engine (throws if none provided) |
| `setSubject(subject)` | set the current user/subject; re-renders subscribed components |
| `getSubject()` | the current app-wide subject (`{ roles: [] }` until set) |
| `can(action, resource, instance?)` | yes/no gate for template holes, against the current subject |
| `cannot(...)` / `check(...)` | negation / full decision (value + reason), against the current subject |
| `rbacProvider(engine, { subject? })` | a `ComponentProvider` adding a **scoped** `this.can` + auto reactivity |
| `withRBAC(Base, engine, { subject? })` | the mixin form of the same contribution |

`this.can` (from the provider / mixin): `can(action, resource, instance?)`,
`cannot(...)`, `check(...)`, `subject()`, `roles()` — each evaluated against the
provider's `subject()` (default: the app-wide subject).

Re-exports the core `RBAC` class and its types (`Action`, `Resource`, `Subject`,
`AccessContext`, `AccessResult`, `Condition`, `Permission`, `RoleDefinition`).
