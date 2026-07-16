// ── @youneed/server-plugin-devtools/apidocs — interactive API documentation ───
//
// Renders the generated OpenAPI + AsyncAPI documents as INTERACTIVE docs (à la
// Swagger UI / AsyncAPI Studio), not just raw JSON:
//   • OpenAPI  — operations grouped by tag, expandable; parameters, request body
//     and response schemas rendered; a "Try it out" form sends a real request to
//     the inspected server (path/query params, Authorization, JSON body).
//   • AsyncAPI — channels with publish/subscribe message payloads; a live console
//     for `ws` channels (connect, send, see incoming) and `sse` channels (listen).
//   • a raw-JSON view + copy/download for each document.
//
// Pure UI over the docs the `ApiDocs` domain serves; the live server origin
// (`base`) is used for Try-it-out + the WS/SSE console. Defined as a component so
// the extension panel can hand it the fetched docs.
import { Component, html, css, repeat } from "@youneed/dom";

type View = ReturnType<typeof html>;
type Json = Record<string, unknown>;

interface ApiDoc {
  openapi?: string;
  asyncapi?: string;
  info?: { title?: string; version?: string };
  paths?: Record<string, Record<string, Json>>;
  channels?: Record<string, Json>;
  [k: string]: unknown;
}

const METHOD_COLOR: Record<string, string> = {
  get: "#3b82f6",
  post: "#22c55e",
  put: "#f59e0b",
  patch: "#14b8a6",
  delete: "#ef4444",
  ws: "#8b5cf6",
  sse: "#ec4899",
};
const methodColor = (m: string): string => METHOD_COLOR[m.toLowerCase()] ?? "#6b7280";
const HAS_BODY = new Set(["post", "put", "patch"]);

// ── JSON-schema renderer (our generator inlines schemas — no $ref to resolve) ──
function renderSchema(schema: Json | undefined, depth = 0): View {
  if (!schema || typeof schema !== "object") return html`<span class="t">any</span>`;
  const type = schema.type as string | undefined;
  if (schema.enum) return html`<span class="t">enum</span> <span class="muted">${(schema.enum as unknown[]).map((e) => JSON.stringify(e)).join(" | ")}</span>`;
  if (type === "array") {
    return html`<span class="t">array</span> <span class="muted">of</span> ${renderSchema(schema.items as Json, depth)}`;
  }
  if (type === "object" || schema.properties) {
    const props = (schema.properties as Record<string, Json>) ?? {};
    const required = new Set((schema.required as string[]) ?? []);
    const keys = Object.keys(props);
    if (!keys.length) return html`<span class="t">object</span>`;
    return html`<div class="schema" style="margin-left:${depth ? "0.9rem" : "0"}">
      ${keys.map(
        (k) => html`<div class="field">
          <span class="key">${k}</span>${required.has(k) ? html`<span class="req">*</span>` : html``}
          <span class="muted">: ${renderSchema(props[k], depth + 1)}</span>
        </div>`,
      )}
    </div>`;
  }
  return html`<span class="t">${type ?? "any"}</span>${schema.format ? html` <span class="muted">(${schema.format})</span>` : html``}`;
}

interface OperationRow {
  key: string;
  path: string;
  method: string;
  op: Json;
  tag: string;
}

function flattenOperations(doc: ApiDoc): OperationRow[] {
  const rows: OperationRow[] = [];
  const paths = doc.paths ?? {};
  for (const path of Object.keys(paths)) {
    const byMethod = paths[path];
    for (const method of Object.keys(byMethod)) {
      const op = byMethod[method];
      const tag = (Array.isArray(op.tags) && op.tags[0]) || "default";
      rows.push({ key: `${method} ${path}`, path, method, op, tag: String(tag) });
    }
  }
  return rows;
}

interface WsState {
  ws?: WebSocket;
  es?: EventSource;
  status: "idle" | "connecting" | "open" | "closed";
  log: Array<{ dir: "→" | "←" | "•"; text: string }>;
}

@Component.define()
export class ApiDocsPanel extends Component("server-apidocs-panel") {
  static styles = css`
    :host { display: block; }
    .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin-bottom: 0.5rem; }
    .spacer { flex: 1; }
    .muted { color: hsl(var(--muted-foreground)); font-size: 0.85rem; }
    .t { color: hsl(var(--primary)); font-family: ui-monospace, monospace; font-size: 0.8rem; }
    pre { margin: 0; max-height: 70vh; overflow: auto; padding: 0.85rem; border: 1px solid hsl(var(--border)); border-radius: var(--radius); background: hsl(var(--muted) / 0.35); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8rem; line-height: 1.45; white-space: pre; }

    .group-title { font-weight: 600; margin: 1rem 0 0.35rem; font-size: 0.9rem; }
    .op { border: 1px solid hsl(var(--border)); border-radius: var(--radius); margin-bottom: 0.4rem; overflow: hidden; }
    .op-head { display: flex; align-items: center; gap: 0.6rem; padding: 0.45rem 0.6rem; cursor: pointer; }
    .op-head:hover { background: hsl(var(--accent)); }
    .verb { color: #fff; font-weight: 700; font-size: 0.72rem; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; min-width: 3.6rem; text-align: center; }
    .op-path { font-family: ui-monospace, monospace; font-size: 0.85rem; }
    .op-sum { color: hsl(var(--muted-foreground)); font-size: 0.82rem; }
    .op-body { padding: 0.6rem 0.8rem; border-top: 1px solid hsl(var(--border)); background: hsl(var(--muted) / 0.2); }
    h4 { margin: 0.6rem 0 0.3rem; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.03em; color: hsl(var(--muted-foreground)); }
    .schema { font-size: 0.82rem; }
    .field { padding: 1px 0; }
    .key { font-family: ui-monospace, monospace; font-weight: 600; }
    .req { color: hsl(var(--destructive)); margin-left: 1px; }
    .params { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    .params th, .params td { text-align: left; padding: 3px 8px; border-bottom: 1px solid hsl(var(--border)); }
    .try { display: grid; gap: 0.4rem; margin-top: 0.4rem; }
    .try label { font-size: 0.78rem; display: grid; gap: 2px; }
    input, textarea { font: inherit; font-size: 0.82rem; padding: 0.25rem 0.4rem; border: 1px solid hsl(var(--border)); border-radius: calc(var(--radius) - 2px); background: hsl(var(--background)); color: inherit; box-sizing: border-box; width: 100%; }
    textarea { font-family: ui-monospace, monospace; min-height: 4rem; resize: vertical; }
    .resp-meta { font-family: ui-monospace, monospace; font-size: 0.8rem; margin: 0.4rem 0 0.2rem; }
    .console-log { font-family: ui-monospace, monospace; font-size: 0.78rem; max-height: 12rem; overflow: auto; border: 1px solid hsl(var(--border)); border-radius: calc(var(--radius) - 2px); padding: 0.4rem; background: hsl(var(--background)); }
    .console-log div { padding: 1px 0; }
    .dir { color: hsl(var(--muted-foreground)); margin-right: 0.4rem; }
  `;

  // One grouped object prop (camelCase single-prop binding is unreliable in html``).
  @Component.prop() data: { openapi: ApiDoc | null; asyncapi: ApiDoc | null; base: string } | null = null;

  #which = this.signal<"openapi" | "asyncapi">("openapi");
  #view = this.signal<"docs" | "json">("docs");
  #expanded = this.signal<Set<string>>(new Set());
  #copied = this.signal(false);
  // Try-it-out results, keyed by operation key. Inputs live in #draft (plain
  // object) so typing doesn't re-render and uncontrolled fields keep focus.
  #results = this.signal<Record<string, { status: number; statusText: string; ms: number; body: string } | "sending">>({});
  #draft: Record<string, string> = {};
  // Live ws/sse consoles, keyed by channel path.
  #ws = this.signal<Record<string, WsState>>({});

  // ── shared doc helpers ────────────────────────────────────────────────────────
  #doc(): ApiDoc | null {
    const d = this.data;
    if (!d) return null;
    return this.#which() === "openapi" ? d.openapi : d.asyncapi;
  }
  #json(): string {
    return JSON.stringify(this.#doc() ?? {}, null, 2);
  }
  async #copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.#json());
      this.#copied.set(true);
      setTimeout(() => this.#copied.set(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }
  #download(): void {
    const blob = new Blob([this.#json()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: this.#which() === "openapi" ? "openapi.json" : "asyncapi.json" });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  #toggle(key: string): void {
    const s = new Set(this.#expanded());
    s.has(key) ? s.delete(key) : s.add(key);
    this.#expanded.set(s);
  }

  // ── OpenAPI: Try it out ───────────────────────────────────────────────────────
  #set(field: string, value: string): void {
    this.#draft[field] = value;
  }

  async #send(row: OperationRow): Promise<void> {
    const base = this.data?.base ?? "";
    const op = row.op;
    let path = row.path;
    const params = (op.parameters as Array<{ name: string; in: string }>) ?? [];
    const qs = new URLSearchParams();
    for (const p of params) {
      const v = this.#draft[`${row.key}:${p.in}:${p.name}`] ?? "";
      if (p.in === "path") path = path.replace(`{${p.name}}`, encodeURIComponent(v));
      else if (p.in === "query" && v !== "") qs.set(p.name, v);
    }
    const headers: Record<string, string> = {};
    const auth = this.#draft[`${row.key}:auth`];
    if (auth) headers.authorization = auth;
    const hasBody = HAS_BODY.has(row.method) && !!op.requestBody;
    const bodyText = this.#draft[`${row.key}:body`] ?? "";
    if (hasBody) headers["content-type"] = "application/json";

    this.#results.set({ ...this.#results(), [row.key]: "sending" });
    const t0 = performance.now();
    try {
      const res = await fetch(base + path + (qs.toString() ? `?${qs}` : ""), {
        method: row.method.toUpperCase(),
        headers,
        body: hasBody && bodyText ? bodyText : undefined,
      });
      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* not JSON */
      }
      this.#results.set({ ...this.#results(), [row.key]: { status: res.status, statusText: res.statusText, ms: performance.now() - t0, body: pretty } });
    } catch (e) {
      this.#results.set({ ...this.#results(), [row.key]: { status: 0, statusText: e instanceof Error ? e.message : "network error", ms: performance.now() - t0, body: "" } });
    }
  }

  #renderTry(row: OperationRow): View {
    const op = row.op;
    const params = (op.parameters as Array<{ name: string; in: string; required?: boolean; schema?: Json }>) ?? [];
    const hasBody = HAS_BODY.has(row.method) && !!op.requestBody;
    const bodySchema = hasBody ? ((op.requestBody as Json).content as Json)?.["application/json"] as Json | undefined : undefined;
    const result = this.#results()[row.key];
    return html`
      <h4>Try it out</h4>
      <div class="try">
        ${params.map(
          (p) => html`<label>${p.name} <span class="muted">(${p.in}${p.required ? ", required" : ""})</span>
            <input placeholder=${p.name} value=${this.#draft[`${row.key}:${p.in}:${p.name}`] ?? ""} @input=${(e: Event) => this.#set(`${row.key}:${p.in}:${p.name}`, (e.target as HTMLInputElement).value)} /></label>`,
        )}
        <label>Authorization <span class="muted">(header, optional)</span>
          <input placeholder="Bearer …" value=${this.#draft[`${row.key}:auth`] ?? ""} @input=${(e: Event) => this.#set(`${row.key}:auth`, (e.target as HTMLInputElement).value)} /></label>
        ${hasBody
          ? html`<label>Body <span class="muted">(JSON)</span>
              <textarea placeholder=${"{ }"} @input=${(e: Event) => this.#set(`${row.key}:body`, (e.target as HTMLTextAreaElement).value)}>${this.#draft[`${row.key}:body`] ?? schemaExample((bodySchema?.schema as Json) ?? {})}</textarea></label>`
          : html``}
        <div><shad-button size="sm" @click=${() => this.#send(row)} ?disabled=${result === "sending"}>${result === "sending" ? "sending…" : "Execute"}</shad-button></div>
      </div>
      ${result && result !== "sending"
        ? html`<div class="resp-meta"><shad-badge variant=${result.status && result.status < 400 ? "secondary" : "destructive"}>${result.status || "ERR"} ${result.statusText}</shad-badge> <span class="muted">${result.ms.toFixed(0)}ms</span></div>
            ${result.body ? html`<pre>${result.body}</pre>` : html``}`
        : html``}
    `;
  }

  #renderOpenApi(doc: ApiDoc): View {
    const rows = flattenOperations(doc);
    const byTag = new Map<string, OperationRow[]>();
    for (const r of rows) (byTag.get(r.tag) ?? byTag.set(r.tag, []).get(r.tag)!).push(r);
    const expanded = this.#expanded();
    return html`${repeat(
      [...byTag.keys()],
      (tag) => tag,
      (tag) => html`
        <div class="group-title">${tag}</div>
        ${repeat(
          byTag.get(tag)!,
          (r) => r.key,
          (r) => {
            const guards = (r.op["x-guards"] as string[]) ?? [];
            const responses = (r.op.responses as Record<string, Json>) ?? {};
            const reqSchema = ((r.op.requestBody as Json)?.content as Json)?.["application/json"] as Json | undefined;
            const isOpen = expanded.has(r.key);
            return html`<div class="op">
              <div class="op-head" @click=${() => this.#toggle(r.key)}>
                <span class="verb" style="background:${methodColor(r.method)}">${r.method}</span>
                <span class="op-path">${r.path}</span>
                <span class="op-sum">${(r.op.summary as string) ?? ""}</span>
                <span class="spacer"></span>
                ${guards.length ? html`<shad-badge variant="outline" title="guards">🔒 ${guards.join(", ")}</shad-badge>` : html``}
                <span class="muted">${isOpen ? "▼" : "▸"}</span>
              </div>
              ${isOpen
                ? html`<div class="op-body">
                    ${r.op.description ? html`<div class="muted">${r.op.description}</div>` : html``}
                    ${(r.op.parameters as unknown[])?.length
                      ? html`<h4>Parameters</h4>
                          <table class="params"><tr><th>Name</th><th>In</th><th>Required</th><th>Type</th></tr>
                            ${(r.op.parameters as Array<{ name: string; in: string; required?: boolean; schema?: Json }>).map(
                              (p) => html`<tr><td class="key">${p.name}</td><td>${p.in}</td><td>${p.required ? "yes" : "no"}</td><td>${renderSchema(p.schema)}</td></tr>`,
                            )}
                          </table>`
                      : html``}
                    ${reqSchema ? html`<h4>Request body</h4>${renderSchema(reqSchema.schema as Json)}` : html``}
                    <h4>Responses</h4>
                    ${Object.keys(responses).map((status) => {
                      const r2 = responses[status];
                      const sch = ((r2.content as Json)?.["application/json"] as Json)?.schema as Json | undefined;
                      return html`<div class="field"><shad-badge variant=${status.startsWith("2") ? "secondary" : "outline"}>${status}</shad-badge> <span class="muted">${(r2.description as string) ?? ""}</span>${sch ? renderSchema(sch, 1) : html``}</div>`;
                    })}
                    ${this.#renderTry(r)}
                  </div>`
                : html``}
            </div>`;
          },
        )}
      `,
    )}`;
  }

  // ── AsyncAPI: channel browser + live console ──────────────────────────────────
  #wsState(channel: string): WsState {
    return this.#ws()[channel] ?? { status: "idle", log: [] };
  }
  #patchWs(channel: string, patch: Partial<WsState>): void {
    const cur = this.#wsState(channel);
    this.#ws.set({ ...this.#ws(), [channel]: { ...cur, ...patch } });
  }
  #pushLog(channel: string, dir: "→" | "←" | "•", text: string): void {
    const cur = this.#wsState(channel);
    this.#patchWs(channel, { log: [...cur.log.slice(-99), { dir, text }] });
  }

  #connectWs(channel: string): void {
    const base = this.data?.base ?? "";
    const url = base.replace(/^http/, "ws") + channel;
    this.#patchWs(channel, { status: "connecting", log: [{ dir: "•", text: `connecting ${url}` }] });
    try {
      const ws = new WebSocket(url);
      ws.onopen = () => this.#patchWs(channel, { ws, status: "open" }), this.#pushLog(channel, "•", "open");
      ws.onmessage = (e) => this.#pushLog(channel, "←", String(e.data));
      ws.onclose = () => this.#patchWs(channel, { status: "closed", ws: undefined });
      ws.onerror = () => this.#pushLog(channel, "•", "error");
      this.#patchWs(channel, { ws });
    } catch (e) {
      this.#pushLog(channel, "•", e instanceof Error ? e.message : "failed");
    }
  }
  #connectSse(channel: string): void {
    const base = this.data?.base ?? "";
    this.#patchWs(channel, { status: "connecting", log: [{ dir: "•", text: `listening ${channel}` }] });
    const es = new EventSource(base + channel);
    es.onopen = () => this.#patchWs(channel, { es, status: "open" });
    es.onmessage = (e) => this.#pushLog(channel, "←", String(e.data));
    es.onerror = () => (this.#patchWs(channel, { status: "closed" }), es.close());
    this.#patchWs(channel, { es });
  }
  #disconnect(channel: string): void {
    const s = this.#wsState(channel);
    s.ws?.close();
    s.es?.close();
    this.#patchWs(channel, { status: "closed", ws: undefined, es: undefined });
  }
  #sendWs(channel: string): void {
    const s = this.#wsState(channel);
    const text = this.#draft[`ws:${channel}`] ?? "";
    if (s.ws && s.status === "open" && text) {
      s.ws.send(text);
      this.#pushLog(channel, "→", text);
    }
  }

  #renderAsyncApi(doc: ApiDoc): View {
    const channels = doc.channels ?? {};
    const keys = Object.keys(channels);
    if (!keys.length) return html`<span class="muted">no channels (no WebSocket / SSE routes)</span>`;
    const expanded = this.#expanded();
    return html`${repeat(
      keys,
      (k) => k,
      (path) => {
        const ch = channels[path] as Json;
        const bindings = (ch.bindings as Json) ?? {};
        const kind = bindings.ws ? "ws" : bindings.sse ? "sse" : "channel";
        const pub = (ch.publish as Json)?.message as Json | undefined;
        const sub = (ch.subscribe as Json)?.message as Json | undefined;
        const isOpen = expanded.has(path);
        const ws = this.#wsState(path);
        return html`<div class="op">
          <div class="op-head" @click=${() => this.#toggle(path)}>
            <span class="verb" style="background:${methodColor(kind)}">${kind}</span>
            <span class="op-path">${path}</span>
            <span class="op-sum">${(ch.description as string) ?? ""}</span>
            <span class="spacer"></span>
            <span class="muted">${isOpen ? "▼" : "▸"}</span>
          </div>
          ${isOpen
            ? html`<div class="op-body">
                ${sub ? html`<h4>Subscribe — server → client</h4>${renderSchema((sub.payload as Json) ?? {})}` : html``}
                ${pub ? html`<h4>Publish — client → server</h4>${renderSchema((pub.payload as Json) ?? {})}` : html``}
                <h4>Live console</h4>
                <div class="row">
                  ${ws.status === "open"
                    ? html`<shad-button size="sm" variant="outline" @click=${() => this.#disconnect(path)}>disconnect</shad-button>`
                    : html`<shad-button size="sm" @click=${() => (kind === "sse" ? this.#connectSse(path) : this.#connectWs(path))}>connect</shad-button>`}
                  <shad-badge variant=${ws.status === "open" ? "secondary" : "outline"}>${ws.status}</shad-badge>
                </div>
                ${kind === "ws" && ws.status === "open"
                  ? html`<div class="row" style="flex-wrap:nowrap">
                      <input placeholder="message to publish" @input=${(e: Event) => this.#set(`ws:${path}`, (e.target as HTMLInputElement).value)} @keydown=${(e: KeyboardEvent) => e.key === "Enter" && this.#sendWs(path)} />
                      <shad-button size="sm" @click=${() => this.#sendWs(path)}>send</shad-button>
                    </div>`
                  : html``}
                ${ws.log.length ? html`<div class="console-log">${ws.log.map((l) => html`<div><span class="dir">${l.dir}</span>${l.text}</div>`)}</div>` : html``}
              </div>`
            : html``}
        </div>`;
      },
    )}`;
  }

  override render() {
    const d = this.data;
    if (!d) return html``;
    const which = this.#which();
    const view = this.#view();
    const doc = this.#doc();
    const pathCount = d.openapi?.paths ? Object.keys(d.openapi.paths).length : 0;
    const chanCount = d.asyncapi?.channels ? Object.keys(d.asyncapi.channels).length : 0;
    const which_btn = (key: "openapi" | "asyncapi", label: string): View =>
      html`<shad-button size="sm" variant=${which === key ? "default" : "outline"} @click=${() => (this.#which.set(key), this.#expanded.set(new Set()))}>${label}</shad-button>`;
    const view_btn = (key: "docs" | "json", label: string): View =>
      html`<shad-button size="sm" variant=${view === key ? "secondary" : "outline"} @click=${() => this.#view.set(key)}>${label}</shad-button>`;
    return html`
      <div class="row">
        ${which_btn("openapi", `OpenAPI (${pathCount} path${pathCount === 1 ? "" : "s"})`)}
        ${which_btn("asyncapi", `AsyncAPI (${chanCount} channel${chanCount === 1 ? "" : "s"})`)}
        <span class="spacer"></span>
        ${view_btn("docs", "Docs")}${view_btn("json", "JSON")}
        <shad-button size="sm" variant="outline" @click=${() => this.#copy()}>${this.#copied() ? "copied" : "copy"}</shad-button>
        <shad-button size="sm" variant="outline" @click=${() => this.#download()}>download</shad-button>
      </div>
      ${!doc
        ? html`<span class="muted">document unavailable</span>`
        : view === "json"
          ? html`<pre>${this.#json()}</pre>`
          : which === "openapi"
            ? this.#renderOpenApi(doc)
            : this.#renderAsyncApi(doc)}
    `;
  }
}

// Build a minimal example object from a JSON schema (seeds the Try-it-out body).
function schemaExample(schema: Json): string {
  const build = (s: Json): unknown => {
    if (!s || typeof s !== "object") return null;
    if (s.enum) return (s.enum as unknown[])[0];
    switch (s.type) {
      case "object": {
        const props = (s.properties as Record<string, Json>) ?? {};
        const out: Json = {};
        for (const k of Object.keys(props)) out[k] = build(props[k]);
        return out;
      }
      case "array":
        return [build(s.items as Json)];
      case "number":
      case "integer":
        return 0;
      case "boolean":
        return false;
      default:
        return s.type === "string" ? "" : null;
    }
  };
  const ex = build(schema);
  return ex && typeof ex === "object" ? JSON.stringify(ex, null, 2) : "{\n  \n}";
}
