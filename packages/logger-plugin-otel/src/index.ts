// ── @youneed/logger-plugin-otel — OpenTelemetry trace correlation ────────────
//
// Stamps the OTel logs-data-model correlation fields (`trace_id`, `span_id`,
// `trace_flags`) of the span ACTIVE AT THE MOMENT of each log call onto every
// record, so log pipelines (e.g. `format.json()`) emit lines that backends
// (Jaeger/Tempo, Datadog, Honeycomb, Grafana Loki, …) can join with traces:
//
//   import { createLogger, format } from "@youneed/logger";
//   import { otel } from "@youneed/logger-plugin-otel";
//   import { startNodeOtel } from "@youneed/otel/node";
//
//   startNodeOtel({ serviceName: "api" });
//   const log = createLogger({ plugins: [otel()] });   // or: log.use(otel())
//
//   await withSpanAsync("GET /users", {}, async () => {
//     log.info("listening", { port: 3000 });
//     // {"level":"info","message":"listening",…,"port":3000,
//     //  "trace_id":"4bf92f3577b34da6a3ce929d0e0e4736",
//     //  "span_id":"00f067aa0ba902b7","trace_flags":"01"}
//   });
//
// Unlike the static-defaults style of `@youneed/logger-plugin-datadog`, the
// values here are DYNAMIC: they are evaluated per record through a format
// prepended with `logger.useFormat()` — the framework's supported hook for
// per-record injection (it runs before the serializing format, so the fields
// land in the final JSON line). When no valid span is active (outside any
// `withSpan*`, or the SDK is disabled), the record is left untouched.
//
// Level rule: this package never imports `@opentelemetry/*` — only the shared
// core `@youneed/otel`. Universal: no Node-only API is touched, so the plugin
// works wherever `@youneed/otel` context propagation works (node + web).

import { activeSpanContext, isValidSpanContext } from "@youneed/otel";
import type { Logger, LoggerPlugin } from "@youneed/logger";

export interface OtelPluginOptions {
  /** Rename the stamped fields. Defaults follow the OTel logs data model. */
  fields?: {
    /** Field for the 32-hex-char trace id. Default `"trace_id"`. */
    traceId?: string;
    /** Field for the 16-hex-char span id. Default `"span_id"`. */
    spanId?: string;
    /** Field for the 2-char lowercase hex trace flags. Default `"trace_flags"`. */
    traceFlags?: string;
  };
}

// Loggers that already have the stamping format installed — installing twice
// must not prepend a second (redundant) transform.
const installed = new WeakSet<Logger>();

/**
 * Plugin: stamp `trace_id` / `span_id` / `trace_flags` of the active OTel span
 * on every log record (per-call evaluation; no-op outside a span).
 *
 * Children: `logger.child(meta)` copies the parent's CURRENT format pipeline,
 * so children created AFTER `use(otel())` stamp too; children created BEFORE
 * the install keep the old pipeline and do not. `close()` (or the returned
 * disposer) switches the transform back to a pass-through.
 */
export function otel(opts: OtelPluginOptions = {}): LoggerPlugin {
  const traceIdField = opts.fields?.traceId ?? "trace_id";
  const spanIdField = opts.fields?.spanId ?? "span_id";
  const traceFlagsField = opts.fields?.traceFlags ?? "trace_flags";

  return {
    name: "otel",
    install(logger: Logger) {
      if (installed.has(logger)) return; // double-install guard: no double wrapping
      installed.add(logger);

      // There is no "unprepend format" API, so disposal flips this flag and the
      // transform becomes a pass-through — original behavior is restored.
      let active = true;
      logger.useFormat({
        transform(info) {
          if (active) {
            const sc = activeSpanContext();
            if (isValidSpanContext(sc)) {
              info[traceIdField] = sc.traceId;
              info[spanIdField] = sc.spanId;
              info[traceFlagsField] = sc.traceFlags.toString(16).padStart(2, "0");
            }
          }
          return info;
        },
      });

      return {
        [Symbol.dispose]() {
          active = false;
          installed.delete(logger); // allow a fresh install after disposal
        },
      };
    },
  };
}
