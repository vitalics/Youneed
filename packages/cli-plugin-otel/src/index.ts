// ── @youneed/cli-plugin-otel — OpenTelemetry for @youneed/cli ───────────────
//
// Real OTel SDK telemetry at the CLI level, built on the shared core
// `@youneed/otel` (this package never imports `@opentelemetry/*` directly):
//
//   import { Application, Command } from "@youneed/cli";
//   import { otelCommand, otelPlugin } from "@youneed/cli-plugin-otel";
//
//   class Deploy extends Command({
//     name: "deploy <env>",
//     middleware: [otelCommand()],
//   }) {
//     async execute(env: string) {
//       const plan = await this.otel.spanAsync("plan", async () => buildPlan(env));
//       await this.otel.spanAsync("apply", async () => applyPlan(plan));
//     }
//   }
//
//   Application({
//     name: "ops",
//     version: "1.4.0",
//     commands: [Deploy],
//     plugins: [otelPlugin({ serviceName: "ops-cli" })],
//   });
//
// Two halves, wired separately:
//
//   otelCommand()  MIDDLEWARE — one span `cli.command <name>` per run, opened at
//                  install and ended at teardown, so its duration covers the
//                  whole command. Thrown errors are recorded (exception event +
//                  ERROR status) and rethrown. Contributes `this.otel`, whose
//                  `span`/`spanAsync` run child spans nested under the command
//                  span (same trace).
//
//   otelPlugin()   PLUGIN — owns the SDK lifecycle. `setup` starts the Node SDK
//                  (OTLP/HTTP, env-aware config via @youneed/otel); `afterCommand`
//                  records `cli.command.count` / `cli.command.duration` metrics
//                  with the exit code, then flushes and shuts down — awaited by
//                  the runner, so telemetry reliably reaches the collector
//                  before a short-lived CLI process exits.
//
// CLIs are short-lived: pass `batch: false` for immediate span export if your
// collector is local, and note the flush happens at `afterCommand` regardless.
// Standard env vars are honored: OTEL_SDK_DISABLED, OTEL_SERVICE_NAME,
// OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_EXPORTER_OTLP_HEADERS.

import {
  contribute,
  specOf,
  type CliMiddleware,
  type CliPlugin,
  type CommandClassRef,
  type CommandSpec,
} from "@youneed/cli";
import {
  extractHeaders,
  getTracer,
  recordException,
  setSpanOnContext,
  withContext,
  withSpan,
  withSpanAsync,
  SpanKind,
  SpanStatusCode,
  useGlobalCounter,
  useGlobalHistogram,
  type Attributes,
  type Context,
  type Counter,
  type GlobalMetricOptions,
  type Histogram,
  type OtelHandle,
  type Span,
  type Tracer,
} from "@youneed/otel";
import { startNodeOtel, type NodeOtelConfig } from "@youneed/otel/node";

// ── Command middleware ───────────────────────────────────────────────────────

/** What `this.otel` exposes inside a command using {@link otelCommand}. */
export interface OtelCommandApi {
  /** The tracer the command span (and its children) are created with. */
  readonly tracer: Tracer;
  /**
   * Run `fn` inside a child span of the command span (thrown errors are
   * recorded and rethrown; the span always ends). Sync only — do NOT return a
   * promise from `fn`; use {@link OtelCommandApi.spanAsync} for async work.
   */
  span<T>(name: string, fn: (span: Span) => T): T;
  /** Async variant of {@link OtelCommandApi.span}. */
  spanAsync<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T>;
  /** `useGlobalCounter` from `@youneed/otel` — the same process-wide metric from any level. */
  counter(name: string, opts?: GlobalMetricOptions): Counter;
  /** `useGlobalHistogram` from `@youneed/otel` — the same process-wide metric from any level. */
  histogram(name: string, opts?: GlobalMetricOptions): Histogram;
}

/** Options for {@link otelCommand}. */
export interface OtelCommandOptions {
  /**
   * Reuse an existing SDK handle's tracer instead of the global one — pair it
   * with the same handle passed to {@link otelPlugin} (tests, embedding apps).
   */
  handle?: OtelHandle;
}

/** The live span of a running command, shared with the plugin's `onError`. */
interface CommandSpanEntry {
  readonly span: Span;
  failed: boolean;
  /** The error already recorded on the span — dedupes the plugin's onError. */
  error?: unknown;
}

/**
 * Command spans keyed by their (shared, reference-stable) CommandSpec. The
 * middleware writes at install/teardown; the plugin reads in `onError` — that
 * hook runs outside the span's async context, so the active span is not
 * reachable from it any other way.
 */
const commandSpans = new WeakMap<CommandSpec, CommandSpanEntry>();

/** A command's `execute`/`render` as the runner calls it (loosely typed). */
type CommandMethod = (this: unknown, ...args: string[]) => unknown;

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as PromiseLike<unknown>).then === "function";

/**
 * Command-span middleware. Adds `this.otel` and wraps the run in one span
 * `cli.command <name>` (kind INTERNAL) with program/command/args attributes,
 * opened at install and ended at teardown. A thrown error is recorded on the
 * span (exception event + ERROR status) and rethrown.
 */
export function otelCommand(
  opts: OtelCommandOptions = {},
): CliMiddleware<{ readonly otel: OtelCommandApi }> {
  return {
    name: "otel",
    install(ctx) {
      const tracer = opts.handle?.tracer ?? getTracer();
      // The spec lives on a Symbol-keyed static of the command class — read it
      // back off the instance's constructor (undefined for non-Command objects).
      const spec = specOf(ctx.command.constructor as unknown as CommandClassRef) as
        | CommandSpec
        | undefined;
      const commandName = spec?.name ?? ctx.command.constructor.name ?? "command";

      const attributes: Attributes = {
        "cli.program.name": ctx.program.name,
        "cli.command.name": commandName,
        "cli.command.args": [...ctx.args],
      };
      if (ctx.program.version !== undefined) {
        attributes["cli.program.version"] = ctx.program.version;
      }

      const span = tracer.startSpan(`cli.command ${commandName}`, {
        kind: SpanKind.INTERNAL,
        attributes,
      });
      const entry: CommandSpanEntry = { span, failed: false };
      if (spec) commandSpans.set(spec, entry);

      // A Context carrying the span, used to nest children. @youneed/otel has
      // no active-context getter — but extracting propagation headers from an
      // EMPTY carrier returns the current active context unchanged (the
      // propagators pass it through when no traceparent/baggage is present).
      const spanContext: Context = setSpanOnContext(extractHeaders({}), span);

      // recordException + ERROR status, then let the error propagate.
      const fail = (err: unknown): void => {
        entry.failed = true;
        entry.error = err;
        recordException(span, err);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : String(err),
        });
      };

      // Wrap render/execute (whichever exists; the runner prefers render) so a
      // throw lands on the span. The wrapper stays sync-passthrough — a sync
      // `render` must keep returning a Renderable, because the live renderer
      // re-invokes it synchronously — and runs the original inside the span's
      // context so user-created spans nest under the command span.
      const view = ctx.command as { execute?: CommandMethod; render?: CommandMethod };
      for (const key of ["render", "execute"] as const) {
        const original = view[key];
        if (typeof original !== "function") continue;
        view[key] = function (this: unknown, ...args: string[]): unknown {
          let result: unknown;
          try {
            result = withContext(spanContext, () => original.apply(this, args));
          } catch (err) {
            fail(err);
            throw err;
          }
          if (isThenable(result)) {
            return result.then(undefined, (err: unknown) => {
              fail(err);
              throw err;
            });
          }
          return result;
        };
      }

      contribute(ctx.command, "otel", {
        tracer,
        span: <T>(name: string, fn: (span: Span) => T): T =>
          withContext(spanContext, () => withSpan(name, {}, fn, { tracer })),
        spanAsync: <T>(name: string, fn: (span: Span) => Promise<T>): Promise<T> =>
          withContext(spanContext, () => withSpanAsync(name, {}, fn, { tracer })),
        counter: (name, metricOpts) => useGlobalCounter(name, metricOpts),
        histogram: (name, metricOpts) => useGlobalHistogram(name, metricOpts),
      } satisfies OtelCommandApi);

      // Teardown runs LIFO once the command settles: close the span there so
      // its duration covers install → execute/render → teardown.
      ctx.onCleanup(() => {
        if (entry.failed) span.setAttribute("cli.command.error", true);
        span.end();
        if (spec) commandSpans.delete(spec);
      });
    },
  };
}

// ── Application plugin ───────────────────────────────────────────────────────

/**
 * Options for {@link otelPlugin} — the full `@youneed/otel/node` SDK config
 * (serviceName, endpoint, headers, sampleRatio, test hooks…) plus handle
 * injection.
 */
export interface CliOtelOptions extends NodeOtelConfig {
  /**
   * Reuse an existing SDK handle (tests, embedding apps that started the SDK
   * themselves). When injected, the plugin records metrics but NEVER flushes
   * or shuts the SDK down — the handle's owner controls its lifecycle.
   */
  handle?: OtelHandle;
}

/**
 * Telemetry plugin. `setup` starts the Node OTel SDK (unless a handle is
 * injected), `afterCommand` records `cli.command.count` (and
 * `cli.command.duration`, ms) with `{ command, exit_code }` attributes, then —
 * for an owned handle only — flushes and shuts the SDK down. The runner AWAITS
 * `afterCommand`, so spans and metrics reach the collector before exit.
 */
export function otelPlugin(opts: CliOtelOptions = {}): CliPlugin {
  const { handle: injected, ...config } = opts;
  let handle: OtelHandle | undefined;
  let owned = false;
  let counter: Counter | undefined;
  let duration: Histogram | undefined;
  // Wall-clock start per command spec — WeakMap is fine: one command runs at a
  // time and the entry is dropped at afterCommand.
  const starts = new WeakMap<CommandSpec, number>();

  return {
    name: "otel",
    setup() {
      handle = injected ?? startNodeOtel(config);
      owned = injected === undefined;
      counter = handle.meter.createCounter("cli.command.count", {
        description: "CLI command runs, by command name and exit code.",
      });
      duration = handle.meter.createHistogram("cli.command.duration", {
        description: "CLI command wall time.",
        unit: "ms",
      });
    },
    beforeCommand(info) {
      starts.set(info.command, Date.now());
    },
    onError(err, info) {
      // The otelCommand middleware already records errors thrown from
      // render/execute; record here only what slipped past it (deduped via the
      // shared entry), on the still-open command span.
      const entry = commandSpans.get(info.command);
      if (entry && entry.error !== err) {
        entry.error = err;
        entry.failed = true;
        recordException(entry.span, err);
        entry.span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    async afterCommand(info, code) {
      const attributes: Attributes = { command: info.command.name, exit_code: code };
      counter?.add(1, attributes);
      const start = starts.get(info.command);
      if (start !== undefined) {
        starts.delete(info.command);
        duration?.record(Date.now() - start, attributes);
      }
      if (owned && handle) {
        await handle.forceFlush();
        await handle.shutdown();
      }
    },
  };
}

export type { OtelHandle } from "@youneed/otel";
