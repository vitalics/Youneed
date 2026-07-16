# @youneed/ssr-plugin-llms

An [`llms.txt`](https://llmstxt.org) SSR module for
[`@youneed/server-plugin-ssr`](../server-plugin-ssr) — a curated, link-first map
of your site for LLM crawlers.

```ts
import { ssr } from "@youneed/server-plugin-ssr";
import { llms } from "@youneed/ssr-plugin-llms";

app.plugin(
  ssr({
    origin: "https://example.com",
    pages: [Home, Docs, Pricing],
    modules: [
      llms({
        title: "Example",
        summary: "A widget store with a public API.",
        notes: ["All prices in USD."],
        sections: [
          { title: "Docs", links: [{ title: "API", url: "/docs/api", notes: "REST reference" }] },
        ],
        includePages: true, // append a "Pages" section from the mounted routes
      }),
    ],
  }),
);
```

Produces the spec's markdown: an `# H1` title, a `>` summary, free-form notes,
and `## H2` sections of `[title](url): notes` links (absolute against `origin`).

## Build

```sh
pnpm --filter @youneed/ssr-plugin-llms run build
```
