// core.ts — the devtools capture layer + shared plugin contract.
//
// Responsibilities:
//   • install the global hook and record per-component state (the `store`);
//   • expose a small read API (components/inspect/subscribe/…);
//   • define the `DevtoolsPanel` plugin contract + the `DevtoolsContext` the
//     shell hands every plugin (store access, on-page highlight, schedulers).
//
// The interactive panel (panel.ts) and the built-in plugins (component-tree.ts,
// page-devtools.ts) are assembled on top of this — nothing here knows about them.

import type {
  ComponentConstructor,
  DevtoolsEvent,
  DevtoolsHook,
  ListenerInfo,
  Scheduler,
  StyleRule,
} from "@youneed/dom";
import { createFpsScheduler, createScheduler, define, rafScheduler, syncScheduler } from "@youneed/dom";

export type { ComponentConstructor, ListenerInfo, Scheduler, StyleRule };

// ── schedulers offered in the live-swap dropdown ────────────────────────────────
// Seeded with the built-ins; grown at runtime from whatever schedulers the app's
// components actually use (e.g. fps(60) appears once such a component mounts).
const schedulerRegistry = new Map<string, Scheduler>();
for (const s of [createScheduler(), syncScheduler, rafScheduler]) {
  if (s.name) schedulerRegistry.set(s.name, s);
}

/** A FRESH, independent scheduler of the same kind as `s`, so swapping one
 *  component doesn't make it share (and sync to) another's frame loop. */
function freshLike(s: Scheduler): Scheduler {
  const name = s.name ?? "";
  const fps = /^fps\((\d+)\)$/.exec(name);
  if (fps) return createFpsScheduler(Number(fps[1]));
  if (name === "raf") return createFpsScheduler();
  if (name === "microtask") return createScheduler();
  return s; // "sync" (stateless) or a custom scheduler — reuse it
}

/** Dropdown choices for the live scheduler swap: revert + every known scheduler. */
export function schedulerChoices(): Array<{ label: string; make: () => Scheduler | undefined }> {
  return [
    { label: "default (revert)", make: () => undefined },
    ...[...schedulerRegistry.values()].map((s) => ({ label: s.name!, make: () => freshLike(s) })),
  ];
}

// ── records ──────────────────────────────────────────────────────────────────
export interface StateSnapshot {
  time: number;
  version?: number;
  props: Record<string, unknown>;
  /** Scoped style rules at this point in time — lets time-travel restore them. */
  styles?: StyleRule[];
}

export interface EmittedEvent {
  time: number;
  type: string;
  detail: unknown;
}

export interface ComponentRecord {
  id: number;
  tag: string;
  mountedAt: number;
  alive: boolean;
  /** Nearest ancestor component's id (undefined for roots). */
  parentId?: number;
  /** Live element reference, for on-page highlighting (may be GC'd). */
  elRef?: WeakRef<Element>;
  props: Record<string, unknown>;
  /** Past states (snapshots over time) — for time-travel inspection. */
  history: StateSnapshot[];
  events: EmittedEvent[];
  /** Event names the component declares via `@Component.event` (its public API). */
  exposed: string[];
  listeners: ListenerInfo[];
  scheduler?: string;
  priority?: string;
  styles: StyleRule[];
}

const store = new Map<number, ComponentRecord>();
const subscribers = new Set<() => void>();

function ensure(event: DevtoolsEvent): ComponentRecord {
  let record = store.get(event.id);
  if (!record) {
    record = {
      id: event.id,
      tag: event.tag,
      mountedAt: event.time,
      alive: true,
      props: {},
      history: [],
      events: [],
      exposed: [],
      listeners: [],
      styles: [],
    };
    store.set(event.id, record);
  }
  return record;
}

// True while a time-travel apply writes props back into a component: the
// resulting "update" must NOT append a new history entry.
let replaying = false;

/** Run `fn` with history-recording suppressed (used by time-travel apply). */
export function replay<T>(fn: () => T): T {
  replaying = true;
  try {
    return fn();
  } finally {
    replaying = false;
  }
}

function send(event: DevtoolsEvent): void {
  const record = ensure(event);
  switch (event.kind) {
    case "mount":
      record.alive = true;
      record.styles = event.styles ?? [];
      record.parentId = event.parentId;
      record.exposed = event.exposed ?? [];
      if (event.el) record.elRef = new WeakRef(event.el);
    // falls through to record props + push history
    case "update":
      record.props = event.props ?? {};
      if (event.listeners) record.listeners = event.listeners;
      if (event.styles) record.styles = event.styles;
      if (event.scheduler !== undefined) record.scheduler = event.scheduler;
      if (event.priority !== undefined) record.priority = event.priority;
      if (event.schedulerRef?.name) schedulerRegistry.set(event.schedulerRef.name, event.schedulerRef);
      if (!replaying) {
        record.history.push({
          time: event.time,
          version: event.version,
          props: record.props,
          styles: event.styles,
        });
      }
      break;
    case "unmount":
      record.alive = false;
      break;
    case "emit":
      if (event.emit) record.events.push({ time: event.time, ...event.emit });
      break;
  }
  for (const notify of subscribers) notify();
}

/**
 * A devtools PLUGIN — the capture/logic half of an extension, separate from a
 * {@link DevtoolsPanel} (the display half). Registered via
 * `installDevtools({ plugins: [...] })`; its `install()` wires up data collection
 * (e.g. subscribing to an event bus) and may return a teardown. A companion
 * panel renders whatever the plugin captured. Splitting the two means the display
 * is free — any panel (or none) can surface a plugin's data.
 */
export interface DevtoolsPlugin {
  /** Stable name (for diagnostics / de-duping). */
  name: string;
  /** Begin capturing; optionally return a teardown (run by {@link uninstallDevtools}). */
  install(): void | (() => void);
}

export interface InstallDevtoolsOptions {
  /** Capture plugins to register (e.g. `a11yPlugin()`). Their companion panels go
   *  to `mountDevtoolsPanel({ panels })`. */
  plugins?: DevtoolsPlugin[];
}

// Teardowns from installed plugins, run by uninstallDevtools().
const pluginTeardowns: Array<() => void> = [];

/** Start capturing (sets the global hook) and register any capture `plugins`.
 *  Call before the app mounts. Plugins are display-agnostic — pair them with
 *  panels in `mountDevtoolsPanel({ panels })`. */
export function installDevtools(options: InstallDevtoolsOptions = {}): void {
  (globalThis as { __DOM_DEVTOOLS__?: DevtoolsHook }).__DOM_DEVTOOLS__ = { send };
  for (const plugin of options.plugins ?? []) {
    const teardown = plugin.install();
    if (typeof teardown === "function") pluginTeardowns.push(teardown);
  }
}

/** Tear down every installed plugin and detach the capture hook. */
export function uninstallDevtools(): void {
  for (const teardown of pluginTeardowns.splice(0)) teardown();
  delete (globalThis as { __DOM_DEVTOOLS__?: DevtoolsHook }).__DOM_DEVTOOLS__;
}

export function subscribe(listener: () => void): () => void {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

export function components(): ComponentRecord[] {
  return [...store.values()];
}

export function inspect(id: number): ComponentRecord | undefined {
  return store.get(id);
}

export function clearDevtools(): void {
  store.clear();
}

/** Dump a readable summary to the console. */
export function dump(): void {
  for (const r of store.values()) {
    console.log(
      `#${r.id} <${r.tag}>${r.alive ? "" : " (unmounted)"} ` +
        `props=${JSON.stringify(r.props)} ` +
        `history=${r.history.length} events=${r.events.length} styles=${r.styles.length}`,
    );
    for (const e of r.events) console.log(`    ↑ ${e.type}: ${JSON.stringify(e.detail)}`);
  }
}

// ============================================================
// Plugin contract
// ============================================================

/**
 * The services the panel shell hands every plugin: read the recorded store,
 * subscribe to changes, highlight an element on the page, and list schedulers
 * for the live-swap UI. Plugins never reach into shell internals beyond this.
 */
export interface DevtoolsContext {
  components(): ComponentRecord[];
  inspect(id: number): ComponentRecord | undefined;
  /** Subscribe to store changes (mount/update/unmount/emit). */
  subscribe(listener: () => void): () => void;
  /** Outline an element on the page (or clear it with `undefined`). */
  highlight(rec: ComponentRecord | undefined): void;
  /** Choices for the live scheduler-swap dropdown. */
  schedulerChoices(): Array<{ label: string; make: () => Scheduler | undefined }>;
  // ── shared selection (so the tree, time-travel and styles plugins agree) ──
  /** The currently selected component id (or null). */
  selected(): number | null;
  /** Select a component (broadcasts to every plugin via onSelect). */
  select(id: number | null): void;
  /** Subscribe to selection changes. Returns an unsubscribe function. */
  onSelect(listener: () => void): () => void;
  /** Run `fn` with history recording suppressed (for time-travel writes). */
  replay<T>(fn: () => T): T;
  /** The selected record, or undefined — convenience over `inspect(selected())`. */
  current(): ComponentRecord | undefined;
  // ── per-plugin settings (toggles/selects shown in the shell's Settings view) ──
  /**
   * Read the current value of one of THIS plugin's declared settings —
   * `boolean` for a toggle, `string` for a select. Defaults to `boolean`;
   * pass the type for a select: `ctx.setting<string>("order")`.
   */
  setting<T extends boolean | string = boolean>(id: string): T;
  /** Subscribe to changes of this plugin's settings. Returns an unsubscribe. */
  onSettingsChange(listener: () => void): () => void;
}

/** A boolean plugin setting, rendered as a checkbox in the Settings view. */
export interface ToggleSetting {
  id: string;
  label: string;
  type?: "toggle";
  /** Initial value before the user has touched it. */
  default: boolean;
}
/** A one-of-many plugin setting, rendered as a segmented button row. */
export interface SelectSetting {
  id: string;
  label: string;
  type: "select";
  options: Array<{ value: string; label: string; title?: string }>;
  /** Initial value (one of `options[].value`) before the user touches it. */
  default: string;
}
/** A user-adjustable plugin setting surfaced in the shell's Settings view. */
export type DevtoolsSetting = ToggleSetting | SelectSetting;

/**
 * A devtools plugin = one tab. The shell renders it into a container and gives
 * it the context. `render` may return a cleanup function (called when the tab is
 * hidden) — that's how a stateful plugin (e.g. the component tree) manages its
 * own live subscription. Static plugins can instead expose `subscribe`.
 */
export interface DevtoolsPanel {
  /** Stable id, also used as the tab's value. */
  id: string;
  /** Tab label. */
  title: string;
  /** CSS injected once into the panel's shadow root (scoped to the panel). */
  styles?: string;
  /** Toggles this plugin exposes; the shell renders them in its Settings view. */
  settings?: DevtoolsSetting[];
  /** Render into the container; optionally return a cleanup for tab-switch. */
  render(container: HTMLElement, ctx: DevtoolsContext): void | (() => void);
  /** Alternative live source for stateless panels: called to request re-render. */
  subscribe?(rerender: () => void): () => void;
}

// ============================================================
// Tiny DOM helpers shared by the shell and the built-in plugins
// ============================================================

export function el(
  tag: string,
  className: string,
  children: string | Node | Array<string | Node>,
): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

export function button(label: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  b.disabled = disabled;
  b.addEventListener("click", onClick);
  return b;
}

export function checkbox(checked: boolean, onChange: () => void): HTMLInputElement {
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = checked;
  cb.className = "cssck";
  cb.addEventListener("change", onChange);
  return cb;
}

export function fmt(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// ============================================================
// PluginAPI — author a plugin as a @youneed/dom component
// ============================================================

/**
 * Wrap a `@youneed/dom` component as a devtools plugin: the shell mounts it into
 * the tab container and hands it the `DevtoolsContext` via a `ctx` property. This
 * is how devtools renders its own UI with this framework — and how third-party
 * plugins are written. The component MUST set `static devtools = false` so it
 * doesn't report itself into the component tree it's inspecting.
 *
 *   class MyPanel extends Component("my-panel") {
 *     static devtools = false;
 *     @Component.prop() ctx!: DevtoolsContext;
 *     render() { return html`components: ${this.ctx?.components().length}`; }
 *   }
 *   componentPlugin("mine", "Mine", MyPanel);
 */
export function componentPlugin(
  id: string,
  title: string,
  Component: ComponentConstructor,
): DevtoolsPanel {
  return {
    id,
    title,
    render(container, ctx) {
      define(Component);
      const element = document.createElement(Component.tagName);
      // Set ctx BEFORE connecting, so the first render AND onMount() already see
      // it (matters under a synchronous scheduler, where connect renders inline).
      (element as unknown as { ctx?: DevtoolsContext }).ctx = ctx;
      container.appendChild(element);
      (element as unknown as { flushSync?: () => void }).flushSync?.();
      return () => element.remove();
    },
  };
}
