# @youneed/ssr-plugin-feature-flags

Evaluate [`@youneed/feature-flags`](../feature-flags) on the **server** during SSR
and inject the resulting snapshot into every rendered page, so the client hydrates
the exact same flag values — no flag definitions shipped to the browser, no flash
of wrong content.

An SSR module for [`@youneed/server-plugin-ssr`](../server-plugin-ssr). Like
structured-data (and unlike robots/sitemap/rss/llms, which serve their own routes),
it embeds its output in the document `<head>`.

## Usage

```ts
import { ssr } from "@youneed/server-plugin-ssr";
import { createFlags } from "@youneed/feature-flags";
import { featureFlags } from "@youneed/ssr-plugin-feature-flags";

const flags = createFlags([
  { key: "new-dashboard", defaultValue: false, rollout: 20 },        // 20% of users
  { key: "checkout", defaultValue: "control",
    variants: { control: "control", fast: "fast" },
    rules: [{ attributes: { plan: "pro" }, variant: "fast" }] },     // pro → "fast"
]);

app.plugin(
  ssr({
    origin: "https://example.com",
    modules: [
      featureFlags(flags, {
        // derive the evaluation context from each request (cookie, session, …)
        context: (req) => ({ targetingKey: req.cookies?.uid, attributes: { plan: req.plan } }),
      }),
    ],
  }),
);
```

On every render this injects, into the page `<head>`:

```html
<script>window.__FLAGS__ = {"new-dashboard":{"key":"new-dashboard","value":true,"reason":"ROLLOUT"}, ...}</script>
```

The snapshot is `flags.all(context(req))` — every flag evaluated against the
request's context — so the server and client agree byte-for-byte.

## Options

`featureFlags(flags, opts?)`:

- `context?: (req) => EvaluationContext` — per-request evaluation context. Omit to
  evaluate anonymously (`{}`).
- `globalVar?: string` — the `window` variable the snapshot is assigned to. Default
  `"__FLAGS__"`. Only a bare JS identifier is accepted; anything else falls back to
  `__FLAGS__`.

The inline JSON is escaped so a flag value containing `</script>` or `<!--` can't
break out of the script tag.

## Client hydration

The client reads the injected global with `@youneed/dom-provider-feature-flags`'s
`hydrateFlags`, which builds a read-only engine via `fromSnapshot(...)`:

```ts
import { hydrateFlags } from "@youneed/dom-provider-feature-flags";

hydrateFlags(window.__FLAGS__); // or hydrateFlags() — defaults to reading window.__FLAGS__
// now flags() / flagged() work on the client with the server's exact values
```

(This package does not depend on the DOM provider — it only writes the global — so
there is no circular dependency.)

## Build

```sh
pnpm --filter @youneed/ssr-plugin-feature-flags run build
```
