// dom.ts — public API barrel for @youneed/dom.
//
// A small reactive component framework on native Custom Elements + Shadow DOM —
// a blend of Angular (decorators, tasks, signals), Lit (html`` templates, scoped
// styles, fine-grained updates) and the platform.
//
// The implementation is split across focused modules; this file re-exports the
// curated public surface (unchanged), so `@youneed/dom` consumers and the test
// suite keep importing from one place:
//   • template.ts   — html``/css`` templates, directives, parts, scoped styles
//   • signals.ts    — fine-grained reactive values (signal/computed/effect/batch)
//   • task.ts       — cancellable async tasks
//   • decorators.ts — @Component.* decorators, registries, element registration
//   • component.ts  — the Reactive base class, Component() factory, Mount

// The render scheduler lives in its own DOM/Node-agnostic package; re-exported
// here so the public API is unchanged.
export {
  createScheduler,
  createFpsScheduler,
  syncScheduler,
  rafScheduler,
  setDefaultScheduler,
} from "@youneed/dom-scheduler";
export type { Priority, Scheduler, SchedulerHost } from "@youneed/dom-scheduler";

export {
  html,
  css,
  repeat,
  classMap,
  styleMap,
  when,
  map,
  If,
  Switch,
  For,
  While,
  Await,
  flow,
  ref,
  createRef,
  portal,
} from "./template.ts";
export type {
  TemplateResult,
  RepeatResult,
  Ref,
  RefDirective,
  PortalResult,
  AwaitResult,
  AwaitHandlers,
  StyleInput,
  LazyStyle,
  Part,
} from "./template.ts";

export { signal, computed, effect, batch } from "./signals.ts";
export type { Signal, ReadonlySignal, SignalOptions } from "./signals.ts";

export { task } from "./task.ts";
export type { Task, TaskOptions, TaskRun } from "./task.ts";

export { getExposedEvents, define, flushPendingDefines } from "./decorators.ts";
export type { EventEmitter, EventOptions } from "./decorators.ts";

export {
  Component,
  Mount,
  hydrate,
  getHydrationProps,
  flushSync,
  setErrorHandler,
} from "./component.ts";
export type {
  ReactiveHost,
  DevtoolsEvent,
  DevtoolsHook,
  ListenerInfo,
  StyleRule,
  ComponentConstructor,
  ComponentOptions,
  DefineWhen,
  OnMount,
  OnUpdate,
  OnUnmount,
  OnError,
  MountHandle,
  PropsOf,
  ErrorPhase,
  ErrorInfo,
  ComponentProvider,
} from "./component.ts";
