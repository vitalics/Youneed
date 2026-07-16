# @youneed/devtools-protocol — design

A **universal, CDP-style devtools protocol** for every youneed surface: the
frontend (`@youneed/dom`), the server (`@youneed/server`), SSR
(`@youneed/server-plugin-ssr`) and the CLI (`@youneed/cli`). One wire format, one
client, many targets.

The model is Chrome DevTools Protocol (CDP): **JSON-RPC 2.0 over WebSocket**,
organised into **Domains**, each with **commands** (request → response) and
**events** (target → client push). We already have most of the machinery — this
package is the thin, transport-agnostic spine that ties it together.

---

## 1. Principles

1. **One envelope everywhere.** JSON-RPC 2.0 (we already ship it:
   `@youneed/server-plugin-jsonrpc`, `src/index.ts:30`). CDP *is* JSON-RPC over
   WS — so we get a familiar, tool-compatible shape for free.
2. **Domains are optional per target.** A target advertises which domains it
   implements. The frontend speaks `DOM`/`Components`/`Runtime`; the server
   speaks `Topology`/`Network`/`RPC`. Same protocol, different capability sets —
   this is what makes it *universal* without a lowest-common-denominator API.
3. **Self-describing.** Every command/event declares its param + result schema
   with `@youneed/schema`'s `t`. A `Protocol.getDomains` command returns the full
   machine-readable spec (CDP's `protocol.json` analog) → typed clients, codegen,
   and auto-generated debugger forms (the JSON-RPC panel already auto-forms from
   `t` kinds: `server-plugin-jsonrpc/src/devtools.ts`).
4. **Transport-agnostic core.** The spine knows nothing about WS/HTTP/postMessage.
   A `Transport` is just `send(msg)` + `onMessage(cb)`. WS, in-page hook,
   `postMessage`, and SSE are all adapters.
5. **Reuse, don't reinvent.** The `kind`-discriminated renderer registry
   (`server-plugin-devtools/src/registry.ts:30`) stays as the UI layer; domains
   map onto it. `inspect()` stays as the static snapshot. We only *add* the live,
   bidirectional channel.

---

## 2. Core concepts

| Concept | CDP analog | Here |
| --- | --- | --- |
| **Target** | a page / worker / browser | a thing you can inspect: a DOM page, a server, an SSR renderer, a CLI process. Has `id`, `kind`, `title`, `url`, `domains[]`. |
| **Session** | `sessionId` | a client↔target attachment. Lets one connection (a **hub**) multiplex many targets. |
| **Domain** | `Page`, `Runtime`, `Network` | a namespaced capability bundle. `Topology`, `Components`, `RPC`, `Test`, … |
| **Command** | `Page.navigate` | request/response; `method: "Domain.command"`, has `id`. |
| **Event** | `Network.requestWillBeSent` | target→client push; `method: "Domain.event"`, **no `id`**. |
| **Transport** | the WS socket | `send` + `onMessage`. Pluggable. |
| **Hub** | the browser endpoint (`/json`) | optional aggregator that lists targets and proxies their sessions over one socket. |

---

## 3. Wire protocol

Pure JSON-RPC 2.0, plus a CDP-style `sessionId` for multiplexing and the
notification form for events.

**Command** (client → target):
```jsonc
{ "id": 1, "sessionId": "S1", "method": "Components.getTree", "params": {} }
```
**Response** (target → client):
```jsonc
{ "id": 1, "sessionId": "S1", "result": { "roots": [ /* … */ ] } }
// or
{ "id": 1, "sessionId": "S1", "error": { "code": -32601, "message": "Method not found" } }
```
**Event** (target → client, no `id`):
```jsonc
{ "sessionId": "S1", "method": "Components.updated", "params": { "id": 42, "props": { /* … */ } } }
```

`sessionId` is **optional** — omitted for a single-target direct connection
(e.g. the in-page DOM inspector talking to itself), present when a hub fans out
to several targets. This is exactly how CDP flat-mode sessions work, so the
shape is already battle-tested.

`error.code` follows JSON-RPC (`-32601` method not found, `-32602` invalid
params, …) — the codes our jsonrpc plugin already emits
(`server-plugin-jsonrpc/src/index.ts:55`).

---

## 4. Enable/disable (event streams)

CDP gates events behind `Domain.enable` so a target doesn't push until someone
listens. We adopt the same:

```jsonc
{ "id": 2, "method": "Network.enable" }   // start receiving Network.* events
{ "id": 9, "method": "Network.disable" }  // stop
```

A domain tracks, per session, whether it's enabled, and only emits to enabled
sessions. This is the **one capability our jsonrpc transport lacks today** —
see §8.

---

## 5. Discovery

A hub exposes a CDP-style target list (the `/json/list` analog):

```
GET {mount}/json   →  [
  { "id": "srv-1", "kind": "server", "title": "users-api",
    "url": "http://localhost:3000",
    "webSocketDebuggerUrl": "ws://localhost:3000/__devtools/ws",
    "domains": ["Target","Protocol","Topology","Network","RPC"] },
  { "id": "page-7", "kind": "dom", "title": "Checkout",
    "webSocketDebuggerUrl": "ws://localhost:3000/__devtools/ws?target=page-7",
    "domains": ["Target","Protocol","Runtime","DOM","Components"] }
]
```

The unified UI fetches `/json`, shows a target picker, attaches, and drives
each target with only the domains it advertises. External targets (a browser
page that connected *out* to the hub) appear here too.

---

## 6. Self-describing schema

`Protocol.getDomains` returns the full spec, every command/event with its
`@youneed/schema` shape rendered to JSON Schema (we already have
`toJsonSchema`). This powers:

- typed client codegen,
- the debugger's auto-forms (extend the existing JSON-RPC panel form-builder),
- protocol diffing / versioning.

```jsonc
{ "id": 3, "method": "Protocol.getDomains" }
// →
{ "id": 3, "result": { "version": "0.1", "domains": [
  { "domain": "Components", "commands": [
      { "name": "getTree", "params": {}, "returns": { /* JSON Schema */ } },
      { "name": "setProps", "params": { /* … */ } }
    ],
    "events": [ { "name": "updated", "params": { /* … */ } } ] }
]}}
```

---

## 7. Package layering

```
@youneed/devtools-protocol            ← THIS package: pure, browser-safe spine
  ├─ envelope types (Command/Response/Event, Target, Session)
  ├─ defineDomain()  — declare commands/events with t-schemas
  ├─ createTarget()  — register domains, dispatch, emit, enable/disable
  ├─ createClient()  — typed command()/on(event) over a Transport
  ├─ Transport iface — send + onMessage
  ├─ Protocol.getDomains / Target.* / built-in domains
  └─ NO node, NO dom — both browser UI and node server import it

adapters (live in the surface packages, as a /protocol subpath):
  @youneed/server-plugin-devtools/protocol   → Topology, Network, RPC, Bench, Security
  @youneed/devtools/protocol                 → Runtime, DOM, Components
  @youneed/server-plugin-ssr/protocol        → SSR (page, routes, modules, map)
  @youneed/cli-plugin-devtools/protocol      → CLI (catalog, run, output stream)
  @youneed/test-devtools (already SSE)        → Test (run/suite/test events)

transports:
  ws        — reuse @youneed/server-plugin-jsonrpc WS (extend with events, §8)
  in-page   — wrap the existing __DOM_DEVTOOLS__ hook (devtools/src/core.ts:124)
  postMessage — iframe/extension bridge for an out-of-page UI
  sse       — one-way fallback (test-devtools already does this)
```

The current `@youneed/server-plugin-devtools` renderer registry and `<server-devtools>`
UI become the **client** of this protocol; the topology JSON it polls today
becomes `Topology.get` + `Topology.audit` commands, with live `*.event` pushes
replacing the manual refresh.

---

## 8. The gap (✅ DONE): server→client events in the WS transport

> **Status: implemented in `@youneed/server-plugin-jsonrpc`.** The WS handler now
> keeps a per-socket `RpcConnection` (`emit` + `state` + `close`), exposed to
> handlers as `this.connection` / `this.emit` and ambiently via `rpcConnection()`
> (run inside an `AsyncLocalStorage`, mirroring `context()`). Self-description
> ships as the reserved **`rpc.discover`** method (OpenRPC 1.2). See the package
> README. `enable`/`disable` are a convention over `connection.state` — domains
> implement them as ordinary methods.

The original gap: `jsonrpc`'s WS handler was pure request/response. The protocol
needs **server-initiated** frames (events) and **per-connection state**
(enable/disable, sessionId). The shipped shape:

```ts
// A handler may receive a per-connection RPC context with an emitter.
interface RpcConnection {
  id: string;                       // connection id == default sessionId
  emit(method: string, params?: unknown): void;   // push an event frame
  state: Record<string, unknown>;   // per-connection scratch (enabled domains…)
  close(): void;
}

// JsonRPC methods can take `(…, ctx)` where ctx exposes `ctx.connection` on WS.
@JsonRPC.method("Network.enable")
enable(_: void, ctx: Context & { connection?: RpcConnection }) {
  ctx.connection?.state.network && (ctx.connection.state.network = true);
}
```

Implementation: the WS `message` handler keeps a `WsConnection`-keyed
`RpcConnection`; `emit` writes a notification frame (`{ method, params }`, no
id). Domains push through it. This is a small, contained change and is the
*only* core addition the whole protocol needs.

(For the POST transport, events degrade gracefully: no push channel, so the UI
falls back to polling `Topology.get` — exactly today's behaviour.)

---

## 9. Domain catalogue (mapped to existing capabilities)

Each domain wraps capabilities that **already exist** — the protocol is mostly a
naming + transport layer over them.

### `Target` (every target) — meta
- `getTargets` → list (the `/json` payload). `attach{targetId}` → `sessionId`.
  `detach`. Event: `targetCreated` / `targetDestroyed`.

### `Protocol` (every target) — introspection
- `getDomains` → §6.

### `Topology` (server) — wraps `server-plugin-devtools/src/core.ts`
- `get` → `ServerInfo` (`core.ts:49`, today's `topology.json`).
- `audit` → `securityAudit()` (`core.ts:132`). `openapi` → `toOpenApi()` (`core.ts:194`).
- `tryGuard{method,path,init}` → `app.tryGuards()` (today's `POST /try-guard`).
- `bench{…}` → `microbench()` (`core.ts:293`).
- Event: `routesChanged` (hot-reload / dynamic mount).

### `Network` (server) — request log stream  *(new wiring)*
- `enable`/`disable`. Event: `requestWillBeSent` / `responseReceived`
  (`{ requestId, method, path, status, ms }`), sourced from a middleware that
  taps `ctx` (compose `@youneed/server-middleware-request-logger` +
  `server-timing`). This is the most CDP-like win: a live request waterfall.

### `RPC` (server) — wraps `@youneed/server-plugin-jsonrpc`
- `listMethods` → `plugin.methods()` (`jsonrpc/src/index.ts:236`).
- `call{method,params}` → dispatch. (The debugger panel already does this.)

### `Runtime` / `DOM` / `Components` (frontend) — wraps `@youneed/devtools`
- `Components.getTree` → the `Map<id, ComponentRecord>` store
  (`devtools/src/core.ts:66`). `getComponent{id}`, `getHistory{id}` (time-travel
  snapshots), `setProps{id,props}` (time-travel jump), `highlight{id}`,
  `setScheduler{id,name}` (live scheduler swap), `eval{id,expr}`.
- Events: `Components.mounted/updated/unmounted/emitted` — a 1:1 rename of the
  existing `DevtoolsEvent` union (`devtools/src/core.ts:52`) onto the wire.
  The in-page hook *becomes* an in-process `Transport`.

### `SSR` (ssr) — wraps `@youneed/server-plugin-ssr`
- `getPage`, `getRoutes`, `getModules` (each module's `inspect()`),
  `getSpeculationMap`. Today embedded as JSON in the page
  (`page-devtools.ts`); the protocol makes it queryable + live.

### `CLI` (cli) — wraps `@youneed/cli-plugin-devtools`
- `getCatalog` → `createCatalog()`. `run{command,args}` → spawn; stream stdout
  via `CLI.output` events instead of the one-shot `{ code, output }`.

### `Test` (test runner) — wraps `@youneed/test-devtools`
- Already an event stream (SSE). Rename `WireEvent` (`test-devtools/src/index.ts:25`)
  to `Test.runStart/suiteStart/testStart/testEnd/runEnd`. Trivial adapter:
  SSE *is* a one-way Transport.

### `Log` (every target) — unified console/log
- `enable`/`disable`. Event: `entryAdded{ level, message, meta, ts, source }`.
  Server side taps `@youneed/logger`; frontend taps `console`.

---

## 10. Core API sketch (this package)

```ts
// ── envelope ───────────────────────────────────────────────
export interface Command  { id: number | string; sessionId?: string; method: string; params?: unknown }
export interface Response { id: number | string; sessionId?: string; result?: unknown; error?: ProtocolError }
export interface Event    { sessionId?: string; method: string; params?: unknown }   // no id
export type Frame = Command | Response | Event;

export interface ProtocolError { code: number; message: string; data?: unknown }

// ── transport ──────────────────────────────────────────────
export interface Transport {
  send(frame: Frame): void;
  onMessage(cb: (frame: Frame) => void): () => void;  // returns unsubscribe
  close?(): void;
}

// ── domain definition (schema-first, like @JsonRPC.method) ──
export interface CommandDef<P, R> { params?: Schema<P>; returns?: Schema<R>; handler: (params: P, ctx: DomainContext) => R | Promise<R> }
export interface EventDef<P>      { params?: Schema<P> }

export function defineDomain<C, E>(spec: {
  domain: string;
  commands: { [K in keyof C]: CommandDef<any, any> };
  events?:  { [K in keyof E]: EventDef<any> };
}): Domain;

// ctx given to a command handler — can emit this domain's events to the caller's session
export interface DomainContext {
  sessionId?: string;
  emit(event: string, params?: unknown): void;
  enabledFor(session?: string): boolean;
}

// ── target: hosts domains, dispatches frames ───────────────
export function createTarget(opts: { kind: TargetKind; title?: string; url?: string }): DevtoolsTarget;
interface DevtoolsTarget {
  register(...domains: Domain[]): this;
  attach(transport: Transport): void;     // start serving over a transport
  describe(): TargetDescription;          // for /json + Target.getTargets
}

// ── client: typed driver over a transport ──────────────────
export function createClient(transport: Transport): DevtoolsClient;
interface DevtoolsClient {
  command<R = unknown>(method: string, params?: unknown, sessionId?: string): Promise<R>;
  on(method: string, cb: (params: unknown, sessionId?: string) => void): () => void;
  getDomains(): Promise<ProtocolSpec>;
}
```

`defineDomain` mirrors the ergonomics of `@JsonRPC.method` (schema-first), so a
domain author writes the same style they already know. A domain compiles to a
set of JSON-RPC methods (`Domain.command`) + a set of event names
(`Domain.event`) — i.e. **a domain is just a namespaced JSON-RPC surface**, and
the existing jsonrpc dispatcher (once it can emit, §8) executes it.

---

## 11. Why this is the right shape

- **It's literally CDP.** Anyone who has used Chrome DevTools, Playwright, or
  `chrome-remote-interface` already understands targets/domains/sessions. External
  tools can even speak to us.
- **Maximum reuse.** Transport = jsonrpc (done). UI/registry = server-plugin-devtools
  (done). Static `inspect()` = done. Per-surface capabilities = done. We add one
  thing (WS events, §8) and a thin spine (this package).
- **Incremental.** Each surface ships a `/protocol` adapter independently. The
  UI keeps working off polling until a domain goes live, then upgrades to events.
- **Universal without compromise.** Domains are opt-in per target, so the CLI
  isn't forced to pretend it has a DOM, and the frontend isn't forced to expose
  routes.

---

## 12. Build order

1. ✅ **This package** — DONE. `src/index.ts`: envelope + `Transport`
   (`inProcessTransport`, `fromWebSocket`) + `defineDomain` + `createTarget`
   (built-in `Protocol.getDomains` / `Target.getInfo`/`getTargets`) +
   `createClient` (command/on/getDomains, wildcard `Domain.*` events) +
   `schemaToJson`. `src/ui.ts` (`./ui` subpath): the **domain-keyed UI extension
   registry** — `registerExtension({ domain, label, panel, card })` +
   `extensionsFor(target)`. Pure core tested (8 cases).
2. ✅ **jsonrpc WS events** (§8) — DONE (`RpcConnection.emit` + state +
   `rpc.discover`).
3. ✅ **`server-plugin-devtools/protocol`** — DONE. `topologyDomain(app, meta)`
   (`Topology.get/audit/grade/openapi/tryGuard` + `routesChanged` event) +
   `serveProtocol(app, { path, domains })` mounting `{path}/ws` (per-socket
   session, transport bridged from `@youneed/server` WsHandlers). The `devtools()`
   plugin mounts it by default (`protocol: false` to opt out); legacy
   `topology.json` stays. `Network` tap = follow-up.
4. ✅ **`@youneed/devtools/protocol`** (frontend) — DONE. `componentsDomain()`
   (`Components.getTree/getComponent` + `enable/disable` → `changed` events) +
   `createComponentsTarget()`. Driven by `inProcessTransport` in-page (events via
   the session-bound `ctx.emit` over a `subscribe()` hook). WS bridge = follow-up.
5. ✅ **ssr / cli** — DONE. `@youneed/server-plugin-ssr/protocol` `ssrDomain(() =>
   inspect())` (rides the server target via `devtools({ domains: [...] })`);
   `@youneed/cli-plugin-devtools/protocol` `cliDomain(host)` (`CLI.getCatalog` +
   `CLI.run`) / `createCliTarget`. **test** adapter = follow-up (SSE already a
   one-way transport).
6. ✅ **Hub + shell + built-in UI extensions** — DONE.
   - Hub: `serveProtocol` mounts `{path}/json` (CDP `/json/list` analog) listing
     the server target (`webSocketDebuggerUrl: {path}/ws`) + declared
     `externalTargets`.
   - Shell: `@youneed/devtools-protocol/shell` `<youneed-devtools discovery="...">`
     — fetches `/json`, connects WS, renders a tab per `extensionsFor(target)`,
     handing each a live target-scoped client. Served at `{path}/unified`.
   - Built-in UI extensions: `@youneed/devtools-protocol/extensions` register
     GENERIC panels for `Topology`/`Components`/`SSR`/`CLI` — each talks to its
     domain ONLY through the client, never importing the surface package. Bundled
     into the server devtools web bundle (`web.ts`).

7. ✅ **Front-bridge relay** — DONE. A page connects OUT to `{path}/register` and
   serves its target there (`bridgeToHub(url, target)` core / `bridgeComponents`
   frontend). The hub records it, lists it in `/json` (with a `sessionId`), and
   RELAYS frames between the unified UI (`{path}/ws`) and the page, multiplexed by
   CDP-style `sessionId` (= remote target id). UI: `hub.attach{targetId}` →
   `createClient(transport, { sessionId })`. So one shell inspects front + back.
8. ✅ **`Network` + `Log` domains** — DONE. `networkTap()` (global middleware +
   `Network` domain: `getRecent`/`enable`/`disable` + `requestWillBeSent`/
   `responseReceived` events) and `logTap()` (`Log` domain + `push()`), both
   mounted by `serveProtocol` (`network: false` to skip). `serveProtocol` returns
   a `ProtocolHandle` = target + `.log(...)`. Built-in UI extensions for both.

9. ✅ **Legacy UI removed** — DONE. The old `<server-devtools>` shell, the
   `topology.json`/`try-guard` HTTP routes, the React-Flow island and the
   `kind`-renderer bootstrap are gone (pre-release, no back-compat needed). The
   devtools plugin now serves ONLY the unified shell at `{path}` + the protocol
   endpoints. Bundle dropped ~1.9mb → ~72kb. (`registry.ts` + the per-plugin
   `/devtools` kind-renderers remain on disk but are no longer bundled; superseded
   by domain UI extensions.)

### Remaining
- **test** adapter (SSE → `Test.*` events) — trivial, deferred.
- Richer/custom per-surface UI extensions (built-ins are minimal snapshots +
  refresh; live auto-update needs component-based panels); shad styling, drawers,
  folding in the legacy `kind`-renderer features.

### The extension model (answers "one protocol, many UIs")

Two distinct extension points, deliberately split:

- **Protocol extension = a `Domain`** (`defineDomain`, in the pure core): new
  *capabilities* (commands + events). What's observable.
- **UI extension = a `DevtoolsExtension`** (`registerExtension`, in `./ui`): how a
  domain *draws itself*. Keyed by `domain`, handed a live, target-scoped
  `DevtoolsClient`. What's shown.

Each surface ships ONE `/devtools` module that does both: `target.register(MyDomain)`
on the server/runtime side, and `registerExtension({ domain: "MyDomain", panel })`
on the UI side. The shell reads `Target.getInfo().domains`, calls
`extensionsFor(target)`, and renders a tab per `(advertised domain × registered
extension)`. Add a new surface → add a package; the shell and protocol are
untouched. This generalises today's `server-plugin-devtools` `kind`-renderer
registry (static `inspect()` snapshot → live client).

---

## 13. Open questions

- **Auth / safety.** The protocol exposes a lot. Gate the WS endpoint behind the
  same dev-only guard as `serveDevtools` today, plus an optional token in
  `/json`. Never mount in production.
- **Frontend reachability.** A browser page can't be *dialed*; it must connect
  *out* to the hub (WS client) to be inspectable remotely. In-page UI stays the
  zero-config default; remote is opt-in.
- **Backpressure** on high-volume events (`Network`, `Log`): coalesce/sample in
  the domain before `emit`, and honour `enable/disable` strictly.
- **Versioning.** `Protocol.getDomains.version`; the client tolerates unknown
  domains/commands (forward-compatible, like CDP).
```
