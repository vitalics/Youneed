// @youneed/cli-plugin-help — a richer `help` command for @youneed/cli.
//
//   Application({
//     name: "ops",
//     commands: [...],
//     plugins: [help({ examples: { split: ["ops split a,b,c --first"] } })],
//   });
//
// Registers a `help [command]` command that replaces the built-in help with a
// grouped command list and per-command examples. (The built-in --help / `help`
// stays for apps without this plugin; when a `help` command is registered the
// runtime defers to it.)
//
// Difference from cli-plugin-man: `help` is the interactive, in-terminal usage
// (with examples); `man` emits offline roff documentation.

import { Command, type CliPlugin, type CommandSpec, type PluginHost } from "@youneed/cli";

const bold = (s: string): string => `\x1b[1m${s}\x1b[22m`;
const dim = (s: string): string => `\x1b[2m${s}\x1b[22m`;
const cyan = (s: string): string => `\x1b[36m${s}\x1b[39m`;

/** Per-command example invocations. */
export type Examples = Record<string, string[]>;

function usage(c: CommandSpec): string {
  const args = c.args.map((a) => (a.required ? `<${a.name}>` : `[${a.name}]`)).join(" ");
  return `${c.name}${args ? " " + args : ""}`;
}

function pad(rows: [string, string][]): string {
  const w = rows.reduce((m, [l]) => Math.max(m, l.length), 0);
  return rows.map(([l, r]) => `  ${l.padEnd(w)}  ${dim(r)}`).join("\n");
}

/** Render the full help for the app, or for one command. */
export function renderHelp(host: PluginHost, examples: Examples, commandName?: string): string {
  const commands = host.commands.filter((c) => !c.hidden);
  const target = commandName ? commands.find((c) => c.name === commandName) : undefined;

  if (target) {
    const out: string[] = [`${bold("Usage:")} ${host.name} ${usage(target)} [options]`];
    if (target.description) out.push("", target.description);
    if (target.options.length) {
      out.push("", bold("Options:"));
      out.push(pad(target.options.map((o) => [o.raw, o.description ?? ""])));
    }
    const ex = examples[target.name];
    if (ex?.length) {
      out.push("", bold("Examples:"));
      out.push(ex.map((e) => `  ${cyan("$")} ${e}`).join("\n"));
    }
    return out.join("\n");
  }

  const out: string[] = [`${bold(host.name)}${host.version ? dim(" v" + host.version) : ""}`];
  if (host.description) out.push(host.description);
  out.push("", `${bold("Usage:")} ${host.name} <command> [options]`, "", bold("Commands:"));
  out.push(pad(commands.map((c) => [usage(c), c.description ?? ""])));
  const all = Object.values(examples).flat();
  if (all.length) {
    out.push("", bold("Examples:"));
    out.push(all.map((e) => `  ${cyan("$")} ${e}`).join("\n"));
  }
  return out.join("\n");
}

/** Options for {@link help}. */
export interface HelpOptions {
  /** Per-command example command lines. */
  examples?: Examples;
  /** Name of the registered command. Default `help`. */
  command?: string;
}

/** Enhanced-help plugin. Registers a `help [command]` command. */
export function help(options: HelpOptions = {}): CliPlugin {
  const commandName = options.command ?? "help";
  const examples = options.examples ?? {};
  return {
    name: "help",
    setup(host) {
      class Help extends Command(`${commandName} [command]`, {
        description: "Show help, with examples",
      }) {
        override execute(command?: string): void {
          // eslint-disable-next-line no-console
          console.log(renderHelp(host, examples, command));
        }
      }
      host.addCommand(Help);
    },
  };
}
