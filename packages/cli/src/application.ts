// @youneed/cli — the `Application()` entry point: wires commands together,
// parses argv, dispatches to a command, and handles help/version. Like
// Commander's `program`, calling Application() with argv present runs straight
// away; for tests, pass `autoRun: false` and call `app.run(argv)` yourself with
// injected `stdout`/`stderr`/`exit`.

import {
  nearestCommand,
  parseArgs,
  resolveEntries,
  SPEC,
  type CommandSpec,
  type OptionSpec,
} from "./parse.ts";
import { renderCommandHelp, renderProgramHelp, type ProgramInfo } from "./help.ts";
import { ABORT, NOTIFY, TASKS } from "./command.ts";
import { withHost } from "./context.ts";
import { LiveRenderer } from "./live.ts";
import type { ReactiveHost } from "./task.ts";
import type { CliPlugin, CommandRunInfo, PluginHost } from "./plugin.ts";
import { isTemplate, renderTemplate, type CliTemplateResult } from "./template.ts";
import type { OptionEntry, Renderable } from "./types.ts";

/**
 * Write a {@link Renderable} to `out`, one chunk per line. A `string` is written
 * as-is (checked first — a string is itself an iterable of characters); a
 * template is rendered to its final text; arrays and sync/async iterables
 * stream chunk by chunk.
 */
async function writeRenderable(value: Renderable, out: (line: string) => void): Promise<void> {
  if (value == null) return;
  if (typeof value === "string") {
    out(value);
  } else if (isTemplate(value)) {
    out(renderTemplate(value));
  } else if (Array.isArray(value)) {
    for (const line of value) out(line);
  } else if (typeof (value as AsyncIterable<string>)[Symbol.asyncIterator] === "function") {
    for await (const line of value as AsyncIterable<string>) out(line);
  } else if (typeof (value as Iterable<string>)[Symbol.iterator] === "function") {
    for (const line of value as Iterable<string>) out(line);
  }
}

/** A command instance as the runner sees it (loosely typed). */
interface CommandRunnerView {
  options: Record<string, unknown>;
  args: string[];
  execute?: (...args: string[]) => unknown;
  render?: (...args: string[]) => Renderable | Promise<Renderable>;
  [Symbol.dispose]?: () => void;
  [Symbol.asyncDispose]?: () => unknown;
  [NOTIFY]?: () => void;
  [TASKS]: Set<{ readonly pending: boolean; abort?(): void }>;
  [ABORT]?: AbortSignal;
  scheduler?: { dispose(): void };
}

/** Graceful-shutdown configuration. */
export interface ShutdownConfig {
  /** Signals that trigger graceful shutdown. Default `["SIGINT", "SIGTERM"]`. */
  signals?: NodeJS.Signals[];
  /** Force-exit if teardown doesn't finish within this many ms. Default 10000. */
  timeoutMs?: number;
  /** Called once when a shutdown signal first arrives. */
  onShutdown?: (signal: NodeJS.Signals) => void;
}

/** Exit codes for the supported shutdown signals (128 + signal number). */
const SIGNAL_EXIT: Record<string, number> = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 };

/**
 * A command class as produced by `Command()`. Kept loose (its public instance
 * type omits the internal reactive slots); the runner casts to
 * {@link CommandRunnerView} after construction.
 */
type CommandCtor = (new () => object) & { [SPEC]: CommandSpec };

/** Turn a disposable into a teardown thunk, or `undefined` if it isn't one. */
function disposerOf(
  resource: Disposable | AsyncDisposable | undefined,
): (() => unknown) | undefined {
  if (!resource) return undefined;
  const async = (resource as AsyncDisposable)[Symbol.asyncDispose];
  if (typeof async === "function") return () => async.call(resource);
  const sync = (resource as Disposable)[Symbol.dispose];
  if (typeof sync === "function") return () => sync.call(resource);
  return undefined;
}

/** What a {@link ApplicationConfig.unknownCommandHandler} receives. */
export interface UnknownCommandInfo {
  /** The unrecognized command name the user typed. */
  name: string;
  /** The closest real command name, if one is close enough. */
  suggestion?: string;
  /** Every known command name and alias. */
  commands: string[];
}

/** Configuration for {@link Application}. */
export interface ApplicationConfig {
  /** Program name shown in usage. */
  name: string;
  /** One-line program description. */
  description?: string;
  /** Version string printed by `--version`. */
  version?: string;
  /** The commands this CLI exposes. */
  commands?: readonly CommandCtor[];
  /** Global options available to every command (e.g. `...defaultOptions()`). */
  options?: readonly OptionEntry[];
  /** Application plugins (e.g. `[devtools()]`) — catalogue access + lifecycle. */
  plugins?: readonly CliPlugin[];
  /**
   * Graceful shutdown on SIGINT/SIGTERM while a command runs: aborts
   * `this.abortSignal`, stops the live region, runs teardown, then exits with
   * the signal's conventional code. `false` disables it. (SIGKILL can't be
   * caught — the OS reclaims resources.)
   */
  shutdown?: false | ShutdownConfig;
  /**
   * Override the message shown for an unrecognized command. Return a string to
   * print it to stderr, or handle output yourself and return nothing. The
   * default suggests the nearest matching command name. The exit code is 1
   * regardless.
   */
  unknownCommandHandler?: (info: UnknownCommandInfo) => string | void;

  /** Run immediately using `argv` / `process.argv`. Default `true`. */
  autoRun?: boolean;
  /** Arguments to parse. Defaults to `process.argv.slice(2)`. */
  argv?: string[];
  /** Sink for normal output. Defaults to `console.log`. */
  stdout?: (line: string) => void;
  /** Sink for errors. Defaults to `console.error`. */
  stderr?: (line: string) => void;
  /**
   * Raw, un-newlined sink for the live renderer (cursor-control sequences).
   * Defaults to `process.stdout.write`.
   */
  write?: (chunk: string) => void;
  /**
   * Whether output is an interactive terminal. When true, a template `render`
   * with pending tasks repaints in place via cursor control; when false, the
   * final snapshot is written once. Defaults to the `YOUNEED_CLI_TTY` env var
   * (`"1"`/`"0"`) if set, else `process.stdout.isTTY` — so a CLI driven over a
   * pipe (e.g. the devtools terminal) can still opt into live repainting.
   */
  tty?: boolean;
  /** Called with the resulting exit code. Defaults to setting `process.exitCode`. */
  exit?: (code: number) => void;
}

/** A runnable CLI program. */
export interface App {
  /** Parse `argv` (default the configured one), dispatch, and return an exit code. */
  run(argv?: string[]): Promise<number>;
  /** Render help text for the program, or for one command by name. */
  helpText(commandName?: string): string;
}

const isHelp = (t: string): boolean => t === "-h" || t === "--help";
const isVersion = (t: string): boolean => t === "-V" || t === "--version";

/** Find an option spec matching a `--long`/`-s` token, for global pre-scanning. */
function matchGlobal(specs: OptionSpec[], token: string): OptionSpec | undefined {
  if (token.startsWith("--")) {
    const body = token.slice(2).split("=")[0]!;
    return specs.find((s) => s.long === body);
  }
  if (token.startsWith("-")) return specs.find((s) => s.short === token[1]);
  return undefined;
}

/**
 * Build a CLI program. With `autoRun` (the default) and argv available, it runs
 * once on creation.
 *
 * ```ts
 * Application({
 *   name: "string-util",
 *   version: "0.0.8",
 *   commands: [SplitCommand],
 *   options: [...defaultOptions()],
 * });
 * ```
 */
export function Application(config: ApplicationConfig): App {
  const stdout = config.stdout ?? ((l: string) => console.log(l));
  const stderr = config.stderr ?? ((l: string) => console.error(l));
  const rawWrite =
    config.write ?? ((c: string) => void (typeof process !== "undefined" && process.stdout?.write(c)));
  const envTty = typeof process !== "undefined" ? process.env.YOUNEED_CLI_TTY : undefined;
  const isTty = config.tty ?? (envTty === "1" ? true : envTty === "0" ? false : Boolean(typeof process !== "undefined" && process.stdout?.isTTY));
  const exit = config.exit ?? ((c: number) => void (process.exitCode = c));

  const commands = (config.commands ?? []).map((ctor) => ({ ctor, spec: ctor[SPEC] }));
  const globals = resolveEntries(config.options ?? []);
  const plugins = config.plugins ?? [];

  // Build the plugin host and run each plugin's setup (may register commands).
  const pluginHost: PluginHost = {
    name: config.name,
    version: config.version,
    description: config.description,
    get commands() {
      return commands.map((c) => c.spec);
    },
    get options() {
      return globals;
    },
    addCommand(command) {
      commands.push({ ctor: command as unknown as CommandCtor, spec: command[SPEC] });
    },
  };
  for (const plugin of plugins) plugin.setup?.(pluginHost);

  const info = (): ProgramInfo => ({
    name: config.name,
    description: config.description,
    version: config.version,
    commands: commands.map((c) => c.spec),
    globalOptions: globals,
  });

  const findCommand = (name: string) =>
    commands.find((c) => c.spec.name === name || c.spec.aliases.includes(name));

  const helpText = (commandName?: string): string => {
    if (commandName) {
      const cmd = findCommand(commandName);
      if (cmd) return renderCommandHelp(info(), cmd.spec);
    }
    return renderProgramHelp(info());
  };

  const run = async (argv: string[] = config.argv ?? process.argv.slice(2)): Promise<number> => {
    // Phase A: skip leading global options to locate the command word.
    let i = 0;
    let commandName: string | undefined;
    while (i < argv.length) {
      const token = argv[i]!;
      if (token.startsWith("-")) {
        const spec = matchGlobal(globals, token);
        if (spec?.takesValue && !token.includes("=")) i++;
        i++;
      } else {
        commandName = token;
        break;
      }
    }
    const globalTokens = argv.slice(0, commandName === undefined ? argv.length : i);
    const wantHelp = globalTokens.some(isHelp);
    const wantVersion = globalTokens.some(isVersion);

    // The built-in `help [command]` command — unless a plugin registered its own
    // `help` command (e.g. cli-plugin-help), which then takes over.
    if (commandName === "help" && !findCommand("help")) {
      stdout(helpText(argv[i + 1]));
      return 0;
    }

    if (commandName === undefined) {
      if (wantVersion && config.version !== undefined) {
        stdout(config.version);
        return 0;
      }
      stdout(renderProgramHelp(info()));
      return wantHelp ? 0 : 1;
    }

    const cmd = findCommand(commandName);
    if (!cmd) {
      if (wantVersion && config.version !== undefined) {
        stdout(config.version);
        return 0;
      }
      if (wantHelp) {
        stdout(renderProgramHelp(info()));
        return 0;
      }
      const names = commands.flatMap((c) => [c.spec.name, ...c.spec.aliases]);
      const suggestion = nearestCommand(commandName, names);
      if (config.unknownCommandHandler) {
        const message = config.unknownCommandHandler({ name: commandName, suggestion, commands: names });
        if (typeof message === "string") stderr(message);
      } else {
        stderr(
          suggestion
            ? `error: unknown command '${commandName}', maybe you want '${suggestion}'?`
            : `error: unknown command '${commandName}'`,
        );
        stderr(`(run '${config.name} --help' for a list of commands)`);
      }
      return 1;
    }

    const rest = argv.slice(i + 1);
    if (rest.some(isHelp)) {
      stdout(renderCommandHelp(info(), cmd.spec));
      return 0;
    }

    const specs = [...cmd.spec.options, ...globals];
    const result = parseArgs(specs, rest);

    if (result.options.help === true) {
      stdout(renderCommandHelp(info(), cmd.spec));
      return 0;
    }
    if (result.options.version === true && config.version !== undefined) {
      stdout(config.version);
      return 0;
    }
    if (result.errors.length) {
      for (const e of result.errors) stderr(`error: ${e}`);
      stderr(`(run '${config.name} ${cmd.spec.name} --help' for usage)`);
      return 1;
    }

    // Validate the positional arity declared in the command name.
    const required = cmd.spec.args.filter((a) => a.required && !a.variadic).length;
    if (result.positionals.length < required) {
      const missing = cmd.spec.args[result.positionals.length];
      stderr(`error: missing required argument '${missing?.name ?? ""}'`);
      stderr(`(run '${config.name} ${cmd.spec.name} --help' for usage)`);
      return 1;
    }

    const instance = new cmd.ctor() as CommandRunnerView;
    instance.options = result.options;
    instance.args = result.positionals;

    // Teardown stack, run LIFO once the command settles: contributed resources,
    // middleware cleanups, and the command's own disposal — all via the
    // Symbol.dispose / Symbol.asyncDispose protocol where present.
    const teardownStack: Array<() => unknown> = [];
    const teardown = async (): Promise<void> => {
      for (const fn of teardownStack.reverse()) await fn();
    };
    // Always stop the command's scheduler timers when the run settles.
    teardownStack.push(() => instance.scheduler?.dispose());

    // Graceful shutdown: on SIGINT/SIGTERM, abort the run (and its tasks), let
    // the dispatch unwind, run teardown, and exit with the signal's code. A
    // second signal — or a teardown that overruns the deadline — force-exits.
    const shutdown = new AbortController();
    instance[ABORT] = shutdown.signal;
    let signalCode = 0;
    if (config.shutdown !== false) {
      const cfg = config.shutdown ?? {};
      const signals = cfg.signals ?? (["SIGINT", "SIGTERM"] as NodeJS.Signals[]);
      let forceTimer: ReturnType<typeof setTimeout> | undefined;
      const onSignal = (signal: NodeJS.Signals): void => {
        if (shutdown.signal.aborted) {
          process.exit(signalCode); // impatient: a second signal hard-exits
        }
        signalCode = SIGNAL_EXIT[signal] ?? 1;
        cfg.onShutdown?.(signal);
        for (const t of instance[TASKS]) t.abort?.();
        shutdown.abort();
        forceTimer = setTimeout(() => process.exit(signalCode), cfg.timeoutMs ?? 10_000);
        forceTimer.unref?.();
      };
      if (typeof process !== "undefined") {
        // Bind the signal name at registration — robust even when a signal is
        // emitted programmatically without the name argument.
        const bound = signals.map((s) => [s, () => onSignal(s)] as const);
        for (const [s, handler] of bound) process.on(s, handler);
        teardownStack.push(() => {
          if (forceTimer) clearTimeout(forceTimer);
          for (const [s, handler] of bound) process.off(s, handler);
        });
      }
    }

    // Install middleware (after options are parsed, before render/execute) —
    // each can augment `this` and register teardown.
    try {
      for (const mw of cmd.spec.middleware) {
        const returned = mw.install({
          command: instance,
          options: result.options,
          args: result.positionals,
          program: { name: config.name, version: config.version },
          onCleanup: (fn) => teardownStack.push(fn),
          use: (resource) => {
            const disposer = disposerOf(resource);
            if (disposer) teardownStack.push(disposer);
            return resource;
          },
        });
        const disposer = disposerOf(returned ?? undefined);
        if (disposer) teardownStack.push(disposer);
      }
    } catch (err) {
      stderr(`error: ${err instanceof Error ? err.message : String(err)}`);
      await teardown();
      return 1;
    }

    // The command instance itself is disposed last-registered → first-run.
    const instanceDisposer = disposerOf(instance as Disposable & AsyncDisposable);
    if (instanceDisposer) teardownStack.push(instanceDisposer);

    // Dispatch: prefer the declarative `render`, fall back to imperative
    // `execute`, and show help if neither is implemented.
    const handler =
      typeof instance.render === "function"
        ? "render"
        : typeof instance.execute === "function"
          ? "execute"
          : "none";
    if (handler === "none") {
      stdout(renderCommandHelp(info(), cmd.spec));
      await teardown();
      return 0;
    }
    // Render under the host context so `flow.await` can track promises.
    const callRender = (args: string[]): Renderable | Promise<Renderable> =>
      withHost(instance as unknown as ReactiveHost, () => instance.render!(...args));

    // Plugin lifecycle: notify before/after the command runs.
    const runInfo: CommandRunInfo = {
      command: cmd.spec,
      args: result.positionals,
      options: result.options,
    };
    for (const plugin of plugins) await plugin.beforeCommand?.(runInfo);

    let code = 0;
    try {
      if (handler === "render") {
        const first = await callRender(result.positionals);
        if (isTemplate(first)) {
          await renderLive(instance, result.positionals, shutdown.signal);
        } else {
          await writeRenderable(first, stdout);
        }
      } else {
        await instance.execute!(...result.positionals);
      }
    } catch (err) {
      // Let plugins format the error; fall back to the default line.
      let handled = false;
      for (const plugin of plugins) {
        const formatted = await plugin.onError?.(err, runInfo);
        if (typeof formatted === "string") {
          stderr(formatted);
          handled = true;
        }
      }
      if (!handled) stderr(`error: ${err instanceof Error ? err.message : String(err)}`);
      code = 1;
    } finally {
      await teardown();
    }
    // A shutdown signal overrides the command's own exit code.
    const finalCode = signalCode || code;
    for (const plugin of plugins) await plugin.afterCommand?.(runInfo, finalCode);
    return finalCode;
  };

  /**
   * Drive a template `render` as a live region: wait for the command's tasks to
   * settle, repainting on every `requestUpdate`. On a TTY each repaint patches
   * changed lines in place via cursor control; otherwise only the final
   * snapshot is written, line by line.
   *
   * `render` is re-invoked (and re-stringified) to get a fresh snapshot, so it
   * must be a synchronous, pure function of state — create tasks as fields, and
   * pass `flow.await` a stable promise. Stringifying under the host context is
   * what lets `flow.await` register its promise and keep the run alive.
   */
  const renderLive = async (
    instance: CommandRunnerView,
    args: string[],
    signal: AbortSignal,
  ): Promise<void> => {
    const tasks = instance[TASKS];
    const allSettled = (): boolean => ![...tasks].some((t) => t.pending);
    const done = (): boolean => allSettled() || signal.aborted;
    // Re-render AND stringify under the host context: this is where tasks are
    // read and `flow.await` subscribes, so it must precede the settled-check.
    const draw = (): string =>
      withHost(instance as unknown as ReactiveHost, () =>
        renderTemplate(instance.render!(...args) as CliTemplateResult),
      );

    if (isTty) {
      const live = new LiveRenderer(rawWrite);
      live.draw(draw());
      let scheduled = false;
      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve(), { once: true });
        instance[NOTIFY] = () => {
          if (scheduled) return;
          scheduled = true;
          queueMicrotask(() => {
            scheduled = false;
            live.draw(draw());
            if (done()) resolve();
          });
        };
        if (done()) resolve();
      });
    } else {
      draw(); // evaluate once so tasks/awaits register before we wait
      if (!done()) {
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true });
          instance[NOTIFY] = () => {
            if (done()) resolve();
          };
        });
      }
      for (const line of draw().split("\n")) stdout(line);
    }
    instance[NOTIFY] = undefined;
  };

  const app: App = { run, helpText };

  if (config.autoRun !== false) {
    void run().then((code) => exit(code));
  }
  return app;
}
