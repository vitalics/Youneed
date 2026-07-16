// @youneed/server middleware — stamp a bundle of hardening response headers
// (helmet defaults: CSP, HSTS, frameguard, etc.). Register globally or scope it.
import type { Middleware } from "@youneed/server";

export interface HelmetOptions {
  /** CSP string, or `false` to omit. Default: a strict self-only policy. */
  contentSecurityPolicy?: string | false;
  /** HSTS, or `false` to omit. Default: 180d + includeSubDomains. */
  hsts?: false | { maxAge?: number; includeSubDomains?: boolean; preload?: boolean };
  /** X-Frame-Options. Default "SAMEORIGIN". */
  frameguard?: false | "DENY" | "SAMEORIGIN";
  referrerPolicy?: string | false; // default "no-referrer"
  noSniff?: boolean; // X-Content-Type-Options: nosniff (default on)
  xssFilter?: boolean; // X-XSS-Protection: 0 (modern guidance; default on)
  crossOriginOpenerPolicy?: string | false; // default "same-origin"
  crossOriginResourcePolicy?: string | false; // default "same-origin"
  originAgentCluster?: boolean; // Origin-Agent-Cluster: ?1 (default on)
  dnsPrefetchControl?: boolean; // X-DNS-Prefetch-Control: off (default on)
  permittedCrossDomainPolicies?: string | false; // default "none"
}

const DEFAULT_CSP =
  "default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';" +
  "frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';" +
  "style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests";

/** Sets a bundle of hardening response headers (helmet defaults). */
export function helmet(opts: HelmetOptions = {}): Middleware {
  // The header set is static → compute once, just stamp it per request.
  const headers: [string, string][] = [];
  if (opts.contentSecurityPolicy !== false)
    headers.push(["Content-Security-Policy", opts.contentSecurityPolicy ?? DEFAULT_CSP]);
  if (opts.noSniff !== false) headers.push(["X-Content-Type-Options", "nosniff"]);
  if (opts.frameguard !== false) headers.push(["X-Frame-Options", opts.frameguard ?? "SAMEORIGIN"]);
  if (opts.referrerPolicy !== false) headers.push(["Referrer-Policy", opts.referrerPolicy ?? "no-referrer"]);
  if (opts.xssFilter !== false) headers.push(["X-XSS-Protection", "0"]);
  if (opts.crossOriginOpenerPolicy !== false)
    headers.push(["Cross-Origin-Opener-Policy", opts.crossOriginOpenerPolicy ?? "same-origin"]);
  if (opts.crossOriginResourcePolicy !== false)
    headers.push(["Cross-Origin-Resource-Policy", opts.crossOriginResourcePolicy ?? "same-origin"]);
  if (opts.originAgentCluster !== false) headers.push(["Origin-Agent-Cluster", "?1"]);
  if (opts.dnsPrefetchControl !== false) headers.push(["X-DNS-Prefetch-Control", "off"]);
  if (opts.permittedCrossDomainPolicies !== false)
    headers.push(["X-Permitted-Cross-Domain-Policies", opts.permittedCrossDomainPolicies ?? "none"]);
  if (opts.hsts !== false) {
    const h = opts.hsts ?? {};
    let v = `max-age=${h.maxAge ?? 15552000}`;
    if (h.includeSubDomains !== false) v += "; includeSubDomains";
    if (h.preload) v += "; preload";
    headers.push(["Strict-Transport-Security", v]);
  }
  return (ctx, next) => {
    const res = ctx.response;
    for (let i = 0; i < headers.length; i++) res.setHeader(headers[i][0], headers[i][1]);
    return next();
  };
}
