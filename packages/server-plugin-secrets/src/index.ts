// ── @youneed/server-plugin-secrets — secrets for @youneed/server ─────────────
//
// Wraps a `@youneed/secrets` engine into a `ServerPlugin` plus a controller
// PROVIDER. The plugin mounts SAFE introspection routes (secret NAMES only + a
// masked presence "health" probe) and an `inspect()` for the devtools Secrets
// tab. The provider contributes `this.secrets` (the raw `Secrets` engine) to a
// controller so handlers do `await this.secrets.require("STRIPE_KEY")`.
//
//   SECURITY: this plugin NEVER exposes secret VALUES over HTTP or devtools.
//   Routes surface secret NAMES and a MASKED preview only (e.g. "sk•••ab").
//
//   const engine = createSecrets(new EnvSecrets());
//
//   const app = Application(BillingController).plugin(secrets(engine));
//
//   class BillingController extends Controller("/billing", {
//     providers: [secretsProvider(engine)],
//   }) {
//     @Controller.post()
//     async charge() {
//       const key = await this.secrets.require("STRIPE_KEY"); // never leaves the server
//       return { ok: true };
//     }
//   }

import { Response } from "@youneed/server";
import type { Context, ControllerProvider, ServerPlugin } from "@youneed/server";
import type { Secrets } from "@youneed/secrets";

export * from "@youneed/secrets"; // Secrets, createSecrets, EnvSecrets, … — for convenience

// ── masking — the ONLY value-derived data that ever leaves the server ─────────

/** Mask a secret value to a preview that reveals almost nothing: first 2 + "•••"
 *  + last 2 chars (e.g. `"sk_live_abcd" → "sk•••cd"`). Short values collapse to
 *  all-bullets so length is never leaked precisely for tiny secrets. Exported
 *  (pure) for tests. NEVER returns the raw value. */
export function maskSecret(value: string): string {
  if (value.length <= 4) return "•".repeat(Math.max(value.length, 1));
  return `${value.slice(0, 2)}•••${value.slice(-2)}`;
}

// ── controller provider — `this.secrets` (the raw engine) ─────────────────────

/**
 * A controller provider that contributes `this.secrets` — the {@link Secrets}
 * engine itself. Mirrors `ormProvider`/`flagsProvider`: it extends the controller
 * instance with a private, typed member, so a handler reads secrets directly:
 *
 *   class Billing extends Controller("/billing", {
 *     providers: [secretsProvider(engine)],
 *   }) { … await this.secrets.require("STRIPE_KEY") … }
 *
 * The value stays server-side — the handler decides what (if anything) to return.
 */
export function secretsProvider(engine: Secrets): ControllerProvider<{ readonly secrets: Secrets }> {
  return {
    install(instance) {
      Object.defineProperty(instance, "secrets", { configurable: true, value: engine });
    },
  };
}

// ── ServerPlugin ──────────────────────────────────────────────────────────────

/** Options for {@link secrets}. */
export interface SecretsPluginOptions {
  /** Internal route prefix (default `"/__secrets"`). */
  basePath?: string;
  /** Mount the devtools introspection routes (default true). */
  exposeDevtools?: boolean;
  /**
   * Allow the `GET /health` probe to RESOLVE a named secret and return a MASKED
   * preview + length (default true — a dev convenience). Even when enabled the
   * raw value is NEVER returned. Set `false` in production to make `/health`
   * report presence only (no length, no preview).
   */
  allowResolveTester?: boolean;
}

/** The `inspect()` payload — devtools detects the engine by `kind === "secrets"`. */
export interface SecretsInspect {
  kind: "secrets";
  backend: string;
  count: number;
  endpoints: { names: string; health: string };
}

/** The `GET /names` payload — NAMES only, plus the backend id. */
export interface SecretNamesResult {
  backend: string;
  names: string[];
}

/** The `GET /health?name=` payload — presence + MASKED metadata only. */
export interface SecretHealthResult {
  name: string;
  present: boolean;
  /** Present only when `allowResolveTester` and the secret resolves. */
  length?: number;
  /** MASKED preview (e.g. `"sk•••ab"`); never the raw value. */
  preview?: string;
}

/**
 * Probe a secret's presence WITHOUT leaking its value. Returns presence and,
 * when `allowResolveTester`, a masked preview + length. Exported (pure) so it can
 * be unit-tested against any {@link Secrets} engine with no HTTP wiring.
 */
export async function secretHealth(engine: Secrets, name: string, allowResolveTester: boolean): Promise<SecretHealthResult> {
  const value = await engine.get(name);
  const present = value !== undefined && value !== "";
  if (!present) return { name, present: false };
  if (!allowResolveTester) return { name, present: true };
  return { name, present: true, length: value!.length, preview: maskSecret(value!) };
}

/**
 * Mount a {@link Secrets} engine as a ServerPlugin: exposes SAFE introspection
 * routes under `basePath` and an `inspect()` for the devtools Secrets tab.
 * Register the matching {@link secretsProvider} on controllers that read
 * `this.secrets`.
 *
 * SECURITY: no route ever returns a raw secret value — only NAMES and a masked
 * presence probe.
 */
export function secrets(engine: Secrets, opts: SecretsPluginOptions = {}): ServerPlugin & { secrets: Secrets } {
  const basePath = (opts.basePath ?? "/__secrets").replace(/\/$/, "");
  const allowResolveTester = opts.allowResolveTester !== false;
  const endpoints = {
    names: `${basePath}/names`,
    health: `${basePath}/health`,
  };

  return {
    name: "secrets",
    secrets: engine,
    setup(app) {
      if (opts.exposeDevtools === false) return;

      // NAMES ONLY — never values. The devtools table's source of truth.
      const listing = async () => Response.json({ backend: engine.backend, names: await engine.list() } satisfies SecretNamesResult);
      app.get(basePath, () => listing()); // GET / (basePath root)
      app.get(endpoints.names, () => listing());

      // Presence probe with a MASKED preview — never the raw value.
      app.get(endpoints.health, async (ctx: Context) => {
        const name = ctx.query?.name;
        if (!name) return Response.json({ error: "name is required" }, { status: 400 });
        return Response.json(await secretHealth(engine, name, allowResolveTester));
      });
    },
    inspect(): SecretsInspect {
      // Sync — topology never awaits. `count` is 0 when the backend can't
      // enumerate; the panel fetches live names/health over the routes above.
      return { kind: "secrets", backend: engine.backend, count: 0, endpoints };
    },
  };
}
