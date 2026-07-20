# @youneed/ssr-plugin-otel

OpenTelemetry for the SSR level: an `SsrModule` for `@youneed/server-plugin-ssr`
that emits one `ssr.render <url>` span per rendered static page, plus render
metrics. Built on the shared `@youneed/otel` core (the real OpenTelemetry SDK) —
this package never imports `@opentelemetry/*` itself.

## Usage

```ts
import { Application } from "@youneed/server";
import { ssr } from "@youneed/server-plugin-ssr";
import { otelModule } from "@youneed/ssr-plugin-otel";

Application()
  .plugin(ssr({
    pages: [Home, About],
    modules: [otelModule()],
  }))
  .listen(3000, () => {});
```

The module only **uses** a tracer/meter — it does not start the SDK. SDK
lifecycle belongs to the app, typically via `@youneed/server-plugin-otel`:

```ts
import { otel } from "@youneed/server-plugin-otel";

Application()
  .plugin(otel({ serviceName: "site" }))                // starts the SDK
  .plugin(ssr({ pages, modules: [otelModule()] }));     // global providers
```

Or inject a handle directly (tests, custom bootstrap):

```ts
modules: [otelModule({ handle })] // handle from startNodeOtel(...)
```

## Spans

Every `GET` of a static page route produces one INTERNAL span:

- name: `ssr.render <url>` (e.g. `ssr.render /about`)
- attributes: `ssr.route` = the page URL; `http.response.status_code` = the
  response status
- a throwing `render()` records an exception event + `ERROR` status, then the
  error is rethrown (the framework turns it into a 500)

When `@youneed/server-plugin-otel` is also installed (list it first), its
SERVER span is active around the pipeline, so `ssr.render` nests under it via
the OTel context. Without it, `ssr.render` spans are trace roots. Both are
supported — the server plugin is not required.

## Metrics

| Instrument            | Type      | Unit | Attributes        |
| --------------------- | --------- | ---- | ----------------- |
| `ssr.render.count`    | Counter   |      | `route`, `status` |
| `ssr.render.duration` | Histogram | ms   | `route`, `status` |

## Limitations

- **Static routes only.** The SSR module context exposes no URL patterns for
  dynamic pages (`/users/:id`), so their renders pass through untraced rather
  than emitting high-cardinality span names. Non-page routes (API endpoints,
  assets) are untouched as well.
