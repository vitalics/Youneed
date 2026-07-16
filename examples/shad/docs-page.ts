// <docs-page slug="button"> — the content area: title + description + a preview
// of the component's demo. Driven by the `slug` attribute (set by <docs-app>).

import { Component, html, css, map, when } from "@youneed/dom";
import { tw } from "@youneed/dom-ui-shad";
import { DEMOS, slugify, type ApiDoc } from "./demos.ts";
import { highlight, tokenStyles } from "./highlight.ts";
import "./docs-view.ts";

@Component.define()
export class DocsPage extends Component("docs-page") {
  // `scroll-mt` keeps "On this page" anchors clear of the sticky header.
  static styles = [
    tw,
    css`
      :host { display: block; }
      [id] { scroll-margin-top: 80px; }
    `,
    tokenStyles,
  ];

  @Component.prop({ attribute: true }) slug = "button";

  override render() {
    const demo = DEMOS[this.slug];
    if (!demo) {
      return html`<div class="text-muted-foreground">Unknown component: ${this.slug}</div>`;
    }
    return html`
      <article class="mx-auto max-w-3xl">
        <h1 class="text-3xl font-bold tracking-tight text-foreground">${demo.title}</h1>
        <p class="mt-2 text-lg text-muted-foreground">${demo.description}</p>
        <div class="mt-6 flex flex-col gap-6">
          ${map(
            demo.examples,
            (ex) => html`<docs-view
              id=${ex.name ? slugify(ex.name) : ""}
              name=${ex.name ?? ""}
              .code=${ex.code ?? ""}
            >${ex.render()}</docs-view>`,
          )}
        </div>
        <p class="mt-4 text-sm text-muted-foreground">
          Add it: <code class="rounded bg-muted px-1.5 py-0.5">npx shad add ${this.slug}</code>
        </p>
        ${when(demo.api, () => this.#renderApi(demo.api!))}
      </article>
    `;
  }

  #renderApi(api: ApiDoc) {
    return html`
      ${when(
        api.props?.length || api.slots?.length || api.events?.length,
        () => html`
          <section id="api-reference" class="mt-12">
            <h2 class="text-xl font-semibold tracking-tight text-foreground">API Reference</h2>
            ${when(api.props?.length, () => this.#table("Props", ["Prop", "Type", "Default"], api.props!))}
            ${when(
              api.events?.length,
              () => html`
                <h3 class="mt-6 mb-2 text-sm font-medium text-muted-foreground">Events</h3>
                ${this.#twoCol("Event", "Detail", "Description", api.events!.map((e) => [e.name, e.detail, e.description]))}
              `,
            )}
            ${when(
              api.slots?.length,
              () => html`
                <h3 class="mt-6 mb-2 text-sm font-medium text-muted-foreground">Slots</h3>
                ${this.#twoCol("Slot", null, "Description", api.slots!.map((s) => [s.name, null, s.description]))}
              `,
            )}
          </section>
        `,
      )}
      ${when(
        api.extend,
        () => html`
          <section id="extending" class="mt-12">
            <h2 class="text-xl font-semibold tracking-tight text-foreground">Extending</h2>
            <p class="mt-2 text-sm text-muted-foreground">
              Build on the base component with class inheritance — override
              <code class="rounded bg-muted px-1 py-0.5 text-xs">render()</code> and add your own
              <code class="rounded bg-muted px-1 py-0.5 text-xs">@Component.prop</code>s.
            </p>
            <div class="mt-4 overflow-hidden rounded-lg border border-border bg-muted">
              <pre class="overflow-auto p-4 text-sm leading-relaxed"><code>${highlight(api.extend!)}</code></pre>
            </div>
          </section>
        `,
      )}
    `;
  }

  // A props reference table (the prop name + a description column at the end).
  #table(_title: string, cols: string[], props: NonNullable<ApiDoc["props"]>) {
    return html`
      <h3 class="mt-4 mb-2 text-sm font-medium text-muted-foreground">Props</h3>
      <div class="overflow-hidden rounded-lg border border-border">
        <table class="w-full border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-border bg-muted">
              ${map(cols, (c) => html`<th class="p-3 font-medium">${c}</th>`)}
              <th class="p-3 font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            ${map(
              props,
              (p) => html`<tr class="border-b border-border align-top last:border-0">
                <td class="whitespace-nowrap p-3 font-mono text-xs text-foreground">${p.name}</td>
                <td class="p-3 font-mono text-xs text-muted-foreground">${p.type}</td>
                <td class="whitespace-nowrap p-3 font-mono text-xs text-muted-foreground">${p.default ?? "—"}</td>
                <td class="p-3 text-muted-foreground">${p.description}</td>
              </tr>`,
            )}
          </tbody>
        </table>
      </div>
    `;
  }

  // A simple table for Events (3 cols) / Slots (2 cols — pass `c2 = null`).
  #twoCol(c1: string, c2: string | null, c3: string, rows: Array<[string, string | null, string]>) {
    return html`
      <div class="overflow-hidden rounded-lg border border-border">
        <table class="w-full border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-border bg-muted">
              <th class="p-3 font-medium">${c1}</th>
              ${when(c2, () => html`<th class="p-3 font-medium">${c2}</th>`)}
              <th class="p-3 font-medium">${c3}</th>
            </tr>
          </thead>
          <tbody>
            ${map(
              rows,
              (r) => html`<tr class="border-b border-border align-top last:border-0">
                <td class="whitespace-nowrap p-3 font-mono text-xs text-foreground">${r[0]}</td>
                ${when(c2, () => html`<td class="p-3 font-mono text-xs text-muted-foreground">${r[1]}</td>`)}
                <td class="p-3 text-muted-foreground">${r[2]}</td>
              </tr>`,
            )}
          </tbody>
        </table>
      </div>
    `;
  }
}
