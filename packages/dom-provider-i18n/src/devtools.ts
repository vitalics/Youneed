// ── @youneed/dom-provider-i18n/devtools — i18n capture + panel for devtools ──
//
// Two separate APIs, mirroring the devtools split between CAPTURE and DISPLAY:
//
//   • i18nPlugin() — a `DevtoolsPlugin` (capture): registered with
//     `installDevtools({ plugins })`, it records every translator's `t()` call
//     (framework-wide, via the core hook `setI18nDevtoolsHook`);
//   • i18nPanel(i18n, opts) — a `DevtoolsPanel` (display): mounted with
//     `mountDevtoolsPanel({ panels })`, it shows a live locale switcher, a
//     searchable key browser (per-locale gaps flagged), and a tail of the
//     captured `t()` calls (missing keys in red).
//
//   import { installDevtools, mountDevtoolsPanel, defaultPanels } from "@youneed/devtools";
//   import { i18nPlugin, i18nPanel } from "@youneed/dom-provider-i18n/devtools";
//   import { i18n, resources } from "./i18n.ts";
//
//   installDevtools({ plugins: [i18nPlugin()] });                                       // capture
//   mountDevtoolsPanel(document.body, { panels: [...defaultPanels(), i18nPanel(i18n, { resources })] }); // display
//
// The display half is free: the captured data (`i18nUsage()` / `onI18nUsage()`)
// can feed any UI.

import { button, el, fmt, type DevtoolsContext, type DevtoolsPanel, type DevtoolsPlugin } from "@youneed/devtools";
import { isPluralForms, setI18nDevtoolsHook, type I18n, type I18nTranslateEvent, type Messages } from "@youneed/i18n";

// ── capture (the plugin) ──────────────────────────────────────────────────────

/** A recorded `t()` call (an {@link I18nTranslateEvent} stamped with a time). */
export interface I18nUsage extends I18nTranslateEvent {
  time: number;
}

let capacity = 500;
const log: I18nUsage[] = [];
const listeners = new Set<() => void>();

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** The captured usage log, oldest first. */
export function i18nUsage(): readonly I18nUsage[] {
  return log;
}

/** Subscribe to usage-log changes. Returns an unsubscribe. */
export function onI18nUsage(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Drop every captured entry. */
export function clearI18nUsage(): void {
  log.length = 0;
  for (const fn of listeners) fn();
}

/**
 * The i18n capture plugin: records every translator's `t()` call into a buffer
 * the panel (or any UI) can read. Register it with
 * `installDevtools({ plugins: [i18nPlugin()] })`. Capture is framework-wide (via
 * the core hook), so it sees every translator, not only the one the panel shows.
 */
export function i18nPlugin(options: { capacity?: number } = {}): DevtoolsPlugin {
  if (options.capacity) capacity = options.capacity;
  return {
    name: "i18n",
    install() {
      setI18nDevtoolsHook({
        send(event: I18nTranslateEvent) {
          log.push({ ...event, time: now() });
          if (log.length > capacity) log.splice(0, log.length - capacity);
          for (const fn of listeners) fn();
        },
      });
      return () => setI18nDevtoolsHook(undefined);
    },
  };
}

// ── key enumeration (the browser) ─────────────────────────────────────────────

/** Flatten a message tree into `dotted.key → template` pairs. A plural entry is
 *  shown as one key (its `other` form, prefixed `⇶`). */
function flatten(tree: Messages, prefix = "", out = new Map<string, string>()): Map<string, string> {
  for (const k of Object.keys(tree)) {
    const v = tree[k];
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(key, v);
    else if (isPluralForms(v)) out.set(key, `⇶ ${v.other}`);
    else flatten(v, key, out);
  }
  return out;
}

interface KeyRow {
  key: string;
  value: string;
  /** Locales where this key is absent. */
  missing: string[];
}

/** Build the per-key view for the active locale, flagging where keys are missing. */
function keyRows(resources: Record<string, Messages>, active: string): KeyRow[] {
  const perLocale = new Map<string, Map<string, string>>();
  const all = new Set<string>();
  for (const loc of Object.keys(resources)) {
    const flat = flatten(resources[loc]);
    perLocale.set(loc, flat);
    for (const k of flat.keys()) all.add(k);
  }
  const activeFlat = perLocale.get(active) ?? new Map();
  return [...all].sort().map((key) => ({
    key,
    value: activeFlat.get(key) ?? "",
    missing: [...perLocale].filter(([, flat]) => !flat.has(key)).map(([loc]) => loc),
  }));
}

// ── panel (the display) ───────────────────────────────────────────────────────

export interface I18nPanelOptions {
  /** The resource map — enables the key browser + parity flags. */
  resources?: Record<string, Messages>;
  /** Tab id (default `"i18n"`). */
  id?: string;
  /** Tab title (default `"i18n"`). */
  title?: string;
}

const I18N_CSS = `
  :host { display: block; padding: 8px 10px; color: #d4d4d8; font: 12px/1.5 ui-monospace, Menlo, monospace; }
  .row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .section { margin: 10px 0 4px; color: #a1a1aa; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; font-size: 10px; }
  button { background: #27272a; color: #d4d4d8; border: 1px solid #3a3a40; border-radius: 5px; padding: 2px 8px; cursor: pointer; font: inherit; }
  button:hover { background: #323238; }
  button.active { background: #2563eb; border-color: #2563eb; color: #fff; }
  input[type=search] { flex: 1; min-width: 120px; background: #18181b; color: #d4d4d8; border: 1px solid #3a3a40; border-radius: 5px; padding: 3px 8px; font: inherit; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 6px; vertical-align: top; border-bottom: 1px solid #27272a; }
  td.k { color: #fbbf24; white-space: nowrap; }
  td.v { color: #d4d4d8; word-break: break-word; }
  .badge { color: #f87171; font-size: 10px; margin-left: 6px; }
  .muted { color: #71717a; }
  .log { max-height: 220px; overflow: auto; }
  .logline { display: flex; gap: 8px; padding: 1px 0; }
  .logline .loc { color: #93c5fd; }
  .logline .key { color: #fbbf24; }
  .logline .res { color: #a3e635; word-break: break-word; }
  .logline.missing .key, .logline.missing .res { color: #f87171; }
`;

/**
 * A devtools panel for an `@youneed/i18n` translator: a live locale switcher, a
 * searchable key browser (per-locale gaps flagged when `resources` is given) and
 * a tail of the captured `t()` calls (needs {@link i18nPlugin} installed for the
 * log). Returns a `DevtoolsPanel` for `mountDevtoolsPanel({ panels })`.
 */
export function i18nPanel(i18n: I18n, opts: I18nPanelOptions = {}): DevtoolsPanel {
  const resources = opts.resources;
  return {
    id: opts.id ?? "i18n",
    title: opts.title ?? "i18n",
    styles: I18N_CSS,
    render(container: HTMLElement, _ctx: DevtoolsContext): () => void {
      let filter = "";
      container.textContent = "";

      const localeBar = el("div", "row", []);
      const search = document.createElement("input");
      search.type = "search";
      search.placeholder = "filter keys…";
      const keysWrap = el("div", "", []);
      const logWrap = el("div", "log", []);

      container.append(
        el("div", "section", "locale"),
        localeBar,
        el("div", "section", "keys"),
        el("div", "row", search),
        keysWrap,
        el("div", "section", "live usage"),
        el("div", "row", button("clear", false, () => clearI18nUsage())),
        logWrap,
      );

      function paintLocales(): void {
        localeBar.textContent = "";
        for (const loc of i18n.locales) {
          const b = button(loc, false, () => i18n.setLocale(loc));
          if (loc === i18n.locale) b.classList.add("active");
          localeBar.appendChild(b);
        }
      }

      function paintKeys(): void {
        keysWrap.textContent = "";
        if (!resources) {
          keysWrap.appendChild(el("div", "muted", "no resources passed — key browser disabled"));
          return;
        }
        const rows = keyRows(resources, i18n.locale).filter(
          (r) => !filter || r.key.toLowerCase().includes(filter) || r.value.toLowerCase().includes(filter),
        );
        const table = document.createElement("table");
        for (const r of rows) {
          const tr = document.createElement("tr");
          const kCell = el("td", "k", r.key);
          if (r.missing.length) kCell.appendChild(el("span", "badge", `missing: ${r.missing.join(", ")}`));
          tr.append(kCell, el("td", "v", r.value || "—"));
          table.appendChild(tr);
        }
        keysWrap.appendChild(rows.length ? table : el("div", "muted", "no matching keys"));
      }

      function paintLog(): void {
        logWrap.textContent = "";
        const entries = i18nUsage();
        if (!entries.length) {
          logWrap.appendChild(el("div", "muted", "no translations captured (install i18nPlugin())"));
          return;
        }
        for (const u of entries.slice(-200).reverse()) {
          logWrap.appendChild(
            el("div", `logline${u.resolved ? "" : " missing"}`, [
              el("span", "loc", u.locale),
              el("span", "key", u.key),
              el("span", "res", u.resolved ? fmt(u.result) : "(missing)"),
            ]),
          );
        }
      }

      paintLocales();
      paintKeys();
      paintLog();

      search.addEventListener("input", () => {
        filter = search.value.toLowerCase();
        paintKeys();
      });
      const offLocale = i18n.subscribe(() => {
        paintLocales();
        paintKeys();
      });
      const offUsage = onI18nUsage(paintLog);
      return () => {
        offLocale();
        offUsage();
      };
    },
  };
}
