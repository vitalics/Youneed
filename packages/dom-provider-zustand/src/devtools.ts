// ── @youneed/dom-provider-zustand/devtools — store capture + panel ───────────
//
// Two separate APIs, mirroring the devtools split between CAPTURE and DISPLAY:
//
//   • zustandPlugin(store, { name }) — a `DevtoolsPlugin` (capture): registered
//     with `installDevtools({ plugins })`, it subscribes to a store and records
//     every state change. Register one per store you want to watch.
//   • zustandPanel() — a `DevtoolsPanel` (display): mounted with
//     `mountDevtoolsPanel({ panels })`, it shows each watched store's current
//     state and a tail of changes, with a per-change "restore" (time-travel).
//
//   import { installDevtools, mountDevtoolsPanel, defaultPanels } from "@youneed/devtools";
//   import { zustandPlugin, zustandPanel } from "@youneed/dom-provider-zustand/devtools";
//   import { cart, user } from "./stores.ts";
//
//   installDevtools({ plugins: [zustandPlugin(cart, { name: "cart" }), zustandPlugin(user, { name: "user" })] });
//   mountDevtoolsPanel(document.body, { panels: [...defaultPanels(), zustandPanel()] });
//
// The captured data is also exposed directly (`zustandChanges()` /
// `onZustandChanges()`) to feed any UI.

import { button, el, type DevtoolsContext, type DevtoolsPanel, type DevtoolsPlugin } from "@youneed/devtools";
import type { StoreApi } from "./index.ts";

// ── capture (the plugin) ──────────────────────────────────────────────────────

/** A recorded store change. */
export interface StoreChange {
  /** Name the store was registered under. */
  store: string;
  /** Time the change was recorded (`Date.now()`). */
  time: number;
  /** The new state snapshot. */
  state: unknown;
  /** The previous state snapshot. */
  prev: unknown;
}

let capacity = 200;
const changes: StoreChange[] = [];
const registry = new Map<string, StoreApi<unknown>>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

/** Recorded changes, oldest first. */
export function zustandChanges(): readonly StoreChange[] {
  return changes;
}

/** Registered stores, as `{ name, store }` (for current-state display / restore). */
export function zustandStores(): Array<{ name: string; store: StoreApi<unknown> }> {
  return [...registry].map(([name, store]) => ({ name, store }));
}

/** Subscribe to capture changes (a new change or a (de)registered store). */
export function onZustandChanges(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Drop every recorded change. */
export function clearZustandChanges(): void {
  changes.length = 0;
  notify();
}

/**
 * The zustand capture plugin for ONE store: subscribes to it and records every
 * change under `name`. Register one per store with
 * `installDevtools({ plugins: [zustandPlugin(store, { name })] })`.
 */
export function zustandPlugin<T>(
  store: StoreApi<T>,
  options: { name?: string; capacity?: number } = {},
): DevtoolsPlugin {
  const name = options.name ?? "store";
  if (options.capacity) capacity = options.capacity;
  return {
    name: `zustand:${name}`,
    install() {
      registry.set(name, store as StoreApi<unknown>);
      notify();
      const off = store.subscribe((state, prev) => {
        changes.push({ store: name, time: Date.now(), state, prev });
        if (changes.length > capacity) changes.splice(0, changes.length - capacity);
        notify();
      });
      return () => {
        off();
        registry.delete(name);
        notify();
      };
    },
  };
}

// ── panel (the display) ───────────────────────────────────────────────────────

// JSON, with functions (zustand actions) rendered as `ƒ` rather than dropped.
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === "function" ? "ƒ" : v), 2) ?? String(value);
  } catch {
    return String(value);
  }
}

// Shallow-changed top-level keys between two state snapshots.
function changedKeys(prev: unknown, next: unknown): string[] {
  if (!prev || !next || typeof prev !== "object" || typeof next !== "object") return [];
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  return [...keys].filter(
    (k) => (prev as Record<string, unknown>)[k] !== (next as Record<string, unknown>)[k],
  );
}

const ZUSTAND_CSS = `
  :host { display: block; padding: 8px 10px; color: #d4d4d8; font: 12px/1.5 ui-monospace, Menlo, monospace; }
  .row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .section { margin: 10px 0 4px; color: #a1a1aa; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; font-size: 10px; }
  button { background: #27272a; color: #d4d4d8; border: 1px solid #3a3a40; border-radius: 5px; padding: 1px 7px; cursor: pointer; font: inherit; }
  button:hover { background: #323238; }
  .muted { color: #71717a; }
  .store { margin: 4px 0; }
  .store .name { color: #fbbf24; }
  pre { margin: 2px 0 6px; white-space: pre-wrap; word-break: break-word; color: #d4d4d8; }
  .log { max-height: 200px; overflow: auto; }
  .chg { display: flex; gap: 8px; align-items: baseline; padding: 1px 0; }
  .chg .name { color: #93c5fd; }
  .chg .keys { color: #a3e635; word-break: break-word; }
`;

/**
 * A zustand devtools panel: each watched store's current state plus a tail of
 * changes, each with a "restore" (time-travel) button. Needs {@link zustandPlugin}
 * installed. Returns a `DevtoolsPanel` for `mountDevtoolsPanel({ panels })`.
 */
export function zustandPanel(options: { id?: string; title?: string } = {}): DevtoolsPanel {
  return {
    id: options.id ?? "zustand",
    title: options.title ?? "zustand",
    styles: ZUSTAND_CSS,
    render(container: HTMLElement, _ctx: DevtoolsContext): () => void {
      container.textContent = "";
      const storesWrap = el("div", "", []);
      const logWrap = el("div", "log", []);

      container.append(
        el("div", "section", "stores"),
        storesWrap,
        el("div", "section", "changes"),
        el("div", "row", button("clear", false, () => clearZustandChanges())),
        logWrap,
      );

      function paintStores(): void {
        storesWrap.textContent = "";
        const stores = zustandStores();
        if (!stores.length) {
          storesWrap.appendChild(el("div", "muted", "no stores watched (install zustandPlugin(store, { name }))"));
          return;
        }
        for (const { name, store } of stores) {
          const pre = document.createElement("pre");
          pre.textContent = safeStringify(store.getState());
          storesWrap.append(el("div", "store name", name), pre);
        }
      }

      function paintLog(): void {
        logWrap.textContent = "";
        const log = zustandChanges();
        if (!log.length) {
          logWrap.appendChild(el("div", "muted", "no changes yet"));
          return;
        }
        for (let i = log.length - 1; i >= 0; i--) {
          const change = log[i];
          const restore = button("restore", false, () => {
            registry.get(change.store)?.setState(change.state as never, true);
          });
          logWrap.appendChild(
            el("div", "chg", [
              el("span", "name", change.store),
              el("span", "keys", changedKeys(change.prev, change.state).join(", ") || "(init)"),
              restore,
            ]),
          );
        }
      }

      paintStores();
      paintLog();
      const off = onZustandChanges(() => {
        paintStores();
        paintLog();
      });
      return off;
    },
  };
}
