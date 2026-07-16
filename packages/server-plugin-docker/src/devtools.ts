// ── @youneed/server-plugin-docker/devtools — view the generated artifacts ─────
//
// The plugin's `inspect()` carries the generated file CONTENTS, so this panel
// needs no server roundtrip: it shows the Dockerfile, docker-compose.yml and
// .dockerignore with a file switch + copy/download. Registers with
// `@youneed/server-plugin-devtools`; devtools never special-cases "docker".
import { Component, html, css } from "@youneed/dom";
import { registerDevtoolsRenderer, type DevtoolsContext, type View } from "@youneed/server-plugin-devtools/registry";

interface GeneratedFile {
  kind: string;
  name: string;
  content: string;
}
interface DockerInfo {
  kind: "docker";
  dockerfile: string;
  dockerignore: string;
  compose: string;
  services: string[];
  /** The SELECTED files (per `outputs`), with resolved names. */
  files: GeneratedFile[];
}

const DOCS = "https://github.com/youneed/framework/tree/main/packages/server-plugin-docker";

@Component.define()
export class DockerPanel extends Component("server-docker-panel") {
  static styles = css`
    :host { display: block; }
    .row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; margin-bottom: 0.5rem; }
    .spacer { flex: 1; }
    .muted { color: hsl(var(--muted-foreground)); font-size: 0.85rem; }
    pre { margin: 0; max-height: 70vh; overflow: auto; padding: 0.85rem; border: 1px solid hsl(var(--border)); border-radius: var(--radius); background: hsl(var(--muted) / 0.35); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8rem; line-height: 1.45; white-space: pre; }
  `;

  // One grouped object prop (camelCase single-prop binding is unreliable in html``).
  @Component.prop() data: { info: DockerInfo; ctx: DevtoolsContext } | null = null;

  #selected = this.signal<string | null>(null);
  #copied = this.signal(false);

  #files(): GeneratedFile[] {
    return this.data?.info.files ?? [];
  }
  #current(): GeneratedFile | undefined {
    const files = this.#files();
    const name = this.#selected();
    return files.find((f) => f.name === name) ?? files[0];
  }
  async #copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.#current()?.content ?? "");
      this.#copied.set(true);
      setTimeout(() => this.#copied.set(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }
  #download(): void {
    const f = this.#current();
    if (!f) return;
    const blob = new Blob([f.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: f.name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  override render() {
    const info = this.data?.info;
    if (!info) return html``;
    const files = this.#files();
    const cur = this.#current();
    return html`
      <div class="row">
        ${files.map(
          (f) => html`<shad-button size="sm" variant=${cur?.name === f.name ? "default" : "outline"} @click=${() => this.#selected.set(f.name)}>${f.name}</shad-button>`,
        )}
        <span class="spacer"></span>
        <span class="muted">${info.services.length} service${info.services.length === 1 ? "" : "s"}: ${info.services.join(", ")}</span>
        <shad-button size="sm" variant="outline" @click=${() => this.#copy()}>${this.#copied() ? "copied" : "copy"}</shad-button>
        <shad-button size="sm" variant="outline" @click=${() => this.#download()}>download</shad-button>
      </div>
      <pre>${cur?.content ?? ""}</pre>
    `;
  }
}

registerDevtoolsRenderer({
  kind: "docker",
  label: "Docker",
  docs: DOCS,
  card(info, ctx): View {
    const d = info as DockerInfo;
    return html`
      <div class="row"><shad-badge variant="secondary">docker</shad-badge> <span class="muted">${d.services?.length ?? 0} service(s): ${(d.services ?? []).join(", ")}</span></div>
      <div class="row"><a class="link" href="#/plugin/docker" @click=${() => ctx.goto("#/plugin/docker")}>open Docker →</a></div>
    `;
  },
  panel(info, ctx): View {
    return html`<server-docker-panel .data=${{ info, ctx }}></server-docker-panel>`;
  },
  flowNode(info) {
    const d = info as DockerInfo;
    return { label: `Docker\n${(d.services ?? []).length} services`, detail: { services: d.services } };
  },
});
