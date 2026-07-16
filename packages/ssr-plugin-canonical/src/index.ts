// @youneed/ssr-plugin-canonical — <link rel="canonical"> + hreflang alternates.
//
// By default every page gets a canonical link derived from the SSR `origin` and
// the request path. A page can override the URL (or opt out) via the `canonical`
// option, and declare `alternates` for hreflang.
//
//   import { ssr } from "@youneed/server-plugin-ssr";
//   import { canonical } from "@youneed/ssr-plugin-canonical";
//
//   class Page extends Page("/pricing", {
//     canonical: "/pricing",                // or `false` to omit, or (ctx) => "…"
//     alternates: [{ hreflang: "de", href: "/de/preise" }],
//   }) { … }
//
//   app.plugin(ssr({ origin: "https://example.com", pages: [Page], modules: [canonical()] }));

import { registerPageMiddleware, Link } from "@youneed/ssr";
import type { Context } from "@youneed/server";
import type { SsrModule, SsrModuleContext } from "@youneed/server-plugin-ssr";

/** An hreflang alternate link. */
export interface Alternate {
  hreflang: string;
  /** Path (absolute against `origin`) or an absolute URL. */
  href: string;
}

export type CanonicalInput = string | boolean | ((ctx: Context) => string | undefined);

export interface CanonicalOptions {
  /** Emit a canonical link automatically (from origin + path) when a page does
   *  not declare one. Default `true`. */
  auto?: boolean;
  /** Normalize the auto-derived path. Default `"preserve"`. */
  trailingSlash?: "preserve" | "strip" | "add";
}

// Augment PageOptions with `canonical` + `alternates`.
declare module "@youneed/ssr" {
  interface PageOptions {
    canonical?: CanonicalInput;
    alternates?: Alternate[];
  }
}

function normalize(path: string, mode: CanonicalOptions["trailingSlash"]): string {
  if (mode === "strip") return path.length > 1 ? path.replace(/\/+$/, "") : path;
  if (mode === "add") return /\/$/.test(path) || /\.[a-z0-9]+$/i.test(path) ? path : path + "/";
  return path;
}

/** An {@link SsrModule} that emits canonical + hreflang links per page. */
export function canonical(options: CanonicalOptions = {}): SsrModule {
  const auto = options.auto !== false;
  return {
    name: "canonical",
    setup(ctx: SsrModuleContext) {
      registerPageMiddleware((c) => {
        const out: string[] = [];
        const declared = c.options.canonical;

        let href: string | undefined;
        if (declared === false) {
          href = undefined;
        } else if (typeof declared === "string") {
          href = ctx.absolute(declared);
        } else if (typeof declared === "function") {
          const r = declared(c.ctx);
          href = r ? ctx.absolute(r) : undefined;
        } else if (auto) {
          // Prefer the live request path; fall back to the page's URL (SSG).
          const path = c.ctx.request?.url ? c.ctx.request.url.split("?")[0] : c.url;
          href = ctx.absolute(normalize(path, options.trailingSlash));
        }

        if (href) out.push(Link({ rel: "canonical", href }));
        for (const alt of c.options.alternates ?? []) {
          out.push(Link({ rel: "alternate", hreflang: alt.hreflang, href: ctx.absolute(alt.href) }));
        }
        return out;
      });
    },
    inspect() {
      return { kind: "canonical", auto };
    },
  };
}
