// @youneed/cli — a Commander-style CLI framework built on the @youneed
// factory-class pattern. Define options and commands as classes, compose them
// into an Application, and get `this.options` and `execute(...)` typed straight
// from your flag and argument strings.
//
//   import { Application, Command, Option, defaultOptions } from "@youneed/cli";
//
//   class FirstOption extends Option("--first", {
//     short: "f",
//     description: "display just the first substring",
//   }) {}
//
//   class SplitCommand extends Command({
//     name: "split <string>",
//     description: "Split a string into substrings and display as an array",
//     options: [FirstOption, { name: "-s, --separator <char>", default: "," }, ...defaultOptions()],
//   }) {
//     execute(value: string) {
//       const limit = this.options.first ? 1 : undefined;
//       console.log(value.split(this.options.separator, limit));
//     }
//   }
//
//   Application({
//     name: "string-util",
//     description: "CLI to some JavaScript string utilities",
//     version: "0.0.8",
//     commands: [SplitCommand],
//     options: [...defaultOptions()],
//   });

export { Option, option } from "./option.ts";
// Re-exported for option `schema:` validation — `import { option, t } from "@youneed/cli"`.
export { t, type Infer } from "@youneed/schema";
// Resolved spec types — plugins (e.g. devtools) build catalogues from these.
export type { CommandSpec, OptionSpec, ArgSpec } from "./parse.ts";
export {
  Command,
  type CommandConfig,
  type CommandInstance,
  type CommandBaseClass,
} from "./command.ts";
export {
  contribute,
  type CliMiddleware,
  type MiddlewareContext,
  type MiddlewareContributions,
} from "./middleware.ts";
export {
  specOf,
  type CliPlugin,
  type PluginHost,
  type CommandRunInfo,
  type CommandClassRef,
} from "./plugin.ts";
export {
  task,
  type Task,
  type TaskOptions,
  type TaskRun,
  type TaskState,
  type ReactiveHost,
} from "./task.ts";
export { createScheduler, type Scheduler, type SchedulerHost } from "./scheduler.ts";
export {
  nodeTerminal,
  scriptedTerminal,
  decodeKeys,
  key,
  type Key,
  type Terminal,
} from "./terminal.ts";
export {
  text,
  table,
  isTemplate,
  renderTemplate,
  renderMarked,
  parseHoles,
  stripHoleMarkers,
  HOLE_START,
  HOLE_END,
  type CliTemplateResult,
  type Hole,
  type TableOptions,
  type Align,
} from "./template.ts";
export { LiveRenderer } from "./live.ts";
export {
  box,
  stepper,
  select,
  input,
  alert,
  spinner,
  visibleWidth,
  SPINNER_FRAMES,
  type BoxOptions,
  type StepperOptions,
  type SelectState,
  type InputState,
  type SpinnerState,
  type ChoiceItem,
  type ItemState,
  type ItemFormatter,
} from "./elements.ts";
export {
  flow,
  when,
  If,
  Switch,
  For,
  While,
  map,
  Await,
  isAwaitResult,
  type AwaitHandlers,
  type AwaitResult,
} from "./flow.ts";
export {
  Application,
  type ApplicationConfig,
  type App,
  type UnknownCommandInfo,
  type ShutdownConfig,
} from "./application.ts";

export type {
  MaybePromise,
  OptionConfig,
  OptionEntry,
  InlineOption,
  OptionsShape,
  PositionalArgs,
  Renderable,
  ValueConstructor,
  CoercibleSchema,
  StandardSchemaV1,
} from "./types.ts";

/**
 * The conventional built-in options: `-h, --help` and `-V, --version`. Spread
 * into a command's or the application's `options` to opt into automatic help
 * and version handling.
 *
 * ```ts
 * options: [...defaultOptions()]
 * ```
 */
export function defaultOptions() {
  return [
    { name: "-h, --help", description: "display help for command" },
    { name: "-V, --version", description: "output the version number" },
  ] as const;
}
