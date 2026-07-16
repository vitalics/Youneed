// shad <shad-pagination> — page navigation. Data-driven: give it `page` (1-based)
// and `total` page count; it renders Previous / numbered links (with ellipsis) /
// Next and emits `change` with the new page.
//   <shad-pagination page="2" total="10"></shad-pagination>
//   <shad-pagination page="2" total="10" icons-only></shad-pagination>
// For real links (SSR / router), set the `hrefFor` property: (page) => url — items
// render as <a href>; otherwise they're buttons that emit `change`.

import { Component, html, css, map, when, type TemplateResult } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

const CHEV_LEFT = html`<svg class="rtl-flip h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg>`;
const CHEV_RIGHT = html`<svg class="rtl-flip h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>`;
const ELLIPSIS = html`<svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>`;

@Component.define()
export class ShadPagination extends Component("shad-pagination") {
  static styles = [
    tw,
    css`
      :host { display: block; }
      /* RTL: flip the prev/next chevrons (the row order mirrors on its own). */
      :host-context([dir="rtl"]) .rtl-flip { transform: scaleX(-1); }
    `,
  ];

  @Component.prop({ attribute: true }) page = 1;
  @Component.prop({ attribute: true }) total = 1;
  @Component.prop({ attribute: true }) siblings = 1;
  @Component.prop({ attribute: "icons-only" }) iconsOnly = false;
  /** Optional: (page) => href — renders items as <a> instead of buttons. */
  @Component.prop() hrefFor?: (page: number) => string;

  #go(p: number): void {
    if (p < 1 || p > this.total || p === this.page) return;
    this.page = p;
    this.emit("change", p);
  }

  // Page numbers with "…" gaps: always first + last, plus current ± siblings.
  #pages(): (number | "…")[] {
    const total = Math.max(1, this.total);
    const keep = new Set<number>([1, total]);
    for (let i = this.page - this.siblings; i <= this.page + this.siblings; i++) {
      if (i >= 1 && i <= total) keep.add(i);
    }
    const sorted = [...keep].sort((a, b) => a - b);
    const out: (number | "…")[] = [];
    let prev = 0;
    for (const n of sorted) {
      if (n - prev > 1) out.push("…");
      out.push(n);
      prev = n;
    }
    return out;
  }

  // A clickable cell: an <a> when hrefFor is set, else a <button>.
  #cell(p: number, cls: string, body: TemplateResult | string, label?: string, disabled = false) {
    const onClick = (e: Event) => {
      if (disabled) return e.preventDefault();
      if (!this.hrefFor) e.preventDefault();
      this.#go(p);
    };
    if (this.hrefFor && !disabled) {
      return html`<a href=${this.hrefFor(p)} aria-label=${label ?? null} class=${cls} @click=${onClick}>${body}</a>`;
    }
    return html`<button type="button" aria-label=${label ?? null} class=${cls + (disabled ? " pointer-events-none opacity-50" : "")} .disabled=${disabled} @click=${onClick}>${body}</button>`;
  }

  override render() {
    const pages = this.#pages();
    const base =
      "inline-flex shrink-0 cursor-pointer select-none items-center justify-center rounded-md text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";
    const ghostIcon = base + " size-9 hover:bg-muted hover:text-accent-foreground";
    const activeIcon = base + " size-9 border border-border bg-background hover:bg-muted";
    const edge = base + (this.iconsOnly ? " size-9 hover:bg-muted" : " h-9 gap-1 px-2.5 hover:bg-muted");

    return html`<nav role="navigation" aria-label="pagination" class="mx-auto flex w-full justify-center">
      <ul class="flex items-center gap-1">
        <li>
          ${this.#cell(
            this.page - 1,
            edge,
            this.iconsOnly ? CHEV_LEFT : html`${CHEV_LEFT}<span class="hidden sm:block">Previous</span>`,
            "Go to previous page",
            this.page <= 1,
          )}
        </li>
        ${map(pages, (p) =>
          p === "…"
            ? html`<li><span aria-hidden="true" class="flex size-9 items-center justify-center text-muted-foreground">${ELLIPSIS}<span class="sr-only">More pages</span></span></li>`
            : html`<li>${this.#cell(p, p === this.page ? activeIcon : ghostIcon, String(p), `Go to page ${p}`)}</li>`,
        )}
        <li>
          ${this.#cell(
            this.page + 1,
            edge,
            this.iconsOnly ? CHEV_RIGHT : html`<span class="hidden sm:block">Next</span>${CHEV_RIGHT}`,
            "Go to next page",
            this.page >= this.total,
          )}
        </li>
      </ul>
    </nav>`;
  }
}
