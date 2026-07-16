// ── @youneed/server-plugin-feature-flags — flags for @youneed/server ─────────
//
// Wraps a `@youneed/feature-flags` engine into a `ServerPlugin` plus a controller
// PROVIDER. The plugin mounts control + bootstrap routes (list definitions, a
// client-hydration snapshot, override/clear toggles, an ad-hoc evaluator) and an
// `inspect()` for the devtools Feature Flags tab. The provider contributes a
// REQUEST-SCOPED `this.flags` to a controller: every call evaluates against the
// per-request `EvaluationContext` derived from the in-flight request (user,
// headers, …) via `opts.context`.
//
//   const flags = createFlags([
//     { key: "new-checkout", defaultValue: false, rollout: 20 },
//   ]);
//
//   // per-request context: bucket by the authenticated user id
//   const ctxOf = (ctx: Context) => ({ targetingKey: (ctx.state.user as any)?.id });
//
//   const app = Application(CheckoutController).plugin(featureFlags(flags, { context: ctxOf }));
//
//   class CheckoutController extends Controller("/checkout", {
//     providers: [flagsProvider(flags, { context: ctxOf })],
//   }) {
//     @Controller.get()
//     index() {
//       if (this.flags.isEnabled("new-checkout")) return { ui: "v2" };
//       return { ui: "v1" };
//     }
//   }

import { Response, context as currentContext } from "@youneed/server";
import type { Context, ControllerProvider, ServerPlugin } from "@youneed/server";
import type { EvaluationContext, Evaluation, FeatureFlags, FlagDefinition, FlagValue } from "@youneed/feature-flags";

export * from "@youneed/feature-flags"; // FeatureFlags, createFlags, types — for convenience

/** Derives the per-request {@link EvaluationContext} from the in-flight request
 *  (e.g. `ctx.state.user`, headers). Default `() => ({})`. */
export type ContextDeriver = (ctx: Context) => EvaluationContext;

const NO_CONTEXT: ContextDeriver = () => ({});

/** Resolve the {@link EvaluationContext} for the current (or a supplied) request. */
function resolveContext(derive: ContextDeriver, ctx?: Context): EvaluationContext {
  const c = ctx ?? currentContext();
  return c ? derive(c) : {};
}

// ── controller provider — `this.flags`, bound to the request context ──────────

/** The request-bound flags API contributed by {@link flagsProvider} as `this.flags`.
 *  Every method evaluates against the CURRENT request's derived context — no need
 *  to pass a context per call. */
export interface RequestFlags {
  /** Full {@link Evaluation} for `key` (value + variant + reason). */
  evaluate<T extends FlagValue = FlagValue>(key: string): Evaluation<T>;
  /** Truthy value ⇒ enabled. */
  isEnabled(key: string): boolean;
  /** Selected variant name, if any. */
  variant(key: string): string | undefined;
  /** Typed value with an optional `fallback` for unknown flags. */
  value<T extends FlagValue = FlagValue>(key: string, fallback?: T): T;
  /** Evaluate EVERY flag for the current request (SSR bootstrap / debugging). */
  all(): Record<string, Evaluation>;
}

/** Options for {@link flagsProvider}. */
export interface FlagsProviderOptions {
  /** Derive the {@link EvaluationContext} for each request. Default `() => ({})`. */
  context?: ContextDeriver;
}

/** Build the request-bound {@link RequestFlags} facade over an engine + deriver.
 *  Exported (pure) so it can be tested with a fake request context. */
export function requestFlags(flags: FeatureFlags, derive: ContextDeriver = NO_CONTEXT, ctx?: Context): RequestFlags {
  const ec = (): EvaluationContext => resolveContext(derive, ctx);
  return {
    evaluate: <T extends FlagValue = FlagValue>(key: string) => flags.evaluate<T>(key, ec()),
    isEnabled: (key: string) => flags.isEnabled(key, ec()),
    variant: (key: string) => flags.variant(key, ec()),
    value: <T extends FlagValue = FlagValue>(key: string, fallback?: T) => flags.value<T>(key, ec(), fallback),
    all: () => flags.all(ec()),
  };
}

/**
 * A controller provider that contributes `this.flags` — a {@link RequestFlags}
 * facade bound to the CURRENT request's derived {@link EvaluationContext}. Mirrors
 * `ormProvider`: it extends the controller instance with a private, typed member.
 * Because the request context is read lazily (per call, via async-local storage),
 * one installed provider serves every request.
 *
 *   class Users extends Controller("/users", {
 *     providers: [flagsProvider(flags, { context: (ctx) => ({ targetingKey: userId(ctx) }) })],
 *   }) { … this.flags.isEnabled("beta") … }
 */
export function flagsProvider(flags: FeatureFlags, options: FlagsProviderOptions = {}): ControllerProvider<{ readonly flags: RequestFlags }> {
  const derive = options.context ?? NO_CONTEXT;
  // Resolve the request context lazily on each access — the async-local `context()`
  // returns the in-flight request, so one facade closes over all requests.
  const facade = requestFlags(flags, derive);
  return {
    install(instance) {
      Object.defineProperty(instance, "flags", { configurable: true, value: facade });
    },
  };
}

// ── ServerPlugin ──────────────────────────────────────────────────────────────

/** Options for {@link featureFlags}. */
export interface FeatureFlagsPluginOptions {
  /** Internal route prefix (default `"/__flags"`). */
  basePath?: string;
  /** Mount the devtools introspection + control routes (default true). */
  exposeDevtools?: boolean;
  /** Derive the {@link EvaluationContext} for each request (snapshot route etc.).
   *  Default `() => ({})`. */
  context?: ContextDeriver;
  /** Allow the `POST /override` and `POST /clear` dev routes (default true).
   *  Set `false` in production to make the flag store read-only over HTTP. */
  allowOverride?: boolean;
}

/** The `inspect()` payload — devtools detects the engine by `kind === "feature-flags"`. */
export interface FeatureFlagsInspect {
  kind: "feature-flags";
  count: number;
  endpoints: { list: string; snapshot: string; override: string; clear: string; evaluate: string };
}

/** Parse `targetingKey` + arbitrary `attr.*` query params into an {@link EvaluationContext}.
 *  Exported (pure) for the devtools eval tester + tests. */
export function contextFromQuery(query: Record<string, string> | undefined): EvaluationContext {
  const q = query ?? {};
  const attributes: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(q)) {
    if (k === "targetingKey") continue;
    // `attr.plan=pro` → attributes.plan = "pro"; bare keys also collected as attributes.
    const name = k.startsWith("attr.") ? k.slice(5) : k;
    attributes[name] = coerce(v);
  }
  const ec: EvaluationContext = {};
  if (q.targetingKey) ec.targetingKey = q.targetingKey;
  if (Object.keys(attributes).length) ec.attributes = attributes;
  return ec;
}

/** Loosely coerce a query-string value to boolean/number/JSON where obvious. */
function coerce(v: string): unknown {
  if (v === "true") return true;
  if (v === "false") return false;
  if (v !== "" && !Number.isNaN(Number(v))) return Number(v);
  return v;
}

/**
 * Mount a {@link FeatureFlags} engine as a ServerPlugin: exposes control + bootstrap
 * routes under `basePath` and an `inspect()` for the devtools Feature Flags tab.
 * Register the matching {@link flagsProvider} on controllers that read `this.flags`.
 */
export function featureFlags(flags: FeatureFlags, opts: FeatureFlagsPluginOptions = {}): ServerPlugin & { flags: FeatureFlags } {
  const basePath = (opts.basePath ?? "/__flags").replace(/\/$/, "");
  const derive = opts.context ?? NO_CONTEXT;
  const allowOverride = opts.allowOverride !== false;
  const endpoints = {
    list: `${basePath}/list`,
    snapshot: `${basePath}/snapshot`,
    override: `${basePath}/override`,
    clear: `${basePath}/clear`,
    evaluate: `${basePath}/evaluate`,
  };

  return {
    name: "feature-flags",
    flags,
    setup(app) {
      if (opts.exposeDevtools === false) return;

      // Definitions + current overrides (devtools table source of truth).
      const listing = () => Response.json({ definitions: definitionList(flags), overrides: flags.overrides() });
      app.get(basePath, () => listing()); // GET / (basePath root)
      app.get(endpoints.list, () => listing());

      // The client-bootstrap snapshot the dom-provider hydrates from.
      app.get(endpoints.snapshot, (ctx: Context) => Response.json(flags.all(resolveContext(derive, ctx))));

      // Ad-hoc evaluation for the devtools tester: /evaluate?key=&targetingKey=&attr.plan=pro
      app.get(endpoints.evaluate, (ctx: Context) => {
        const key = ctx.query?.key;
        if (!key) return Response.json({ error: "key is required" }, { status: 400 });
        const ec = contextFromQuery(ctx.query);
        return Response.json(flags.evaluate(key, ec));
      });

      // Dev-only override / clear (gated by allowOverride).
      app.post(endpoints.override, async (ctx: Context) => {
        if (!allowOverride) return Response.json({ error: "overrides disabled" }, { status: 403 });
        const body = (ctx.body ?? {}) as { key?: string; value?: FlagValue };
        if (!body.key) return Response.json({ error: "key is required" }, { status: 400 });
        flags.override(body.key, body.value as FlagValue);
        return Response.json({ ok: true, overrides: flags.overrides() });
      });
      app.post(endpoints.clear, async (ctx: Context) => {
        if (!allowOverride) return Response.json({ error: "overrides disabled" }, { status: 403 });
        const body = (ctx.body ?? {}) as { key?: string };
        if (body.key) flags.override(body.key, undefined);
        else for (const key of Object.keys(flags.overrides())) flags.override(key, undefined);
        return Response.json({ ok: true, overrides: flags.overrides() });
      });
    },
    inspect(): FeatureFlagsInspect {
      // Sync — topology never awaits. The panel fetches live definitions/snapshot
      // over the routes above (values depend on a request context).
      return { kind: "feature-flags", count: flags.keys().length, endpoints };
    },
  };
}

/** Definitions with each flag's override reflected (for the devtools list route). */
function definitionList(flags: FeatureFlags): Array<FlagDefinition & { overridden?: FlagValue }> {
  const overrides = flags.overrides();
  return flags.keys().map((key) => {
    const def = flags.definition(key)!;
    return key in overrides ? { ...def, overridden: overrides[key] } : { ...def };
  });
}
