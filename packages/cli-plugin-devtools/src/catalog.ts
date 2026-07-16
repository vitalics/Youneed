// @youneed/cli-plugin-devtools — catalogue model.
//
// A serialisable snapshot of an app's commands and options, derived from the
// plugin host's resolved specs. The devtools UI renders this, and
// `assembleCommand` turns a filled-in form back into a runnable invocation.

import type { CommandSpec, OptionSpec, PluginHost } from "@youneed/cli";

/** A serialisable option. */
export interface CatalogOption {
  /** Flags exactly as declared, e.g. `-s, --separator <char>`. */
  flags: string;
  /** `this.options` key. */
  key: string;
  long?: string;
  short?: string;
  description?: string;
  takesValue: boolean;
  optional: boolean;
  required: boolean;
  default?: unknown;
}

/** A serialisable positional argument. */
export interface CatalogArg {
  name: string;
  required: boolean;
  variadic: boolean;
}

/** A serialisable command. */
export interface CatalogCommand {
  name: string;
  description?: string;
  aliases: string[];
  args: CatalogArg[];
  options: CatalogOption[];
  middleware: string[];
}

/** The whole app, serialised. */
export interface Catalog {
  name: string;
  version?: string;
  description?: string;
  options: CatalogOption[];
  commands: CatalogCommand[];
}

function toOption(o: OptionSpec): CatalogOption {
  return {
    flags: o.raw,
    key: o.key,
    long: o.long,
    short: o.short,
    description: o.description,
    takesValue: o.takesValue,
    optional: o.optionalValue,
    required: o.required,
    default: o.default,
  };
}

function toCommand(c: CommandSpec): CatalogCommand {
  return {
    name: c.name,
    description: c.description,
    aliases: c.aliases,
    args: c.args.map((a) => ({ name: a.name, required: a.required, variadic: a.variadic })),
    options: c.options.map(toOption),
    middleware: c.middleware.map((m) => m.name ?? "middleware"),
  };
}

/** Build a {@link Catalog} from a plugin host, optionally excluding one command. */
export function createCatalog(host: PluginHost, opts: { exclude?: string } = {}): Catalog {
  return {
    name: host.name,
    version: host.version,
    description: host.description,
    options: host.options.map(toOption),
    commands: host.commands.filter((c) => c.name !== opts.exclude).map(toCommand),
  };
}

/** Filled-in builder values for one command. */
export interface CommandValues {
  args: Record<string, string>;
  options: Record<string, string | boolean>;
}

/** Quote a token for the shell if it contains whitespace or quotes. */
export function quoteArg(value: string): string {
  return /[\s"'$`\\]/.test(value) ? `"${value.replace(/(["\\$`])/g, "\\$1")}"` : value;
}

/** The argv (after the program name) a filled-in command produces. */
export function toArgv(command: CatalogCommand, values: CommandValues): string[] {
  const argv: string[] = [command.name];
  for (const a of command.args) {
    const v = values.args[a.name];
    if (v) argv.push(v);
  }
  for (const o of command.options) {
    const v = values.options[o.key];
    if (v === undefined || v === "" || v === false) continue;
    const flag = o.long ? `--${o.long}` : o.short ? `-${o.short}` : `--${o.key}`;
    argv.push(flag);
    if (o.takesValue && v !== true) argv.push(String(v));
  }
  return argv;
}

/** The copy-paste command line a filled-in command produces. */
export function assembleCommand(appName: string, command: CatalogCommand, values: CommandValues): string {
  return [appName, ...toArgv(command, values).map(quoteArg)].join(" ");
}
