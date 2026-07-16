// ── @youneed/server-middleware-accept-language — request locale negotiation ──
//
// Server-driven content negotiation on the `Accept-Language` header (MDN:
// https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Content_negotiation).
// Parses the header's weighted language tags, picks the best match from YOUR
// supported locales, stashes it on `ctx.state.locale`, and advertises the choice
// with a `Content-Language` response header (+ `Vary: Accept-Language`).
//
//   import { Application } from "@youneed/server";
//   import { acceptLanguage } from "@youneed/server-middleware-accept-language";
//   import { i18n } from "./i18n.ts";
//
//   Application()
//     .use(acceptLanguage({ supported: ["en", "de", "fr"], default: "en", i18n }))
//     .get("/", (ctx) => Response.text(i18n("greeting", { name: ctx.state.locale })))
//     .listen(3000, () => {});
//
// Matching is case-insensitive and language-aware: a request for `de-AT` matches
// supported `de` (primary-subtag fallback), and `*` (when present and nothing
// else matched) takes the highest-priority supported locale. When an `i18n`
// translator is supplied its locale is set per request — handy for synchronous,
// single-locale-at-a-time handlers.

import type { Context, Middleware } from "@youneed/server";

export interface AcceptLanguageOptions {
  /** Locales you actually ship, most-preferred first (used to break ties / serve `*`). */
  supported: readonly string[];
  /** Fallback when the header is absent or matches nothing. Defaults to `supported[0]`. */
  default?: string;
  /** Where to stash the negotiated locale on `ctx.state` (default `"locale"`). */
  stateKey?: string;
  /** Set this translator's active locale per request (e.g. an `@youneed/i18n` instance). */
  i18n?: { setLocale(locale: string): void };
  /** Emit the `Content-Language` response header (default `true`). */
  contentLanguage?: boolean;
  /** Add `Vary: Accept-Language` so caches key on the header (default `true`). */
  vary?: boolean;
}

interface Weighted {
  /** Lowercased full tag, e.g. `"de-at"` or `"*"`. */
  tag: string;
  /** Lowercased primary subtag, e.g. `"de"`. */
  primary: string;
  /** Quality weight 0–1. */
  q: number;
  /** Header order (stable tie-break). */
  order: number;
}

/** Parse an `Accept-Language` header into entries sorted by descending quality. */
export function parseAcceptLanguage(header: string | undefined): Weighted[] {
  if (!header) return [];
  const out: Weighted[] = [];
  let order = 0;
  for (const part of header.split(",")) {
    const [rawTag, ...params] = part.trim().split(";");
    const tag = rawTag.trim().toLowerCase();
    if (!tag) continue;
    let q = 1;
    for (const p of params) {
      const m = /^\s*q=([0-9.]+)\s*$/i.exec(p);
      if (m) q = Math.max(0, Math.min(1, Number(m[1]) || 0));
    }
    out.push({ tag, primary: tag.split("-")[0], q, order: order++ });
  }
  // Higher q first; stable by header order within equal q.
  return out.sort((a, b) => b.q - a.q || a.order - b.order);
}

/**
 * Pick the best supported locale for an `Accept-Language` header. Tries, in
 * descending header priority: exact tag match, then primary-subtag match, then
 * `*` (any) mapped to the first supported locale. Returns `undefined` if nothing
 * (acceptable) matched — `q=0` explicitly rejects a tag.
 */
export function negotiateLanguage(
  header: string | undefined,
  supported: readonly string[],
): string | undefined {
  const wanted = parseAcceptLanguage(header).filter((w) => w.q > 0);
  if (!wanted.length || !supported.length) return undefined;
  // Lowercase lookup → original casing (first wins, preserving `supported` order).
  const byTag = new Map<string, string>();
  const byPrimary = new Map<string, string>();
  for (const s of supported) {
    const low = s.toLowerCase();
    if (!byTag.has(low)) byTag.set(low, s);
    const prim = low.split("-")[0];
    if (!byPrimary.has(prim)) byPrimary.set(prim, s);
  }
  for (const w of wanted) {
    if (w.tag === "*") return supported[0];
    const exact = byTag.get(w.tag);
    if (exact) return exact;
    const prim = byPrimary.get(w.primary);
    if (prim) return prim;
  }
  return undefined;
}

/** Negotiate the request locale from `Accept-Language` and stash it on `ctx.state`. */
export function acceptLanguage(opts: AcceptLanguageOptions): Middleware {
  const fallback = opts.default ?? opts.supported[0];
  const stateKey = opts.stateKey ?? "locale";
  return (ctx: Context, next) => {
    const header = ctx.request.headers["accept-language"];
    const locale =
      negotiateLanguage(typeof header === "string" ? header : undefined, opts.supported) ?? fallback;
    ctx.state[stateKey] = locale;
    opts.i18n?.setLocale(locale);
    if (opts.contentLanguage !== false) ctx.response.setHeader("Content-Language", locale);
    if (opts.vary !== false) {
      // Append rather than clobber a `Vary` set by e.g. compression.
      const prev = ctx.response.getHeader("Vary");
      const tokens = new Set(
        String(prev ?? "")
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
      );
      if (!tokens.has("*") && !tokens.has("accept-language")) {
        ctx.response.setHeader("Vary", prev ? `${prev}, Accept-Language` : "Accept-Language");
      }
    }
    return next();
  };
}
