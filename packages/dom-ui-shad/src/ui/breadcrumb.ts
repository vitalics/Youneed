// shad <shad-breadcrumb> — a navigation trail. Data-driven via the `items`
// property; separators are inserted automatically.
//   breadcrumb.items = [
//     { label: "Home", href: "/" },
//     { ellipsis: true },                 // collapsed middle
//     { label: "Components", href: "/components" },
//     { label: "Breadcrumb" },            // no href → current page
//   ];
// `separator` overrides the default chevron (e.g. separator="/").

import { Component, html, css, map } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

export interface Crumb {
  label?: string;
  /** A link crumb when set; otherwise the crumb is the current page. */
  href?: string;
  /** Render a collapsed "…" placeholder instead of a label. */
  ellipsis?: boolean;
}

@Component.define()
export class ShadBreadcrumb extends Component("shad-breadcrumb") {
  static styles = [
    tw,
    css`
      :host { display: block; }
      /* Chevron points the reading direction; flip it in RTL. */
      :host-context([dir="rtl"]) .chevron { transform: rotate(180deg); }
    `,
  ];

  @Component.prop() items: Crumb[] = [];
  /** Custom separator text (e.g. "/"); falls back to a chevron when empty. */
  @Component.prop({ attribute: true }) separator = "";

  #separator() {
    return this.separator
      ? html`<span aria-hidden="true">${this.separator}</span>`
      : html`<svg class="chevron h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>`;
  }

  override render() {
    const last = this.items.length - 1;
    return html`
      <nav aria-label="breadcrumb">
        <ol class="flex flex-wrap items-center gap-1.5 break-words text-sm text-muted-foreground sm:gap-2.5">
          ${map(
            this.items,
            (c, i) => html`
              <li class="inline-flex items-center gap-1.5">
                ${c.ellipsis
                  ? html`<span class="flex items-center px-1" aria-hidden="true">…</span>`
                  : c.href
                    ? html`<a href=${c.href} class="transition-colors hover:text-foreground">${c.label}</a>`
                    : html`<span class="font-normal text-foreground" aria-current="page">${c.label}</span>`}
              </li>
              ${i < last ? html`<li class="inline-flex items-center" aria-hidden="true">${this.#separator()}</li>` : ""}
            `,
          )}
        </ol>
      </nav>
    `;
  }
}
