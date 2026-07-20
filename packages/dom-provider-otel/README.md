# @youneed/dom-provider-otel

Real [OpenTelemetry Web SDK](https://opentelemetry.io/) tracing + metrics for
[`@youneed/dom`](../dom) browser components, via the shared core
[`@youneed/otel`](../otel). Every component render becomes a
`dom.render <tag>` span — with `dom.render.duration` / `dom.render.count`
metrics alongside — and each component gets a typed `this.otel` for child
spans, traced effects and traced event listeners.

Start the SDK once, at app boot (OTLP/HTTP export; flushed on `pagehide` /
tab-hide so short page visits don't lose telemetry):

```ts
import { initDomOtel } from "@youneed/dom-provider-otel";

initDomOtel({ serviceName: "web-app", endpoint: "https://otel.example.com" });
```

Then add the provider to any component:

```ts
import { Component, html } from "@youneed/dom";
import { otelProvider } from "@youneed/dom-provider-otel";

class Cart extends Component("x-cart", { providers: [otelProvider()] }) {
  items = this.signal(0);

  onMount() {
    this.otel.tracedEffect(() => (document.title = `${this.items.get()} items`));
    this.otel.tracedListen("click", () => this.items.set(0));
  }

  checkout() {
    return this.otel.spanAsync("checkout", async () => { /* … */ });
  }

  render() { return html`…`; } // ← timed as `dom.render x-cart`
}
```

| API | meaning |
| --- | --- |
| `initDomOtel(opts?)` | start/adopt the app-wide handle (singleton per page — a second call warns and returns the existing one) |
| `getDomOtel()` | the app-wide handle (lazily `initDomOtel()` until set) |
| `otelProvider(opts?)` | the `ComponentProvider`, contributing `this.otel` + render instrumentation |
| `this.otel.tracer` | the handle's `Tracer` |
| `this.otel.span(name, fn)` | run `fn` in a span (sync; errors recorded + rethrown) |
| `this.otel.spanAsync(name, fn)` | async variant |
| `this.otel.tracedEffect(fn)` | `host.effect` wrapped in a `dom.effect <tag>` span per run |
| `this.otel.tracedListen(type, fn, opts?)` | listener on the component; each invocation wrapped in a `dom.event <type> <tag>` span |
| `this.otel.counter(name, opts?)` | `useGlobalCounter` from `@youneed/otel` — process-wide metric shared with app code and tests |
| `this.otel.histogram(name, opts?)` | `useGlobalHistogram` from `@youneed/otel` — same global semantics |

| option | default | meaning |
| --- | --- | --- |
| `handle` | the app-wide `getDomOtel()` | OTel handle to use (e.g. a test's in-memory SDK) |
| `renderSpans` | `true` | per-render `dom.render <tag>` spans + `dom.render.*` metrics |

All of `initDomOtel`'s config is passed through to
[`startWebOtel`](../otel/src/web.ts) (`serviceName`, `endpoint`, `headers`,
`sampleRatio`, `resourceAttributes`, …), plus `handle` to adopt an
already-started SDK instead of starting one.

## What gets traced

- **First render and every update** — the first render bypasses the scheduler
  (`connectedCallback` renders directly) and updates go through `flush()`;
  the provider instruments both paths, so a render always yields exactly one
  `dom.render <tag>` span, timed across render + commit.
- **Render errors** — the framework *contains* them (an `onError` hook or the
  global `setErrorHandler`); the span observes: exception event + `ERROR`
  status, then the error continues through the framework's routing unchanged.
- **Metrics** — `dom.render.duration` histogram (unit `ms`) and
  `dom.render.count` counter, both attributed by `tag`.

## Browser→server trace continuity

Wrap fetch so every call becomes a CLIENT span with `traceparent` injected —
the server side (`@youneed/server-plugin-otel`) picks the trace up:

```ts
import { instrumentedFetch } from "@youneed/otel";

const fetch = instrumentedFetch(); // e.g. createClient({ fetch })
```

## Notes

- With a disabled SDK (`enabled: false` / `OTEL_SDK_DISABLED=true`) everything
  still **works** — effects run, listeners fire, `span`/`spanAsync` execute
  their body — it just doesn't trace: a pass-through no-op.
- This package imports only `@youneed/otel` + `@youneed/otel/web` — never the
  Node entry — so browser bundles stay Node-free.
- Spans are per-render and short-lived; nothing is kept per component beyond
  the current render's span reference, dropped on disconnect.
