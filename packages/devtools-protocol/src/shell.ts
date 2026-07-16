// @youneed/devtools-protocol/shell — the unified <youneed-devtools> shell.
//
// One UI for every surface: fetch a hub's target list (`/json`), connect to a
// target over WebSocket, and render a tab per `(advertised domain × registered
// UI extension)` — handing each extension a live, target-scoped client. The
// extensions decide what to draw (one protocol, per-surface UI); the shell only
// discovers, connects and routes. Import `./extensions` for the built-in panels.
//
//   <youneed-devtools discovery="/__devtools/json"></youneed-devtools>

import { Component, html, css } from "@youneed/dom";
import { createClient, fromWebSocket, type DevtoolsClient, type TargetInfo } from "./index.ts";
import { extensionsFor, getExtension, type ExtensionContext, type View } from "./ui.ts";

interface Descriptor extends TargetInfo {
  webSocketDebuggerUrl: string;
  /** Set for a relayed (front-bridge) target: the session id to `hub.attach` +
   *  thread on every command. */
  sessionId?: string;
}

@Component.define()
export class YouneedDevtools extends Component("youneed-devtools") {
  static styles = css`
    :host { display: block; font-family: system-ui, sans-serif; }
    .bar { display: flex; gap: 0.25rem; align-items: center; flex-wrap: wrap; padding: 0.5rem; border-bottom: 1px solid #8884; }
    .tab { border: 0; background: transparent; padding: 0.35rem 0.7rem; border-radius: 6px; cursor: pointer; font: inherit; }
    .tab.active { background: #8883; font-weight: 600; }
    select { font: inherit; padding: 0.25rem; margin-right: 0.5rem; }
    .panel { padding: 0.75rem; }
    .err { color: #c33; padding: 0.5rem 0.75rem; }
    .muted { opacity: 0.6; }
  `;

  /** URL of the hub's target list (`{path}/json`). */
  @Component.prop() discovery = "";

  #targets = this.signal<Descriptor[]>([]);
  #info = this.signal<TargetInfo | null>(null);
  #domain = this.signal("");
  #view = this.signal<View | null>(null);
  #error = this.signal("");
  #status = this.signal("starting…");
  #client: DevtoolsClient | null = null;
  #ws: WebSocket | null = null;

  onMount(): void {
    void this.#load();
  }

  /** The hub's target list URL: the `discovery` prop/attribute, else derived from
   *  the page path (the page is served AT the devtools mount, so `{path}/json`). */
  #discoveryUrl(): string {
    const explicit = this.discovery || this.getAttribute("discovery") || "";
    if (explicit) return explicit;
    const base = location.pathname.replace(/\/+$/, "");
    return `${base}/json`;
  }

  async #load(): Promise<void> {
    const url = this.#discoveryUrl();
    this.#status.set(`discovering ${url}…`);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const targets = (await res.json()) as Descriptor[];
      this.#targets.set(targets);
      this.#status.set(`${targets.length} target(s)`);
      if (targets[0]) await this.#attach(targets[0]);
      else this.#error.set("no targets advertised");
    } catch (e) {
      this.#error.set(`discovery failed (${url}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async #attach(d: Descriptor): Promise<void> {
    this.#error.set("");
    this.#client?.close();
    this.#ws?.close();
    try {
      const url = new URL(d.webSocketDebuggerUrl, location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      this.#status.set(`connecting ${url}…`);
      const ws = new WebSocket(url.toString());
      this.#ws = ws;
      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error(`socket error (${url})`));
      });
      this.#client = createClient(fromWebSocket(ws as never), d.sessionId ? { sessionId: d.sessionId } : {});
      if (d.sessionId) await this.#client.command("hub.attach", { targetId: d.sessionId });
      this.#status.set("loading info…");
      const info = await this.#client.getInfo();
      this.#info.set(info);
      const tabs = extensionsFor(info);
      this.#status.set(tabs.length ? "" : `connected, but no UI extension for: ${info.domains.join(", ")}`);
      await this.#select(tabs[0]?.domain ?? "");
    } catch (e) {
      this.#error.set(e instanceof Error ? e.message : String(e));
    }
  }

  async #select(domain: string): Promise<void> {
    this.#domain.set(domain);
    const ext = getExtension(domain);
    const info = this.#info();
    if (!ext?.panel || !this.#client || !info) {
      this.#view.set(null);
      return;
    }
    const ctx: ExtensionContext = {
      client: this.#client,
      target: info,
      goto: () => {},
      refresh: () => void this.#select(this.#domain()),
    };
    try {
      this.#view.set(await ext.panel(ctx));
    } catch (e) {
      this.#error.set(e instanceof Error ? e.message : String(e));
    }
  }

  override render() {
    const info = this.#info();
    const tabs = info ? extensionsFor(info) : [];
    const targets = this.#targets();
    return html`
      <div class="bar">
        ${targets.length > 1
          ? html`<select
              @change=${(e: Event) => {
                const d = targets.find((t) => t.id === (e.target as HTMLSelectElement).value);
                if (d) void this.#attach(d);
              }}
            >
              ${targets.map((t) => html`<option value=${t.id}>${t.kind}: ${t.title ?? t.id}</option>`)}
            </select>`
          : html``}
        ${tabs.map(
          (t) => html`<button
            class=${t.domain === this.#domain() ? "tab active" : "tab"}
            @click=${() => void this.#select(t.domain)}
          >
            ${t.label}
          </button>`,
        )}
      </div>
      ${this.#error() ? html`<div class="err">${this.#error()}</div>` : html``}
      <div class="panel">${this.#view() ?? html`<span class="muted">${this.#error() ? "" : this.#status() || "select a tab"}</span>`}</div>
    `;
  }
}
