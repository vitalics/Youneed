// ── @youneed/server-plugin-ssr/protocol — the SSR DOMAIN ──────────────────────
//
// Exposes the SSR plugin's surface (pages, satellite modules) over
// `@youneed/devtools-protocol`. The SSR domain rides the SAME server target as
// `Topology` — register it via the devtools plugin's `domains` option:
//
//   const pages = ssr({ pages: [...], modules: [sitemap(), robots()] });
//   app.plugin(pages, devtools({ domains: [ssrDomain(() => pages.inspect?.()) ] }));

import { defineDomain, type Domain } from "@youneed/devtools-protocol";

/** The shape `ssr().inspect()` returns. */
export interface SsrInspect {
  kind: "ssr";
  origin?: string;
  pages: number;
  modules: Array<{ name: string; info?: unknown }>;
}

/**
 * The `SSR` domain — wraps the SSR plugin's `inspect()`:
 *   • `SSR.get`         → the full inspect payload
 *   • `SSR.getModules`  → satellite modules + their own `inspect()` info
 */
export function ssrDomain(source: () => SsrInspect | undefined): Domain {
  return defineDomain({
    domain: "SSR",
    description: "SSR pages + satellite modules (robots/sitemap/rss/llms)",
    commands: {
      get: { description: "the SSR inspect payload", handler: () => source() ?? null },
      getModules: { description: "satellite modules", handler: () => source()?.modules ?? [] },
    },
  });
}
