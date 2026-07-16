// ── @youneed/server-plugin-feature-flags/devtools — this package's devtools UI ─
//
// Draws the Feature Flags devtools surfaces (Infra card, header-tab panel with a
// live flags table + per-flag override toggle/clear + an ad-hoc eval tester,
// flow-graph node + drawer) and registers them with
// `@youneed/server-plugin-devtools`. Flag EVALUATIONS depend on a request context,
// so the panel fetches definitions/snapshot/evaluations LIVE over the plugin's
// routes via `ctx.request` rather than from the sync `inspect()`. Import this
// module (its import has the registration side effect) into the devtools bundle.

import { Component, html, css, repeat } from "@youneed/dom";
import { registerDevtoolsRenderer, type DevtoolsContext, type View } from "@youneed/server-plugin-devtools/registry";

type FlagValue = boolean | string | number | null | FlagValue[] | { [k: string]: FlagValue };

interface FlagDef {
  key: string;
  description?: string;
  enabled?: boolean;
  defaultValue: FlagValue;
  variants?: Record<string, FlagValue>;
  rollout?: number;
  overridden?: FlagValue;
}
interface Evaluation {
  key: string;
  value: FlagValue;
  variant?: string;
  reason: string;
}
interface FeatureFlagsInfo {
  kind: "feature-flags";
  count: number;
  endpoints: { list: string; snapshot: string; override: string; clear: string; evaluate: string };
}

const DOCS = "https://github.com/youneed/framework/tree/main/packages/server-plugin-feature-flags";
const REASON_VARIANT: Record<string, string> = {
  DISABLED: "secondary",
  TARGETING_MATCH: "default",
  ROLLOUT: "default",
  DEFAULT: "outline",
  STATIC: "destructive",
  ERROR: "destructive",
};

const fmt = (v: FlagValue): string => (typeof v === "string" ? v : JSON.stringify(v));

// The interactive panel — live flags table with override toggles + an eval tester.
@Component.define()
export class FeatureFlagsPanel extends Component("server-feature-flags-panel") {
  static styles = css`
    :host { display: block; }
    .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin: 0.5rem 0; }
    .muted { color: hsl(var(--muted-foreground)); font-size: 0.85rem; }
    .name { font-weight: 600; }
    .mono { font-family: ui-monospace, monospace; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid hsl(var(--border)); }
  `;

  // One grouped object prop (camelCase single-prop binding is unreliable in html``).
  @Component.prop() data: { info: FeatureFlagsInfo; ctx: DevtoolsContext } | null = null;

  #defs = this.signal<FlagDef[]>([]);
  #overrides = this.signal<Record<string, FlagValue>>({});
  #snapshot = this.signal<Record<string, Evaluation>>({});
  #busy = this.signal(false);

  // eval tester
  #targetingKey = this.signal("");
  #attrs = this.signal("");
  #testResult = this.signal<Evaluation | { error: string } | null>(null);

  override connectedCallback(): void {
    super.connectedCallback();
    void this.#refresh();
  }

  async #refresh(): Promise<void> {
    const d = this.data;
    if (!d) return;
    this.#busy.set(true);
    try {
      const [listRes, snapRes] = await Promise.all([d.ctx.request(d.info.endpoints.list), d.ctx.request(d.info.endpoints.snapshot)]);
      const list = (await listRes.json()) as { definitions?: FlagDef[]; overrides?: Record<string, FlagValue> };
      this.#defs.set(list.definitions ?? []);
      this.#overrides.set(list.overrides ?? {});
      this.#snapshot.set((await snapRes.json()) as Record<string, Evaluation>);
    } catch {
      /* server unreachable — keep the last snapshot */
    } finally {
      this.#busy.set(false);
    }
  }

  async #post(endpoint: string, body: unknown): Promise<void> {
    const d = this.data;
    if (!d) return;
    try {
      await d.ctx.request(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    } finally {
      await this.#refresh();
    }
  }

  // Toggle a boolean flag's override on/off relative to its current evaluated value.
  #toggle(def: FlagDef): void {
    const current = Boolean(this.#snapshot()[def.key]?.value);
    void this.#post(this.data!.info.endpoints.override, { key: def.key, value: !current });
  }

  #clear(key: string): void {
    void this.#post(this.data!.info.endpoints.clear, { key });
  }

  async #evaluate(key: string): Promise<void> {
    const d = this.data;
    if (!d) return;
    const params = new URLSearchParams();
    params.set("key", key);
    const tk = this.#targetingKey().trim();
    if (tk) params.set("targetingKey", tk);
    const raw = this.#attrs().trim();
    if (raw) {
      try {
        const obj = JSON.parse(raw) as Record<string, unknown>;
        for (const [k, v] of Object.entries(obj)) params.set(`attr.${k}`, String(v));
      } catch {
        /* ignore malformed attrs JSON */
      }
    }
    try {
      const res = await d.ctx.request(`${d.info.endpoints.evaluate}?${params.toString()}`);
      this.#testResult.set((await res.json()) as Evaluation);
    } catch {
      this.#testResult.set({ error: "request failed" });
    }
  }

  override render() {
    const info = this.data?.info;
    if (!info) return html``;
    const defs = this.#defs();
    const overrides = this.#overrides();
    const snap = this.#snapshot();
    const result = this.#testResult();
    const firstKey = defs[0]?.key ?? "";
    return html`
      <shad-card>
        <div style="padding:1rem">
          <div class="row">
            <span class="name">flags (${defs.length})</span>
            ${Object.keys(overrides).length ? html`<shad-badge variant="destructive">${Object.keys(overrides).length} override(s)</shad-badge>` : html``}
            <shad-button size="sm" variant="outline" @click=${() => this.#refresh()} ?disabled=${this.#busy()}>Refresh</shad-button>
          </div>

          ${defs.length
            ? html`<table>
                <tr><th>Key</th><th>Value</th><th>Variant</th><th>Reason</th><th>Rollout</th><th></th></tr>
                ${repeat(
                  defs,
                  (d) => d.key,
                  (d) => {
                    const ev = snap[d.key];
                    const isOverridden = d.key in overrides;
                    const isBool = typeof (ev?.value ?? d.defaultValue) === "boolean";
                    return html`<tr>
                      <td class="name">${d.key}${d.description ? html`<div class="muted">${d.description}</div>` : html``}</td>
                      <td class="mono">${fmt(ev?.value ?? d.defaultValue)}${isOverridden ? html` <shad-badge variant="destructive">override</shad-badge>` : html``}</td>
                      <td class="muted">${ev?.variant ?? "—"}</td>
                      <td><shad-badge variant=${REASON_VARIANT[ev?.reason ?? "DEFAULT"] ?? "secondary"}>${ev?.reason ?? "—"}</shad-badge></td>
                      <td class="muted">${d.rollout !== undefined ? `${d.rollout}%` : "—"}</td>
                      <td>
                        ${isBool ? html`<shad-button size="sm" variant="outline" @click=${() => this.#toggle(d)}>Toggle</shad-button>` : html``}
                        ${isOverridden ? html`<shad-button size="sm" variant="ghost" @click=${() => this.#clear(d.key)}>clear</shad-button>` : html``}
                      </td>
                    </tr>`;
                  },
                )}
              </table>`
            : html`<span class="muted">no flags defined</span>`}

          <shad-separator></shad-separator>
          <div class="muted">evaluate a flag for an ad-hoc context</div>
          <div class="row">
            <shad-input placeholder="targetingKey (user id)" .value=${this.#targetingKey()} @input=${(e: Event) => this.#targetingKey.set((e.target as HTMLInputElement).value)}></shad-input>
          </div>
          <shad-textarea placeholder='attributes (JSON, e.g. {"plan":"pro"})' .value=${this.#attrs()} @input=${(e: Event) => this.#attrs.set((e.target as HTMLTextAreaElement).value)}></shad-textarea>
          <div class="row">
            ${repeat(
              defs,
              (d) => d.key,
              (d) => html`<shad-button size="sm" variant="secondary" @click=${() => this.#evaluate(d.key)}>${d.key}</shad-button>`,
            )}
            ${defs.length === 0 && firstKey ? html`<shad-button size="sm" @click=${() => this.#evaluate(firstKey)}>evaluate</shad-button>` : html``}
          </div>
          ${result
            ? "error" in result
              ? html`<shad-badge variant="destructive">${result.error}</shad-badge>`
              : html`<div class="row">
                  <shad-badge variant=${REASON_VARIANT[result.reason] ?? "secondary"}>${result.reason}</shad-badge>
                  <span class="mono">${fmt(result.value)}</span>
                  ${result.variant ? html`<span class="muted">variant: ${result.variant}</span>` : html``}
                </div>`
            : html``}
        </div>
      </shad-card>
    `;
  }
}

registerDevtoolsRenderer({
  kind: "feature-flags",
  label: "Feature Flags",
  docs: DOCS,
  card(info, ctx): View {
    const f = info as FeatureFlagsInfo;
    return html`
      <div class="row"><shad-badge variant="secondary">feature-flags</shad-badge> <span class="muted">${f.count} flag(s)</span></div>
      <div class="row"><a class="link" href="#/plugin/feature-flags" @click=${() => ctx.goto("#/plugin/feature-flags")}>open Feature Flags →</a></div>
    `;
  },
  panel(info, ctx): View {
    return html`<server-feature-flags-panel .data=${{ info, ctx }}></server-feature-flags-panel>`;
  },
  flowNode(info) {
    const f = info as FeatureFlagsInfo;
    return { label: `Feature Flags\n${f.count} flag(s)`, detail: { count: f.count, endpoints: f.endpoints } };
  },
  drawer(detail, ctx): View {
    const d = detail as { count?: number };
    return html`
      <span slot="title">Feature Flags</span>
      <span slot="description">runtime flag evaluation & rollout</span>
      <div style="padding:1rem">
        <div class="muted">${d.count ?? 0} flag(s)</div>
      </div>
      <shad-button slot="footer" @click=${() => ctx.goto("#/plugin/feature-flags")}>Open Feature Flags →</shad-button>
    `;
  },
});
