// ── @youneed/dom-provider-otel — OpenTelemetry for browser components ────────
//
// Real OpenTelemetry Web SDK (via the shared core `@youneed/otel`) at the
// `@youneed/dom` level: every component render becomes a `dom.render <tag>`
// span — with `dom.render.duration` / `dom.render.count` metrics alongside —
// and each component gets a typed `this.otel` for child spans, traced effects
// and traced event listeners:
//
//   import { Component, html } from "@youneed/dom";
//   import { initDomOtel, otelProvider } from "@youneed/dom-provider-otel";
//
//   // Once, at app boot — OTLP/HTTP to the collector, flushed on pagehide:
//   initDomOtel({ serviceName: "web-app", endpoint: "https://otel.example.com" });
//
//   class Cart extends Component("x-cart", { providers: [otelProvider()] }) {
//     items = this.signal(0);
//     onMount() {
//       this.otel.tracedEffect(() => (document.title = `${this.items.get()} items`));
//       this.otel.tracedListen("click", () => this.items.set(0));
//     }
//     checkout() {
//       return this.otel.spanAsync("checkout", async () => { /* … */ });
//     }
//     render() { return html`…`; } // ← timed as `dom.render x-cart`
//   }
//
// For browser→server trace continuity, wrap fetch so every call becomes a
// CLIENT span with `traceparent` injected (the server side recovers the trace
// via `@youneed/server-plugin-otel`):
//
//   import { instrumentedFetch } from "@youneed/otel";
//   const fetch = instrumentedFetch(); // pass to createClient({ fetch }) etc.
//
// Browser rule: this package imports ONLY `@youneed/otel` + `@youneed/otel/web`
// — never `@youneed/otel/node` or `@opentelemetry/sdk-trace-node` — so browser
// bundles stay Node-free.

import type { ComponentProvider } from "@youneed/dom";
import {
  recordException,
  SpanStatusCode,
  useGlobalCounter,
  useGlobalHistogram,
  withSpan,
  withSpanAsync,
  type Counter,
  type GlobalMetricOptions,
  type Histogram,
  type Meter,
  type OtelHandle,
  type Span,
  type Tracer,
} from "@youneed/otel";
import { startWebOtel, type WebOtelConfig } from "@youneed/otel/web";

// ── app-wide handle ──────────────────────────────────────────────────────────
// Like the logger provider's base logger: set once at boot, shared by every
// component whose provider wasn't given an explicit handle.

/** Config for {@link initDomOtel}: everything {@link startWebOtel} takes, plus
 *  a ready-made handle (tests, apps that started the SDK themselves). */
export interface DomOtelConfig extends WebOtelConfig {
  /** Use this handle instead of starting the Web SDK. */
  handle?: OtelHandle;
}

let current: OtelHandle | undefined;

/**
 * Initialize the app-wide DOM OTel handle: starts the Web SDK
 * (`@youneed/otel/web` — OTLP/HTTP export, flushed on pagehide/tab-hide) or
 * adopts a given `handle`. Singleton per page — a second call warns and
 * returns the existing handle, mirroring `startWebOtel`.
 */
export function initDomOtel(opts: DomOtelConfig = {}): OtelHandle {
  if (current) {
    console.warn("[@youneed/dom-provider-otel] already initialized — returning the existing handle");
    return current;
  }
  const { handle, ...config } = opts;
  return (current = handle ?? startWebOtel(config));
}

/** The app-wide handle — lazily `initDomOtel()` (default config) until the app
 *  initializes it. */
export function getDomOtel(): OtelHandle {
  return (current ??= initDomOtel());
}

// ── this.otel ────────────────────────────────────────────────────────────────

/** The provider's contribution, exposed as `this.otel` on the component. */
export interface DomOtelApi {
  /** The handle's tracer — for spans that need manual control. */
  readonly tracer: Tracer;
  /** Run `fn` inside a span named `name` (sync). Errors are recorded
   *  (exception event + ERROR status) and rethrown; the span always ends. */
  span<T>(name: string, fn: (span: Span) => T): T;
  /** Async variant of {@link DomOtelApi.span}. */
  spanAsync<T>(name: string, fn: (span: Span) => T | Promise<T>): Promise<T>;
  /** `host.effect` whose every (re)run is wrapped in a `dom.effect <tag>` span. */
  tracedEffect(fn: () => void | (() => void)): void;
  /** `host.listen` on the component element itself; every handler invocation is
   *  wrapped in a `dom.event <type> <tag>` span. Errors recorded + rethrown. */
  tracedListen(type: string, handler: (event: Event) => void, options?: AddEventListenerOptions): void;
  /** `useGlobalCounter` from `@youneed/otel` — the same process-wide metric from any level. */
  counter(name: string, opts?: GlobalMetricOptions): Counter;
  /** `useGlobalHistogram` from `@youneed/otel` — the same process-wide metric from any level. */
  histogram(name: string, opts?: GlobalMetricOptions): Histogram;
}

export interface OtelProviderOptions {
  /** Handle to use (default: the app-wide {@link getDomOtel}). */
  handle?: OtelHandle;
  /** Per-render `dom.render <tag>` spans + `dom.render.*` metrics. Default true. */
  renderSpans?: boolean;
}

/** Host members the provider wraps — public on the component class but absent
 *  from the public `ReactiveHost` interface, so typed structurally here. */
interface InstrumentedHost {
  flush(): void;
  render(): unknown;
  listen(
    target: EventTarget,
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions,
  ): void;
}

// ── render metrics ───────────────────────────────────────────────────────────

interface RenderInstruments {
  duration: Histogram;
  renders: Counter;
}

// Instruments are created once per meter — re-creating same-named instruments
// per component instance would be churn (and the SDK dedupes them anyway).
const instrumentCache = new WeakMap<Meter, RenderInstruments>();

function getInstruments(meter: Meter): RenderInstruments {
  let instruments = instrumentCache.get(meter);
  if (!instruments) {
    instruments = {
      duration: meter.createHistogram("dom.render.duration", {
        description: "Time spent rendering a component (render + commit), per tag.",
        unit: "ms",
      }),
      renders: meter.createCounter("dom.render.count", {
        description: "Component renders, per tag.",
      }),
    };
    instrumentCache.set(meter, instruments);
  }
  return instruments;
}

/**
 * A composable `Component` provider contributing a typed `this.otel` — plus a
 * `dom.render <tag>` span (and `dom.render.duration` / `dom.render.count`
 * metrics) for every render of the component.
 *
 * With a disabled handle (`enabled: false`) everything below still WORKS —
 * effects run, listeners fire, `span`/`spanAsync` execute their body — it just
 * doesn't trace: a pass-through no-op, like `noopHandle()` itself.
 */
export function otelProvider(opts: OtelProviderOptions = {}): ComponentProvider<{ readonly otel: DomOtelApi }> {
  return {
    install(host) {
      const handle = opts.handle ?? getDomOtel();
      const tag = host.localName || host.tagName.toLowerCase();
      const tracer = handle.tracer;
      const h = host as unknown as InstrumentedHost;

      const api: DomOtelApi = {
        tracer,
        span: (name, fn) => withSpan(name, { tag }, fn, { tracer }),
        spanAsync: (name, fn) => withSpanAsync(name, { tag }, fn, { tracer }),
        counter: (name, metricOpts) => useGlobalCounter(name, metricOpts),
        histogram: (name, metricOpts) => useGlobalHistogram(name, metricOpts),
        tracedEffect: (fn) => {
          host.effect(() => withSpan(`dom.effect ${tag}`, { tag }, fn, { tracer }));
        },
        tracedListen: (type, handler, options) => {
          h.listen(
            host,
            type,
            (event) => withSpan(`dom.event ${type} ${tag}`, { tag }, () => handler.call(host, event), { tracer }),
            options,
          );
        },
      };
      Object.defineProperty(host, "otel", { configurable: true, value: api });

      if (!handle.enabled || opts.renderSpans === false) return;

      const { duration, renders } = getInstruments(handle.meter);
      // The render span currently open for THIS host: set by whichever wrapper
      // opened it, read by the other so one render never produces two spans.
      const open: { span?: Span } = { span: undefined };

      const record = (start: number): void => {
        duration.record(performance.now() - start, { tag });
        renders.add(1, { tag });
      };

      // Scheduled updates: scheduler → host.flush() → #render(). `flush` is a
      // prototype method, so shadow it per instance and time the original into
      // a `dom.render <tag>` span; metrics go in a finally so a failed render
      // is still measured. withSpan records + rethrows anything that escapes.
      const originalFlush = h.flush;
      Object.defineProperty(host, "flush", {
        configurable: true,
        writable: true,
        value: (): void => {
          if (open.span) return originalFlush.call(host); // re-entrant flush — already timed
          const start = performance.now();
          withSpan(
            `dom.render ${tag}`,
            { tag },
            (span) => {
              open.span = span;
              try {
                originalFlush.call(host);
              } finally {
                open.span = undefined;
                record(start);
              }
            },
            { tracer },
          );
        },
      });

      // …but flush() alone misses two things (verified in @youneed/dom):
      //   1. the FIRST render — connectedCallback calls the private #render()
      //      directly; only scheduled updates go through flush();
      //   2. render ERRORS — #renderInner() catches them (→ onError hook /
      //      global handler), so they never propagate out of flush().
      // Both are covered by also wrapping render() itself: it opens the span
      // when flush didn't (first render) and records contained errors on the
      // already-open span (updates). The rethrow keeps the framework's error
      // routing unchanged — the span observes, it doesn't interfere.
      const originalRender = h.render;
      Object.defineProperty(host, "render", {
        configurable: true,
        writable: true,
        value: (): unknown => {
          const span = open.span;
          if (span) {
            // Inside the flush wrapper's span: no nested span, just errors.
            try {
              return originalRender.call(host);
            } catch (err) {
              recordException(span, err);
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: err instanceof Error ? err.message : String(err),
              });
              throw err;
            }
          }
          // First render (connectedCallback → #render): open the span here.
          const start = performance.now();
          return withSpan(
            `dom.render ${tag}`,
            { tag },
            (renderSpan) => {
              open.span = renderSpan;
              try {
                return originalRender.call(host);
              } finally {
                open.span = undefined;
                record(start);
              }
            },
            { tracer },
          );
        },
      });

      // Nothing leaky: spans are per-render and short-lived (each finally
      // above ends + clears them). This just drops the last reference when
      // the host disconnects, so a span object never outlives its component.
      host.onCleanup(() => {
        open.span = undefined;
      });
    },
  };
}
