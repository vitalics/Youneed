// ── @youneed/server-middleware-request-id — correlation id per request ───────
//
// Assigns every request a stable id: reuses a trusted inbound `X-Request-Id`
// (so an id set by your load balancer / upstream flows through) or mints a fresh
// one. Exposes it on `ctx.state.requestId`, echoes it on the response, and — when
// a logger is present — every log line for the request carries it.
//
//   import { requestId, getRequestId } from "@youneed/server-middleware-request-id";
//   app.use(requestId());
//   app.get("/x", (ctx) => ({ id: getRequestId(ctx) }));

import { randomUUID } from "node:crypto";
import type { Context, Middleware } from "@youneed/server";

export interface RequestIdOptions {
  /** Inbound/echo header name (default `"x-request-id"`). */
  header?: string;
  /** Response header to echo the id on (default = `header`). Set `false` to skip. */
  responseHeader?: string | false;
  /** Mint a new id (default `crypto.randomUUID`). */
  generate?: () => string;
  /** Trust and reuse a client-supplied id when it passes `validate` (default true).
   *  Turn OFF at the edge of an untrusted boundary to avoid log-spoofing. */
  trustInbound?: boolean;
  /** Sanity-check an inbound id (default: 1–200 chars, `[\w.\-:]`). */
  validate?: (id: string) => boolean;
  /** Where to store the id on `ctx.state` (default `"requestId"`). */
  stateKey?: string;
}

const DEFAULT_VALID = /^[\w.\-:]{1,200}$/;

/** Read the request id assigned by `requestId()` (`""` if the middleware is absent). */
export function getRequestId(ctx: Context, stateKey = "requestId"): string {
  return (ctx.state[stateKey] as string | undefined) ?? "";
}

/**
 * Assign a correlation id to each request — reused from a trusted inbound header
 * or freshly generated — on `ctx.state[stateKey]`, echoed on the response, and
 * attached to the request logger (if any) so all its lines are correlated.
 */
export function requestId(opts: RequestIdOptions = {}): Middleware {
  const header = (opts.header ?? "x-request-id").toLowerCase();
  const responseHeader = opts.responseHeader === false ? undefined : (opts.responseHeader ?? opts.header ?? "X-Request-Id");
  const generate = opts.generate ?? randomUUID;
  const trustInbound = opts.trustInbound ?? true;
  const isValid = opts.validate ?? ((id: string) => DEFAULT_VALID.test(id));
  const stateKey = opts.stateKey ?? "requestId";

  return (ctx, next) => {
    const inbound = ctx.request.headers[header];
    const id = trustInbound && typeof inbound === "string" && isValid(inbound) ? inbound : generate();
    ctx.state[stateKey] = id;
    if (responseHeader) ctx.response.setHeader(responseHeader, id);

    // Correlate logs: if a logger middleware exposed a child-capable logger,
    // bind the id so every line for this request carries it.
    const log = ctx.state.log as { child?: (b: Record<string, unknown>) => unknown } | undefined;
    if (log?.child) ctx.state.log = log.child({ requestId: id });

    return next();
  };
}
