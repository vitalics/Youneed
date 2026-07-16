// @youneed/dom-provider-env — type-safe environment variables for the frontend,
// as a composable `@youneed/dom` provider.
//
// `defineEnvironmentVariables(source, { schema })` coerces + validates a raw string
// source (build-time `import.meta.env`, a runtime-fetched config, …) against a
// `@youneed/schema` `t` spec, failing fast with every issue aggregated. The schema
// (the `t` builder) and the validation engine come from `@youneed/schema`; this
// package adds the frontend defaults (`import.meta.env`, async sources) AND a
// provider so a component reads the env through `this.env`:
//
//   import { Component, html } from "@youneed/dom";
//   import { defineEnvironmentVariables, envProvider, t } from "@youneed/dom-provider-env";
//
//   export const env = defineEnvironmentVariables(import.meta.env, {
//     schema: { API_URL: t.url(), FEATURE_X: t.boolean().default(false) },
//   });
//
//   class Widget extends Component("x-widget", { providers: [envProvider(env)] }) {
//     render() {
//       return html`<a href=${this.env.API_URL}>open</a>`; //  ← typed this.env
//     }
//   }
//
// Defined environments are registered for the devtools panel
// (`@youneed/dom-provider-env/devtools`), which shows them with secrets redacted.
//
// Note: browser env is PUBLIC (it ships in the bundle). `.secret()` masks a value
// in the devtools panel but is NOT a privacy guarantee — keep real secrets on the
// server (@youneed/server-plugin-env).

import { EnvError, parseEnv, type EnvOf, type EnvSchema, type EnvSource } from "@youneed/schema";
import type { ComponentProvider } from "@youneed/dom";

// Re-export the builder + engine pieces so a frontend app needs a single import.
export { t, EnvError, describeEnv } from "@youneed/schema";
export type { Schema, Infer, EnvSchema, EnvOf, EnvSource, EnvIssue } from "@youneed/schema";

export interface DefineEnvOptions<Sc extends EnvSchema> {
  /** The variable spec: a record of `t.*()` schemas. */
  schema: Sc;
  /** Label for the devtools panel (default `"env"`, deduped on collision). */
  name?: string;
}

/** A source that may be provided eagerly or behind a Promise (lazy `import()`). */
type SyncSource = EnvSource | (() => EnvSource);
type AsyncSource = Promise<EnvSource> | (() => Promise<EnvSource>);

// ── public API ────────────────────────────────────────────────────────────────

/** Validate against a synchronous source (or `import.meta.env` when omitted). */
export function defineEnvironmentVariables<Sc extends EnvSchema>(
  source: SyncSource | undefined,
  options: DefineEnvOptions<Sc>,
): EnvOf<Sc>;
/** Validate against an asynchronous source — returns a Promise of the env. */
export function defineEnvironmentVariables<Sc extends EnvSchema>(
  source: AsyncSource,
  options: DefineEnvOptions<Sc>,
): Promise<EnvOf<Sc>>;
export function defineEnvironmentVariables<Sc extends EnvSchema>(
  source: SyncSource | AsyncSource | undefined,
  options: DefineEnvOptions<Sc>,
): EnvOf<Sc> | Promise<EnvOf<Sc>> {
  const resolved = typeof source === "function" ? source() : source;
  if (isThenable(resolved)) return resolved.then((s) => build(s, options));
  return build(resolved, options);
}

/**
 * A composable `Component` provider that exposes a validated env object as
 * `this.env` — typed to the env you pass, so `this.env.SOMETHING` is checked:
 *
 *   class X extends Component("x", { providers: [envProvider(env)] }) { … }
 */
export function envProvider<E extends object>(env: E): ComponentProvider<{ readonly env: E }> {
  return {
    install(host) {
      Object.defineProperty(host, "env", { configurable: true, value: env });
    },
  };
}

// ── devtools registry (read by @youneed/dom-provider-env/devtools) ──────────────

/** A defined environment, as the devtools panel sees it. */
export interface RegisteredEnvironment {
  /** Label (the `name` option, deduped). */
  name: string;
  /** The validated, frozen values (raw — the panel redacts secrets via the schema). */
  values: Record<string, unknown>;
  /** The spec, used to know each field's kind / secret / optional / default. */
  schema: EnvSchema;
}

const registry = new Map<string, RegisteredEnvironment>();
const listeners = new Set<() => void>();
let counter = 0;

function register(name: string | undefined, values: Record<string, unknown>, schema: EnvSchema): void {
  // Default "env"; on collision (multiple unnamed) suffix to keep each visible.
  let key = name ?? "env";
  if (!name && registry.has(key)) key = `env-${++counter}`;
  registry.set(key, { name: key, values, schema });
  for (const fn of [...listeners]) fn();
}

/** Every environment defined via {@link defineEnvironmentVariables}, for devtools. */
export function registeredEnvironments(): readonly RegisteredEnvironment[] {
  return [...registry.values()];
}

/** Subscribe to registry changes (a new env defined). Returns an unsubscribe. */
export function onEnvironmentRegistered(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Clear the registry (mainly for tests). */
export function clearRegisteredEnvironments(): void {
  registry.clear();
  counter = 0;
  for (const fn of [...listeners]) fn();
}

// ── internals ───────────────────────────────────────────────────────────────

function build<Sc extends EnvSchema>(source: EnvSource | undefined, options: DefineEnvOptions<Sc>): EnvOf<Sc> {
  const { values, issues } = parseEnv(source ?? importMetaEnv(), options.schema);
  if (issues.length > 0) throw new EnvError(issues);
  const frozen = Object.freeze(values);
  register(options.name, frozen as Record<string, unknown>, options.schema);
  return frozen;
}

/** `import.meta.env` — the bundler (e.g. Vite) replaces this across every module,
 *  including dependencies, so reading it here yields the app's env. `undefined`
 *  outside such a bundler (Node/tests), where you pass the source explicitly. */
function importMetaEnv(): EnvSource {
  return (import.meta as unknown as { env?: EnvSource }).env ?? {};
}

function isThenable(v: unknown): v is Promise<EnvSource> {
  return v != null && typeof (v as { then?: unknown }).then === "function";
}
