// ── @youneed/server-plugin-secrets/devtools — this package's devtools UI ──────
//
// Draws the Secrets devtools surfaces (Infra card, header-tab panel with a live
// table of secret NAMES + a per-name presence "check", flow-graph node + drawer)
// and registers them with `@youneed/server-plugin-devtools`.
//
//   SECURITY: this panel NEVER shows secret VALUES. It renders NAMES and, on an
//   explicit per-name check, a MASKED preview (e.g. "sk•••ab") + length only.
//   The masking is made deliberately obvious in the UI. Secret names + health
//   are fetched LIVE over the plugin's routes via `ctx.request`.
//
// Import this module (its import has the registration side effect) into the
// devtools web bundle.

import { Component, html, css, repeat } from "@youneed/dom";
import { registerDevtoolsRenderer, type DevtoolsContext, type View } from "@youneed/server-plugin-devtools/registry";

interface SecretsInfo {
  kind: "secrets";
  backend: string;
  count: number;
  endpoints: { names: string; health: string };
}
interface Health {
  name: string;
  present: boolean;
  length?: number;
  preview?: string;
}

const DOCS = "https://github.com/youneed/framework/tree/main/packages/server-plugin-secrets";

// The interactive panel — live table of secret NAMES with a per-name presence
// check that shows a MASKED preview only. Values are NEVER fetched or shown.
@Component.define()
export class SecretsPanel extends Component("server-secrets-panel") {
  static styles = css`
    :host { display: block; }
    .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin: 0.5rem 0; }
    .muted { color: hsl(var(--muted-foreground)); font-size: 0.85rem; }
    .name { font-weight: 600; }
    .mono { font-family: ui-monospace, monospace; }
    .warn { font-size: 0.8rem; padding: 6px 8px; border: 1px solid hsl(var(--border)); border-radius: 6px; margin: 0.5rem 0; }
    .mask { font-family: ui-monospace, monospace; letter-spacing: 1px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid hsl(var(--border)); }
  `;

  // One grouped object prop (camelCase single-prop binding is unreliable in html``).
  @Component.prop() data: { info: SecretsInfo; ctx: DevtoolsContext } | null = null;

  #names = this.signal<string[]>([]);
  #backend = this.signal("");
  #health = this.signal<Record<string, Health>>({});
  #busy = this.signal(false);

  override connectedCallback(): void {
    super.connectedCallback();
    void this.#refresh();
  }

  async #refresh(): Promise<void> {
    const d = this.data;
    if (!d) return;
    this.#busy.set(true);
    try {
      const res = await d.ctx.request(d.info.endpoints.names);
      const body = (await res.json()) as { backend?: string; names?: string[] };
      this.#names.set(body.names ?? []);
      this.#backend.set(body.backend ?? d.info.backend);
      this.#health.set({}); // stale on refresh — checks are explicit
    } catch {
      /* server unreachable — keep the last snapshot */
    } finally {
      this.#busy.set(false);
    }
  }

  // Explicit per-name presence check → GET /health?name= → masked preview only.
  async #check(name: string): Promise<void> {
    const d = this.data;
    if (!d) return;
    try {
      const res = await d.ctx.request(`${d.info.endpoints.health}?name=${encodeURIComponent(name)}`);
      const h = (await res.json()) as Health;
      this.#health.set({ ...this.#health(), [name]: h });
    } catch {
      /* ignore — leave the row unchecked */
    }
  }

  override render() {
    const info = this.data?.info;
    if (!info) return html``;
    const names = this.#names();
    const health = this.#health();
    return html`
      <shad-card>
        <div style="padding:1rem">
          <div class="row">
            <span class="name">secrets (${names.length})</span>
            <shad-badge variant="secondary">backend: ${this.#backend() || info.backend}</shad-badge>
            <shad-button size="sm" variant="outline" @click=${() => this.#refresh()} ?disabled=${this.#busy()}>Refresh</shad-button>
          </div>

          <div class="warn muted">
            🔒 Secret <strong>values are never shown</strong>. A check reveals only whether a
            secret resolves and a <span class="mask">ma•••ed</span> preview (first 2 · ••• · last 2).
          </div>

          ${names.length
            ? html`<table>
                <tr><th>Name</th><th>Present</th><th>Length</th><th>Preview (masked)</th><th></th></tr>
                ${repeat(
                  names,
                  (n) => n,
                  (n) => {
                    const h = health[n];
                    return html`<tr>
                      <td class="name mono">${n}</td>
                      <td>
                        ${h === undefined
                          ? html`<span class="muted">—</span>`
                          : h.present
                            ? html`<shad-badge variant="default">✓ present</shad-badge>`
                            : html`<shad-badge variant="destructive">✗ missing</shad-badge>`}
                      </td>
                      <td class="muted">${h?.length ?? "—"}</td>
                      <td class="mask">${h?.preview ?? "—"}</td>
                      <td><shad-button size="sm" variant="outline" @click=${() => this.#check(n)}>check</shad-button></td>
                    </tr>`;
                  },
                )}
              </table>`
            : html`<span class="muted">no secret names reported by this backend</span>`}
        </div>
      </shad-card>
    `;
  }
}

registerDevtoolsRenderer({
  kind: "secrets",
  label: "Secrets",
  docs: DOCS,
  card(info, ctx): View {
    const s = info as SecretsInfo;
    return html`
      <div class="row"><shad-badge variant="secondary">secrets</shad-badge> <span class="muted">backend: ${s.backend}</span></div>
      <div class="row"><a class="link" href="#/plugin/secrets" @click=${() => ctx.goto("#/plugin/secrets")}>open Secrets →</a></div>
    `;
  },
  panel(info, ctx): View {
    return html`<server-secrets-panel .data=${{ info, ctx }}></server-secrets-panel>`;
  },
  flowNode(info) {
    const s = info as SecretsInfo;
    return { label: `Secrets\n${s.backend}`, detail: { backend: s.backend, endpoints: s.endpoints } };
  },
  drawer(detail, ctx): View {
    const d = detail as { backend?: string };
    return html`
      <span slot="title">Secrets</span>
      <span slot="description">secret resolution — values never exposed</span>
      <div style="padding:1rem">
        <div class="muted">backend: ${d.backend ?? "—"}</div>
        <div class="muted">names + masked presence only</div>
      </div>
      <shad-button slot="footer" @click=${() => ctx.goto("#/plugin/secrets")}>Open Secrets →</shad-button>
    `;
  },
});
