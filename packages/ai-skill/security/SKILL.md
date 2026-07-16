---
name: youneed-security
description: "Authorization and secrets in the youneed framework. RBAC — the framework-agnostic @youneed/rbac engine (roles grant action×resource permissions, role inheritance, ownership/attribute conditions, explicit deny beats allow, synchronous) plus its integrations: @youneed/server-plugin-rbac (authorize() guard + request-scoped this.can + devtools tab), @youneed/dom-provider-rbac (this.can UI gating, re-renders on subject change), @youneed/test-plugin-rbac (fresh engine per test, expectCan/expectCannot). Secrets — the @youneed/secrets engine (SecretsProvider contract, caching, secret:// reference resolution, require) with built-in env/memory/file providers, managed backends @youneed/secrets-vault (HashiCorp Vault KV v2) and @youneed/secrets-aws (AWS Secrets Manager, SigV4, no SDK), and @youneed/server-plugin-secrets (this.secrets on controllers, never leaks values). Use this skill when adding role/permission checks, gating routes or UI, deriving a Subject from the authenticated principal, loading secrets/config, or wiring Vault/AWS Secrets Manager."
license: ISC
---

# youneed — Security (RBAC authorization + Secrets management)

Two orthogonal concerns, both framework-agnostic cores with per-surface integrations.
Authentication (who the user *is* — OAuth2/OTP/JWT/API-key) lives in the main `youneed`
skill's `references/auth.md`; **this skill is authorization (what they may *do*) and
secret material (config that must not leak).**

Source of truth: `packages/{rbac,secrets,secrets-aws,secrets-vault}/src`,
`packages/server-plugin-{rbac,secrets}/src`, `packages/{dom,test}-plugin-rbac`. Verify
a signature in source/README before asserting it.

## Route to the reference

| Task | Read |
|------|------|
| Roles, permissions, `can`/`check`, ownership/attr conditions, guard/`this.can`, UI gating, test setup | `references/rbac.md` |
| Loading secrets, `secret://` references, config hydration, Vault / AWS Secrets Manager, `this.secrets` | `references/secrets.md` |

## At a glance

**RBAC** — one engine, three integrations:
```ts
const rbac = createRBAC((role) => {
  role("admin").can("*", "*");
  role("editor").inherits("viewer").can(["create","update"], "post")
    .can("delete", "post", owns("authorId"));      // only own posts; deny wins over allow
});
rbac.can({ roles: ["editor"], id: "u1" }, "delete", "post", { authorId: "u1" }); // true
```
- Server: `@Controller.guard(authorize("update","post"))` + `this.can` (request-scoped).
- DOM: `when(can("update","post",post), …)` — re-renders on `setSubject(...)`.
- Test: `expectCan(rbac, subject(["editor"]), "update", "post")` on a fresh-per-test engine.

**Secrets** — one engine, pluggable providers, never leaks:
```ts
const secrets = createSecrets(new EnvSecrets(), { cacheTtlMs: 60_000 });
await secrets.require("DATABASE_URL");                          // throws if unset
await secrets.resolveAll({ db: "secret://DATABASE_URL" });     // deep-resolve refs
```
Swap `EnvSecrets` for `vaultSecrets({...})` / `awsSecrets({...})`; `this.secrets` on a
controller resolves server-side and the plugin's routes surface **names + masked probe only**.

## Ground rules

- **`deny` beats `allow`.** RBAC decisions are `ALLOW | DENY | NO_MATCH`; an explicit
  `cannot(...)` always wins. Use `check(...)` (not `can`) when you need the reason.
- **The `Subject` comes from auth.** RBAC gates on `{ roles, id?, attributes? }` derived
  from the authenticated principal (`ctx.state.user`) — RBAC does not authenticate.
- **Secrets never cross the wire.** The server plugin exposes secret **names** and a
  **masked** presence probe only; the raw value never leaves the server. Returning it to a
  client is always the handler's explicit choice.
- **Managed backends are pure `fetch` + `node:crypto`** — no `aws-sdk`, no Vault SDK. They
  implement the same `SecretsProvider` contract, so `secret://` refs and caching still work.
- **Both cores are dependency-free**; the engines are synchronous (RBAC) / cached (secrets)
  so evaluation is cheap on the hot path.
