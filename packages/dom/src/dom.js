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
export { createScheduler, createFpsScheduler, syncScheduler, rafScheduler, setDefaultScheduler, } from "@youneed/dom-scheduler";
export { html, css, repeat, classMap, styleMap, when, map, If, Switch, For, While, Await, flow, ref, createRef, portal, } from "./template.js";
export { signal, computed, effect, batch } from "./signals.js";
export { task } from "./task.js";
export { getExposedEvents, define, flushPendingDefines } from "./decorators.js";
export { Component, Mount, hydrate, getHydrationProps, flushSync, setErrorHandler, } from "./component.js";
