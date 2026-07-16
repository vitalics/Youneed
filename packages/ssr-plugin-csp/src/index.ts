// @youneed/ssr-plugin-csp — Content-Security-Policy tuned for SSR.
//
// SSR injects several INLINE scripts (hydration JSON, speculation rules, JSON-LD,
// the devtools payload). A strict CSP blocks inline scripts unless they carry a
// matching nonce — so this middleware:
//   1. generates a per-request nonce,
//   2. rewrites the document's <script> tags to carry it,
//   3. sets the Content-Security-Policy header with `'nonce-…'` in script-src.
//
// It only touches DOCUMENT responses (Accept: text/html) so API/JSON traffic is
// untouched and unbuffered.
//
//   import { ssr } from "@youneed/server-plugin-ssr";
//   import { csp } from "@youneed/ssr-plugin-csp";
//
//   app.plugin(ssr({ pages: [Home], modules: [csp({ directives: { "img-src": ["'self'", "https://cdn"] } })] }));
//
// Or standalone, as plain server middleware:
//
//   import { cspMiddleware } from "@youneed/ssr-plugin-csp";
//   app.use(cspMiddleware());

import { randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
import type { Context, Middleware } from "@youneed/server";
import type { SsrModule } from "@youneed/server-plugin-ssr";

export type DirectiveValue = string | string[] | boolean;

export interface CspOptions {
  /** Directives merged OVER the defaults (a key replaces that directive whole;
   *  `false` drops it). E.g. `{ "img-src": ["'self'", "https://cdn"] }`. */
  directives?: Record<string, DirectiveValue>;
  /** Emit `Content-Security-Policy-Report-Only` instead of enforcing. */
  reportOnly?: boolean;
  /** Generate a nonce + rewrite inline `<script>`s. Default `true`. When off, a
   *  static header is sent and the body is left untouched (use hashes/allowlists). */
  nonce?: boolean;
  /** Also nonce `<style>` and drop `'unsafe-inline'` from style-src. Default
   *  `false` (shadow-DOM styles make blanket style nonces unreliable). */
  styleNonce?: boolean;
  /** Legacy `report-uri` directive. */
  reportUri?: string;
  /** `ctx.state` key the nonce is stored under. Default `"cspNonce"`. */
  stateKey?: string;
}

/** The default policy — strict, but allows inline styles (shadow DOM) by default. */
export const DEFAULT_DIRECTIVES: Record<string, DirectiveValue> = {
  "default-src": ["'self'"],
  "base-uri": ["'self'"],
  "object-src": ["'none'"],
  "script-src": ["'self'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:"],
  "font-src": ["'self'", "https:", "data:"],
  "frame-ancestors": ["'self'"],
};

const asArray = (v: Exclude<DirectiveValue, false>): string[] | true =>
  v === true ? true : Array.isArray(v) ? [...v] : [v];

/** Serialize directives into a CSP header value, weaving in the nonce. */
export function buildCspHeader(
  directives: Record<string, DirectiveValue>,
  opts: { nonce?: string; styleNonce?: boolean; reportUri?: string } = {},
): string {
  const merged: Record<string, string[] | true> = {};
  for (const [k, v] of Object.entries({ ...DEFAULT_DIRECTIVES, ...directives })) {
    if (v === false) continue;
    merged[k] = asArray(v);
  }
  if (opts.nonce) {
    const script = merged["script-src"];
    merged["script-src"] = [...(Array.isArray(script) ? script : ["'self'"]), `'nonce-${opts.nonce}'`];
    if (opts.styleNonce) {
      const style = merged["style-src"];
      const base = (Array.isArray(style) ? style : ["'self'"]).filter((x) => x !== "'unsafe-inline'");
      merged["style-src"] = [...base, `'nonce-${opts.nonce}'`];
    }
  }
  const parts: string[] = [];
  for (const [k, v] of Object.entries(merged)) parts.push(v === true ? k : `${k} ${v.join(" ")}`);
  if (opts.reportUri) parts.push(`report-uri ${opts.reportUri}`);
  return parts.join("; ");
}

/** Add `nonce="…"` to every `<script>` (and optionally `<style>`) lacking one. */
export function injectNonce(html: string, nonce: string, styleNonce = false): string {
  let out = html.replace(/<script(?=[\s>])(?![^>]*\snonce=)/gi, `<script nonce="${nonce}"`);
  if (styleNonce) out = out.replace(/<style(?=[\s>])(?![^>]*\snonce=)/gi, `<style nonce="${nonce}"`);
  return out;
}

/** Read the nonce generated for the current request (if any). */
export function getNonce(ctx: Context, stateKey = "cspNonce"): string | undefined {
  return ctx.state?.[stateKey] as string | undefined;
}

const isDocument = (accept: string): boolean => accept === "" || accept.includes("text/html") || accept.includes("*/*");

/** The CSP middleware (usable directly via `app.use`). */
export function cspMiddleware(options: CspOptions = {}): Middleware {
  const directives = options.directives ?? {};
  const useNonce = options.nonce !== false;
  const styleNonce = options.styleNonce === true;
  const stateKey = options.stateKey ?? "cspNonce";
  const headerName = options.reportOnly
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";

  return (ctx, next) => {
    const accept = String(ctx.request.headers["accept"] ?? "");
    // Only police document responses; leave API/asset traffic untouched.
    if (!isDocument(accept)) return next();

    if (!useNonce) {
      ctx.response.setHeader(headerName, buildCspHeader(directives, { reportUri: options.reportUri }));
      return next();
    }

    const nonce = randomBytes(16).toString("base64");
    ctx.state[stateKey] = nonce;

    const res = ctx.response as unknown as {
      write: (...a: unknown[]) => boolean;
      end: (...a: unknown[]) => unknown;
      getHeader: (n: string) => unknown;
      setHeader: (n: string, v: string) => void;
    };
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);
    const chunks: Buffer[] = [];
    const toBuf = (c: unknown, enc?: unknown) =>
      Buffer.isBuffer(c) ? c : Buffer.from(c as string, typeof enc === "string" ? (enc as BufferEncoding) : "utf8");
    const restore = () => {
      res.write = origWrite as typeof res.write;
      res.end = origEnd as typeof res.end;
    };

    res.write = (chunk?: unknown, enc?: unknown, cb?: unknown) => {
      if (chunk) chunks.push(toBuf(chunk, enc));
      if (typeof enc === "function") (enc as () => void)();
      else if (typeof cb === "function") (cb as () => void)();
      return true;
    };
    res.end = (chunk?: unknown, enc?: unknown, cb?: unknown) => {
      if (typeof chunk === "function") { cb = chunk; chunk = undefined; }
      else if (typeof enc === "function") { cb = enc; enc = undefined; }
      if (chunk) chunks.push(toBuf(chunk, enc));
      restore();
      const body = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
      const ct = String(res.getHeader("Content-Type") ?? "");
      // Body isn't actually HTML (a redirect, JSON error, …) — static header only.
      if (!/text\/html/i.test(ct)) {
        res.setHeader(headerName, buildCspHeader(directives, { reportUri: options.reportUri }));
        return origEnd(body, cb as undefined);
      }
      const html = injectNonce(body.toString("utf8"), nonce, styleNonce);
      const outBuf = Buffer.from(html, "utf8");
      res.setHeader(headerName, buildCspHeader(directives, { nonce, styleNonce, reportUri: options.reportUri }));
      res.setHeader("Content-Length", String(outBuf.length));
      return origEnd(outBuf, cb as undefined);
    };
    return next();
  };
}

/** An {@link SsrModule} that installs the CSP middleware on the app. */
export function csp(options: CspOptions = {}): SsrModule {
  return {
    name: "csp",
    setup(ctx) {
      ctx.app.use(cspMiddleware(options));
    },
    inspect() {
      return { kind: "csp", reportOnly: options.reportOnly === true, nonce: options.nonce !== false };
    },
  };
}
