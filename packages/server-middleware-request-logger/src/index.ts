// @youneed/server middleware — log `METHOD url status durationms [requestId]` for
// every request (including errors). Register globally or scope it per route.
import { HttpError, isResult } from "@youneed/server";
import type { Middleware, HttpResponse } from "@youneed/server";
import type { Logger } from "@youneed/logger";

const ZERO_TRACE = "00000000000000000000000000000000";

export interface LoggerOptions {
  /** Sink for the formatted line (default console.log). */
  log?: (line: string) => void;
  /** Custom formatter; receives method, url, status, duration (ms), requestId. */
  format?: (info: { method: string; url: string; status: number; ms: number; requestId: string }) => string;
  /**
   * Structured logger. When provided, emits a structured record per request
   * (`logger.info("request", { method, url, status, ms, requestId, traceId? })`)
   * instead of the string formatter. 5xx / thrown errors use `logger.error`,
   * 4xx use `logger.warn`, everything else `logger.info`.
   */
  logger?: Logger;
}

function statusOf(result: unknown, res: HttpResponse): number {
  if (isResult(result)) return result.status;
  if (res.headersSent) return res.statusCode;
  return result === undefined || result === null ? 204 : 200;
}

function traceIdOf(state: Record<string, unknown>): string | undefined {
  const span = state.span as { traceId?: string } | undefined;
  if (span?.traceId && span.traceId !== ZERO_TRACE) return span.traceId;
  return undefined;
}

/** Logs `METHOD url status durationms [requestId]` for every request, incl. errors. */
export function requestLogger(opts: LoggerOptions = {}): Middleware {
  const logger = opts.logger;
  const out = opts.log ?? ((line) => console.log(line));
  const fmt =
    opts.format ??
    ((i) => `${i.method} ${i.url} ${i.status} ${i.ms.toFixed(1)}ms [${i.requestId}]`);
  return async (ctx, next) => {
    const start = performance.now();
    const { method = "GET", url = "/" } = ctx.request;
    try {
      const result = await next();
      const status = statusOf(result, ctx.response);
      const ms = performance.now() - start;
      if (logger) {
        const fields: Record<string, unknown> = {
          method,
          url,
          status,
          ms: Math.round(ms * 1000) / 1000,
          requestId: ctx.requestId,
        };
        const traceId = traceIdOf(ctx.state);
        if (traceId) fields.traceId = traceId;
        if (status >= 500) logger.error("request", fields);
        else if (status >= 400) logger.warn("request", fields);
        else logger.info("request", fields);
      } else {
        out(fmt({ method, url, status, ms, requestId: ctx.requestId }));
      }
      return result;
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      const ms = performance.now() - start;
      if (logger) {
        const fields: Record<string, unknown> = {
          method,
          url,
          status,
          ms: Math.round(ms * 1000) / 1000,
          requestId: ctx.requestId,
          err,
        };
        const traceId = traceIdOf(ctx.state);
        if (traceId) fields.traceId = traceId;
        logger.error("request", fields);
      } else {
        out(fmt({ method, url, status, ms, requestId: ctx.requestId }));
      }
      throw err;
    }
  };
}
