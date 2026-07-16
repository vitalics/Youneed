// @youneed/ssr-plugin-preload — resource hints in the document head.
//
// Complements @youneed/ssr-plugin-speculation: speculation tells the browser
// which PAGES to prefetch/prerender; this declares the RESOURCES the current
// page needs early (preload/modulepreload/preconnect/dns-prefetch/prefetch).
//
//   import { ssr } from "@youneed/server-plugin-ssr";
//   import { preload } from "@youneed/ssr-plugin-preload";
//
//   class Home extends Page("/", {
//     preload: [
//       { rel: "preload", href: "/fonts/inter.woff2", as: "font", type: "font/woff2", crossorigin: true },
//       { rel: "modulepreload", href: "/client.js" },
//     ],
//   }) { … }
//
//   app.plugin(ssr({
//     pages: [Home],
//     modules: [preload({ hints: [{ rel: "preconnect", href: "https://cdn.example.com" }] })],
//   }));

import { registerPageMiddleware, Link } from "@youneed/ssr";
import type { Context } from "@youneed/server";
import type { SsrModule, SsrModuleContext } from "@youneed/server-plugin-ssr";

export type HintRel = "preload" | "modulepreload" | "prefetch" | "preconnect" | "dns-prefetch";

export type HintAs =
  | "script"
  | "style"
  | "font"
  | "image"
  | "fetch"
  | "document"
  | "audio"
  | "video"
  | "track"
  | "worker"
  | "embed"
  | "object";

/** One resource hint → a `<link>`. */
export interface ResourceHint {
  /** Default `"preload"`. */
  rel?: HintRel;
  /** Path (absolute against `origin`) or an absolute URL. */
  href: string;
  as?: HintAs;
  type?: string;
  crossorigin?: boolean | "anonymous" | "use-credentials";
  media?: string;
  /** Hint priority — `<link fetchpriority>`. */
  fetchpriority?: "high" | "low" | "auto";
  /** For `rel="preload" as="image"` responsive sources. */
  imagesrcset?: string;
  imagesizes?: string;
}

export interface PreloadOptions {
  /** Site-wide hints emitted on every page (e.g. preconnect to a CDN). */
  hints?: ResourceHint[];
}

// Augment PageOptions with `preload`.
declare module "@youneed/ssr" {
  interface PageOptions {
    preload?: ResourceHint[] | ((ctx: Context) => ResourceHint[]);
  }
}

/** Render one resource hint to a `<link>`. Exported for tests. */
export function hintLink(hint: ResourceHint, ctx: SsrModuleContext): string {
  const crossorigin =
    hint.crossorigin === true ? "anonymous" : hint.crossorigin === false ? undefined : hint.crossorigin;
  // preconnect/dns-prefetch take an origin verbatim; the rest resolve to absolute.
  const verbatim = hint.rel === "preconnect" || hint.rel === "dns-prefetch";
  return Link({
    rel: hint.rel ?? "preload",
    href: verbatim ? hint.href : ctx.absolute(hint.href),
    as: hint.as,
    type: hint.type,
    crossorigin,
    media: hint.media,
    fetchpriority: hint.fetchpriority,
    imagesrcset: hint.imagesrcset,
    imagesizes: hint.imagesizes,
  });
}

/** An {@link SsrModule} that emits resource hints per page (+ site-wide hints). */
export function preload(options: PreloadOptions = {}): SsrModule {
  const siteHints = options.hints ?? [];
  return {
    name: "preload",
    setup(ctx: SsrModuleContext) {
      registerPageMiddleware((c) => {
        const declared = c.options.preload;
        const pageHints = typeof declared === "function" ? declared(c.ctx) : declared ?? [];
        return [...siteHints, ...pageHints].map((h) => hintLink(h, ctx));
      });
    },
    inspect() {
      return { kind: "preload", siteHints: siteHints.length };
    },
  };
}
