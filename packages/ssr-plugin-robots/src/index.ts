// @youneed/ssr-plugin-robots — a robots.txt SSR module.
//
//   import { ssr } from "@youneed/server-plugin-ssr";
//   import { robots } from "@youneed/ssr-plugin-robots";
//
//   app.plugin(ssr({
//     origin: "https://example.com",
//     modules: [
//       robots({
//         policies: [
//           { userAgent: "*", disallow: ["/admin", "/api"] },
//           { userAgent: "GPTBot", disallow: "/" },
//         ],
//         sitemap: true, // → Sitemap: https://example.com/sitemap.xml
//       }),
//     ],
//   }));
//
// The default (no policies) is the permissive "allow everything" file.

import { Response } from "@youneed/server";
import type { SsrModule, SsrModuleContext } from "@youneed/server-plugin-ssr";

/** One `User-agent` block: its agents plus their allow/disallow rules. */
export interface RobotsPolicy {
  /** Agent(s) the block applies to. Default `"*"` (all crawlers). */
  userAgent?: string | string[];
  /** Path prefixes the agent may crawl. */
  allow?: string | string[];
  /** Path prefixes the agent must not crawl. */
  disallow?: string | string[];
  /** `Crawl-delay` in seconds (non-standard, honored by Bing/Yandex). */
  crawlDelay?: number;
}

export interface RobotsOptions {
  /** Served path. Default `"/robots.txt"`. */
  path?: string;
  /** `User-agent` blocks. Default: a single `User-agent: *` / `Disallow:` (all). */
  policies?: RobotsPolicy[];
  /**
   * `Sitemap:` line(s). A string/array is used verbatim (resolved to absolute
   * against `origin`); `true` points at the conventional `/sitemap.xml`.
   */
  sitemap?: string | string[] | boolean;
  /** Optional `Host:` directive (preferred mirror; Yandex). */
  host?: string;
}

const toLines = (v: string | string[] | undefined): string[] =>
  v == null ? [] : Array.isArray(v) ? v : [v];

/** Render the robots.txt body for the given options + SSR context. */
export function buildRobots(options: RobotsOptions, ctx: SsrModuleContext): string {
  const policies = options.policies?.length
    ? options.policies
    : [{ userAgent: "*", disallow: "" } satisfies RobotsPolicy];

  const blocks: string[] = [];
  for (const policy of policies) {
    const lines: string[] = [];
    for (const agent of toLines(policy.userAgent).length ? toLines(policy.userAgent) : ["*"]) {
      lines.push(`User-agent: ${agent}`);
    }
    for (const allow of toLines(policy.allow)) lines.push(`Allow: ${allow}`);
    const disallow = toLines(policy.disallow);
    // An empty disallow ("allow all") is meaningful — keep the bare directive.
    if (disallow.length === 0 && !policy.allow) lines.push("Disallow:");
    for (const d of disallow) lines.push(`Disallow: ${d}`);
    if (policy.crawlDelay != null) lines.push(`Crawl-delay: ${policy.crawlDelay}`);
    blocks.push(lines.join("\n"));
  }

  const trailer: string[] = [];
  const sitemaps =
    options.sitemap === true
      ? [ctx.absolute("/sitemap.xml")]
      : toLines(options.sitemap === false ? undefined : options.sitemap).map((s) => ctx.absolute(s));
  for (const s of sitemaps) trailer.push(`Sitemap: ${s}`);
  if (options.host) trailer.push(`Host: ${options.host}`);

  return [blocks.join("\n\n"), trailer.join("\n")].filter(Boolean).join("\n\n") + "\n";
}

/** A robots.txt {@link SsrModule}. */
export function robots(options: RobotsOptions = {}): SsrModule {
  const path = options.path ?? "/robots.txt";
  return {
    name: "robots",
    setup(ctx) {
      const body = buildRobots(options, ctx);
      ctx.app.get(path, () =>
        Response.text(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } }),
      );
    },
    inspect() {
      return { kind: "robots", path, policies: options.policies?.length ?? 1, sitemap: !!options.sitemap };
    },
  };
}
