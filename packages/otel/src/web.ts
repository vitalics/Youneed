// ── @youneed/otel/web — browser SDK wiring (dom level) ──────────────────────
//
// Starts the OpenTelemetry Web SDK once per page: WebTracerProvider with a
// BatchSpanProcessor → OTLP/HTTP (fetch/sendBeacon transport) and a MeterProvider
// with a periodic OTLP reader. Spans are force-flushed on `pagehide` / when the
// tab goes hidden so short page visits don't lose telemetry.
//
//   initDomOtel is built on this:
//   import { startWebOtel } from "@youneed/otel/web";
//   const handle = startWebOtel({ serviceName: "web-app", endpoint: "https://otel.example.com" });

import { metrics } from "@opentelemetry/api";
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
  type IMetricReader,
  type PushMetricExporter,
} from "@opentelemetry/sdk-metrics";
import {
  AlwaysOffSampler,
  AlwaysOnSampler,
  BatchSpanProcessor,
  ParentBasedSampler,
  SimpleSpanProcessor,
  type Sampler,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { TraceIdRatioBasedSampler } from "@opentelemetry/sdk-trace";
import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import {
  __bindGlobalMetrics,
  buildResource,
  getMeter,
  getTracer,
  noopHandle,
  resolveConfig,
  type OtelConfig,
  type OtelHandle,
} from "./index.ts";

export interface WebOtelConfig extends OtelConfig {
  traceExporter?: SpanExporter;
  metricExporter?: PushMetricExporter;
  metricReader?: IMetricReader;
  /** false → SimpleSpanProcessor (tests). Default true. */
  batch?: boolean;
  /** Register pagehide/visibilitychange flush listeners. Default true. */
  flushOnHide?: boolean;
}

function buildSampler(cfg: { traces: boolean; sampleRatio: number }): Sampler {
  if (!cfg.traces) return new AlwaysOffSampler();
  if (cfg.sampleRatio >= 1) return new AlwaysOnSampler();
  return new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(cfg.sampleRatio) });
}

let current: OtelHandle | undefined;

/** Start the Web OTel SDK. Idempotent like `startNodeOtel`. */
export function startWebOtel(config: WebOtelConfig = {}): OtelHandle {
  if (current) {
    console.warn("[@youneed/otel] Web SDK already started — returning the existing handle");
    return current;
  }
  const cfg = resolveConfig(config);
  if (!cfg.enabled) return (current = noopHandle());

  const resource = buildResource(config);
  const propagator = new CompositePropagator({
    propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
  });

  const exporter =
    config.traceExporter ?? new OTLPTraceExporter({ url: `${cfg.endpoint}/v1/traces`, headers: cfg.headers });
  const processor = config.batch === false ? new SimpleSpanProcessor(exporter) : new BatchSpanProcessor(exporter);
  const tracerProvider = new WebTracerProvider({
    resource,
    sampler: buildSampler(cfg),
    spanProcessors: [processor],
  });
  tracerProvider.register({ propagator });

  const reader =
    config.metricReader ??
    new PeriodicExportingMetricReader({
      exporter: config.metricExporter ?? new OTLPMetricExporter({ url: `${cfg.endpoint}/v1/metrics`, headers: cfg.headers }),
      exportIntervalMillis: cfg.metricExportIntervalMs,
    });
  const meterProvider = new MeterProvider({ resource, readers: cfg.metrics ? [reader] : [] });
  metrics.setGlobalMeterProvider(meterProvider);
  __bindGlobalMetrics();

  const handle: OtelHandle = {
    enabled: true,
    tracer: getTracer(),
    meter: getMeter(),
    async forceFlush() {
      await Promise.allSettled([tracerProvider.forceFlush(), meterProvider.forceFlush()]);
    },
    async shutdown() {
      try {
        await Promise.allSettled([tracerProvider.shutdown(), meterProvider.shutdown()]);
      } finally {
        current = undefined;
      }
    },
  };

  // Browsers kill pages without warning — flush when the page goes away.
  if (config.flushOnHide !== false && typeof window !== "undefined" && typeof window.addEventListener === "function") {
    const flush = () => void handle.forceFlush();
    window.addEventListener("pagehide", flush);
    window.addEventListener("visibilitychange", () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") flush();
    });
  }

  return (current = handle);
}

/** Test seam: drop the singleton without touching global registrations. */
export function __resetWebOtelForTests(): void {
  current = undefined;
}
