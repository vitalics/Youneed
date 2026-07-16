// @youneed/cli — help text rendering. Pure string building; the runner decides
// when to print it. Layout follows Commander's: Usage / description / Arguments
// / Options / Commands, with a two-column aligned body.

import type { ArgSpec, CommandSpec, OptionSpec } from "./parse.ts";

/** Static facts the renderer needs about the program. */
export interface ProgramInfo {
  name: string;
  description?: string;
  version?: string;
  commands: CommandSpec[];
  globalOptions: OptionSpec[];
}

/** Render a positional arg as `<name>` / `[name]` / `<name...>`. */
function formatArg(arg: ArgSpec): string {
  const inner = arg.variadic ? `${arg.name}...` : arg.name;
  return arg.required ? `<${inner}>` : `[${inner}]`;
}

/** Align a list of `[left, right]` rows into a two-column block. */
function columns(rows: [string, string][], indent = "  "): string {
  const width = rows.reduce((max, [left]) => Math.max(max, left.length), 0);
  return rows
    .map(([left, right]) =>
      right ? `${indent}${left.padEnd(width)}  ${right}` : `${indent}${left}`,
    )
    .join("\n");
}

/** The right-hand description for an option, with its default appended. */
function optionDescription(opt: OptionSpec): string {
  let desc = opt.description ?? "";
  if (opt.default !== undefined) {
    const value = typeof opt.default === "string" ? `"${opt.default}"` : String(opt.default);
    desc = desc ? `${desc} (default: ${value})` : `(default: ${value})`;
  }
  return desc;
}

/** Top-level `--help`. */
export function renderProgramHelp(info: ProgramInfo): string {
  const out: string[] = [];
  const hasCommands = info.commands.some((c) => !c.hidden);
  out.push(`Usage: ${info.name} [options]${hasCommands ? " [command]" : ""}`);
  if (info.description) out.push("", info.description);

  if (info.globalOptions.length) {
    out.push("", "Options:");
    out.push(columns(info.globalOptions.map((o) => [o.raw, optionDescription(o)])));
  }

  if (hasCommands) {
    out.push("", "Commands:");
    const rows = info.commands
      .filter((c) => !c.hidden)
      .map((c): [string, string] => {
        const args = c.args.map(formatArg).join(" ");
        return [`${c.name}${args ? " " + args : ""}`, c.description ?? ""];
      });
    rows.push(["help [command]", "display help for command"]);
    out.push(columns(rows));
  }
  return out.join("\n");
}

/** Per-command `--help`. */
export function renderCommandHelp(info: ProgramInfo, cmd: CommandSpec): string {
  const out: string[] = [];
  const args = cmd.args.map(formatArg).join(" ");
  out.push(`Usage: ${info.name} ${cmd.name}${args ? " " + args : ""} [options]`);
  if (cmd.description) out.push("", cmd.description);

  if (cmd.args.length) {
    out.push("", "Arguments:");
    out.push(columns(cmd.args.map((a) => [formatArg(a), ""])));
  }

  // Merge command + global options, deduped (a command that spreads
  // `defaultOptions()` would otherwise list `--help`/`--version` twice — once
  // from its own options and once from the program globals). The command's own
  // spec wins.
  const optionId = (o: OptionSpec): string => o.long ?? o.short ?? o.raw;
  const own = new Set(cmd.options.map(optionId));
  const options = [...cmd.options, ...info.globalOptions.filter((o) => !own.has(optionId(o)))];
  if (options.length) {
    out.push("", "Options:");
    out.push(columns(options.map((o) => [o.raw, optionDescription(o)])));
  }
  return out.join("\n");
}
