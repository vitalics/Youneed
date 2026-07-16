// @youneed/cli-plugin-feature-flags — evaluate & operate feature flags from a CLI.
//
//   import { Application, Command } from "@youneed/cli";
//   import { createFlags } from "@youneed/feature-flags";
//   import { featureFlags, flagsMiddleware } from "@youneed/cli-plugin-feature-flags";
//
//   const flags = createFlags([{ key: "beta", defaultValue: false, rollout: 20 }]);
//
//   class Deploy extends Command({ name: "deploy", middleware: [flagsMiddleware(flags)] }) {
//     execute() {
//       if (this.flags.isEnabled("beta")) console.log("beta path");
//     }
//   }
//
//   Application({ name: "ops", commands: [Deploy], plugins: [featureFlags(flags)] });
//   // `ops flags`              → list every flag with value / variant / reason
//   // `ops flags beta`         → detail for one flag
//   // `ops flags --on beta`    → override beta → true (in-process)
//   // `ops flags --set plan=fast` / `--off beta` / `--clear beta`
//
// Two twins, mirroring the rest of @youneed/cli:
//   • `flagsMiddleware(flags, opts)` — the provider twin: adds `this.flags`
//     (a small, context-bound evaluator) to a command so it can gate behaviour.
//   • `featureFlags(flags, opts)` — the app plugin: registers the `flags`
//     command for listing / inspecting / overriding at runtime.
// Overrides are held in-process on the shared FeatureFlags engine unless the
// engine's source persists them.

import {
  Command,
  contribute,
  option,
  defaultOptions,
  table,
  type CliMiddleware,
  type CliPlugin,
} from "@youneed/cli";
import type {
  Evaluation,
  EvaluationContext,
  FeatureFlags,
  FlagValue,
} from "@youneed/feature-flags";

/** Options shared by {@link featureFlags} and {@link flagsMiddleware}. */
export interface FeatureFlagsOptions {
  /** Default evaluation context used when a call passes none. Default `{}`. */
  context?: EvaluationContext;
}

/**
 * The evaluator attached as `this.flags` on a command. A thin, context-bound
 * facade over the shared {@link FeatureFlags} engine — every call defaults to
 * the plugin/middleware `context` when none is supplied.
 */
export interface CommandFlags {
  /** Boolean check — truthy value ⇒ enabled. */
  isEnabled(key: string, ctx?: EvaluationContext): boolean;
  /** The selected variant name, if any. */
  variant(key: string, ctx?: EvaluationContext): string | undefined;
  /** The typed value, with a `fallback` when the flag is unknown. */
  value<T extends FlagValue = FlagValue>(key: string, ctx?: EvaluationContext, fallback?: T): T;
  /** The full evaluation (value + variant + reason). */
  evaluate<T extends FlagValue = FlagValue>(key: string, ctx?: EvaluationContext): Evaluation<T>;
  /** All flag keys currently known to the engine. */
  keys(): string[];
  /** The shared engine, for advanced use (`override`, `onChange`, …). */
  readonly engine: FeatureFlags;
}

/** Build the context-bound `this.flags` facade over `engine`. */
function commandFlags(engine: FeatureFlags, base: EvaluationContext): CommandFlags {
  const ctxOf = (ctx?: EvaluationContext): EvaluationContext => ctx ?? base;
  return {
    engine,
    isEnabled: (key, ctx) => engine.isEnabled(key, ctxOf(ctx)),
    variant: (key, ctx) => engine.variant(key, ctxOf(ctx)),
    value: (key, ctx, fallback) => engine.value(key, ctxOf(ctx), fallback),
    evaluate: (key, ctx) => engine.evaluate(key, ctxOf(ctx)),
    keys: () => engine.keys(),
  };
}

/**
 * Feature-flags middleware — the provider twin. Adds `this.flags` (a
 * {@link CommandFlags} evaluator bound to `opts.context`) so any command can
 * gate behaviour on a flag.
 *
 * ```ts
 * class Build extends Command({ name: "build", middleware: [flagsMiddleware(flags)] }) {
 *   execute() {
 *     if (this.flags.isEnabled("fast-build")) { … }
 *   }
 * }
 * ```
 */
export function flagsMiddleware(
  engine: FeatureFlags,
  opts: FeatureFlagsOptions = {},
): CliMiddleware<{ readonly flags: CommandFlags }> {
  const base = opts.context ?? {};
  return {
    name: "feature-flags",
    install(ctx) {
      contribute(ctx.command, "flags", commandFlags(engine, base));
    },
  };
}

// ── value parsing / formatting for the `flags` command ────────────────────────

/** Parse a `--set key=value` value: JSON if it parses, else the raw string. */
function parseValue(raw: string): FlagValue {
  try {
    return JSON.parse(raw) as FlagValue;
  } catch {
    return raw;
  }
}

/** Render a flag value for display (compact JSON for objects/arrays). */
function show(value: FlagValue): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

const dim = (s: string): string => `\x1b[2m${s}\x1b[22m`;
const bold = (s: string): string => `\x1b[1m${s}\x1b[22m`;

/** One evaluated flag as a table row `[key, value, variant, reason]`. */
function row(engine: FeatureFlags, key: string, ctx: EvaluationContext): [string, string, string, string] {
  const ev = engine.evaluate(key, ctx);
  const overridden = Object.prototype.hasOwnProperty.call(engine.overrides(), key);
  return [
    overridden ? `${key} ${dim("(override)")}` : key,
    show(ev.value),
    ev.variant ?? dim("—"),
    ev.reason,
  ];
}

/** Render the list of all flags as a table. */
export function renderList(engine: FeatureFlags, ctx: EvaluationContext): string {
  const keys = engine.keys();
  if (keys.length === 0) return dim("no flags defined");
  const rows = keys.map((k) => row(engine, k, ctx));
  return table(rows, { head: ["flag", "value", "variant", "reason"] });
}

/** Render the detail view for a single flag. */
export function renderDetail(engine: FeatureFlags, key: string, ctx: EvaluationContext): string {
  const def = engine.definition(key);
  const ev = engine.evaluate(key, ctx);
  const overridden = Object.prototype.hasOwnProperty.call(engine.overrides(), key);
  const out: string[] = [bold(key)];
  if (def?.description) out.push(def.description);
  const rows: [string, string][] = [
    ["value", show(ev.value)],
    ["variant", ev.variant ?? "—"],
    ["reason", ev.reason],
    ["enabled", String(def?.enabled ?? true)],
    ["default", def ? show(def.defaultValue) : "—"],
    ["overridden", String(overridden)],
  ];
  const w = rows.reduce((m, [l]) => Math.max(m, l.length), 0);
  out.push(rows.map(([l, r]) => `  ${dim(l.padEnd(w))}  ${r}`).join("\n"));
  return out.join("\n");
}

/** Options for {@link featureFlags}. */
export interface FeatureFlagsPluginOptions extends FeatureFlagsOptions {
  /** Name of the registered command. Default `flags`. */
  command?: string;
}

/**
 * Feature-flags plugin — the app twin. Registers a `flags` command that lists
 * every flag with its current value / variant / reason, shows detail for one
 * flag, and mutates overrides at runtime:
 *
 * - `flags`                    — list all flags
 * - `flags <key>`              — detail for one flag
 * - `flags --on <key>`         — override to `true`
 * - `flags --off <key>`        — override to `false`
 * - `flags --set <key>=<val>`  — override to a parsed value (JSON or string)
 * - `flags --clear <key>`      — remove an override
 *
 * Overrides call {@link FeatureFlags.override} on the shared engine and persist
 * in-process unless the engine's source persists them.
 */
export function featureFlags(engine: FeatureFlags, options: FeatureFlagsPluginOptions = {}): CliPlugin {
  const commandName = options.command ?? "flags";
  const base = options.context ?? {};

  return {
    name: "feature-flags",
    setup(host) {
      class Flags extends Command(`${commandName} [key]`, {
        description: "List, inspect, and override feature flags",
        options: [
          option("--on <key>", { description: "override a flag to true" }),
          option("--off <key>", { description: "override a flag to false" }),
          option("--set <pair>", { description: "override a flag: <key>=<value>" }),
          option("--clear <key>", { description: "remove an override" }),
          ...defaultOptions(),
        ],
      }) {
        override execute(key?: string): void {
          const { on, off, set, clear } = this.options;
          const lines: string[] = [];

          if (typeof on === "string") {
            engine.override(on, true);
            lines.push(`${on} = true ${dim("(override)")}`);
          }
          if (typeof off === "string") {
            engine.override(off, false);
            lines.push(`${off} = false ${dim("(override)")}`);
          }
          if (typeof set === "string") {
            const eq = set.indexOf("=");
            const k = eq === -1 ? set : set.slice(0, eq);
            const v = eq === -1 ? true : parseValue(set.slice(eq + 1));
            engine.override(k, v);
            lines.push(`${k} = ${show(v)} ${dim("(override)")}`);
          }
          if (typeof clear === "string") {
            engine.override(clear, undefined);
            lines.push(`${clear} ${dim("(override cleared)")}`);
          }

          const mutated = lines.length > 0;
          if (mutated) {
            // eslint-disable-next-line no-console
            console.log(lines.join("\n"));
          }

          if (key) {
            // eslint-disable-next-line no-console
            console.log(renderDetail(engine, key, base));
          } else if (!mutated) {
            // eslint-disable-next-line no-console
            console.log(renderList(engine, base));
          }
        }
      }
      host.addCommand(Flags);
    },
  };
}

export type {
  Evaluation,
  EvaluationContext,
  FeatureFlags,
  FlagValue,
} from "@youneed/feature-flags";
