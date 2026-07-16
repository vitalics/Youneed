// @youneed/cli — the `Command()` factory.
//
// Same shape as Option(): a config object in, a base class out. The command's
// resolved spec (name, positional args, options, middleware) is computed once at
// definition time and stored on a Symbol-keyed static; the runner reads it back.
// The cast return type is where the magic lives — it gives the subclass a
// `this.options` typed from the `options` tuple, an `execute(...)` whose
// parameters are the positional arguments declared in `name`, and the typed
// members contributed by each middleware (`this.logger`, `this.color`, …).

import { parseCommandName, resolveEntries, SPEC, type CommandSpec } from "./parse.ts";
import type { ReactiveHost, TaskState } from "./task.ts";
import { createScheduler, type Scheduler } from "./scheduler.ts";
import type { CliMiddleware, MiddlewareContributions } from "./middleware.ts";
import type {
  MaybePromise,
  OptionEntry,
  OptionsShape,
  PositionalArgs,
  Renderable,
} from "./types.ts";

/** Configuration accepted by {@link Command}. */
export interface CommandConfig<
  TName extends string,
  TOptions extends readonly OptionEntry[],
  TMiddleware extends readonly CliMiddleware[],
> {
  /** Command grammar: a word plus positional args, e.g. `split <string>`. */
  name: TName;
  /** One-line description shown in help. */
  description?: string;
  /** Alternative names that also invoke this command. */
  aliases?: string[];
  /** Options accepted by the command — `Option()` classes and/or inline specs. */
  options?: TOptions;
  /** Middleware that augment `this` (e.g. `[logger(), color(), env(schema)]`). */
  middleware?: TMiddleware;
  /** Hide the command from the help listing. */
  hidden?: boolean;
}

/** The instance surface a `Command()` subclass is typed against. */
export type CommandInstance<
  TName extends string,
  TOptions extends readonly OptionEntry[],
  TMiddleware extends readonly CliMiddleware[],
> = {
  /** Parsed options, typed from the `options` array. Populated before `execute`. */
  readonly options: OptionsShape<TOptions>;
  /** Raw positional arguments, in order. */
  readonly args: string[];
  /**
   * Imperative entry point: run the command, writing output yourself.
   * Parameters are the positionals declared in `name`.
   */
  execute?(...args: PositionalArgs<TName>): MaybePromise<unknown>;
  /**
   * Declarative entry point (preferred): return what to draw to stdout —
   * a string, an array, or an (async) iterable of lines. The runner writes it.
   * The CLI counterpart of a dom/ssr `render`. Used when present; otherwise
   * `execute` runs.
   */
  render?(...args: PositionalArgs<TName>): MaybePromise<Renderable>;
  /**
   * Ask the runtime to repaint — called automatically by `task` on state
   * changes; call it yourself after mutating render-relevant state.
   */
  requestUpdate(): void;
  /**
   * Aborts on graceful shutdown (SIGINT/SIGTERM). Pass to `fetch`/long work, or
   * `await`-resolve a long-running command when it fires.
   */
  readonly abortSignal: AbortSignal;
  /**
   * Per-command scheduler — register independent ticks for animated elements
   * (`this.scheduler.frame(...)`, `this.scheduler.every(...)`). Disposed when
   * the command ends.
   */
  readonly scheduler: Scheduler;
  /** Dispose resources after the command settles (sync). */
  [Symbol.dispose]?(): void;
  /** Dispose resources after the command settles (async; preferred if present). */
  [Symbol.asyncDispose]?(): MaybePromise<void>;
} & MiddlewareContributions<TMiddleware>;

/** The base class returned by {@link Command}. */
export type CommandBaseClass<
  TName extends string,
  TOptions extends readonly OptionEntry[],
  TMiddleware extends readonly CliMiddleware[],
> = {
  readonly [SPEC]: CommandSpec;
} & (abstract new () => CommandInstance<TName, TOptions, TMiddleware>);

/** Internal symbol for the runtime's repaint hook (set by the runner). */
export const NOTIFY: unique symbol = Symbol.for("@youneed/cli.notify");
/** Internal symbol for a command's live task set. */
export const TASKS: unique symbol = Symbol.for("@youneed/cli.tasks");
/** Internal symbol for the run's shutdown signal (set by the runner). */
export const ABORT: unique symbol = Symbol.for("@youneed/cli.abort");

/** A signal that never aborts — the default before a run wires shutdown in. */
const NEVER_ABORT: AbortSignal = new AbortController().signal;

/**
 * Internal base every command extends — holds the mutable runtime slots and the
 * {@link ReactiveHost} wiring `task()` relies on.
 */
abstract class CommandRoot implements ReactiveHost {
  options: Record<string, unknown> = {};
  args: string[] = [];
  /** @internal repaint hook installed by the runner during live rendering. */
  [NOTIFY]?: () => void;
  /** @internal tasks created with `task(this, …)`, awaited before the run ends. */
  readonly [TASKS] = new Set<TaskState>();
  /** Per-command scheduler; disposed by the runner on teardown. */
  readonly scheduler: Scheduler = createScheduler(this);
  /** @internal the run's shutdown signal, installed by the runner. */
  [ABORT]?: AbortSignal;

  /** Aborts on SIGINT/SIGTERM (graceful shutdown). Pass it to fetch/long work. */
  get abortSignal(): AbortSignal {
    return this[ABORT] ?? NEVER_ABORT;
  }

  requestUpdate(): void {
    this[NOTIFY]?.();
  }

  registerTask(task: TaskState): void {
    this[TASKS].add(task);
  }
}

/**
 * Define a command.
 *
 * ```ts
 * class SplitCommand extends Command({
 *   name: "split <string>",
 *   description: "Split a string into substrings",
 *   options: [FirstOption, { name: "-s, --separator <char>", default: "," }],
 *   middleware: [logger(), color()],
 * }) {
 *   execute(value: string) {
 *     const limit = this.options.first ? 1 : undefined;
 *     this.logger.info(this.color.green(value.split(this.options.separator, limit).join(" ")));
 *   }
 * }
 * ```
 */
export function Command<
  const TName extends string,
  const TOptions extends readonly OptionEntry[] = readonly [],
  const TMiddleware extends readonly CliMiddleware[] = readonly [],
>(
  name: TName,
  config?: Omit<CommandConfig<TName, TOptions, TMiddleware>, "name">,
): CommandBaseClass<TName, TOptions, TMiddleware>;
export function Command<
  const TName extends string,
  const TOptions extends readonly OptionEntry[] = readonly [],
  const TMiddleware extends readonly CliMiddleware[] = readonly [],
>(config: CommandConfig<TName, TOptions, TMiddleware>): CommandBaseClass<TName, TOptions, TMiddleware>;
export function Command(
  nameOrConfig: string | CommandConfig<string, readonly OptionEntry[], readonly CliMiddleware[]>,
  maybeConfig?: Omit<CommandConfig<string, readonly OptionEntry[], readonly CliMiddleware[]>, "name">,
): CommandBaseClass<string, readonly OptionEntry[], readonly CliMiddleware[]> {
  const config: CommandConfig<string, readonly OptionEntry[], readonly CliMiddleware[]> =
    typeof nameOrConfig === "string" ? { ...maybeConfig, name: nameOrConfig } : nameOrConfig;
  const { word, args } = parseCommandName(config.name);
  const spec: CommandSpec = {
    name: word,
    raw: config.name,
    description: config.description,
    aliases: config.aliases ?? [],
    hidden: config.hidden ?? false,
    args,
    options: resolveEntries(config.options ?? []),
    middleware: [...(config.middleware ?? [])],
  };

  abstract class CommandImpl extends CommandRoot {
    static readonly [SPEC]: CommandSpec = spec;
  }
  return CommandImpl as unknown as CommandBaseClass<
    string,
    readonly OptionEntry[],
    readonly CliMiddleware[]
  >;
}
