// @youneed/cli-plugin-man — man-page documentation for @youneed/cli.
//
//   Application({ name: "ops", commands: [...], plugins: [man()] });
//   // ops man > ops.1   →  man ./ops.1
//
// Registers a `man` command that emits a roff/troff man page generated from the
// catalogue. Distinct from --help: `man` produces the offline `man(1)` format
// (sections, .TP entries) you ship as a `.1` file or pipe to `man`; `help` is the
// interactive in-terminal usage.

import { Command, type CliPlugin, type CommandSpec, type PluginHost } from "@youneed/cli";

const escape = (s: string): string => s.replace(/\\/g, "\\\\").replace(/-/g, "\\-");

function usage(c: CommandSpec): string {
  const args = c.args.map((a) => (a.required ? `<${a.name}>` : `[${a.name}]`)).join(" ");
  return `${c.name}${args ? " " + args : ""}`;
}

/** Generate a roff man page for the whole app. */
export function generateMan(host: PluginHost, exclude?: string): string {
  const name = host.name;
  const commands = host.commands.filter((c) => !c.hidden && c.name !== exclude);
  const lines: string[] = [];
  lines.push(`.TH ${name.toUpperCase()} 1${host.version ? ` "" "v${host.version}"` : ""}`);
  lines.push(".SH NAME");
  lines.push(`${escape(name)} \\- ${escape(host.description ?? name)}`);
  lines.push(".SH SYNOPSIS");
  lines.push(`.B ${escape(name)}`);
  lines.push("[command] [options]");
  lines.push(".SH COMMANDS");
  for (const c of commands) {
    lines.push(".TP");
    lines.push(`.B ${escape(usage(c))}`);
    lines.push(escape(c.description ?? ""));
    for (const o of c.options) {
      lines.push(`.RS`);
      lines.push(`.TP`);
      lines.push(`.B ${escape(o.raw)}`);
      lines.push(escape(o.description ?? ""));
      lines.push(`.RE`);
    }
  }
  return lines.join("\n");
}

/** Options for {@link man}. */
export interface ManOptions {
  /** Name of the registered command. Default `man`. */
  command?: string;
}

/** Man-page plugin. Registers a `man` command. */
export function man(options: ManOptions = {}): CliPlugin {
  const commandName = options.command ?? "man";
  return {
    name: "man",
    setup(host) {
      class Man extends Command(commandName, { description: "Print the man page (roff)" }) {
        override execute(): void {
          // eslint-disable-next-line no-console
          console.log(generateMan(host, commandName));
        }
      }
      host.addCommand(Man);
    },
  };
}
