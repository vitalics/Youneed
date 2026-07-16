// @youneed/devtools-protocol/extensions — built-in UI extensions for the
// standard domains (Topology, Components, SSR, CLI). Importing this module
// registers them (side effect). They are GENERIC: each talks to its domain only
// through the live `client`, never importing the surface package — so the same
// panel renders a server, a page, an SSR renderer or a CLI. Custom surfaces ship
// their own `registerExtension(...)`; these are the defaults.

import { html } from "@youneed/dom";
import { registerExtension, type ExtensionContext, type View } from "./ui.ts";

const row = (label: unknown, value: unknown): View => html`<div style="display:flex;gap:.5rem;padding:2px 0"><span style="font-weight:600">${label}</span><span style="opacity:.7">${value}</span></div>`;

// ── Topology (server) ─────────────────────────────────────────────────────────
registerExtension({
  domain: "Topology",
  label: "Topology",
  order: 10,
  async panel(ctx: ExtensionContext): Promise<View> {
    const info = await ctx.client.command<{ name: string; routes: Array<{ method: string; path: string; controller?: string }> }>("Topology.get");
    const grade = await ctx.client.command<string>("Topology.grade").catch(() => "?");
    const findings = await ctx.client
      .command<Array<{ severity: string; rule: string; route?: string; message: string }>>("Topology.audit")
      .catch(() => []);
    const gradeColor = grade === "error" ? "#c33" : grade === "warning" ? "#c80" : "#2a2";
    return html`
      <div>
        ${row("server", info.name)}
        <div style="display:flex;gap:.5rem;padding:2px 0"><span style="font-weight:600">audit</span><span style="color:${gradeColor};font-weight:600">${grade}</span><span style="opacity:.6">(${findings.length} finding${findings.length === 1 ? "" : "s"})</span></div>
        ${findings.length
          ? html`<details style="margin:.25rem 0"><summary style="cursor:pointer;opacity:.7">security findings</summary>
              ${findings.map(
                (f) => html`<div style="font-size:.8rem;padding:1px 0"><span style="color:${f.severity === "error" ? "#c33" : f.severity === "warning" ? "#c80" : "#888"}">${f.severity}</span> <span style="font-family:monospace">${f.rule}</span> <span style="opacity:.6">${f.route ?? ""}</span></div>`,
              )}
            </details>`
          : html``}
        <table style="width:100%;border-collapse:collapse;font-size:.85rem;margin-top:.5rem">
          <tr><th style="text-align:left">Method</th><th style="text-align:left">Path</th><th style="text-align:left">Controller</th></tr>
          ${info.routes.map(
            (r) => html`<tr><td style="font-family:monospace">${r.method}</td><td style="font-family:monospace">${r.path}</td><td style="opacity:.6">${r.controller ?? "—"}</td></tr>`,
          )}
        </table>
      </div>
    `;
  },
});

// ── Components (frontend) ─────────────────────────────────────────────────────
registerExtension({
  domain: "Components",
  label: "Components",
  order: 20,
  async panel(ctx: ExtensionContext): Promise<View> {
    const tree = await ctx.client.command<Array<{ id: number; tag: string; alive: boolean; parentId?: number }>>("Components.getTree");
    return html`
      <div>
        <button @click=${() => ctx.refresh()} style="margin-bottom:.5rem">refresh</button>
        ${row("components", tree.length)}
        ${tree.map(
          (c) => html`<div style="font-family:monospace;padding:1px 0;opacity:${c.alive ? "1" : ".5"}">
            #${c.id} &lt;${c.tag}&gt;${c.parentId !== undefined ? html`<span style="opacity:.5"> ◂ #${c.parentId}</span>` : html``}
          </div>`,
        )}
      </div>
    `;
  },
});

// ── SSR ───────────────────────────────────────────────────────────────────────
registerExtension({
  domain: "SSR",
  label: "SSR",
  order: 30,
  async panel(ctx: ExtensionContext): Promise<View> {
    const info = await ctx.client.command<{ origin?: string; pages: number; modules: Array<{ name: string }> }>("SSR.get");
    return html`
      <div>
        ${row("origin", info.origin ?? "—")} ${row("pages", info.pages)}
        <div style="margin-top:.5rem;font-weight:600">modules</div>
        ${info.modules.map((m) => html`<div style="font-family:monospace">${m.name}</div>`)}
      </div>
    `;
  },
});

// ── Network (server) — live request waterfall ─────────────────────────────────
registerExtension({
  domain: "Network",
  label: "Network",
  order: 15,
  async panel(ctx: ExtensionContext): Promise<View> {
    const recent = await ctx.client.command<Array<{ method: string; path: string; status: number; ms: number }>>("Network.getRecent");
    return html`
      <div>
        <button @click=${() => ctx.refresh()} style="margin-bottom:.5rem">refresh</button>
        ${row("requests", recent.length)}
        <table style="width:100%;border-collapse:collapse;font-size:.85rem;margin-top:.5rem">
          <tr><th style="text-align:left">Method</th><th style="text-align:left">Path</th><th>Status</th><th>ms</th></tr>
          ${recent
            .slice()
            .reverse()
            .map(
              (e) => html`<tr><td style="font-family:monospace">${e.method}</td><td style="font-family:monospace">${e.path}</td><td style="text-align:center;color:${e.status >= 400 ? "#c33" : "inherit"}">${e.status}</td><td style="text-align:right">${e.ms}</td></tr>`,
            )}
        </table>
      </div>
    `;
  },
});

// ── Log (server) — live log stream ────────────────────────────────────────────
registerExtension({
  domain: "Log",
  label: "Log",
  order: 16,
  async panel(ctx: ExtensionContext): Promise<View> {
    const recent = await ctx.client.command<Array<{ level: string; message: string; ts: number }>>("Log.getRecent");
    return html`
      <div>
        <button @click=${() => ctx.refresh()} style="margin-bottom:.5rem">refresh</button>
        ${row("entries", recent.length)}
        ${recent
          .slice()
          .reverse()
          .map((e) => html`<div style="font-family:monospace;font-size:.8rem"><span style="opacity:.5">${e.level}</span> ${e.message}</div>`)}
      </div>
    `;
  },
});

// ── Infra (server) — mounted plugins via inspect() ────────────────────────────
registerExtension({
  domain: "Infra",
  label: "Infra",
  order: 50,
  async panel(ctx: ExtensionContext): Promise<View> {
    const plugins = await ctx.client.command<Array<{ name: string; info?: { kind?: string } }>>("Infra.get");
    return html`
      <div>
        <button @click=${() => ctx.refresh()} style="margin-bottom:.5rem">refresh</button>
        ${row("plugins", plugins.length)}
        ${plugins.map(
          (p) => html`<div style="padding:2px 0"><span style="font-weight:600">${p.name}</span> <span class="muted">${p.info?.kind ?? ""}</span></div>`,
        )}
      </div>
    `;
  },
});

// ── CLI ───────────────────────────────────────────────────────────────────────
registerExtension({
  domain: "CLI",
  label: "CLI",
  order: 40,
  async panel(ctx: ExtensionContext): Promise<View> {
    const cat = await ctx.client.command<{ name: string; version?: string; commands: Array<{ name: string; description?: string }> }>("CLI.getCatalog");
    return html`
      <div>
        ${row("app", `${cat.name} ${cat.version ?? ""}`)}
        <div style="margin-top:.5rem;font-weight:600">commands</div>
        ${cat.commands.map((c) => html`<div><span style="font-family:monospace">${c.name}</span> <span style="opacity:.6">${c.description ?? ""}</span></div>`)}
      </div>
    `;
  },
});
