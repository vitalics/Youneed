// ── @youneed/server-plugin-ssr/devtools — the SSR stack's own devtools UI ─────
//
// The `ssr()` plugin reports `inspect() = { kind: "ssr", origin, pages, modules }`
// where each module is `{ name, info: { kind, … } }` from a satellite SSR plugin
// (robots/sitemap/rss/llms/structured-data/meta/canonical/preload/csp/…). This
// one renderer draws the WHOLE stack: an Infra card, a header "SSR" tab listing
// the endpoints (with live links) and the document-head modules, plus a flow node.
//
// Import this module (registration is a side effect) into the devtools web bundle.

import { html } from "@youneed/dom";
import {
  registerDevtoolsRenderer,
  emptyState,
  type View,
  type DevtoolsContext,
} from "@youneed/server-plugin-devtools/registry";

interface ModuleInfo {
  kind?: string;
  path?: string;
  [key: string]: unknown;
}
interface SsrModuleEntry {
  name: string;
  info?: ModuleInfo;
}
interface SsrInfo {
  kind: "ssr";
  origin?: string;
  pages?: number;
  modules?: SsrModuleEntry[];
}

const DOCS = "https://github.com/youneed/framework/tree/main/packages/server-plugin-ssr";

// Modules that serve their own GET route → render the path as a live link.
const ENDPOINT_KINDS = new Set(["robots", "sitemap", "rss", "llms"]);

const modulesOf = (info: unknown): SsrModuleEntry[] => (info as SsrInfo)?.modules ?? [];

/** "key: value · key: value" for everything in a module's info but kind/path. */
function detail(info: ModuleInfo | undefined): string {
  return Object.entries(info ?? {})
    .filter(([k]) => k !== "kind" && k !== "path")
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? (v.length ? v.join(", ") : "—") : String(v)}`)
    .join(" · ");
}

const splitModules = (modules: SsrModuleEntry[]) => ({
  endpoints: modules.filter((m) => m.info?.path && ENDPOINT_KINDS.has(m.info?.kind ?? "")),
  head: modules.filter((m) => !(m.info?.path && ENDPOINT_KINDS.has(m.info?.kind ?? ""))),
});

function endpointRow(m: SsrModuleEntry, ctx: DevtoolsContext): View {
  const base = ctx.server?.url?.replace(/\/+$/, "") ?? "";
  const path = m.info?.path ?? "";
  const href = base ? base + path : path;
  return html`<div class="row">
    <shad-badge variant="secondary">${m.name}</shad-badge>
    <a class="link" href=${href} target="_blank" rel="noreferrer">${path}</a>
    ${detail(m.info) ? html`<span class="muted">${detail(m.info)}</span>` : html``}
  </div>`;
}

function headRow(m: SsrModuleEntry): View {
  return html`<div class="row">
    <shad-badge variant="outline">${m.name}</shad-badge>
    ${detail(m.info) ? html`<span class="muted">${detail(m.info)}</span>` : html``}
  </div>`;
}

registerDevtoolsRenderer({
  kind: "ssr",
  label: "SSR",
  docs: DOCS,

  // Compact Infra card: origin + page count + a badge per mounted module.
  card(info): View {
    const i = info as SsrInfo;
    const modules = modulesOf(info);
    return html`
      <div class="row">
        <shad-badge variant="secondary">ssr</shad-badge>
        <span class="muted">${i.origin ?? "no origin"} · ${i.pages ?? 0} page(s) · ${modules.length} module(s)</span>
      </div>
      <div class="row" style="flex-wrap:wrap;gap:.25rem">
        ${modules.map((m) => html`<shad-badge variant="outline">${m.name}</shad-badge>`)}
      </div>
    `;
  },

  // Full "SSR" header tab: endpoints (with live links) + document-head modules.
  panel(info, ctx): View {
    const i = info as SsrInfo;
    const modules = modulesOf(info);
    if (!modules.length) return emptyState({ title: "No SSR modules", docs: DOCS });
    const { endpoints, head } = splitModules(modules);
    return html`
      <div style="padding:1rem;display:flex;flex-direction:column;gap:1rem">
        <div class="muted">origin: ${i.origin ?? "—"} · ${i.pages ?? 0} page(s)</div>
        ${endpoints.length
          ? html`<div>
              <div class="muted">endpoints</div>
              ${endpoints.map((m) => endpointRow(m, ctx))}
            </div>`
          : html``}
        ${head.length
          ? html`<div>
              <div class="muted">document &lt;head&gt; &amp; policy</div>
              ${head.map((m) => headRow(m))}
            </div>`
          : html``}
      </div>
    `;
  },

  // Flow-graph node + its detail drawer.
  flowNode(info) {
    const modules = modulesOf(info);
    return { label: `SSR\n${modules.length} module(s)`, detail: { modules } };
  },
  drawer(detailObj, ctx): View {
    const modules = (detailObj as { modules?: SsrModuleEntry[] }).modules ?? [];
    const { endpoints, head } = splitModules(modules);
    return html`
      <span slot="title">SSR stack</span>
      <span slot="description">${modules.length} module(s)</span>
      <div style="padding:1rem;display:flex;flex-direction:column;gap:.75rem">
        ${endpoints.map((m) => endpointRow(m, ctx))}
        ${head.map((m) => headRow(m))}
      </div>
    `;
  },
});
