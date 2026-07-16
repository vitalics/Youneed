// @youneed/cli — the application plugin contract.
//
// A plugin is the APP-level counterpart to middleware. Where middleware augments
// a single command's `this`, a plugin sees the whole application: it can inspect
// the command catalogue, register new commands, and hook the run lifecycle. This
// is the CLI twin of @youneed/server's `ServerPlugin`.
//
//   Application({ name: "ops", commands: [...], plugins: [devtools()] });
//
// Use a plugin (not middleware) when the feature needs the whole app — shell
// completion, a devtools server, an update-notifier, telemetry, a config loader.

import type { CommandSpec, OptionSpec } from "./parse.ts";
import { SPEC } from "./parse.ts";

/** A command class as produced by `Command()` (loose, for `addCommand`). */
export type CommandClassRef = (new () => object) & { readonly [SPEC]: CommandSpec };

/** What a plugin's `setup` receives — the application's catalogue + extension points. */
export interface PluginHost {
  readonly name: string;
  readonly version?: string;
  readonly description?: string;
  /** Resolved specs of every registered command (live — reflects later additions). */
  readonly commands: readonly CommandSpec[];
  /** Resolved global option specs. */
  readonly options: readonly OptionSpec[];
  /** Register an extra command (e.g. a `devtools`/`completion` command). */
  addCommand(command: CommandClassRef): void;
}

/** Facts about a single command run, passed to lifecycle hooks. */
export interface CommandRunInfo {
  readonly command: CommandSpec;
  readonly args: readonly string[];
  readonly options: Readonly<Record<string, unknown>>;
}

/** An application plugin. */
export interface CliPlugin {
  /** Name, for diagnostics. */
  name: string;
  /** Inspect the catalogue and register commands at build time. */
  setup?(host: PluginHost): void;
  /** Run before a matched command dispatches. */
  beforeCommand?(info: CommandRunInfo): void | Promise<void>;
  /** Run after a command settles, with its exit code. */
  afterCommand?(info: CommandRunInfo, code: number): void | Promise<void>;
  /**
   * Handle an error thrown while a command ran. Return a string to print to
   * stderr instead of the default `error: …` line (the first plugin that
   * returns one wins the message). The command still exits non-zero.
   */
  onError?(error: unknown, info: CommandRunInfo): string | void | Promise<string | void>;
}

/** Read the {@link CommandSpec} off a command class. */
export function specOf(command: CommandClassRef): CommandSpec {
  return command[SPEC];
}
