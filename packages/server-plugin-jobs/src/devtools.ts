// ── @youneed/server-plugin-jobs/devtools — this package's own devtools UI ─────
//
// The jobs scheduler draws its own Infra card (+ flow-graph node) and registers
// it with `@youneed/server-plugin-devtools`. Import this module (registration is
// a side effect) into the devtools web bundle.

import { html } from "@youneed/dom";
import { registerDevtoolsRenderer, type View } from "@youneed/server-plugin-devtools/registry";

interface JobsInfo {
  kind: "jobs";
  jobs: Array<{ name: string; nextRun?: unknown; running?: unknown }>;
}

const DOCS = "https://github.com/youneed/framework/tree/main/packages/server-plugin-jobs";

registerDevtoolsRenderer({
  kind: "jobs",
  docs: DOCS,
  card(info): View {
    const j = info as JobsInfo;
    const jobs = j.jobs ?? [];
    return html`
      <div class="row"><shad-badge variant="secondary">jobs</shad-badge> <span class="muted">scheduler · ${jobs.length} job(s)</span></div>
      ${jobs.map(
        (job) => html`<div class="row">
          <span class="name">${job.name}</span>
          <span class="muted">next: ${String(job.nextRun ?? "—")}</span>
          <shad-badge variant=${job.running ? "default" : "outline"}>${job.running ? "running" : "idle"}</shad-badge>
        </div>`,
      )}
    `;
  },
  flowNode(info) {
    const j = info as JobsInfo;
    return { label: `Jobs\n${(j.jobs ?? []).length} scheduled`, detail: { jobs: j.jobs ?? [] } };
  },
  drawer(detail): View {
    const jobs = (detail as { jobs?: JobsInfo["jobs"] }).jobs ?? [];
    return html`
      <span slot="title">Scheduled jobs</span>
      <span slot="description">${jobs.length} job(s)</span>
      <div style="padding:1rem">
        ${jobs.map((job) => html`<div class="row"><span class="name">${job.name}</span> <span class="muted">next: ${String(job.nextRun ?? "—")}</span></div>`)}
      </div>
    `;
  },
});
