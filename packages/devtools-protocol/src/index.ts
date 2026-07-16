// @youneed/devtools-protocol — the universal, CDP-style devtools spine.
//
// One wire format (JSON-RPC 2.0), one client, many TARGETS (a frontend page, a
// server, an SSR renderer, a CLI). A target hosts DOMAINS; a domain bundles
// COMMANDS (request → response) and EVENTS (target → client push). The whole
// core is transport-agnostic and free of node/dom imports, so both the browser
// UI and a node server import it. See DESIGN.md.
//
// Layering:
//   • this module        — protocol core (envelopes, transports, domains, target, client)
//   • ./ui (subpath)     — the domain-keyed UI extension registry (imports @youneed/dom)
//
// A DOMAIN is the *protocol* extension point (new capabilities); a UI EXTENSION
// (./ui) is how a domain DRAWS itself. One protocol, per-surface UI.

import type { Schema } from "@youneed/schema";

// ── wire envelope (JSON-RPC 2.0 + a CDP-style sessionId) ──────────────────────

export type Id = number | string;

export interface ProtocolError {
  code: number;
  message: string;
  data?: unknown;
}

/** Client → target: invoke a `Domain.command`. */
export interface Command {
  id: Id;
  sessionId?: string;
  method: string;
  params?: unknown;
}
/** Target → client: the reply to a {@link Command}. */
export interface ResponseFrame {
  id: Id;
  sessionId?: string;
  result?: unknown;
  error?: ProtocolError;
}
/** Target → client: a `Domain.event` push — a JSON-RPC notification (NO `id`). */
export interface EventFrame {
  sessionId?: string;
  method: string;
  params?: unknown;
}
export type Frame = Command | ResponseFrame | EventFrame;

const isCommand = (f: Frame): f is Command => "id" in f && "method" in f;
const isResponse = (f: Frame): f is ResponseFrame => "id" in f && !("method" in f);
const isEvent = (f: Frame): f is EventFrame => !("id" in f) && "method" in f;

/** Reserved JSON-RPC error codes (shared with `@youneed/server-plugin-jsonrpc`). */
export const ProtocolErrors = {
  ParseError: { code: -32700, message: "Parse error" },
  InvalidRequest: { code: -32600, message: "Invalid Request" },
  MethodNotFound: { code: -32601, message: "Method not found" },
  InvalidParams: { code: -32602, message: "Invalid params" },
  InternalError: { code: -32603, message: "Internal error" },
} as const satisfies Record<string, ProtocolError>;

// ── transport ─────────────────────────────────────────────────────────────────

/** A bidirectional frame pipe. WS, in-process, postMessage and SSE are adapters. */
export interface Transport {
  send(frame: Frame): void;
  /** Subscribe to inbound frames; returns an unsubscribe fn. */
  onMessage(cb: (frame: Frame) => void): () => void;
  close?(): void;
}

/** A linked in-process transport pair — `a` and `b` each receive what the other
 *  sends. For the in-page DOM inspector (UI ↔ capture) and for tests. */
export function inProcessTransport(): { a: Transport; b: Transport } {
  const aCbs = new Set<(f: Frame) => void>();
  const bCbs = new Set<(f: Frame) => void>();
  const emit = (set: Set<(f: Frame) => void>, f: Frame): void => {
    for (const cb of [...set]) cb(f);
  };
  return {
    a: { send: (f) => emit(bCbs, f), onMessage: (cb) => (aCbs.add(cb), () => aCbs.delete(cb)) },
    b: { send: (f) => emit(aCbs, f), onMessage: (cb) => (bCbs.add(cb), () => bCbs.delete(cb)) },
  };
}

/** Minimal WebSocket shape (browser `WebSocket` and node's global both satisfy it). */
export interface WebSocketLike {
  send(data: string): void;
  close(): void;
  addEventListener(type: "message", cb: (e: { data: unknown }) => void): void;
  removeEventListener(type: "message", cb: (e: { data: unknown }) => void): void;
}

/** Wrap an already-open WebSocket as a {@link Transport} (JSON text frames). */
export function fromWebSocket(ws: WebSocketLike): Transport {
  return {
    send: (f) => ws.send(JSON.stringify(f)),
    onMessage(cb) {
      const handler = (e: { data: unknown }): void => {
        let frame: Frame;
        try {
          frame = JSON.parse(String(e.data)) as Frame;
        } catch {
          return; // a non-JSON frame isn't ours
        }
        cb(frame);
      };
      ws.addEventListener("message", handler);
      return () => ws.removeEventListener("message", handler);
    },
    close: () => ws.close(),
  };
}

// ── schema → JSON Schema (for self-description) ───────────────────────────────

/** Render a `t.*` schema to a minimal JSON Schema (only the publicly-exposed
 *  shape: kind/optional/default/description). */
export function schemaToJson(s: Schema<unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  switch (s.kind) {
    case "number":
      out.type = "number";
      break;
    case "int":
    case "port":
      out.type = "integer";
      break;
    case "boolean":
      out.type = "boolean";
      break;
    case "url":
      out.type = "string";
      out.format = "uri";
      break;
    case "json":
      break; // any
    default:
      out.type = "string"; // string / enum
  }
  if (s.description) out.description = s.description;
  if (s.hasDefault) out.default = s.defaultValue;
  return out;
}

// ── domain model ──────────────────────────────────────────────────────────────

/** Per-connection scratch shared across a session's frames (e.g. `enable` flags). */
export type SessionState = Record<string, unknown>;

/** What a command handler is handed. */
export interface DomainContext {
  /** The session the command came in on (CDP-style; may be `undefined`). */
  sessionId?: string;
  /** Per-connection scratch (survives across frames). */
  session: SessionState;
  /** Push an EVENT of THIS domain to the calling client (`<domain>.<event>`). */
  emit(event: string, params?: unknown): void;
}

export interface CommandDef<P = any, R = any> {
  /** Param schema; validated before the handler runs (failure → `Invalid params`). */
  params?: Schema<P>;
  /** Result schema — only for self-description (`Protocol.getDomains`). */
  result?: Schema<R>;
  description?: string;
  handler(params: P, ctx: DomainContext): R | Promise<R>;
}

export interface EventDef<P = any> {
  params?: Schema<P>;
  description?: string;
}

export interface Domain {
  /** Namespace, e.g. `"Components"`, `"Topology"`, `"RPC"`. */
  domain: string;
  description?: string;
  commands?: Record<string, CommandDef>;
  events?: Record<string, EventDef>;
}

/** Declare a domain (schema-first, like `@JsonRPC.method`). Pure data. */
export function defineDomain(spec: Domain): Domain {
  return spec;
}

// ── self-description shapes (Protocol.getDomains) ─────────────────────────────

export interface ProtocolSpec {
  version: string;
  domains: Array<{
    domain: string;
    description?: string;
    commands: Array<{ name: string; description?: string; params?: Record<string, unknown>; result?: Record<string, unknown> }>;
    events: Array<{ name: string; description?: string; params?: Record<string, unknown> }>;
  }>;
}

// ── target description / discovery ────────────────────────────────────────────

export type TargetKind = "dom" | "server" | "ssr" | "cli" | "test" | (string & {});

export interface TargetInfo {
  id: string;
  kind: TargetKind;
  title?: string;
  url?: string;
  /** The domains this target implements (advertised so a UI shows only relevant tabs). */
  domains: string[];
}

// ── target (hosts domains, serves frames) ─────────────────────────────────────

let targetSeq = 0;

export interface DevtoolsTarget {
  /** Register one or more domains. Chainable. Rejects duplicate domain names. */
  register(...domains: Domain[]): this;
  info(): TargetInfo;
  /** Serve over a transport (one session). Returns a detach fn. */
  serve(transport: Transport): () => void;
  /** Dispatch a single command directly (in-proc / testing); events are dropped. */
  dispatch(command: Command, session?: SessionState): Promise<ResponseFrame>;
}

export function createTarget(opts: { id?: string; kind: TargetKind; title?: string; url?: string }): DevtoolsTarget {
  const domains = new Map<string, Domain>();
  const id = opts.id ?? `${opts.kind}-${++targetSeq}`;

  const info = (): TargetInfo => ({ id, kind: opts.kind, title: opts.title, url: opts.url, domains: [...domains.keys(), "Protocol", "Target"] });

  const getDomains = (): ProtocolSpec => ({
    version: "0.1",
    domains: [...domains.values()].map((d) => ({
      domain: d.domain,
      description: d.description,
      commands: Object.entries(d.commands ?? {}).map(([name, c]) => ({
        name,
        description: c.description,
        params: c.params ? schemaToJson(c.params as Schema<unknown>) : undefined,
        result: c.result ? schemaToJson(c.result as Schema<unknown>) : undefined,
      })),
      events: Object.entries(d.events ?? {}).map(([name, e]) => ({
        name,
        description: e.description,
        params: e.params ? schemaToJson(e.params as Schema<unknown>) : undefined,
      })),
    })),
  });

  // Run one command, emitting this domain's events through `emit`.
  const run = async (command: Command, emit: (frame: EventFrame) => void, session: SessionState): Promise<ResponseFrame> => {
    const reply = (patch: Partial<ResponseFrame>): ResponseFrame => ({ id: command.id, sessionId: command.sessionId, ...patch });
    const dot = command.method.indexOf(".");
    if (dot === -1) return reply({ error: { ...ProtocolErrors.InvalidRequest } });
    const domainName = command.method.slice(0, dot);
    const cmdName = command.method.slice(dot + 1);

    // Built-in introspection domains.
    if (domainName === "Protocol" && cmdName === "getDomains") return reply({ result: getDomains() });
    if (domainName === "Target" && cmdName === "getInfo") return reply({ result: info() });
    if (domainName === "Target" && cmdName === "getTargets") return reply({ result: [info()] });

    const domain = domains.get(domainName);
    const cmd = domain?.commands?.[cmdName];
    if (!domain || !cmd) return reply({ error: { ...ProtocolErrors.MethodNotFound, data: command.method } });

    let params: unknown = command.params;
    if (cmd.params) {
      const parsed = cmd.params.parse(command.params);
      if (!parsed.success) return reply({ error: { ...ProtocolErrors.InvalidParams, data: parsed.error.message } });
      params = parsed.value;
    }

    const ctx: DomainContext = {
      sessionId: command.sessionId,
      session,
      emit: (event, p) => emit({ sessionId: command.sessionId, method: `${domainName}.${event}`, params: p }),
    };
    try {
      const result = await cmd.handler(params, ctx);
      return reply({ result });
    } catch (e) {
      return reply({ error: { ...ProtocolErrors.InternalError, data: e instanceof Error ? e.message : String(e) } });
    }
  };

  return {
    register(...ds) {
      for (const d of ds) {
        if (d.domain === "Protocol" || d.domain === "Target") throw new Error(`devtools-protocol: "${d.domain}" is reserved`);
        if (domains.has(d.domain)) throw new Error(`devtools-protocol: duplicate domain "${d.domain}"`);
        domains.set(d.domain, d);
      }
      return this;
    },
    info,
    serve(transport) {
      const session: SessionState = {};
      const off = transport.onMessage((frame) => {
        if (!isCommand(frame)) return; // a target only handles commands
        void run(frame, (ev) => transport.send(ev), session).then((res) => transport.send(res));
      });
      return off;
    },
    async dispatch(command, session = {}) {
      return run(command, () => {}, session); // direct dispatch drops events
    },
  };
}

/**
 * Front-bridge: connect a target OUT to a hub's register endpoint and serve it
 * there, so a thing that can't be dialled (a browser page) becomes inspectable
 * through the hub. Sends `hub.register` with the target's info, then serves it
 * over the socket — the hub relays the unified UI's frames in and out.
 *
 *   bridgeToHub("ws://localhost:3000/__devtools/register", createComponentsTarget());
 */
export function bridgeToHub(hubUrl: string, target: DevtoolsTarget): { close(): void } {
  const ws = new WebSocket(hubUrl);
  const transport = fromWebSocket(ws as unknown as WebSocketLike);
  const register = (): void => ws.send(JSON.stringify({ method: "hub.register", params: target.info() } satisfies EventFrame));
  if (ws.readyState === 1) register();
  else ws.addEventListener("open", () => register());
  const detach = target.serve(transport);
  return {
    close() {
      detach();
      transport.close?.();
    },
  };
}

// ── client (typed driver over a transport) ────────────────────────────────────

export interface CommandOptions {
  sessionId?: string;
  signal?: AbortSignal;
}

export interface DevtoolsClient {
  /** Invoke a `Domain.command`; resolves with its result or rejects with the error. */
  command<R = unknown>(method: string, params?: unknown, opts?: CommandOptions): Promise<R>;
  /** Subscribe to an event. `method` is `"Domain.event"` or `"Domain.*"` for a domain. */
  on(method: string, cb: (params: unknown, event: EventFrame) => void): () => void;
  /** Fetch the target's self-description. */
  getDomains(): Promise<ProtocolSpec>;
  /** Fetch the attached target's info. */
  getInfo(): Promise<TargetInfo>;
  close(): void;
}

export function createClient(transport: Transport, defaults: { sessionId?: string } = {}): DevtoolsClient {
  let seq = 0;
  const pending = new Map<Id, { resolve: (v: unknown) => void; reject: (e: ProtocolError) => void }>();
  const listeners = new Map<string, Set<(params: unknown, event: EventFrame) => void>>();

  const off = transport.onMessage((frame) => {
    if (isResponse(frame)) {
      const p = pending.get(frame.id);
      if (!p) return;
      pending.delete(frame.id);
      if (frame.error) p.reject(frame.error);
      else p.resolve(frame.result);
    } else if (isEvent(frame)) {
      const exact = listeners.get(frame.method);
      const dot = frame.method.indexOf(".");
      const wildcard = dot === -1 ? undefined : listeners.get(`${frame.method.slice(0, dot)}.*`);
      for (const set of [exact, wildcard]) if (set) for (const cb of [...set]) cb(frame.params, frame);
    }
  });

  return {
    command<R>(method: string, params?: unknown, opts: CommandOptions = {}): Promise<R> {
      const id = ++seq;
      return new Promise<R>((resolve, reject) => {
        if (opts.signal?.aborted) return reject(new Error("aborted"));
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject: (e) => reject(Object.assign(new Error(e.message), e)) });
        opts.signal?.addEventListener("abort", () => {
          if (pending.delete(id)) reject(new Error("aborted"));
        });
        transport.send({ id, method, params, sessionId: opts.sessionId ?? defaults.sessionId });
      });
    },
    on(method, cb) {
      let set = listeners.get(method);
      if (!set) listeners.set(method, (set = new Set()));
      set.add(cb);
      return () => set!.delete(cb);
    },
    getDomains() {
      return this.command<ProtocolSpec>("Protocol.getDomains");
    },
    getInfo() {
      return this.command<TargetInfo>("Target.getInfo");
    },
    close() {
      off();
      transport.close?.();
    },
  };
}
