// @youneed/ssr-plugin-feature-flags — evaluate feature flags on the SERVER during
// SSR and inject the resulting snapshot into every rendered page, so the client
// can hydrate the exact same values without shipping flag definitions.
//
//   import { ssr } from "@youneed/server-plugin-ssr";
//   import { createFlags } from "@youneed/feature-flags";
//   import { featureFlags } from "@youneed/ssr-plugin-feature-flags";
//
//   const flags = createFlags([
//     { key: "new-dashboard", defaultValue: false, rollout: 20 },
//   ]);
//
//   app.plugin(ssr({
//     origin: "https://example.com",
//     modules: [
//       featureFlags(flags, {
//         // derive the evaluation context from each request (cookies, session, …)
//         context: (req) => ({ targetingKey: req.cookies?.uid }),
//       }),
//     ],
//   }));
//
// On every render this emits, into the page <head>:
//
//   <script>window.__FLAGS__ = {"new-dashboard":{"key":"new-dashboard","value":true,"reason":"ROLLOUT"}}</script>
//
// The client rehydrates via `@youneed/dom-provider-feature-flags`:
//
//   import { hydrateFlags } from "@youneed/dom-provider-feature-flags";
//   hydrateFlags(window.__FLAGS__); // reads the injected global → fromSnapshot(...)
//
// Like structured-data (and unlike robots/sitemap/rss/llms, which serve their own
// routes), this module embeds its output in the document head via the SSR
// context's `head()` registration rather than mounting a route.

import type { Context } from "@youneed/server";
import type { SsrModule, SsrModuleContext } from "@youneed/server-plugin-ssr";
import type { EvaluationContext, FeatureFlags } from "@youneed/feature-flags";

/** Options for the {@link featureFlags} SSR module. */
export interface FeatureFlagsSsrOptions {
  /** Derive the {@link EvaluationContext} to evaluate against, per request.
   *  Omit to evaluate anonymously (`{}`). */
  context?: (req: Context) => EvaluationContext;
  /** Global variable the snapshot is assigned to on `window`. Default `"__FLAGS__"`. */
  globalVar?: string;
}

// A valid JS identifier or a safe dotted path (e.g. "window.__FLAGS__" is passed
// as "__FLAGS__"). We only allow bare identifier chars so the assignment target
// can never break out of the assignment expression.
const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Neutralize `</script>` and HTML-comment openers so the JSON can't break out of
 *  the inline `<script>`. */
const escapeScript = (json: string): string =>
  json.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "\\u003c!--");

/**
 * Serialise an evaluated snapshot into an inline `<script>` that assigns it to
 * `window[globalVar]`. Exported for testing / advanced injection.
 */
export function flagsScript(snapshot: Record<string, unknown>, globalVar = "__FLAGS__"): string {
  const name = IDENT.test(globalVar) ? globalVar : "__FLAGS__";
  const json = escapeScript(JSON.stringify(snapshot));
  return `<script>window.${name} = ${json}</script>`;
}

/**
 * An SSR {@link SsrModule} that, on each render, evaluates EVERY flag against the
 * request's {@link EvaluationContext} and injects the snapshot into the page head
 * so the client can hydrate the exact same values.
 *
 * @param flags   the evaluation engine (created with `createFlags(...)`).
 * @param opts    optional per-request `context` fn and `globalVar` name.
 */
export function featureFlags(flags: FeatureFlags, opts: FeatureFlagsSsrOptions = {}): SsrModule {
  const globalVar = opts.globalVar ?? "__FLAGS__";
  return {
    name: "feature-flags",
    setup(ctx: SsrModuleContext) {
      ctx.head((reqCtx: Context) => {
        const evalCtx = opts.context ? opts.context(reqCtx) : {};
        const snapshot = flags.all(evalCtx);
        return flagsScript(snapshot, globalVar);
      });
    },
    inspect() {
      return {
        kind: "feature-flags",
        globalVar,
        perRequest: typeof opts.context === "function",
        keys: flags.keys(),
      };
    },
  };
}
