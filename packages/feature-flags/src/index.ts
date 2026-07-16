// @youneed/feature-flags — a tiny, framework-agnostic feature-flag engine.
//
// Universal (no Node/DOM deps). Evaluation is SYNCHRONOUS over an in-memory
// snapshot — so DOM components, SSR, CLIs and the server can all evaluate the
// same way without awaiting. A `FlagSource` (default in-memory) supplies the flag
// definitions; call `load()` to (re)fill the snapshot and `onChange` to react.
//
//   const flags = createFlags([
//     { key: "new-dashboard", defaultValue: false, rollout: 20 },      // 20% of users
//     { key: "checkout", defaultValue: "control",
//       variants: { control: "control", fast: "fast" },
//       rules: [{ attributes: { plan: "pro" }, variant: "fast" }] },   // pro users → "fast"
//   ]);
//   flags.isEnabled("new-dashboard", { targetingKey: user.id });        // stable 20% bucket
//   flags.variant("checkout", { targetingKey: user.id, attributes: { plan: user.plan } });
//
// Integrations layer on top: @youneed/dom-provider-feature-flags,
// @youneed/server-plugin-feature-flags, @youneed/ssr-plugin-feature-flags,
// @youneed/cli-plugin-feature-flags, @youneed/test-plugin-feature-flags.

/** A JSON-serialisable flag value. */
export type FlagValue = boolean | string | number | null | FlagValue[] | { [k: string]: FlagValue };

/** The context an evaluation runs against — a stable id + arbitrary attributes. */
export interface EvaluationContext {
  /** Stable identifier for deterministic bucketing (user id, device id, …). */
  targetingKey?: string;
  /** Attributes matched by rules (plan, country, role, …). */
  attributes?: Record<string, unknown>;
}

/** A targeting rule. Matches when every `attributes` entry matches AND the
 *  optional `percentage` bucket includes the context. First matching rule wins. */
export interface Rule {
  /** Attribute constraints: value equals (or, for an array, `includes`) the context's. */
  attributes?: Record<string, unknown>;
  /** Deterministic rollout for this rule (0–100), bucketed by `targetingKey`. */
  percentage?: number;
  /** Result when matched: a named variant… */
  variant?: string;
  /** …or a direct value (takes precedence over `variant`). */
  value?: FlagValue;
}

/** A flag definition. */
export interface FlagDefinition {
  key: string;
  description?: string;
  /** Master switch. When `false`, evaluation short-circuits to `defaultValue`. Default `true`. */
  enabled?: boolean;
  /** Value when no rule matches (and the baseline "off" for boolean flags). */
  defaultValue: FlagValue;
  /** Named variants a rule (or `defaultVariant`) can select. */
  variants?: Record<string, FlagValue>;
  /** The variant used when no rule matches (else `defaultValue`). */
  defaultVariant?: string;
  /** Targeting rules, evaluated in order — first match wins. */
  rules?: Rule[];
  /** Shorthand boolean rollout: this % of `targetingKey`s evaluate to `true`. */
  rollout?: number;
}

/** Why an evaluation produced its value. */
export type EvaluationReason = "DISABLED" | "TARGETING_MATCH" | "ROLLOUT" | "DEFAULT" | "STATIC" | "ERROR";

/** The outcome of evaluating one flag. */
export interface Evaluation<T extends FlagValue = FlagValue> {
  key: string;
  value: T;
  variant?: string;
  reason: EvaluationReason;
}

/** A source of flag definitions. Loading may be async; the engine snapshots it. */
export interface FlagSource {
  all(): FlagDefinition[] | Promise<FlagDefinition[]>;
  /** Notify the engine to reload when the backing definitions change. */
  onChange?(cb: () => void): () => void;
}

/**
 * A REMOTE evaluator (LaunchDarkly, PostHog, …) the engine delegates to, instead
 * of evaluating local definitions. `resolve` is async (network/SDK); the engine
 * keeps a per-`(key, context)` cache so `evaluate()` stays synchronous — a cold
 * cache returns the fallback and warms in the background (re-render on `onChange`),
 * `evaluateAsync()` / `warm()` await the real value. Contrast {@link FlagSource},
 * which supplies DEFINITIONS the engine evaluates itself.
 */
export interface FlagProvider {
  readonly name: string;
  /** Resolve one flag for a context. `fallback` is the caller's default. */
  resolve(key: string, context: EvaluationContext, fallback?: FlagValue): Promise<Evaluation> | Evaluation;
  /** Known flag keys (for `all()` / devtools), if the backend can enumerate them. */
  keys?(): string[] | Promise<string[]>;
  /** Fired when the backend pushes an update (streaming) — clears the cache + reloads. */
  onChange?(cb: () => void): () => void;
  /** One-time init (open the SDK / stream). */
  init?(): Promise<void>;
  close?(): Promise<void>;
}

/** A listener notified of every evaluation — for exposure logging / analytics
 *  (e.g. `@youneed/feature-flags-datadog`). */
export type EvaluationListener = (evaluation: Evaluation, context: EvaluationContext) => void;

/** Stable cache key for a `(key, context)` pair. */
function contextHash(key: string, ctx: EvaluationContext): string {
  const attrs = ctx.attributes ? Object.keys(ctx.attributes).sort().map((k) => `${k}=${String(ctx.attributes![k])}`).join("&") : "";
  return `${key}|${ctx.targetingKey ?? ""}|${attrs}`;
}

// ── deterministic bucketing ─────────────────────────────────────────────────

/** FNV-1a 32-bit hash → a stable 0–99 bucket for `key`. */
export function bucket(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 100;
}

/** Whether a context falls inside a `percentage` rollout for `flagKey` (stable). */
function inRollout(flagKey: string, percentage: number, ctx: EvaluationContext): boolean {
  if (percentage <= 0) return false;
  if (percentage >= 100) return true;
  return bucket(`${flagKey}:${ctx.targetingKey ?? "anonymous"}`) < percentage;
}

/** Does a value match a rule constraint? Array constraint ⇒ `includes`. */
function matches(constraint: unknown, actual: unknown): boolean {
  if (Array.isArray(constraint)) return constraint.includes(actual as never);
  return constraint === actual;
}

// ── in-memory source ──────────────────────────────────────────────────────────

/** A mutable in-process {@link FlagSource}. */
export class MemorySource implements FlagSource {
  #defs = new Map<string, FlagDefinition>();
  #subs = new Set<() => void>();

  constructor(defs: FlagDefinition[] = []) {
    for (const d of defs) this.#defs.set(d.key, d);
  }

  all(): FlagDefinition[] {
    return [...this.#defs.values()];
  }

  /** Add or replace a definition and notify subscribers. */
  set(def: FlagDefinition): void {
    this.#defs.set(def.key, def);
    this.#emit();
  }

  /** Remove a definition and notify subscribers. */
  remove(key: string): void {
    if (this.#defs.delete(key)) this.#emit();
  }

  onChange(cb: () => void): () => void {
    this.#subs.add(cb);
    return () => void this.#subs.delete(cb);
  }

  #emit(): void {
    for (const cb of [...this.#subs]) cb();
  }
}

// ── the engine ──────────────────────────────────────────────────────────────

export interface FeatureFlagsOptions {
  /** Called if a rule/variant is misconfigured during evaluation. */
  onError?: (err: Error, key: string) => void;
  /** Delegate evaluation to a remote {@link FlagProvider} (LaunchDarkly, PostHog…)
   *  instead of evaluating local definitions. */
  provider?: FlagProvider;
}

/**
 * The evaluation engine. Holds a synchronous snapshot of definitions (from a
 * {@link FlagSource}); `evaluate`/`isEnabled`/`variant`/`value` read it without
 * awaiting. `load()` fills/refreshes the snapshot; `onChange` fires on source or
 * override changes.
 */
export class FeatureFlags {
  readonly #source: FlagSource;
  readonly #onError?: (err: Error, key: string) => void;
  readonly #provider?: FlagProvider;
  #snapshot = new Map<string, FlagDefinition>();
  #overrides = new Map<string, FlagValue>();
  #cache = new Map<string, Evaluation>(); // provider results, keyed by contextHash
  #inflight = new Set<string>();
  #subs = new Set<() => void>();
  #listeners = new Set<EvaluationListener>();
  #detachSource?: () => void;
  #detachProvider?: () => void;

  constructor(source: FlagSource | FlagDefinition[] = [], opts: FeatureFlagsOptions = {}) {
    this.#source = Array.isArray(source) ? new MemorySource(source) : source;
    this.#onError = opts.onError;
    this.#provider = opts.provider;
    // If the source is synchronous, snapshot immediately so evaluation works pre-load.
    const all = this.#source.all();
    if (Array.isArray(all)) this.#fill(all);
    this.#detachSource = this.#source.onChange?.(() => void this.load());
    this.#detachProvider = this.#provider?.onChange?.(() => {
      this.#cache.clear();
      this.#emit();
    });
    void this.#provider?.init?.();
  }

  /** (Re)load definitions from the source into the snapshot. */
  async load(): Promise<void> {
    this.#fill(await this.#source.all());
    this.#emit();
  }

  #fill(defs: FlagDefinition[]): void {
    this.#snapshot = new Map(defs.map((d) => [d.key, d]));
  }

  /** All flag keys currently known. */
  keys(): string[] {
    return [...this.#snapshot.keys()];
  }

  /** The raw definition for a key (with any in-memory override reflected separately). */
  definition(key: string): FlagDefinition | undefined {
    return this.#snapshot.get(key);
  }

  /** Force a flag to a fixed value at runtime (dev toggles, tests). `undefined` clears. */
  override(key: string, value: FlagValue | undefined): void {
    if (value === undefined) this.#overrides.delete(key);
    else this.#overrides.set(key, value);
    this.#emit();
  }

  /** Current overrides (for devtools display). */
  overrides(): Record<string, FlagValue> {
    return Object.fromEntries(this.#overrides);
  }

  /** Evaluate one flag against a context. Synchronous, never throws.
   *  Order: override → provider cache (else local + warm the cache) → local rules.
   *  Every result is dispatched to `onEvaluation` listeners (exposure logging). */
  evaluate<T extends FlagValue = FlagValue>(key: string, ctx: EvaluationContext = {}): Evaluation<T> {
    let ev: Evaluation<T>;
    if (this.#overrides.has(key)) {
      ev = { key, value: this.#overrides.get(key)! as T, reason: "STATIC" };
    } else if (this.#provider) {
      const hit = this.#cache.get(contextHash(key, ctx)) as Evaluation<T> | undefined;
      if (hit) ev = hit;
      else {
        this.#warmOne(key, ctx); // background resolve → cache → re-render
        ev = this.#localEvaluate<T>(key, ctx); // best-effort until the provider answers
      }
    } else {
      ev = this.#localEvaluate<T>(key, ctx);
    }
    if (this.#listeners.size) for (const cb of [...this.#listeners]) cb(ev, ctx);
    return ev;
  }

  /** Await the authoritative value (resolves the provider; no-op vs local sources). */
  async evaluateAsync<T extends FlagValue = FlagValue>(key: string, ctx: EvaluationContext = {}): Promise<Evaluation<T>> {
    if (this.#overrides.has(key) || !this.#provider) return this.evaluate<T>(key, ctx);
    const ev = (await this.#resolveProvider(key, ctx)) as Evaluation<T>;
    if (this.#listeners.size) for (const cb of [...this.#listeners]) cb(ev, ctx);
    return ev;
  }

  /** Pre-resolve provider flags into the cache for a context (SSR / warm start). */
  async warm(ctx: EvaluationContext = {}, keys?: string[]): Promise<void> {
    if (!this.#provider) return;
    const list = keys ?? (await this.#provider.keys?.()) ?? this.keys();
    await Promise.all(list.map((k) => this.#resolveProvider(k, ctx)));
    this.#emit();
  }

  #warmOne(key: string, ctx: EvaluationContext): void {
    const h = contextHash(key, ctx);
    if (this.#inflight.has(h)) return;
    this.#inflight.add(h);
    void this.#resolveProvider(key, ctx).finally(() => {
      this.#inflight.delete(h);
      this.#emit(); // re-render now that the real value is cached
    });
  }

  async #resolveProvider(key: string, ctx: EvaluationContext): Promise<Evaluation> {
    try {
      const local = this.#localEvaluate(key, ctx);
      const ev = await this.#provider!.resolve(key, ctx, local.reason === "ERROR" ? undefined : local.value);
      this.#cache.set(contextHash(key, ctx), ev);
      return ev;
    } catch (e) {
      this.#onError?.(e instanceof Error ? e : new Error(String(e)), key);
      return this.#localEvaluate(key, ctx);
    }
  }

  /** Evaluate against LOCAL definitions/rules only (the built-in engine). */
  #localEvaluate<T extends FlagValue = FlagValue>(key: string, ctx: EvaluationContext = {}): Evaluation<T> {
    const reply = (value: FlagValue, reason: EvaluationReason, variant?: string): Evaluation<T> => ({ key, value: value as T, variant, reason });
    const def = this.#snapshot.get(key);
    if (!def) return reply(false, "ERROR");
    try {
      if (def.enabled === false) return reply(def.defaultValue, "DISABLED");
      for (const rule of def.rules ?? []) {
        const attrsOk = Object.entries(rule.attributes ?? {}).every(([k, v]) => matches(v, ctx.attributes?.[k]));
        if (!attrsOk) continue;
        if (rule.percentage !== undefined && !inRollout(key, rule.percentage, ctx)) continue;
        const value = rule.value !== undefined ? rule.value : rule.variant !== undefined ? def.variants?.[rule.variant] : def.defaultValue;
        return reply(value ?? def.defaultValue, rule.percentage !== undefined ? "ROLLOUT" : "TARGETING_MATCH", rule.variant);
      }
      if (def.rollout !== undefined) return reply(inRollout(key, def.rollout, ctx), "ROLLOUT");
      if (def.defaultVariant) return reply(def.variants?.[def.defaultVariant] ?? def.defaultValue, "DEFAULT", def.defaultVariant);
      return reply(def.defaultValue, "DEFAULT");
    } catch (e) {
      this.#onError?.(e instanceof Error ? e : new Error(String(e)), key);
      return reply(def.defaultValue, "ERROR");
    }
  }

  /** Boolean check — truthy value ⇒ enabled. */
  isEnabled(key: string, ctx?: EvaluationContext): boolean {
    return Boolean(this.evaluate(key, ctx).value);
  }

  /** The selected variant name, if any. */
  variant(key: string, ctx?: EvaluationContext): string | undefined {
    return this.evaluate(key, ctx).variant;
  }

  /** The typed value, with a `fallback` when the flag is unknown. */
  value<T extends FlagValue = FlagValue>(key: string, ctx?: EvaluationContext, fallback?: T): T {
    const ev = this.evaluate<T>(key, ctx);
    return ev.reason === "ERROR" && fallback !== undefined ? fallback : ev.value;
  }

  /** Evaluate EVERY flag for a context — a snapshot for SSR bootstrap / devtools. */
  all(ctx: EvaluationContext = {}): Record<string, Evaluation> {
    const out: Record<string, Evaluation> = {};
    for (const key of this.#snapshot.keys()) out[key] = this.evaluate(key, ctx);
    return out;
  }

  /** Subscribe to changes (source reload / override / provider push). Returns an unsubscribe fn. */
  onChange(cb: () => void): () => void {
    this.#subs.add(cb);
    return () => void this.#subs.delete(cb);
  }

  /** Subscribe to EVERY evaluation — for exposure logging / analytics sinks
   *  (e.g. `@youneed/feature-flags-datadog`). Returns an unsubscribe fn. */
  onEvaluation(cb: EvaluationListener): () => void {
    this.#listeners.add(cb);
    return () => void this.#listeners.delete(cb);
  }

  /** Detach from source/provider and drop listeners. */
  dispose(): void {
    this.#detachSource?.();
    this.#detachProvider?.();
    void this.#provider?.close?.();
    this.#subs.clear();
    this.#listeners.clear();
  }

  #emit(): void {
    for (const cb of [...this.#subs]) cb();
  }
}

/** Convenience constructor. Pass definitions or a {@link FlagSource}. */
export function createFlags(source?: FlagSource | FlagDefinition[], opts?: FeatureFlagsOptions): FeatureFlags {
  return new FeatureFlags(source ?? [], opts);
}

/**
 * Rehydrate an engine from a precomputed snapshot of evaluations (SSR → client):
 * the server evaluates `flags.all(ctx)`, serialises it, and the client builds a
 * read-only engine that returns those values without the definitions.
 */
export function fromSnapshot(snapshot: Record<string, Evaluation>): FeatureFlags {
  const defs: FlagDefinition[] = Object.values(snapshot).map((e) =>
    e.variant ? { key: e.key, defaultValue: e.value, variants: { [e.variant]: e.value }, defaultVariant: e.variant } : { key: e.key, defaultValue: e.value },
  );
  return new FeatureFlags(defs);
}
