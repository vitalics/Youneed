// ── @youneed/server-plugin-queue/devtools — this package's own devtools UI ────
//
// Draws the Queue devtools surfaces (Infra card, header-tab panel with a live
// jobs table + enqueue/retry/remove, flow-graph node + drawer) and registers
// them with `@youneed/server-plugin-devtools`. Because a queue's counts + jobs
// live in a (possibly remote) KV store, the panel fetches them LIVE over the
// plugin's control routes via `ctx.request` rather than from the sync `inspect()`.
// Import this module (its import has the registration side effect) into the
// devtools web bundle.

import { Component, html, css, repeat } from "@youneed/dom";
import { registerDevtoolsRenderer, type DevtoolsContext, type View } from "@youneed/server-plugin-devtools/registry";

interface QueueJob {
  id: string;
  name: string;
  state: "waiting" | "active" | "completed" | "failed";
  attempts: number;
  maxAttempts: number;
  runAt: number;
  error?: string;
}
interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  total: number;
}
interface QueueInfo {
  kind: "queue";
  concurrency: number;
  endpoints: { jobs: string; stats: string; enqueue: string; retry: string; remove: string };
}

const DOCS = "https://github.com/youneed/framework/tree/main/packages/server-plugin-queue";
const STATE_VARIANT: Record<string, string> = { waiting: "secondary", active: "default", completed: "outline", failed: "destructive" };

// The interactive panel — fetches live jobs/stats and drives enqueue/retry/remove.
@Component.define()
export class QueuePanel extends Component("server-queue-panel") {
  static styles = css`
    :host { display: block; }
    .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin: 0.5rem 0; }
    .muted { color: hsl(var(--muted-foreground)); font-size: 0.85rem; }
    .name { font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid hsl(var(--border)); }
    .err { color: hsl(var(--destructive)); font-size: 0.8rem; }
  `;

  // One grouped object prop (camelCase single-prop binding is unreliable in html``).
  @Component.prop() data: { info: QueueInfo; ctx: DevtoolsContext } | null = null;

  #jobs = this.signal<QueueJob[]>([]);
  #stats = this.signal<QueueStats | null>(null);
  #name = this.signal("");
  #payload = this.signal("");
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
      const [jobsRes, statsRes] = await Promise.all([d.ctx.request(d.info.endpoints.jobs), d.ctx.request(d.info.endpoints.stats)]);
      const jobs = (await jobsRes.json()) as { jobs?: QueueJob[] };
      this.#jobs.set(jobs.jobs ?? []);
      this.#stats.set((await statsRes.json()) as QueueStats);
    } catch {
      /* server unreachable — leave the last snapshot */
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

  #enqueue(): void {
    const name = this.#name().trim();
    if (!name) return;
    let payload: unknown = undefined;
    const raw = this.#payload().trim();
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = raw; // fall back to the raw string
      }
    }
    this.#name.set("");
    this.#payload.set("");
    void this.#post(this.data!.info.endpoints.enqueue, { name, payload });
  }

  override render() {
    const info = this.data?.info;
    if (!info) return html``;
    const s = this.#stats();
    const jobs = this.#jobs();
    return html`
      <shad-card>
        <div style="padding:1rem">
          <div class="row">
            <span class="name">jobs (${jobs.length})</span>
            <shad-badge variant="secondary">concurrency ${info.concurrency}</shad-badge>
            ${s
              ? html`<span class="muted">${s.waiting} waiting · ${s.active} active · ${s.completed} done · ${s.failed} failed${s.delayed ? html` · ${s.delayed} delayed` : html``}</span>`
              : html``}
            <shad-button size="sm" variant="outline" @click=${() => this.#refresh()} ?disabled=${this.#busy()}>Refresh</shad-button>
          </div>

          ${jobs.length
            ? html`<table>
                <tr><th>ID</th><th>Name</th><th>State</th><th>Att.</th><th>Detail</th><th></th></tr>
                ${repeat(
                  jobs,
                  (j) => j.id,
                  (j) => html`<tr>
                    <td class="muted">${j.id}</td>
                    <td class="name">${j.name}</td>
                    <td><shad-badge variant=${STATE_VARIANT[j.state] ?? "secondary"}>${j.state}</shad-badge></td>
                    <td>${j.attempts}/${j.maxAttempts}</td>
                    <td class="err">${j.error ?? ""}</td>
                    <td>
                      ${j.state === "failed" || j.state === "completed"
                        ? html`<shad-button size="sm" variant="outline" @click=${() => this.#post(info.endpoints.retry, { id: j.id })}>Retry</shad-button>`
                        : html``}
                      <shad-button size="sm" variant="ghost" @click=${() => this.#post(info.endpoints.remove, { id: j.id })}>✕</shad-button>
                    </td>
                  </tr>`,
                )}
              </table>`
            : html`<span class="muted">no jobs — enqueue one below</span>`}

          <shad-separator></shad-separator>
          <div class="muted">enqueue a job</div>
          <div class="row">
            <shad-input placeholder="job name" .value=${this.#name()} @input=${(e: Event) => this.#name.set((e.target as HTMLInputElement).value)}></shad-input>
          </div>
          <shad-textarea placeholder="payload (JSON, optional)" .value=${this.#payload()} @input=${(e: Event) => this.#payload.set((e.target as HTMLTextAreaElement).value)}></shad-textarea>
          <div class="row">
            <shad-button @click=${() => this.#enqueue()} ?disabled=${!this.#name().trim()}>enqueue</shad-button>
          </div>
        </div>
      </shad-card>
    `;
  }
}

registerDevtoolsRenderer({
  kind: "queue",
  label: "Queue",
  docs: DOCS,
  card(info, ctx): View {
    const q = info as QueueInfo;
    return html`
      <div class="row"><shad-badge variant="secondary">queue</shad-badge> <span class="muted">concurrency ${q.concurrency}</span></div>
      <div class="row"><a class="link" href="#/plugin/queue" @click=${() => ctx.goto("#/plugin/queue")}>open Queue →</a></div>
    `;
  },
  panel(info, ctx): View {
    return html`<server-queue-panel .data=${{ info, ctx }}></server-queue-panel>`;
  },
  flowNode(info) {
    const q = info as QueueInfo;
    return { label: `Queue\nconcurrency ${q.concurrency}`, detail: { concurrency: q.concurrency, endpoints: q.endpoints } };
  },
  drawer(detail, ctx): View {
    const d = detail as { concurrency?: number };
    return html`
      <span slot="title">Queue</span>
      <span slot="description">durable background jobs</span>
      <div style="padding:1rem">
        <div class="muted">concurrency ${d.concurrency ?? "—"}</div>
      </div>
      <shad-button slot="footer" @click=${() => ctx.goto("#/plugin/queue")}>Open Queue →</shad-button>
    `;
  },
});
