// ── @youneed/server-plugin-devtools/realtime — Network + Log DOMAINS ──────────
//
// Live request-waterfall + log-stream domains for `@youneed/devtools-protocol`.
// A tiny in-process bus collects events; the domain's `enable` subscribes the
// session's `ctx.emit` to it (CDP-style), so a client only receives a stream
// after it asks. A ring buffer answers `getRecent` for late joiners.

import { isResult, type Context, type Middleware } from "@youneed/server";
import { defineDomain, type Domain } from "@youneed/devtools-protocol";

// ── event bus + ring buffer ───────────────────────────────────────────────────

export interface EventBus {
  on(cb: (event: string, params: unknown) => void): () => void;
  emit(event: string, params: unknown): void;
}

export function createEventBus(): EventBus {
  const subs = new Set<(event: string, params: unknown) => void>();
  return {
    on: (cb) => (subs.add(cb), () => subs.delete(cb)),
    emit: (event, params) => {
      for (const cb of [...subs]) cb(event, params);
    },
  };
}

function ring<T>(max: number): { push(v: T): void; all(): T[] } {
  const buf: T[] = [];
  return {
    push(v) {
      buf.push(v);
      if (buf.length > max) buf.shift();
    },
    all: () => [...buf],
  };
}

// ── Network ───────────────────────────────────────────────────────────────────

export interface NetworkEntry {
  requestId: string;
  method: string;
  path: string;
  status: number;
  ms: number;
  ts: number;
}

export interface NetworkTap {
  middleware: Middleware;
  domain: Domain;
}

/** A request-waterfall tap: a global middleware that times each request + emits
 *  `Network.requestWillBeSent` / `responseReceived`, and the `Network` domain.
 *  Mount the middleware app-wide; register the domain on the target. */
export function networkTap(opts: { recent?: number; clock?: () => number } = {}): NetworkTap {
  const bus = createEventBus();
  const recent = ring<NetworkEntry>(opts.recent ?? 100);
  const now = opts.clock ?? (() => Date.now());

  const middleware: Middleware = async (ctx: Context, next) => {
    const requestId = ctx.requestId;
    const method = (ctx.request.method ?? "GET").toUpperCase();
    const path = (ctx.request.url ?? "/").split("?")[0];
    const t0 = now();
    bus.emit("Network.requestWillBeSent", { requestId, method, path, ts: t0 });
    const result = await next();
    const status = isResult(result) ? result.status : ctx.response.statusCode || 200;
    const entry: NetworkEntry = { requestId, method, path, status, ms: now() - t0, ts: t0 };
    recent.push(entry);
    bus.emit("Network.responseReceived", entry);
    return result;
  };

  const domain = defineDomain({
    domain: "Network",
    description: "live HTTP request waterfall",
    commands: {
      getRecent: { description: "recently completed requests", handler: () => recent.all() },
      enable: {
        description: "start receiving Network.* events",
        handler: (_p, ctx) => {
          if (!ctx.session.netUnsub) ctx.session.netUnsub = bus.on((event, params) => ctx.emit(event.replace("Network.", ""), params));
          return { enabled: true };
        },
      },
      disable: {
        handler: (_p, ctx) => {
          (ctx.session.netUnsub as (() => void) | undefined)?.();
          ctx.session.netUnsub = undefined;
          return { enabled: false };
        },
      },
    },
    events: { requestWillBeSent: {}, responseReceived: {} },
  });

  return { middleware, domain };
}

// ── Log ─────────────────────────────────────────────────────────────────────

export interface LogEntry {
  level: string;
  message: string;
  meta?: Record<string, unknown>;
  ts: number;
  source?: string;
}

export interface LogTap {
  /** Push a log entry — feed from `@youneed/logger`, a middleware, or app code. */
  push(entry: Omit<LogEntry, "ts"> & { ts?: number }): void;
  domain: Domain;
}

/** A log-stream tap: push entries via `tap.push(...)`; the `Log` domain streams
 *  `Log.entryAdded` to enabled clients (+ `getRecent`). */
export function logTap(opts: { recent?: number; clock?: () => number } = {}): LogTap {
  const bus = createEventBus();
  const recent = ring<LogEntry>(opts.recent ?? 200);
  const now = opts.clock ?? (() => Date.now());

  const domain = defineDomain({
    domain: "Log",
    description: "live application log stream",
    commands: {
      getRecent: { handler: () => recent.all() },
      enable: {
        handler: (_p, ctx) => {
          if (!ctx.session.logUnsub) ctx.session.logUnsub = bus.on((_e, params) => ctx.emit("entryAdded", params));
          return { enabled: true };
        },
      },
      disable: {
        handler: (_p, ctx) => {
          (ctx.session.logUnsub as (() => void) | undefined)?.();
          ctx.session.logUnsub = undefined;
          return { enabled: false };
        },
      },
    },
    events: { entryAdded: {} },
  });

  return {
    push(e) {
      const entry: LogEntry = { ts: now(), ...e };
      recent.push(entry);
      bus.emit("Log.entryAdded", entry);
    },
    domain,
  };
}
