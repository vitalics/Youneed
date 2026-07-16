// ── @youneed/server-plugin-rbac/devtools — this package's own devtools UI ─────
//
// Draws the RBAC devtools surfaces (Infra card, header-tab panel with a
// ROLES × PERMISSIONS matrix + an access CHECK TESTER, flow-graph node + drawer)
// and registers them with `@youneed/server-plugin-devtools`. The roles matrix and
// checks are fetched LIVE over the plugin's routes via `ctx.request` (the sync
// `inspect()` only carries counts/endpoints). Import this module (its import has
// the registration side effect) into the devtools bundle.

import { Component, html, css, repeat } from "@youneed/dom";
import { registerDevtoolsRenderer, type DevtoolsContext, type View } from "@youneed/server-plugin-devtools/registry";

interface PermissionRow {
  action: string[];
  resource: string[];
  effect: "allow" | "deny";
  fields?: string[];
  condition?: "predicate" | Record<string, unknown>;
}
interface RoleRow {
  name: string;
  inherits: string[];
  permissions: PermissionRow[];
}
interface CheckResult {
  subject?: { roles: string[]; id?: string };
  action?: string;
  resource?: string;
  instance?: Record<string, unknown>;
  granted: boolean;
  reason: "ALLOW" | "DENY" | "NO_MATCH";
  by?: { role: string; effect: "allow" | "deny" };
  error?: string;
}
interface RbacInfo {
  kind: "rbac";
  roleCount: number;
  endpoints: { roles: string; check: string; subject: string };
}

const DOCS = "https://github.com/youneed/framework/tree/main/packages/server-plugin-rbac";
const REASON_VARIANT: Record<string, string> = { ALLOW: "default", DENY: "destructive", NO_MATCH: "secondary" };

const fmtCondition = (c: PermissionRow["condition"]): string =>
  c === undefined ? "—" : c === "predicate" ? "fn()" : JSON.stringify(c);

// Flatten roles × permissions into table rows (one row per permission, or one
// blank-permission row for a role with none). Avoids nested `repeat()`.
interface Row {
  key: string;
  role: string;
  inherits: string[];
  first: boolean;
  perm?: PermissionRow;
}
function flattenRows(roles: RoleRow[]): Row[] {
  const rows: Row[] = [];
  for (const r of roles) {
    if (r.permissions.length === 0) {
      rows.push({ key: r.name, role: r.name, inherits: r.inherits, first: true });
    } else {
      r.permissions.forEach((perm, i) => rows.push({ key: `${r.name}:${i}`, role: r.name, inherits: r.inherits, first: i === 0, perm }));
    }
  }
  return rows;
}

// The interactive panel — live roles × permissions matrix + an access check tester.
@Component.define()
export class RbacPanel extends Component("server-rbac-panel") {
  static styles = css`
    :host { display: block; }
    .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin: 0.5rem 0; }
    .muted { color: hsl(var(--muted-foreground)); font-size: 0.85rem; }
    .name { font-weight: 600; }
    .mono { font-family: ui-monospace, monospace; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid hsl(var(--border)); vertical-align: top; }
  `;

  // One grouped object prop (camelCase single-prop binding is unreliable in html``).
  @Component.prop() data: { info: RbacInfo; ctx: DevtoolsContext } | null = null;

  #roles = this.signal<RoleRow[]>([]);
  #busy = this.signal(false);

  // check tester
  #roleInput = this.signal("");
  #action = this.signal("");
  #resource = this.signal("");
  #instance = this.signal("");
  #result = this.signal<CheckResult | null>(null);

  override connectedCallback(): void {
    super.connectedCallback();
    void this.#refresh();
  }

  async #refresh(): Promise<void> {
    const d = this.data;
    if (!d) return;
    this.#busy.set(true);
    try {
      const res = await d.ctx.request(d.info.endpoints.roles);
      const body = (await res.json()) as { roles?: RoleRow[] };
      this.#roles.set(body.roles ?? []);
    } catch {
      /* server unreachable — keep the last snapshot */
    } finally {
      this.#busy.set(false);
    }
  }

  async #check(): Promise<void> {
    const d = this.data;
    if (!d) return;
    const params = new URLSearchParams();
    const roles = this.#roleInput().trim();
    if (roles) params.set("roles", roles);
    params.set("action", this.#action().trim());
    params.set("resource", this.#resource().trim());
    const inst = this.#instance().trim();
    if (inst) params.set("instance", inst);
    try {
      const res = await d.ctx.request(`${d.info.endpoints.check}?${params.toString()}`);
      this.#result.set((await res.json()) as CheckResult);
    } catch {
      this.#result.set({ granted: false, reason: "NO_MATCH", error: "request failed" });
    }
  }

  override render() {
    const info = this.data?.info;
    if (!info) return html``;
    const roles = this.#roles();
    const result = this.#result();
    return html`
      <shad-card>
        <div style="padding:1rem">
          <div class="row">
            <span class="name">roles (${roles.length})</span>
            <shad-button size="sm" variant="outline" @click=${() => this.#refresh()} ?disabled=${this.#busy()}>Refresh</shad-button>
          </div>

          ${roles.length
            ? html`<table>
                <tr><th>Role</th><th>Inherits</th><th>Action</th><th>Resource</th><th>Effect</th><th>Condition</th></tr>
                ${repeat(
                  flattenRows(roles),
                  (row) => row.key,
                  (row) =>
                    row.perm
                      ? html`<tr>
                          <td class="name">${row.first ? row.role : ""}</td>
                          <td class="muted">${row.first ? (row.inherits.length ? row.inherits.join(", ") : "—") : ""}</td>
                          <td class="mono">${row.perm.action.join(", ")}</td>
                          <td class="mono">${row.perm.resource.join(", ")}</td>
                          <td><shad-badge variant=${row.perm.effect === "deny" ? "destructive" : "default"}>${row.perm.effect}</shad-badge></td>
                          <td class="muted">${fmtCondition(row.perm.condition)}${row.perm.fields ? html` <span class="muted">fields: ${row.perm.fields.join(", ")}</span>` : html``}</td>
                        </tr>`
                      : html`<tr>
                          <td class="name">${row.role}</td>
                          <td class="muted">${row.inherits.length ? row.inherits.join(", ") : "—"}</td>
                          <td class="muted" colspan="4">no permissions</td>
                        </tr>`,
                )}
              </table>`
            : html`<span class="muted">no roles defined</span>`}

          <shad-separator></shad-separator>
          <div class="muted">check access for an ad-hoc subject</div>
          <div class="row">
            <shad-input placeholder="roles (csv, e.g. editor,viewer)" .value=${this.#roleInput()} @input=${(e: Event) => this.#roleInput.set((e.target as HTMLInputElement).value)}></shad-input>
            <shad-input placeholder="action (e.g. update)" .value=${this.#action()} @input=${(e: Event) => this.#action.set((e.target as HTMLInputElement).value)}></shad-input>
            <shad-input placeholder="resource (e.g. post)" .value=${this.#resource()} @input=${(e: Event) => this.#resource.set((e.target as HTMLInputElement).value)}></shad-input>
          </div>
          <shad-textarea placeholder='instance (JSON, e.g. {"authorId":"u1"})' .value=${this.#instance()} @input=${(e: Event) => this.#instance.set((e.target as HTMLTextAreaElement).value)}></shad-textarea>
          <div class="row">
            <shad-button size="sm" @click=${() => this.#check()}>Check</shad-button>
          </div>
          ${result
            ? result.error
              ? html`<shad-badge variant="destructive">${result.error}</shad-badge>`
              : html`<div class="row">
                  <shad-badge variant=${result.granted ? "default" : "destructive"}>${result.granted ? "GRANTED" : "DENIED"}</shad-badge>
                  <shad-badge variant=${REASON_VARIANT[result.reason] ?? "secondary"}>${result.reason}</shad-badge>
                  ${result.by ? html`<span class="muted">by ${result.by.role} (${result.by.effect})</span>` : html``}
                </div>`
            : html``}
        </div>
      </shad-card>
    `;
  }
}

registerDevtoolsRenderer({
  kind: "rbac",
  label: "RBAC",
  docs: DOCS,
  card(info, ctx): View {
    const r = info as RbacInfo;
    return html`
      <div class="row"><shad-badge variant="secondary">rbac</shad-badge> <span class="muted">${r.roleCount} role(s)</span></div>
      <div class="row"><a class="link" href="#/plugin/rbac" @click=${() => ctx.goto("#/plugin/rbac")}>open RBAC →</a></div>
    `;
  },
  panel(info, ctx): View {
    return html`<server-rbac-panel .data=${{ info, ctx }}></server-rbac-panel>`;
  },
  flowNode(info) {
    const r = info as RbacInfo;
    return { label: `RBAC\n${r.roleCount} role(s)`, detail: { roleCount: r.roleCount, endpoints: r.endpoints } };
  },
  drawer(detail, ctx): View {
    const d = detail as { roleCount?: number };
    return html`
      <span slot="title">RBAC</span>
      <span slot="description">role-based access control & permissions</span>
      <div style="padding:1rem">
        <div class="muted">${d.roleCount ?? 0} role(s)</div>
      </div>
      <shad-button slot="footer" @click=${() => ctx.goto("#/plugin/rbac")}>Open RBAC →</shad-button>
    `;
  },
});
