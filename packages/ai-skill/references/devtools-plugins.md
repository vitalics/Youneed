# youneed — Developing Devtools Plugins (@youneed/devtools-protocol)

Author NEW devtools domains (backend capabilities) and UI panels (how they draw)
on the universal, CDP-style protocol. One protocol, many surfaces: server, DOM
(components), CLI, SSR, test all speak it, and ONE unified `<youneed-devtools>`
shell inspects them together. Source of truth:
`packages/devtools-protocol/src/{index,ui,shell,extensions}.ts`, and the surface
adapters `packages/{server-plugin-devtools,devtools,cli-plugin-devtools}/src/protocol.ts`
(+ `…/ext.ts`). Verify a signature in source before asserting it.

The wire model is **JSON-RPC 2.0 over a transport** (`Command`/`ResponseFrame`/
`EventFrame`). You almost never touch frames — you define domains and panels.

## Two layers

1. **Protocol extension = a `Domain`** — new commands + events (backend capability).
2. **UI extension = a `DevtoolsExtension`** — how that domain renders in the shell.

The plain-HTML defaults live in `@youneed/devtools-protocol/extensions`; richer
shad panels are re-registered per surface in its `ext.ts` (registry is idempotent
by domain — **last registration wins**, so importing a shad `ext.ts` AFTER the
defaults upgrades the UI without touching the protocol).

## 1) Author a domain (backend)

```ts
import { defineDomain, createTarget } from "@youneed/devtools-protocol";
import { t } from "@youneed/schema";

const myDomain = defineDomain({
  domain: "MyDomain",
  description: "custom capability",
  commands: {
    getData: { result: t.json<{ items: string[] }>(), handler: () => ({ items: load() }) },
    act: {
      params: t.json<{ name: string }>(),
      handler: (p, ctx) => { ctx.emit("done", { name: p.name }); return { ok: true }; },
    },
  },
  events: { done: { params: t.json<{ name: string }>() } },
});

const target = createTarget({ kind: "server", title: "my-app" }).register(myDomain);
```

- `handler(params, ctx)` — `ctx.emit(event, data)` pushes to THIS session's client;
  `ctx.session` is per-connection scratch (enable flags, cursors). Params are
  validated before the handler runs.
- `createTarget({ id?, kind, title?, url? })` → `DevtoolsTarget`: `.register(...domains)`
  (chainable), `.info()` (discovery), `.serve(transport)` → detach fn,
  `.dispatch(command, session?)` (direct invocation). Every target auto-answers
  `Protocol.getDomains` (self-description), `Target.getInfo`, `Target.getTargets`.

## 2) Author a UI panel (shell)

```ts
import { registerExtension, type ExtensionContext, type View } from "@youneed/devtools-protocol/ui";
import { html } from "@youneed/dom";   // panels return @youneed/dom html`` (use shad-* for the shared look)

registerExtension({
  domain: "MyDomain",
  label: "My Tab",            // omit `label` → no tab shown
  order: 25,                  // tab sort (default 100)
  docs: "https://…",          // empty-state CTA
  async panel(ctx: ExtensionContext): Promise<View> {
    const data = await ctx.client.command<{ items: string[] }>("MyDomain.getData");
    ctx.client.on("MyDomain.done", () => ctx.refresh());     // re-render on events
    return html`<shad-card style="display:block;padding:1rem">
      ${data.items.map((i) => html`<div>${i}</div>`)}
      <shad-button size="sm" @click=${() => ctx.client.command("MyDomain.act", { name: "x" })}>Go</shad-button>
    </shad-card>`;
  },
});
```

- `ExtensionContext`: `client` (live `command()` + `on()`), `target` (`TargetInfo` —
  kind/title/url/domains), `goto(hash)` (shell router), `refresh()` (re-render).
- `registerExtension(ext)` (idempotent by domain) · `getExtension(domain)` ·
  `extensions()` · `extensionsFor(target)` (advertised + has `label`, sorted) ·
  `emptyState(opts)` (`<shad-empty>` fallback). Also expose a compact `card(ctx)`.

## Serving + the shell

- The browser shell is `@youneed/devtools-protocol/shell` (defines
  `<youneed-devtools discovery="{path}/json">`). It fetches the target list from
  `/json`, connects each target's `webSocketDebuggerUrl` via `fromWebSocket` +
  `createClient`, and renders a tab per advertised domain via `extensionsFor`.
- Transports: `fromWebSocket(ws)` (browser/node WS), `inProcessTransport()`
  (loopback — great for tests), `bridgeToHub(hubUrl, target)` (a page that can't be
  dialled connects OUT and registers itself, multiplexed by `sessionId`).
- The UI bundle = an esbuild entry that imports `…/shell`, your `ext.ts`, and
  `registerTailwind(...)` + theme (see any surface's `web.ts` + `build-web.mjs`).
  Whitelist the side-effect files in `package.json` `sideEffects` so esbuild
  doesn't tree-shake the `import "./ext.ts"` registration.

## Per-surface patterns to copy

| Surface | Domain factory / target | Transport | UI |
|---------|------------------------|-----------|----|
| **server** | `topologyDomain`/`infraDomain`/`apiDocsDomain` + `serveProtocol(app)` mounts `/json`, `/ws`, `/register` | `@youneed/server` `.ws()` | `server-plugin-devtools/src/ext.ts` (shad + React-Flow). Live taps: `networkTap()`, `logTap()` |
| **DOM** | `componentsDomain()` / `createComponentsTarget()` / `bridgeComponents(hubUrl)` | `inProcessTransport()` in-page, or WS via bridge | built into the panel |
| **CLI** | `cliDomain(host)` / `createCliTarget(host)` (`CLI.getCatalog` + `CLI.run`) | a tiny built-in RFC 6455 WS over `node:http` (`serveWebSocket`, no `@youneed/server` dep) | `cli-plugin-devtools/src/ext.ts` — a shad `<cli-builder>` (form + Copy/Run) |
| **SSR** | `ssrDomain()` registered on the server target via `serveProtocol({ domains })` | server WS | a shad SSR panel |

To add a brand-new surface: `defineDomain(...)` → `createTarget({ kind })` →
serve it over a transport (reuse the CLI's `serveWebSocket` for a standalone
`node:http` server, or `app.ws(...)` inside `@youneed/server`) → advertise it at
`/json` with `webSocketDebuggerUrl` → register a `DevtoolsExtension` for its domain.

## Answering style

- Separate the two asks: a new *capability* = `defineDomain` (commands/events on a
  target); a new *tab* = `registerExtension` (panel returning shad `html``).
- Point at the matching surface's `protocol.ts` + `ext.ts` as the copy-paste model,
  and remind that the registry is last-wins by domain and the shell drives every
  target the same way over the protocol.
