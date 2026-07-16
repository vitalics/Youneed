// @youneed/cli-plugin-config — config-file defaults for @youneed/cli.
//
//   Application({ name: "ops", commands: [...], plugins: [config()] });
//   // ops.config.json / .opsrc / package.json "ops" field → option defaults
//
// At build time the plugin loads a config file and merges its values into the
// DEFAULTS of matching options across the whole app. Precedence ends up as
// CLI flag > env (via cli-middleware-env) > config file > built-in default.
// This is NOT the same as env: env reads process.env per-command; config reads
// a file and seeds option defaults app-wide.
//
//   { "separator": ";", "verbose": true, "commands": { "split": { "first": true } } }
//   // top-level keys apply to any option with that key; a `commands.<name>`
//   // section applies only to that command.

import { existsSync, readFileSync } from "node:fs";
import type { CliPlugin, OptionSpec, PluginHost } from "@youneed/cli";

/** A loaded config object. */
export type ConfigData = Record<string, unknown>;

/** Options for {@link config}. */
export interface ConfigOptions {
  /** Use this object directly instead of reading a file (handy for tests). */
  data?: ConfigData;
  /** Candidate files (relative to `cwd`). Defaults derived from the app name. */
  files?: string[];
  /** Directory to search. Default `process.cwd()`. */
  cwd?: string;
  /** package.json field to read when a `package.json` candidate matches. Default the app name. */
  packageKey?: string;
}

function readJsonFile(path: string): ConfigData | undefined {
  try {
    if (!existsSync(path)) return undefined;
    return JSON.parse(readFileSync(path, "utf8")) as ConfigData;
  } catch {
    return undefined;
  }
}

/** Load the first matching config file for `name`, or `undefined`. */
export function loadConfigFile(name: string, options: ConfigOptions = {}): ConfigData | undefined {
  const cwd = options.cwd ?? (typeof process !== "undefined" ? process.cwd() : ".");
  const candidates = options.files ?? [
    `${name}.config.json`,
    `.${name}rc`,
    `.${name}rc.json`,
    "package.json",
  ];
  const join = (file: string): string => `${cwd}/${file}`;
  for (const file of candidates) {
    const data = readJsonFile(join(file));
    if (!data) continue;
    if (file === "package.json") {
      const section = data[options.packageKey ?? name];
      if (section && typeof section === "object") return section as ConfigData;
      continue;
    }
    return data;
  }
  return undefined;
}

/** Seed option defaults from `values` (mutates the resolved specs). */
function seed(options: readonly OptionSpec[], values: ConfigData): void {
  for (const opt of options) {
    if (Object.prototype.hasOwnProperty.call(values, opt.key)) opt.default = values[opt.key];
  }
}

/** Merge `data` into the catalogue's option defaults. */
export function applyConfig(host: PluginHost, data: ConfigData): void {
  seed(host.options, data);
  const commands = (data.commands ?? {}) as Record<string, ConfigData | undefined>;
  for (const command of host.commands) {
    seed(command.options, data); // top-level keys apply everywhere
    const section = commands[command.name];
    if (section && typeof section === "object") seed(command.options, section); // command-specific
  }
}

/**
 * Config plugin. Loads a config file (or the given `data`) and merges it into
 * option defaults for every command.
 */
export function config(options: ConfigOptions = {}): CliPlugin {
  return {
    name: "config",
    setup(host) {
      const data = options.data ?? loadConfigFile(host.name, options);
      if (data) applyConfig(host, data);
    },
  };
}
