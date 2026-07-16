// panel.ts — the floating devtools shell. It owns only the chrome (header,
// settings, dock/launcher/resize, on-page highlight) and hosts a list of
// plugins as tabs. The built-in component inspector and page panels are just
// plugins passed in — nothing component- or page-specific lives here.

import {
  button,
  checkbox,
  type ComponentRecord,
  components,
  type DevtoolsContext,
  type DevtoolsPanel,
  type DevtoolsSetting,
  el,
  inspect,
  replay,
  schedulerChoices,
  subscribe,
} from "./core.ts";
import { componentTreePanel } from "./component-tree.ts";
import { timeTravelPanel } from "./time-travel.ts";
import { stylesPanel } from "./styles.ts";

/** The default plugin set: component inspector + time-travel + styles editor. */
export function defaultPanels(): DevtoolsPanel[] {
  return [componentTreePanel(), timeTravelPanel(), stylesPanel()];
}

export type DockSide = "bottom" | "top" | "left" | "right";
export type LauncherCorner = "bottom-right" | "bottom-left" | "top-right" | "top-left";

// A settings group rendered uniformly in the Settings view. Each group supplies
// its own read/write: the core "DevTools" group maps to the chrome (dock /
// launcher), plugin groups map to the per-plugin settings store.
interface SettingsGroup {
  title: string;
  items: DevtoolsSetting[];
  read(id: string): boolean | string;
  write(id: string, value: boolean | string): void;
}

export interface DevtoolsPanelOptions {
  dock?: DockSide;
  launcher?: LauncherCorner;
  /**
   * The tabs to mount, in order. Defaults to `defaultPanels()` (the component
   * inspector). Compose your own: `[componentTreePanel(), ...pageDevtoolsPanels(), myPanel()]`.
   */
  panels?: DevtoolsPanel[];
}

const CHROME_CSS = `
:host, .root { all: initial; }
.panel {
  position: fixed;
  display: flex; flex-direction: column;
  background: #1b1b1f; color: #d4d4d8;
  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  box-shadow: 0 0 24px rgba(0,0,0,.5);
  z-index: 2147483647; overflow: hidden;
}
.panel * { box-sizing: border-box; }
.resizer { position: absolute; z-index: 1; touch-action: none; }
.resizer:hover, .resizer:active { background: #6366f1; }
.header {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 8px; background: #26262b; border-bottom: 1px solid #3a3a40;
}
.header .title { font-weight: 600; color: #fafafa; white-space: nowrap; }
.header .count { color: #8b8b94; white-space: nowrap; margin-left: auto; }
.iconbtn {
  background: #131316; color: #e4e4e7; border: 1px solid #3a3a40;
  border-radius: 4px; cursor: pointer; font: inherit; line-height: 1; padding: 3px 7px;
}
.iconbtn:hover { background: #3a3a40; }
.iconbtn.active { background: #3730a3; border-color: #6366f1; color: #fff; }
.docks { display: flex; gap: 3px; }
.settings {
  display: flex; flex-direction: column; gap: 8px;
  padding: 8px; background: #202024; border-bottom: 1px solid #3a3a40;
}
.settings .row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.settings .label { color: #8b8b94; }
.settings .group {
  display: flex; flex-direction: column; gap: 4px;
  padding-top: 8px; border-top: 1px solid #2c2c33;
}
.settings .group-title { color: #8b8b94; font-weight: 600; }
.settings .toggle-row { display: flex; align-items: center; gap: 6px; cursor: pointer; color: #d4d4d8; }
.settings .toggle-row input { margin: 0; }
.launcher {
  position: fixed; width: 40px; height: 40px;
  display: flex; align-items: center; justify-content: center;
  background: #26262b; color: #fafafa; border: 1px solid #3a3a40;
  border-radius: 50%; cursor: pointer; font-size: 18px; line-height: 1;
  box-shadow: 0 2px 12px rgba(0,0,0,.5); z-index: 2147483647;
}
.launcher:hover { background: #3730a3; }
.tabs {
  display: flex; gap: 4px; align-items: center;
  padding: 4px 8px; background: #202024; border-bottom: 1px solid #3a3a40;
}
.tab {
  background: transparent; color: #a1a1aa; border: 1px solid transparent;
  border-radius: 4px; cursor: pointer; font: inherit; padding: 2px 9px; line-height: 1.4;
}
.tab:hover { color: #e4e4e7; background: #2c2c33; }
.tab.active { color: #fff; background: #3730a3; border-color: #6366f1; }
.body { flex: 1; display: flex; min-height: 0; }
/* one container per plugin; plugins lay out their own content inside */
.view { flex: 1; min-height: 0; overflow: auto; }
`;

const HIGHLIGHT_CSS =
  "position:fixed;pointer-events:none;z-index:2147483646;" +
  "background:rgba(99,102,241,.25);border:1px solid #6366f1;border-radius:2px;" +
  "transition:all .05s ease;display:none";

const HIGHLIGHT_LABEL_CSS =
  "position:fixed;pointer-events:none;z-index:2147483647;display:none;" +
  "background:#6366f1;color:#fff;border-radius:3px;padding:1px 6px;white-space:nowrap;" +
  "font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;box-shadow:0 1px 4px rgba(0,0,0,.4)";

interface PanelPrefs {
  dock: DockSide;
  launcher: LauncherCorner;
  size?: number;
  open: boolean;
  tab: string;
  /** Plugin setting values, keyed `${pluginId}.${settingId}`. */
  settings: Record<string, boolean | string>;
}

const PREFS_KEY = "dom-devtools-prefs";

function loadPrefs(): PanelPrefs {
  const fallback: PanelPrefs = {
    dock: "bottom",
    launcher: "bottom-right",
    open: true,
    tab: "components",
    settings: {},
  };
  try {
    const raw = globalThis.localStorage?.getItem(PREFS_KEY);
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<PanelPrefs>) } : fallback;
  } catch {
    return fallback;
  }
}

function savePrefs(prefs: PanelPrefs): void {
  try {
    globalThis.localStorage?.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable — settings just won't persist */
  }
}

// A `transform` / `filter` / `perspective` / `contain` / `will-change` on an
// ancestor makes IT (not the viewport) the containing block for descendant
// `position: fixed` boxes — so the docked panel and the corner launcher get
// anchored to, and clipped by, that ancestor instead of the screen. The floating
// chrome must therefore live under a root with NO such ancestor.
function trapsFixed(el: Element): boolean {
  const cs = getComputedStyle(el);
  return (
    cs.transform !== "none" ||
    cs.perspective !== "none" ||
    cs.filter !== "none" ||
    /transform|perspective|filter/.test(cs.willChange || "") ||
    /paint|layout|strict|content/.test(cs.contain || "")
  );
}
function chainTrapsFixed(el: Element): boolean {
  for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) {
    if (trapsFixed(n)) return true;
  }
  return false;
}
/** The nearest attach point whose ancestor chain won't trap `position: fixed`.
 *  Honors `preferred` when it's safe, else escapes to <body>, else <html>. */
function viewportRoot(preferred: Element): Element {
  if (!chainTrapsFixed(preferred)) return preferred;
  if (document.body && !chainTrapsFixed(document.body)) return document.body;
  return document.documentElement;
}

/**
 * A floating, interactive inspector panel assembled from plugins (tabs). With no
 * `options.panels` it mounts the built-in component inspector; pass your own list
 * to add/replace tabs (page-devtools, custom panels). Docks to any side, the
 * launcher icon to any corner; the choice persists in localStorage.
 *
 * The chrome is a viewport overlay (`position: fixed`). If `target` (or any of
 * its ancestors) establishes a containing block for fixed boxes — via
 * `transform`, `filter`, `contain`, … — the floating UI would be trapped and
 * clipped there, so it's re-rooted to a safe top-level element automatically.
 *
 * Idempotent: only one panel can exist per document. A repeat call (e.g. an HMR
 * reload re-running the entry, or an SPA re-mount) returns the existing host
 * instead of stacking a second panel — which would otherwise overlap launchers
 * and double every overlay. Remove the returned host to unmount before remounting.
 */
export function mountDevtoolsPanel(
  target: Element = document.body,
  options: DevtoolsPanelOptions = {},
): HTMLElement {
  const existing = document.querySelector<HTMLElement>("[data-dom-devtools]");
  if (existing) return existing;

  const prefs = { ...loadPrefs(), ...options };
  const panels = options.panels ?? defaultPanels();

  const root = viewportRoot(target);

  const host = document.createElement("div");
  host.setAttribute("data-dom-devtools", "");
  root.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  // chrome CSS first, then each plugin's own (deduped by id).
  let css = CHROME_CSS;
  const seenStyles = new Set<string>();
  for (const p of panels) {
    if (p.styles && !seenStyles.has(p.id)) {
      seenStyles.add(p.id);
      css += "\n" + p.styles;
    }
  }
  style.textContent = css;
  shadow.appendChild(style);

  // ── on-page highlight overlay (a shell service handed to plugins via ctx) ──
  // Also fixed-positioned, so it shares the same trap-free root as the chrome.
  const overlay = document.createElement("div");
  overlay.style.cssText = HIGHLIGHT_CSS;
  root.appendChild(overlay);
  const hlLabel = document.createElement("div");
  hlLabel.style.cssText = HIGHLIGHT_LABEL_CSS;
  root.appendChild(hlLabel);

  function hideHighlight(): void {
    overlay.style.display = "none";
    hlLabel.style.display = "none";
  }
  // Draws the overlay for `rec` (or clears it). Whether highlighting is enabled
  // is now a plugin setting (the component tree owns it), so the shell just
  // draws whatever a plugin asks for — a plugin passes `undefined` when off.
  function highlight(rec: ComponentRecord | undefined): void {
    const node = rec?.elRef?.deref();
    if (!node || !(node as HTMLElement).getBoundingClientRect) {
      hideHighlight();
      return;
    }
    const r = (node as HTMLElement).getBoundingClientRect();
    overlay.style.display = "block";
    overlay.style.left = `${r.left}px`;
    overlay.style.top = `${r.top}px`;
    overlay.style.width = `${r.width}px`;
    overlay.style.height = `${r.height}px`;
    hlLabel.textContent = `<${rec!.tag}>  ${Math.round(r.width)}×${Math.round(r.height)}`;
    hlLabel.style.display = "block";
    hlLabel.style.left = `${Math.max(0, r.left)}px`;
    hlLabel.style.top = r.top >= 20 ? `${r.top - 19}px` : `${r.bottom + 3}px`;
  }

  // ── shared selection (the tree selects; time-travel/styles plugins react) ──
  let selectedId: number | null = null;
  const selectListeners = new Set<() => void>();

  // ── per-plugin settings (toggles) ──────────────────────────────────────────
  // `${pluginId}.${settingId}` → value, seeded from each plugin's defaults and
  // overlaid with whatever the user previously saved.
  const settingsStore = new Map<string, boolean | string>();
  const settingsListeners = new Map<string, Set<() => void>>();
  for (const p of panels) {
    for (const s of p.settings ?? []) {
      const key = `${p.id}.${s.id}`;
      settingsStore.set(key, prefs.settings[key] ?? s.default);
    }
  }
  function setSetting(pluginId: string, settingId: string, value: boolean | string): void {
    const key = `${pluginId}.${settingId}`;
    settingsStore.set(key, value);
    prefs.settings[key] = value;
    savePrefs(prefs);
    for (const fn of settingsListeners.get(pluginId) ?? []) fn();
  }

  // The services shared by every plugin (selection + store + highlight + …).
  const shared: Omit<DevtoolsContext, "setting" | "onSettingsChange"> = {
    components,
    inspect,
    subscribe,
    highlight,
    schedulerChoices,
    replay,
    selected: () => selectedId,
    current: () => (selectedId != null ? inspect(selectedId) : undefined),
    select(id) {
      selectedId = id;
      for (const fn of selectListeners) fn();
    },
    onSelect(listener) {
      selectListeners.add(listener);
      return () => selectListeners.delete(listener);
    },
  };

  // Each plugin gets a ctx whose setting() / onSettingsChange() are scoped to it.
  function ctxFor(pluginId: string): DevtoolsContext {
    return {
      ...shared,
      setting: <T extends boolean | string = boolean>(id: string) =>
        (settingsStore.get(`${pluginId}.${id}`) ?? false) as T,
      onSettingsChange(listener) {
        const set = settingsListeners.get(pluginId) ?? new Set();
        set.add(listener);
        settingsListeners.set(pluginId, set);
        return () => set.delete(listener);
      },
    };
  }

  // ── chrome ──
  const settingsBtn = button("⚙", false, () => {
    settings.style.display = settings.style.display === "none" ? "flex" : "none";
  });
  settingsBtn.className = "iconbtn";
  settingsBtn.title = "Settings: dock, launcher corner & plugin toggles";
  const collapseBtn = button("✕", false, () => toggle(false));
  collapseBtn.className = "iconbtn";
  collapseBtn.title = "Collapse to the launcher icon";
  const launcher = button("🔧", false, () => toggle(true));
  launcher.className = "launcher";

  const DOCKS: Array<[DockSide, string]> = [
    ["bottom", "↓"],
    ["top", "↑"],
    ["left", "←"],
    ["right", "→"],
  ];
  const CORNERS: Array<[LauncherCorner, string]> = [
    ["bottom-left", "↙"],
    ["bottom-right", "↘"],
    ["top-left", "↖"],
    ["top-right", "↗"],
  ];

  // The Settings view is built from groups, rendered uniformly: the core
  // "DevTools" group (dock + launcher, as `select` settings) followed by one
  // group per plugin that declares toggles. Each group provides its own
  // read/write so the core maps to the chrome (dock/launcher) while plugin
  // groups map to the per-plugin settings store.
  const settings = el("div", "settings", [coreGroup(), ...pluginGroups()].map(renderGroup));
  settings.style.display = "none";

  function renderGroup(g: SettingsGroup): HTMLElement {
    const rows = g.items.map((s) => {
      if ("type" in s && s.type === "select") {
        const cur = String(g.read(s.id));
        const btns = s.options.map((o) => {
          const b = button(o.label, false, () => {
            for (const x of btns) x.classList.toggle("active", x === b);
            g.write(s.id, o.value);
          });
          b.className = "iconbtn" + (o.value === cur ? " active" : "");
          if (o.title) b.title = o.title;
          return b;
        });
        return el("div", "row", [el("span", "label", `${s.label}:`), el("div", "docks", btns)]);
      }
      const cb = checkbox(g.read(s.id) === true, () => g.write(s.id, cb.checked));
      return el("label", "toggle-row", [cb, el("span", "", s.label)]);
    });
    return el("div", "group", [el("span", "group-title", g.title), ...rows]);
  }

  function coreGroup(): SettingsGroup {
    return {
      title: "DevTools",
      items: [
        { id: "dock", label: "Dock", type: "select", default: "bottom", options: DOCKS.map(([v, glyph]) => ({ value: v, label: glyph, title: `Dock ${v}` })) },
        { id: "launcher", label: "Launcher icon", type: "select", default: "bottom-right", options: CORNERS.map(([v, glyph]) => ({ value: v, label: glyph, title: `Launcher ${v}` })) },
      ],
      read: (id) => (id === "dock" ? prefs.dock : prefs.launcher),
      write: (id, v) => (id === "dock" ? setDock(v as DockSide) : setLauncher(v as LauncherCorner)),
    };
  }

  function pluginGroups(): SettingsGroup[] {
    return panels
      .filter((p) => p.settings?.length)
      .map((p) => ({
        title: p.title,
        items: p.settings!,
        read: (id: string) => settingsStore.get(`${p.id}.${id}`) ?? false,
        write: (id: string, v: boolean | string) => setSetting(p.id, id, v as boolean),
      }));
  }

  // ── tabs + one view container per plugin ──
  const tabBtns = panels.map((p) => {
    const b = button(p.title, false, () => setTab(p.id));
    b.className = "tab";
    b.dataset.tab = p.id;
    return b;
  });
  const tabsRow = el("div", "tabs", tabBtns);
  if (panels.length <= 1) tabsRow.style.display = "none"; // single plugin → no tab bar

  const views = new Map<string, HTMLElement>();
  for (const p of panels) {
    const v = el("div", "view", []);
    v.dataset.panel = p.id;
    v.style.display = "none";
    views.set(p.id, v);
  }

  const countEl = el("span", "count", "");

  shadow.appendChild(
    el("div", "panel", [
      el("div", "header", [el("span", "title", "🔧 dom-devtools"), countEl, settingsBtn, collapseBtn]),
      settings,
      tabsRow,
      el("div", "body", [...views.values()]),
      el("div", "resizer", []),
    ]),
  );
  shadow.appendChild(launcher);

  const panel = shadow.querySelector(".panel") as HTMLElement;
  const resizer = shadow.querySelector(".resizer") as HTMLElement;

  let open = prefs.open;
  let activeCleanup: (() => void) | undefined;
  let activeTab = "";

  function activate(p: DevtoolsPanel, container: HTMLElement): () => void {
    const pctx = ctxFor(p.id);
    const maybeCleanup = p.render(container, pctx);
    if (typeof maybeCleanup === "function") return maybeCleanup;
    const unsub = p.subscribe?.(() => p.render(container, pctx));
    return () => unsub?.();
  }

  function setTab(id: string): void {
    if (!views.has(id)) id = panels[0].id;
    activeTab = id;
    prefs.tab = id;
    savePrefs(prefs);
    for (const b of tabBtns) b.classList.toggle("active", b.dataset.tab === id);
    for (const [pid, v] of views) v.style.display = pid === id ? "" : "none";
    activeCleanup?.();
    activeCleanup = undefined;
    if (!open) return;
    const p = panels.find((x) => x.id === id)!;
    activeCleanup = activate(p, views.get(id)!);
  }

  // ---- dock / resize / launcher ----
  function applyDock(): void {
    const s = panel.style;
    s.left = s.right = s.top = s.bottom = s.width = s.height = s.maxWidth = "";
    s.borderRadius = s.borderTop = s.borderBottom = s.borderLeft = s.borderRight = "";
    const border = "1px solid #3a3a40";
    const px = (v: number) => `${v}px`;
    const horizontal = prefs.dock === "left" || prefs.dock === "right";
    const size = prefs.size != null ? px(prefs.size) : horizontal ? "460px" : "55vh";
    const rs = resizer.style;
    rs.left = rs.right = rs.top = rs.bottom = rs.width = rs.height = "";
    if (prefs.dock === "bottom") {
      s.left = s.right = s.bottom = "0";
      s.height = size;
      s.borderTop = border;
      s.borderTopLeftRadius = s.borderTopRightRadius = "8px";
      rs.left = rs.right = rs.top = "0"; rs.height = "6px"; rs.cursor = "ns-resize";
    } else if (prefs.dock === "top") {
      s.left = s.right = s.top = "0";
      s.height = size;
      s.borderBottom = border;
      rs.left = rs.right = rs.bottom = "0"; rs.height = "6px"; rs.cursor = "ns-resize";
    } else if (prefs.dock === "left") {
      s.top = s.bottom = s.left = "0";
      s.width = size;
      s.maxWidth = "95vw";
      s.borderRight = border;
      rs.top = rs.bottom = rs.right = "0"; rs.width = "6px"; rs.cursor = "ew-resize";
    } else {
      s.top = s.bottom = s.right = "0";
      s.width = size;
      s.maxWidth = "95vw";
      s.borderLeft = border;
      rs.top = rs.bottom = rs.left = "0"; rs.width = "6px"; rs.cursor = "ew-resize";
    }
  }

  resizer.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    resizer.setPointerCapture(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const { dock } = prefs;
      const raw =
        dock === "bottom" ? window.innerHeight - ev.clientY
        : dock === "top" ? ev.clientY
        : dock === "right" ? window.innerWidth - ev.clientX
        : ev.clientX;
      const max = (dock === "left" || dock === "right" ? window.innerWidth : window.innerHeight) * 0.95;
      prefs.size = Math.max(220, Math.min(max, raw));
      applyDock();
    };
    const onUp = (ev: PointerEvent) => {
      resizer.releasePointerCapture(ev.pointerId);
      resizer.removeEventListener("pointermove", onMove);
      resizer.removeEventListener("pointerup", onUp);
      savePrefs(prefs);
    };
    resizer.addEventListener("pointermove", onMove);
    resizer.addEventListener("pointerup", onUp);
  });

  function applyLauncher(): void {
    const s = launcher.style;
    s.left = s.right = s.top = s.bottom = "";
    const [v, h] = prefs.launcher.split("-");
    s[v as "top" | "bottom"] = "12px";
    s[h as "left" | "right"] = "12px";
  }

  function setDock(side: DockSide): void {
    prefs.dock = side;
    savePrefs(prefs);
    applyDock();
  }
  function setLauncher(corner: LauncherCorner): void {
    prefs.launcher = corner;
    savePrefs(prefs);
    applyLauncher();
  }

  function toggle(next = !open): void {
    open = next;
    prefs.open = open;
    savePrefs(prefs);
    panel.style.display = open ? "flex" : "none";
    launcher.style.display = open ? "none" : "flex";
    if (!open) {
      hideHighlight();
      activeCleanup?.();
      activeCleanup = undefined;
    } else {
      setTab(activeTab || prefs.tab); // (re)activate the current tab
    }
  }

  applyDock();
  applyLauncher();
  // header component count, kept live.
  countEl.textContent = `${components().length} components`;
  subscribe(() => {
    countEl.textContent = `${components().length} components`;
  });

  const savedTab = views.has(prefs.tab) ? prefs.tab : panels[0].id;
  activeTab = savedTab;
  toggle(open); // shows + activates the saved tab (or collapses to launcher)
  return host;
}
