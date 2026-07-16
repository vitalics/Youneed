// ── @youneed/server-plugin-devtools/ext — the RICH (shad + React-Flow) UI ─────
//
// The protocol ships lightweight plain-HTML built-in extensions
// (`@youneed/devtools-protocol/extensions`) as a zero-dependency default. THIS
// module re-registers the same domains with shad components + the React-Flow
// topology graph. The registry is idempotent by domain (last wins), so importing
// this AFTER the defaults (see web.ts) upgrades the UI without touching the
// protocol. Each panel still talks to its domain ONLY through the live client.

import { html } from "@youneed/dom";
import { fromReact } from "@youneed/dom-adapter-react";
import { registerExtension, type ExtensionContext, type View } from "@youneed/devtools-protocol/ui";
import { getDevtoolsRenderer, type DevtoolsContext } from "./registry.ts";
import { TopologyGraph, type RouteLite } from "./flow.tsx";

// Bridge the domain-keyed shell context to the kind-keyed renderer context a
// plugin's interactive panel expects: `request()` fetches the plugin's own HTTP
// routes (e.g. /__kv/set) on the inspected server's origin; `goto()` forwards to
// the shell router. This lets each plugin's rich `panel()` run inside the Infra tab.
function bridge(ctx: ExtensionContext): DevtoolsContext {
  const origin = ctx.target.url ? new URL(ctx.target.url).origin : "";
  return {
    goto: (hash: string) => ctx.goto(hash),
    request: (path: string, init?: RequestInit) => fetch(origin + path, init),
  };
}

const badge = (text: unknown, variant = "secondary"): View => html`<shad-badge variant=${variant}>${text}</shad-badge>`;
const refresh = (ctx: ExtensionContext): View => html`<shad-button size="sm" variant="outline" @click=${() => ctx.refresh()}>refresh</shad-button>`;
const head = (...cols: string[]): View =>
  html`<shad-table-header><shad-table-row>${cols.map((c) => html`<shad-table-head>${c}</shad-table-head>`)}</shad-table-row></shad-table-header>`;

// ── Topology — shad card + React-Flow graph + routes table + audit ────────────
registerExtension({
  domain: "Topology",
  label: "Topology",
  order: 10,
  async panel(ctx: ExtensionContext): Promise<View> {
    const info = await ctx.client.command<{ name: string; routes: RouteLite[] }>("Topology.get");
    const grade = await ctx.client.command<string>("Topology.grade").catch(() => "?");
    const findings = await ctx.client
      .command<Array<{ severity: string; rule: string; route?: string; message: string }>>("Topology.audit")
      .catch(() => []);
    const gradeVariant = grade === "error" ? "destructive" : grade === "warning" ? "secondary" : "default";
    const graph = fromReact(TopologyGraph, { name: info.name, routes: info.routes });
    return html`
      <shad-card style="display:block;padding:1rem">
        <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin-bottom:.75rem">
          <strong>${info.name}</strong> ${badge(`audit: ${grade}`, gradeVariant)}
          <span style="opacity:.6;font-size:.85rem">${findings.length} finding${findings.length === 1 ? "" : "s"}</span>
          ${refresh(ctx)}
        </div>
        ${graph}
        <shad-separator style="margin:.75rem 0"></shad-separator>
        <shad-table>
          ${head("Method", "Path", "Controller")}
          <shad-table-body>
            ${info.routes.map(
              (r) => html`<shad-table-row>
                <shad-table-cell><code>${r.method}</code></shad-table-cell>
                <shad-table-cell><code>${r.path}</code></shad-table-cell>
                <shad-table-cell style="opacity:.6">${r.controller ?? "—"}</shad-table-cell>
              </shad-table-row>`,
            )}
          </shad-table-body>
        </shad-table>
        ${findings.length
          ? html`<details style="margin-top:.75rem"><summary style="cursor:pointer;opacity:.7">security findings</summary>
              ${findings.map(
                (f) => html`<div style="font-size:.8rem;padding:2px 0">
                  ${badge(f.severity, f.severity === "error" ? "destructive" : "secondary")}
                  <code>${f.rule}</code> <span style="opacity:.6">${f.route ?? ""}</span>
                </div>`,
              )}
            </details>`
          : html``}
      </shad-card>
    `;
  },
});

// ── Network — shad table of recent requests ───────────────────────────────────
registerExtension({
  domain: "Network",
  label: "Network",
  order: 15,
  async panel(ctx: ExtensionContext): Promise<View> {
    const recent = await ctx.client.command<Array<{ method: string; path: string; status: number; ms: number }>>("Network.getRecent");
    return html`
      <shad-card style="display:block;padding:1rem">
        <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.5rem">${badge(`${recent.length} requests`)} ${refresh(ctx)}</div>
        <shad-table>
          ${head("Method", "Path", "Status", "ms")}
          <shad-table-body>
            ${recent
              .slice()
              .reverse()
              .map(
                (e) => html`<shad-table-row>
                  <shad-table-cell><code>${e.method}</code></shad-table-cell>
                  <shad-table-cell><code>${e.path}</code></shad-table-cell>
                  <shad-table-cell>${badge(e.status, e.status >= 400 ? "destructive" : "secondary")}</shad-table-cell>
                  <shad-table-cell style="text-align:right">${e.ms}</shad-table-cell>
                </shad-table-row>`,
              )}
          </shad-table-body>
        </shad-table>
      </shad-card>
    `;
  },
});

// ── Log — shad card stream ────────────────────────────────────────────────────
registerExtension({
  domain: "Log",
  label: "Log",
  order: 16,
  async panel(ctx: ExtensionContext): Promise<View> {
    const recent = await ctx.client.command<Array<{ level: string; message: string }>>("Log.getRecent");
    return html`
      <shad-card style="display:block;padding:1rem">
        <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.5rem">${badge(`${recent.length} entries`)} ${refresh(ctx)}</div>
        ${recent
          .slice()
          .reverse()
          .map((e) => html`<div style="font-family:ui-monospace,monospace;font-size:.8rem;padding:1px 0">${badge(e.level, "outline")} ${e.message}</div>`)}
      </shad-card>
    `;
  },
});

// ── Components — shad card tree ───────────────────────────────────────────────
registerExtension({
  domain: "Components",
  label: "Components",
  order: 20,
  async panel(ctx: ExtensionContext): Promise<View> {
    const tree = await ctx.client.command<Array<{ id: number; tag: string; alive: boolean; parentId?: number }>>("Components.getTree");
    return html`
      <shad-card style="display:block;padding:1rem">
        <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.5rem">${badge(`${tree.length} components`)} ${refresh(ctx)}</div>
        ${tree.map(
          (c) => html`<div style="font-family:ui-monospace,monospace;font-size:.85rem;padding:1px 0;opacity:${c.alive ? "1" : ".5"}">
            #${c.id} &lt;${c.tag}&gt;${c.parentId !== undefined ? html`<span style="opacity:.5"> ◂ #${c.parentId}</span>` : html``}
          </div>`,
        )}
      </shad-card>
    `;
  },
});

// ── SSR — shad card ───────────────────────────────────────────────────────────
registerExtension({
  domain: "SSR",
  label: "SSR",
  order: 30,
  async panel(ctx: ExtensionContext): Promise<View> {
    const info = await ctx.client.command<{ origin?: string; pages: number; modules: Array<{ name: string }> }>("SSR.get");
    return html`
      <shad-card style="display:block;padding:1rem">
        <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.5rem">${badge(`${info.pages} pages`)} <span style="opacity:.6">${info.origin ?? ""}</span></div>
        ${info.modules.map((m) => html`<div>${badge(m.name, "outline")}</div>`)}
      </shad-card>
    `;
  },
});

// ── Infra — mounted plugins (jobs / pub-sub / ORM / …) via inspect() ──────────
interface PluginEntry {
  name: string;
  info?: { kind?: string; [k: string]: unknown };
}

// Plain rows (no shad-table — it slots unreliably in this nested shadow context).
const line = (...cells: unknown[]): View =>
  html`<div style="display:flex;gap:1rem;font-size:.85rem;padding:2px 0">${cells.map((c) => html`<span>${c}</span>`)}</div>`;

function renderPlugin(p: PluginEntry): View {
  const info = p.info ?? {};
  const kind = info.kind ?? p.name;
  let body: View;
  if (kind === "jobs") {
    const jobs = (info.jobs as Array<{ name: string; nextRun?: unknown; running?: unknown }>) ?? [];
    body = jobs.length
      ? html`${jobs.map((j) => html`<div style="display:flex;gap:.5rem;align-items:center;font-size:.85rem;padding:2px 0"><code>${j.name}</code><span style="opacity:.6">next: ${String(j.nextRun ?? "—")}</span>${badge(j.running ? "running" : "idle", j.running ? "default" : "outline")}</div>`)}`
      : html`<span style="opacity:.6">no jobs</span>`;
  } else if (kind === "pubsub") {
    const channels = (info.channels as Array<{ channel: string; subscribers?: number; published?: number; delivered?: number }>) ?? [];
    body = html`<div style="opacity:.7;font-size:.85rem;margin-bottom:.25rem">backend: ${String(info.backend ?? "—")}</div>
      ${channels.length
        ? channels.map(
            (c) => html`<div style="display:flex;gap:1rem;font-size:.85rem;padding:2px 0"><code>${c.channel}</code><span style="opacity:.6">${c.subscribers ?? 0} subs · ${c.published ?? 0}↑ ${c.delivered ?? 0}↓</span></div>`,
          )
        : html`<span style="opacity:.6">no channels</span>`}`;
  } else if (kind === "kv") {
    const s = (info.stats as { gets?: number; sets?: number; deletes?: number; incrs?: number; hits?: number; misses?: number }) ?? {};
    const reads = (s.hits ?? 0) + (s.misses ?? 0);
    const rate = reads ? `${Math.round(((s.hits ?? 0) / reads) * 100)}%` : "—";
    body = html`<div style="opacity:.7;font-size:.85rem;margin-bottom:.25rem">backend: ${String(info.backend ?? "—")}</div>
      ${line(`${s.gets ?? 0} get`, `${s.sets ?? 0} set`, `${s.deletes ?? 0} del`, `${s.incrs ?? 0} incr`, `hit-rate ${rate}`)}`;
  } else if (kind === "orm-sql" || kind === "orm") {
    const tables = (info.tables as Array<{ name: string; columns?: unknown[] }>) ?? [];
    body = html`${tables.map((t) => line(html`<code>${t.name}</code>`, `${t.columns?.length ?? 0} columns`))}`;
  } else {
    body = html`<pre style="font-size:.75rem;overflow:auto;margin:0">${JSON.stringify(info, null, 2)}</pre>`;
  }
  return html`<shad-card style="display:block;padding:1rem">
    <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.5rem"><strong>${p.name}</strong> ${badge(kind)}</div>
    ${body}
  </shad-card>`;
}

registerExtension({
  domain: "Infra",
  label: "Infra",
  order: 50,
  async panel(ctx: ExtensionContext): Promise<View> {
    // Only plugins that expose inspect() info are worth a card.
    const plugins = (await ctx.client.command<PluginEntry[]>("Infra.get")).filter((p) => p.info);
    const dctx = bridge(ctx);
    // Prefer a plugin's OWN interactive panel (registry renderer, keyed by
    // inspect().kind — ORM studio, Pub/Sub sender, KV browser). Fall back to the
    // static read-only card when no renderer is registered for the kind.
    const render = (p: PluginEntry): View => {
      const kind = p.info?.kind ?? p.name;
      const renderer = getDevtoolsRenderer(kind);
      if (renderer?.panel) {
        return html`<div>
          <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.5rem"><strong>${p.name}</strong> ${badge(kind)}</div>
          ${renderer.panel(p.info, dctx)}
        </div>`;
      }
      return renderPlugin(p);
    };
    return html`<div style="display:grid;gap:.75rem">
      <div style="display:flex;gap:.5rem;align-items:center">${badge(`${plugins.length} plugin${plugins.length === 1 ? "" : "s"}`)} ${refresh(ctx)}</div>
      ${plugins.length ? plugins.map((p) => render(p)) : html`<span style="opacity:.6">no plugins mounted</span>`}
    </div>`;
  },
});

// ── CLI — shad card ───────────────────────────────────────────────────────────
registerExtension({
  domain: "CLI",
  label: "CLI",
  order: 40,
  async panel(ctx: ExtensionContext): Promise<View> {
    const cat = await ctx.client.command<{ name: string; version?: string; commands: Array<{ name: string; description?: string }> }>("CLI.getCatalog");
    return html`
      <shad-card style="display:block;padding:1rem">
        <div style="margin-bottom:.5rem">${badge(`${cat.name} ${cat.version ?? ""}`)}</div>
        <shad-table>
          ${head("Command", "Description")}
          <shad-table-body>
            ${cat.commands.map(
              (c) => html`<shad-table-row><shad-table-cell><code>${c.name}</code></shad-table-cell><shad-table-cell style="opacity:.6">${c.description ?? ""}</shad-table-cell></shad-table-row>`,
            )}
          </shad-table-body>
        </shad-table>
      </shad-card>
    `;
  },
});

// ── API docs — INTERACTIVE OpenAPI + AsyncAPI (à la Swagger UI / AsyncAPI Studio) ──
// The panel (./apidocs.ts) renders explorable operations with "Try it out" and a
// live ws/sse console; it also keeps a raw-JSON view + copy/download. Fetches both
// documents from the `ApiDocs` domain and hands the panel the live server origin
// (for Try-it-out + the console).
import "./apidocs.ts"; // defines <server-apidocs-panel>
type ApiDoc = Record<string, unknown>;

registerExtension({
  domain: "ApiDocs",
  label: "API",
  order: 12,
  async panel(ctx: ExtensionContext): Promise<View> {
    const [openapi, asyncapi] = await Promise.all([
      ctx.client.command<ApiDoc>("ApiDocs.openapi", {}).catch(() => null),
      ctx.client.command<ApiDoc>("ApiDocs.asyncapi", {}).catch(() => null),
    ]);
    const base = ctx.target.url ? new URL(ctx.target.url).origin : "";
    return html`<server-apidocs-panel .data=${{ openapi, asyncapi, base }}></server-apidocs-panel>`;
  },
});
