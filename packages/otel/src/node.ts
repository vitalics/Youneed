// ── @youneed/otel/node — Node SDK wiring (server, cli, test levels) ─────────
//
// Starts the real OpenTelemetry Node SDK once per process: a NodeTracerProvider
// (BatchSpanProcessor → OTLP/HTTP) and a MeterProvider (PeriodicExportingMetric-
// Reader → OTLP/HTTP), registered globally so `getTracer()`/`getMeter()` and
// context propagation work everywhere, including user code.
//
//   const handle = startNodeOtel({ serviceName: "api" });
//   …
//   await handle.shutdown(); // force-flushes before exit
//
// Advanced/test hooks: inject `traceExporter` / `metricExporter` / `metricReader`
// (e.g. InMemorySpanExporter) and `batch: false` (SimpleSpanProcessor).

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
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
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

export interface NodeOtelConfig extends OtelConfig {
  /** Override the OTLP trace exporter (tests: InMemorySpanExporter). */
  traceExporter?: SpanExporter;
  /** Override the OTLP metric exporter (wrapped in a PeriodicExportingMetricReader). */
  metricExporter?: PushMetricExporter;
  /** Override the whole metric reader (takes precedence over metricExporter). */
  metricReader?: IMetricReader;
  /** false → SimpleSpanProcessor: export every span immediately (CLIs, tests). Default true. */
  batch?: boolean;
}

function buildSampler(cfg: { traces: boolean; sampleRatio: number }): Sampler {
  if (!cfg.traces) return new AlwaysOffSampler();
  if (cfg.sampleRatio >= 1) return new AlwaysOnSampler();
  return new ParentBasedSampler({ root: new TraceIdRatioBasedSampler(cfg.sampleRatio) });
}

let current: OtelHandle | undefined;

/**
 * Start the Node OTel SDK. Idempotent: a second call logs a warning and returns
 * the existing handle (global providers can only be registered once per process).
 */
export function startNodeOtel(config: NodeOtelConfig = {}): OtelHandle {
  if (current) {
    console.warn("[@youneed/otel] SDK already started — returning the existing handle");
    return current;
  }
  const cfg = resolveConfig(config);
  if (!cfg.enabled) return (current = noopHandle());

  const resource = buildResource(config);
  const propagator = new CompositePropagator({
    propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
  });

  // Traces — provider is registered even with traces:false (sampler off) so the
  // AsyncLocalStorage context manager + propagator are always in place.
  const exporter =
    config.traceExporter ?? new OTLPTraceExporter({ url: `${cfg.endpoint}/v1/traces`, headers: cfg.headers });
  const processor = config.batch === false ? new SimpleSpanProcessor(exporter) : new BatchSpanProcessor(exporter);
  const tracerProvider = new NodeTracerProvider({
    resource,
    sampler: buildSampler(cfg),
    spanProcessors: [processor],
  });
  tracerProvider.register({ propagator });

  // Metrics.
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
  return (current = handle);
}

/** Test seam: drop the singleton without touching global registrations. */
export function __resetNodeOtelForTests(): void {
  current = undefined;
}
