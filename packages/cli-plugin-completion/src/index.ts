// @youneed/cli-plugin-completion — shell completion for @youneed/cli.
//
//   Application({ name: "ops", commands: [...], plugins: [completion()] });
//   // then:  ops completion >> ~/.bashrc     (or: eval "$(ops completion)")
//
// Registers a `completion` command that emits a bash/zsh/fish script generated
// from the command catalogue: it completes command names at the first position
// and each command's option flags after. The shell is taken from the argument
// or detected from $SHELL.

import { Command, type CliPlugin, type OptionSpec, type PluginHost } from "@youneed/cli";

/** Supported shells. */
export type Shell = "bash" | "zsh" | "fish";

/** A flattened view of the catalogue used to generate completions. */
export interface CompletionSpec {
  name: string;
  options: string[];
  commands: { name: string; description: string; options: string[] }[];
}

function flagsOf(options: readonly OptionSpec[]): string[] {
  const out: string[] = [];
  for (const o of options) {
    if (o.long) out.push(`--${o.long}`);
    if (o.short) out.push(`-${o.short}`);
  }
  return out;
}

/** Build a {@link CompletionSpec} from a plugin host, excluding one command. */
export function buildSpec(host: PluginHost, exclude?: string): CompletionSpec {
  return {
    name: host.name,
    options: flagsOf(host.options),
    commands: host.commands
      .filter((c) => !c.hidden && c.name !== exclude)
      .map((c) => ({ name: c.name, description: c.description ?? "", options: flagsOf(c.options) })),
  };
}

const id = (name: string): string => name.replace(/[^a-zA-Z0-9_]/g, "_");
const clean = (s: string): string => s.replace(/[:'"\n]/g, " ").trim();

function bash(spec: CompletionSpec): string {
  const fn = `_${id(spec.name)}_complete`;
  const names = spec.commands.map((c) => c.name).join(" ");
  const cases = spec.commands
    .map((c) => `    ${c.name}) opts="$opts ${c.options.join(" ")}" ;;`)
    .join("\n");
  return `# ${spec.name} bash completion
${fn}() {
  local cur cmd opts
  cur="\${COMP_WORDS[COMP_CWORD]}"
  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${names}" -- "$cur") )
    return 0
  fi
  cmd="\${COMP_WORDS[1]}"
  opts="${spec.options.join(" ")}"
  case "$cmd" in
${cases}
  esac
  COMPREPLY=( $(compgen -W "$opts" -- "$cur") )
  return 0
}
complete -F ${fn} ${spec.name}`;
}

function zsh(spec: CompletionSpec): string {
  const fn = `_${id(spec.name)}`;
  const cmds = spec.commands.map((c) => `    '${c.name}:${clean(c.description)}'`).join("\n");
  const cases = spec.commands
    .map((c) => {
      const vals = c.options.map((o) => `'${o}'`).join(" ");
      return `    ${c.name}) _values 'option' ${vals} ;;`;
    })
    .join("\n");
  return `#compdef ${spec.name}
${fn}() {
  local -a commands
  commands=(
${cmds}
  )
  if (( CURRENT == 2 )); then
    _describe -t commands '${spec.name} command' commands
    return
  fi
  case "\${words[2]}" in
${cases}
  esac
}
compdef ${fn} ${spec.name}`;
}

function fishFlag(flag: string): string {
  return flag.startsWith("--") ? `-l ${flag.slice(2)}` : `-s ${flag.slice(1)}`;
}

function fish(spec: CompletionSpec): string {
  const lines = [`# ${spec.name} fish completion`, `complete -c ${spec.name} -f`];
  for (const c of spec.commands) {
    lines.push(
      `complete -c ${spec.name} -n "__fish_use_subcommand" -a "${c.name}" -d "${clean(c.description)}"`,
    );
    for (const o of c.options) {
      lines.push(`complete -c ${spec.name} -n "__fish_seen_subcommand_from ${c.name}" ${fishFlag(o)}`);
    }
  }
  return lines.join("\n");
}

/** Generate a completion script for `shell` from a {@link CompletionSpec}. */
export function generateCompletion(spec: CompletionSpec, shell: Shell): string {
  if (shell === "zsh") return zsh(spec);
  if (shell === "fish") return fish(spec);
  return bash(spec);
}

/** Best-effort shell detection from `$SHELL`. */
export function detectShell(): Shell {
  const sh = (typeof process !== "undefined" ? process.env.SHELL ?? "" : "").toLowerCase();
  if (sh.includes("zsh")) return "zsh";
  if (sh.includes("fish")) return "fish";
  return "bash";
}

/** Options for {@link completion}. */
export interface CompletionOptions {
  /** Name of the registered command. Default `completion`. */
  command?: string;
}

/**
 * Completion plugin. Registers a `completion [shell]` command that prints a
 * shell completion script generated from the catalogue.
 */
export function completion(options: CompletionOptions = {}): CliPlugin {
  const commandName = options.command ?? "completion";
  return {
    name: "completion",
    setup(host) {
      class Completion extends Command(`${commandName} [shell]`, {
        description: "Print a shell completion script (bash/zsh/fish)",
      }) {
        override execute(shell?: string): void {
          const target = (shell as Shell) || detectShell();
          // eslint-disable-next-line no-console
          console.log(generateCompletion(buildSpec(host, commandName), target));
        }
      }
      host.addCommand(Completion);
    },
  };
}
