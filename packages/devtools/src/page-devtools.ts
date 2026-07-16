// page-devtools.ts — SSR/SSG inspector tabs (Page / Routes / Map), each rendered
// with @youneed/dom — same plugin form as the rest of devtools.
//
//   import { installDevtools } from "./dom-devtools.ts";
//   import { installPageDevtools } from "./page-devtools.ts";
//   installDevtools();
//   installPageDevtools();   // component inspector + Page/Routes/Map tabs
//
// The page settings and route table are serialized into the SSR'd HTML by
// page.ts (`enablePageDevtools()` must be on). Here on the client we read that
// JSON and render it. Only TYPES are imported from page.ts (it pulls in
// node:http transitively), so a value import would drag the server into the bundle.

import { Component, css, html } from "@youneed/dom";
import { componentPlugin, defaultPanels, mountDevtoolsPanel } from "./dom-devtools.ts";
import type { DevtoolsPanel, DevtoolsPanelOptions } from "./dom-devtools.ts";
import type { DevtoolsPayload, RouteInfo } from "@youneed/ssr";

// Keep in sync with page.ts `DEVTOOLS_MARKER` (duplicated to avoid a value import).
const DEVTOOLS_MARKER = "data-page-devtools";

/** Read the SSR-embedded payload, if present. */
function readPayload(): DevtoolsPayload | undefined {
  const node = document.querySelector(`script[${DEVTOOLS_MARKER}]`);
  if (!node?.textContent) return undefined;
  try {
    return JSON.parse(node.textContent) as DevtoolsPayload;
  } catch {
    return undefined;
  }
}

const PAGE_CSS = `
  :host { display: block; padding: 6px 10px; color: #d4d4d8; font: 12px/1.5 ui-monospace, Menlo, monospace; }
  .section { margin: 8px 0 4px; color: #a1a1aa; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; font-size: 10px; }
  .kv { display: flex; gap: 6px; padding: 1px 0; }
  .kv .k { color: #fbbf24; }
  .kv .v { color: #d4d4d8; word-break: break-all; }
  .muted { color: #71717a; }
  pre { margin: 4px 0; white-space: pre-wrap; word-break: break-all; color: #d4d4d8; }
  a.route { display: block; padding: 2px 0; text-decoration: none; color: #93c5fd; }
  a.route.current { color: #4ade80; font-weight: 700; }
  .legend { display: flex; gap: 12px; margin: 2px 0 6px; font-size: 11px; color: #a1a1aa; }
  .leg { display: inline-flex; align-items: center; gap: 5px; }
  .sw { width: 14px; height: 0; display: inline-block; }
  .graph svg { max-height: 340px; display: block; }
`;

// ── Page tab ────────────────────────────────────────────────────────────────
let PageView: ReturnType<typeof definePageView> | undefined;
function definePageView() {
  return class PageViewImpl extends Component("dt-page") {
    static devtools = false;
    static styles = css`${PAGE_CSS}`;
    override render() {
      const payload = readPayload();
      if (!payload) return html`<div class="muted">no page payload — enablePageDevtools() on the server?</div>`;
      const p = payload.page;
      return html`
        <div class="section">page</div>
        <div class="kv"><span class="k">url</span><span class="v">${p.url}</span></div>
        ${p.title ? html`<div class="kv"><span class="k">title</span><span class="v">${p.title}</span></div>` : html``}
        ${p.lang ? html`<div class="kv"><span class="k">lang</span><span class="v">${p.lang}</span></div>` : html``}
        ${p.clientScript
          ? html`<div class="kv"><span class="k">clientScript</span><span class="v">${p.clientScript}</span></div>`
          : html``}
        <div class="section">speculation rules</div>
        ${p.speculation
          ? html`<pre>${JSON.stringify(p.speculation, null, 2)}</pre>`
          : html`<div class="muted">none for this page</div>`}
      `;
    }
  };
}

// ── Routes tab ──────────────────────────────────────────────────────────────
let RoutesView: ReturnType<typeof defineRoutesView> | undefined;
function defineRoutesView() {
  return class RoutesViewImpl extends Component("dt-routes") {
    static devtools = false;
    static styles = css`${PAGE_CSS}`;
    override render() {
      const routes = readPayload()?.routes ?? [];
      const here = globalThis.location?.pathname ?? "";
      return html`
        <div class="section">routes (${routes.length})</div>
        ${routes.length === 0
          ? html`<div class="muted">no routes in payload</div>`
          : routes.map((r) => {
              const current = r.url === here;
              const text = (current ? "→ " : "") + (r.title ? `${r.url}  ·  ${r.title}` : r.url);
              // New tab: a same-tab hop would unload the page and take devtools
              // with it. Opening elsewhere keeps this inspector alive.
              return html`<a class=${current ? "route current" : "route"} href=${r.url} target="_blank" rel="noopener">${text}</a>`;
            })}
      `;
    }
  };
}

// ── Map tab (the page graph; SVG is built imperatively in onMount) ────────────
const SVGNS = "http://www.w3.org/2000/svg";
const EDGE_COLOR = { prerender: "#4ade80", prefetch: "#7dd3fc" } as const;
const shortLabel = (url: string) => (url.length > 14 ? url.slice(0, 13) + "…" : url);

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** Build the routes-as-nodes / speculation-edges graph into `host`. */
function drawGraph(host: Element, routes: RouteInfo[], here: string): void {
  const W = 320;
  const cx = W / 2;
  const cy = W / 2;
  const R = routes.length <= 1 ? 0 : 116;
  const nodeR = 22;
  const at = (i: number): [number, number] => {
    if (routes.length === 1) return [cx, cy];
    const a = (i / routes.length) * 2 * Math.PI - Math.PI / 2;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  };
  const index = new Map(routes.map((r, i) => [r.url, i]));

  const root = svgEl("svg", { viewBox: `0 0 ${W} ${W}`, width: "100%" });

  const defs = svgEl("defs", {});
  for (const [kind, color] of Object.entries(EDGE_COLOR)) {
    const marker = svgEl("marker", {
      id: `arrow-${kind}`,
      viewBox: "0 0 10 10",
      refX: 9,
      refY: 5,
      markerWidth: 6,
      markerHeight: 6,
      orient: "auto-start-reverse",
    });
    marker.append(svgEl("path", { d: "M0,0 L10,5 L0,10 z", fill: color }));
    defs.append(marker);
  }
  root.append(defs);

  for (const r of routes) {
    const si = index.get(r.url);
    if (si === undefined) continue;
    const [sx, sy] = at(si);
    for (const link of r.links ?? []) {
      const ti = index.get(link.url);
      if (ti === undefined) continue;
      const [tx, ty] = at(ti);
      const dx = tx - sx;
      const dy = ty - sy;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      root.append(
        svgEl("line", {
          x1: sx + ux * nodeR,
          y1: sy + uy * nodeR,
          x2: tx - ux * (nodeR + 6),
          y2: ty - uy * (nodeR + 6),
          stroke: EDGE_COLOR[link.kind],
          "stroke-width": 1.5,
          "marker-end": `url(#arrow-${link.kind})`,
        }),
      );
    }
  }

  routes.forEach((r, i) => {
    const [x, y] = at(i);
    const current = r.url === here;
    // Open the route in a NEW TAB. A plain same-tab navigation would unload the
    // whole document — including the devtools panel + its launcher — and you'd
    // land on the target with no inspector (and no way to reopen it) unless that
    // page also loads the devtools bundle. A new tab keeps THIS page (and its
    // devtools) intact; the opened route gets its own fresh inspector.
    const g = svgEl("a", { href: r.url, target: "_blank", rel: "noopener" });
    g.style.cursor = "pointer";
    const circle = svgEl("circle", {
      cx: x,
      cy: y,
      r: nodeR,
      fill: current ? "#3730a3" : "#26262b",
      stroke: current ? "#818cf8" : "#3a3a40",
      "stroke-width": current ? 2 : 1,
    });
    const title = svgEl("title", {});
    title.textContent = r.title ? `${r.url} — ${r.title}` : r.url;
    circle.append(title);
    const label = svgEl("text", {
      x,
      y: y + nodeR + 13,
      "text-anchor": "middle",
      fill: current ? "#c7d2fe" : "#93c5fd",
      "font-size": 11,
      "font-family": "ui-monospace, monospace",
    });
    label.textContent = shortLabel(r.url);
    g.append(circle, label);
    root.append(g);
  });

  host.replaceChildren(root);
}

let MapView: ReturnType<typeof defineMapView> | undefined;
function defineMapView() {
  return class MapViewImpl extends Component("dt-map") {
    static devtools = false;
    static styles = css`${PAGE_CSS}`;
    override render() {
      const routes = readPayload()?.routes ?? [];
      if (routes.length === 0) {
        return html`<div class="section">page graph</div><div class="muted">no routes in payload</div>`;
      }
      return html`
        <div class="section">page graph</div>
        <div class="legend">
          ${Object.entries(EDGE_COLOR).map(
            ([kind, color]) =>
              html`<span class="leg"><span class="sw" style=${`border-top:2px solid ${color}`}></span>${kind}</span>`,
          )}
        </div>
        <div class="graph"></div>
      `;
    }
    onMount(): void {
      // The graph is static (SSR payload), so build the SVG once after the first
      // render and never re-render — no fighting with reactive updates.
      const host = this.shadowRoot?.querySelector(".graph");
      const routes = readPayload()?.routes ?? [];
      if (host && routes.length) drawGraph(host, routes, globalThis.location?.pathname ?? "");
    }
  };
}

// ── Plugins tab (SSR modules: robots / sitemap / rss / structured-data / …) ───
const ENDPOINT_KINDS = new Set(["robots", "sitemap", "rss", "llms"]);

/** "key: value · key: value" for a module's info, minus kind/path. */
function moduleDetail(info: Record<string, unknown>): string {
  return Object.entries(info)
    .filter(([k]) => k !== "kind" && k !== "path")
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? (v.length ? v.join(", ") : "—") : String(v)}`)
    .join(" · ");
}

let PluginsView: ReturnType<typeof definePluginsView> | undefined;
function definePluginsView() {
  return class PluginsViewImpl extends Component("dt-plugins") {
    static devtools = false;
    static styles = css`${PAGE_CSS}`;
    override render() {
      const modules = readPayload()?.modules ?? [];
      if (modules.length === 0) {
        return html`<div class="section">ssr modules</div><div class="muted">none — mount server-plugin-ssr with devtools:true</div>`;
      }
      return html`
        <div class="section">ssr modules (${modules.length})</div>
        ${modules.map((m) => {
          const info = (m.info ?? {}) as Record<string, unknown>;
          const kind = typeof info.kind === "string" ? info.kind : undefined;
          const path = typeof info.path === "string" ? info.path : undefined;
          const detail = moduleDetail(info);
          const isEndpoint = !!path && !!kind && ENDPOINT_KINDS.has(kind);
          return html`
            <div class="kv">
              <span class="k">${m.name}</span>
              ${isEndpoint
                ? html`<a class="route" href=${path} target="_blank" rel="noopener">${path}</a>`
                : html`<span class="v muted">${detail || kind || ""}</span>`}
            </div>
            ${isEndpoint && detail ? html`<div class="kv"><span class="v muted">${detail}</span></div>` : html``}
          `;
        })}
      `;
    }
  };
}

// ---- public API ----

function pagePanel(): DevtoolsPanel {
  PageView ??= definePageView();
  return componentPlugin("page", "Page", PageView);
}

function routesPanel(): DevtoolsPanel {
  RoutesView ??= defineRoutesView();
  return componentPlugin("routes", "Routes", RoutesView);
}

function mapPanel(): DevtoolsPanel {
  MapView ??= defineMapView();
  return componentPlugin("map", "Map", MapView);
}

function pluginsPanel(): DevtoolsPanel {
  PluginsView ??= definePluginsView();
  return componentPlugin("plugins", "Plugins", PluginsView);
}

/** All SSR/SSG tabs, ready to pass to `mountDevtoolsPanel({ panels })`. */
function pageDevtoolsPanels(): DevtoolsPanel[] {
  return [pagePanel(), routesPanel(), mapPanel(), pluginsPanel()];
}

/**
 * Convenience: mount the devtools panel composed of the built-in component
 * inspector (+ time-travel/styles) plus the Page/Routes/Map tabs. Call
 * `installDevtools()` first so the Components tab has data.
 */
function installPageDevtools(
  target: Element = document.body,
  options: DevtoolsPanelOptions = {},
): HTMLElement {
  return mountDevtoolsPanel(target, {
    ...options,
    panels: options.panels ?? [...defaultPanels(), ...pageDevtoolsPanels()],
  });
}

export { installPageDevtools, pageDevtoolsPanels, pagePanel, routesPanel, mapPanel, pluginsPanel, readPayload };
