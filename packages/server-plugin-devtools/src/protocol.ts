// ── @youneed/server-plugin-devtools/protocol — the Topology DOMAIN ────────────
//
// Ports the server's topology/audit/OpenAPI/guard-trial capabilities onto
// `@youneed/devtools-protocol`: a `Topology` DOMAIN served over a WebSocket so a
// unified devtools client speaks the same CDP-style protocol to every surface.
//
// The pure analysis still lives in `./core.ts`; this is a thin domain wrapper +
// a per-connection WS transport adapter. The legacy HTTP `topology.json` route
// (see `./serve.ts`) stays for back-compat — this runs alongside it.

import { t } from "@youneed/schema";
import { createTarget, defineDomain, type Domain, type Frame, type Transport, type DevtoolsTarget, type TargetInfo } from "@youneed/devtools-protocol";
import { Response, type AppBuilder, type WsHandlers } from "@youneed/server";
import { fromApp, securityAudit, auditGrade, toOpenApi, toAsyncApi, type ServerInfo } from "./core.ts";
import { networkTap, logTap, type LogTap } from "./realtime.ts";

/** The HTTP surface we need from the app (a subset of `@youneed/server`'s AppBuilder). */
type ProtocolApp = AppBuilder & {
  ws(path: string, handlers: WsHandlers): unknown;
  tryGuards(
    method: string,
    path: string,
    init?: { headers?: Record<string, string>; params?: Record<string, string>; query?: Record<string, string>; body?: unknown },
  ): Promise<unknown>;
};

export interface TopologyMeta {
  name: string;
  url?: string;
  /** Security-relevant middleware names (overrides the app's best-effort list). */
  middleware?: string[];
}

interface TryGuardParams {
  method: string;
  path: string;
  init?: { headers?: Record<string, string>; params?: Record<string, string>; query?: Record<string, string>; body?: unknown };
}

/**
 * The `Topology` domain — wraps `./core.ts`:
 *   • `Topology.get`       → {@link ServerInfo} (the live topology)
 *   • `Topology.audit`     → OWASP findings   · `Topology.grade` → roll-up
 *   • `Topology.openapi`   → OpenAPI 3.1 document
 *   • `Topology.tryGuard`  → run a route's guards against synthetic input
 *   • event `routesChanged` (fire on hot-reload / dynamic mount)
 */
export function topologyDomain(app: ProtocolApp, meta: TopologyMeta): Domain {
  const info = (): ServerInfo => fromApp(app, meta);
  return defineDomain({
    domain: "Topology",
    description: "server routes, security audit, OpenAPI, guard trials",
    commands: {
      get: { description: "the live server topology", result: t.json<ServerInfo>(), handler: () => info() },
      audit: { description: "OWASP-aligned security findings", handler: () => securityAudit(info()) },
      grade: { description: "audit roll-up: pass | warning | error", handler: () => auditGrade(securityAudit(info())) },
      openapi: {
        description: "OpenAPI 3.1 document",
        params: t.json<{ title?: string; version?: string }>(),
        handler: (p: { title?: string; version?: string } | undefined) => toOpenApi(info(), p ?? {}),
      },
      tryGuard: {
        description: "run a route's guards against synthetic input (no handler)",
        params: t.json<TryGuardParams>(),
        handler: (p: TryGuardParams) => app.tryGuards(p.method, p.path, p.init ?? {}),
      },
    },
    events: { routesChanged: { description: "routes changed (hot-reload / dynamic mount)" } },
  });
}

/** A discovered target (the CDP `/json/list` entry) — adds the WS URL. */
export interface TargetDescriptor extends TargetInfo {
  /** WebSocket URL to drive this target (relative to the page origin, or absolute). */
  webSocketDebuggerUrl: string;
  /** For a relayed (front-bridge) target: the session id the UI must `hub.attach` +
   *  thread on every command. Absent for the directly-served server target. */
  sessionId?: string;
}

/**
 * The `Infra` domain — surfaces mounted server plugins via their `inspect()`
 * (jobs schedule, pub/sub channels, ORM schema, …):
 *   • `Infra.get` → `[{ name, info }]` (one per plugin with an `inspect()`)
 */
export function infraDomain(app: ProtocolApp, meta: TopologyMeta): Domain {
  return defineDomain({
    domain: "Infra",
    description: "mounted server plugins (jobs, pub/sub, ORM, …)",
    commands: {
      get: { description: "plugins + their inspect() info", handler: () => fromApp(app, meta).plugins ?? [] },
    },
  });
}

/**
 * The `ApiDocs` domain — the full generated API documents, so they can be viewed
 * whole in one tab (rather than route-by-route):
 *   • `ApiDocs.openapi`  → OpenAPI 3.1 document (HTTP routes)
 *   • `ApiDocs.asyncapi` → AsyncAPI 2.6 document (WebSocket + SSE channels)
 */
export function apiDocsDomain(app: ProtocolApp, meta: TopologyMeta): Domain {
  const info = (): ServerInfo => fromApp(app, meta);
  return defineDomain({
    domain: "ApiDocs",
    description: "OpenAPI + AsyncAPI documents",
    commands: {
      openapi: {
        description: "OpenAPI 3.1 document (HTTP routes)",
        params: t.json<{ title?: string; version?: string }>(),
        handler: (p: { title?: string; version?: string } | undefined) => toOpenApi(info(), p ?? {}),
      },
      asyncapi: {
        description: "AsyncAPI 2.6 document (WebSocket + SSE channels)",
        params: t.json<{ title?: string; version?: string }>(),
        handler: (p: { title?: string; version?: string } | undefined) => toAsyncApi(info(), p ?? {}),
      },
    },
  });
}

export interface ServeProtocolOptions extends Partial<TopologyMeta> {
  /** Devtools mount prefix (the WS endpoint is `{path}/ws`). Default `/__devtools`. */
  path?: string;
  /** Extra domains to register on the target (e.g. `Network`, future surfaces). */
  domains?: Domain[];
  /** Other targets to advertise in `{path}/json` (e.g. a frontend dev server's
   *  devtools WS) — declared, not introspected. The hub just lists them. */
  externalTargets?: TargetDescriptor[];
  /** Mount the `Network` request-waterfall tap (global middleware). Default `true`. */
  network?: boolean;
}

/** What {@link serveProtocol} returns: the server {@link DevtoolsTarget} plus a
 *  `log()` to feed the `Log` domain. */
export type ProtocolHandle = DevtoolsTarget & { log: LogTap["push"] };

/**
 * Mount the protocol WS endpoint (`{path}/ws`) and return the {@link DevtoolsTarget}.
 * Each WS connection gets its own session; the target serves it over a transport
 * bridged from `@youneed/server`'s WS handlers. Register more domains with
 * `opts.domains` (or on the returned target before listen).
 */
export function serveProtocol(app: ProtocolApp, opts: ServeProtocolOptions = {}): ProtocolHandle {
  const base = (opts.path ?? "/__devtools").replace(/\/$/, "");
  const meta: TopologyMeta = { name: opts.name ?? "server", url: opts.url, middleware: opts.middleware };

  // Live taps: Network (a global middleware) + Log (push-fed).
  const net = opts.network === false ? undefined : networkTap();
  const log = logTap();
  if (net) app.use(net.middleware);

  const target = createTarget({ kind: "server", title: meta.name, url: meta.url }).register(
    topologyDomain(app, meta),
    apiDocsDomain(app, meta),
    infraDomain(app, meta),
    ...(net ? [net.domain] : []),
    log.domain,
    ...(opts.domains ?? []),
  );

  // ── front-bridge relay ──────────────────────────────────────────────────────
  // A page can't be dialled, so it CONNECTS OUT to `{base}/register` and serves
  // its own target there. The hub records it + relays frames between the unified
  // UI (`{base}/ws`) and the page, multiplexed by CDP-style `sessionId` (= the
  // remote target id). So one UI inspects front + back together.
  interface Remote {
    info: TargetInfo;
    send: (f: Frame) => void;
  }
  const remotes = new Map<string, Remote>();
  const attachedUI = new Map<string, Set<{ send: (f: Frame) => void }>>();
  let remoteSeq = 0;

  // Hub discovery (CDP `/json/list` analog): server target + relayed pages + externals.
  app.get(`${base}/json`, () =>
    Response.json([
      { ...target.info(), webSocketDebuggerUrl: `${base}/ws` },
      ...[...remotes.values()].map((r) => ({ ...r.info, webSocketDebuggerUrl: `${base}/ws`, sessionId: r.info.id })),
      ...(opts.externalTargets ?? []),
    ] satisfies TargetDescriptor[]),
  );

  // UI side: local server target + relay to remotes by sessionId.
  const conns = new WeakMap<object, { cb?: (f: Frame) => void; detach: () => void; out: { send: (f: Frame) => void } }>();
  app.ws(`${base}/ws`, {
    open(ws) {
      const out = { send: (f: Frame) => ws.send(JSON.stringify(f)) };
      const entry = { cb: undefined as ((f: Frame) => void) | undefined, detach: () => {}, out };
      entry.detach = target.serve({ send: out.send, onMessage: (cb) => ((entry.cb = cb), () => (entry.cb = undefined)) });
      conns.set(ws as object, entry);
    },
    message(ws, message) {
      const entry = conns.get(ws as object);
      if (!entry) return;
      let frame: Frame;
      try {
        frame = JSON.parse(message) as Frame;
      } catch {
        return;
      }
      // Hub control: attach a UI session to a remote target.
      if ("method" in frame && frame.method === "hub.attach" && "id" in frame) {
        const targetId = (frame.params as { targetId?: string } | undefined)?.targetId ?? "";
        if (!attachedUI.has(targetId)) attachedUI.set(targetId, new Set());
        attachedUI.get(targetId)!.add(entry.out);
        entry.out.send({ id: frame.id, result: { sessionId: targetId } });
        return;
      }
      // A command for a remote target → forward to the page; else handle locally.
      const remote = "sessionId" in frame && frame.sessionId ? remotes.get(frame.sessionId) : undefined;
      if (remote) remote.send(frame);
      else entry.cb?.(frame);
    },
    close(ws) {
      const entry = conns.get(ws as object);
      entry?.detach();
      if (entry) for (const set of attachedUI.values()) set.delete(entry.out);
      conns.delete(ws as object);
    },
  });

  // Page side: a registering target. First frame is `hub.register`; thereafter the
  // page's responses/events flow back to whichever UI sessions attached.
  const pageIds = new WeakMap<object, string>();
  app.ws(`${base}/register`, {
    message(ws, message) {
      let frame: Frame;
      try {
        frame = JSON.parse(message) as Frame;
      } catch {
        return;
      }
      if ("method" in frame && frame.method === "hub.register") {
        const info = (frame.params as TargetInfo | undefined) ?? ({ id: "", kind: "dom", domains: [] } as TargetInfo);
        const id = info.id || `remote-${++remoteSeq}`;
        remotes.set(id, { info: { ...info, id }, send: (f) => ws.send(JSON.stringify(f)) });
        pageIds.set(ws as object, id);
        ws.send(JSON.stringify({ method: "hub.registered", params: { id } } satisfies Frame));
        return;
      }
      // Page → UI: route by sessionId (= the remote id) to attached UI sessions.
      const sid = "sessionId" in frame ? frame.sessionId : undefined;
      if (sid) for (const ui of attachedUI.get(sid) ?? []) ui.send(frame);
    },
    close(ws) {
      const id = pageIds.get(ws as object);
      if (id) remotes.delete(id);
    },
  });

  return Object.assign(target, { log: log.push });
}
