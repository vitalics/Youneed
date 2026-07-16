// shad <shad-navigation-menu> — a horizontal site nav whose triggers reveal a
// content panel on hover/focus. Data-driven via `items`:
//   { label, links: [{ title, href, description? }], cols? }  — a trigger + panel
//   { label, content: html`…` }                               — a trigger + custom panel
//   { label, href }                                           — a plain link
//   bar.items = [
//     { label: "Getting started", links: [{ title: "Introduction", href: "/docs", description: "…" }] },
//     { label: "Docs", href: "/docs" },
//   ];
// Opens after a short delay; stays open while the pointer is over the trigger or
// the panel. The panel is absolutely positioned under its trigger.

import { Component, html, css, map, when, type OnMount, type TemplateResult } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

export interface NavLink {
  title: string;
  href: string;
  description?: string;
}
export interface NavItem {
  label: string;
  href?: string;
  links?: NavLink[];
  content?: TemplateResult;
  cols?: number;
  width?: string; // panel width utility, e.g. "w-[500px]"
}

const TRIGGER =
  "inline-flex h-9 w-max cursor-default items-center justify-center gap-1 rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none";

@Component.define()
export class ShadNavigationMenu extends Component("shad-navigation-menu") implements OnMount {
  static styles = [
    tw,
    css`
      :host { display: inline-block; }
      nav { position: relative; }
      .chev { transition: transform 0.3s; }
      [data-open] .chev { transform: rotate(180deg); }
      [data-panel] { animation: navIn 0.15s ease-out; }
      @keyframes navIn { from { opacity: 0; transform: translateY(-4px); } }
    `,
  ];

  @Component.prop() items: NavItem[] = [];

  #open = this.signal(-1);
  #left = this.signal(0);
  #openT = 0;
  #closeT = 0;

  onMount(): void {
    addEventListener("scroll", () => this.#open() >= 0 && this.#hardClose(), { capture: true, passive: true, signal: this.abortSignal });
  }

  #scheduleOpen(i: number): void {
    clearTimeout(this.#closeT);
    if (this.#open() === i) return;
    const delay = this.#open() >= 0 ? 0 : 150; // instant switch when already open
    this.#openT = window.setTimeout(() => {
      const triggers = this.shadowRoot!.querySelectorAll("[data-nav-trigger]");
      const t = triggers[i] as HTMLElement | undefined;
      if (t) this.#left.set(t.offsetLeft);
      this.#open.set(i);
    }, delay);
  }
  #scheduleClose(): void {
    clearTimeout(this.#openT);
    this.#closeT = window.setTimeout(() => this.#open.set(-1), 150);
  }
  #hardClose(): void {
    clearTimeout(this.#openT);
    clearTimeout(this.#closeT);
    this.#open.set(-1);
  }

  #panelBody(item: NavItem) {
    if (item.content) return item.content;
    return html`<ul class=${"grid gap-1 p-2 " + (item.width ?? "w-[420px]")} style=${item.cols ? `grid-template-columns:repeat(${item.cols},minmax(0,1fr))` : ""}>
      ${map(
        item.links ?? [],
        (l) => html`<li>
          <a
            href=${l.href}
            class="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-muted focus:bg-muted"
            @click=${() => this.#hardClose()}
          >
            <div class="text-sm font-medium leading-none">${l.title}</div>
            ${when(l.description, () => html`<p class="line-clamp-2 text-sm leading-snug text-muted-foreground">${l.description}</p>`)}
          </a>
        </li>`,
      )}
    </ul>`;
  }

  override render() {
    const open = this.#open();
    return html`<nav>
      <ul class="flex w-max items-center gap-1 rounded-lg border border-border bg-background p-1">
        ${map(this.items, (item, i) => {
          if (item.href != null && !item.links && !item.content) {
            return html`<li><a href=${item.href} class=${TRIGGER}>${item.label}</a></li>`;
          }
          return html`<li class="relative">
            <button
              type="button"
              data-nav-trigger
              data-open=${open === i ? "" : null}
              aria-expanded=${String(open === i)}
              class=${TRIGGER + (open === i ? " bg-muted" : "")}
              @pointerenter=${() => this.#scheduleOpen(i)}
              @pointerleave=${() => this.#scheduleClose()}
              @focusin=${() => this.#scheduleOpen(i)}
              @click=${() => (open === i ? this.#hardClose() : this.#scheduleOpen(i))}
            >
              ${item.label}
              <svg class="chev relative top-px size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </button>
          </li>`;
        })}
      </ul>
      ${when(
        open >= 0,
        () => html`<div
          data-panel
          data-open
          class="absolute top-full z-50 mt-1.5 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
          style=${`left:${this.#left()}px`}
          @pointerenter=${() => clearTimeout(this.#closeT)}
          @pointerleave=${() => this.#scheduleClose()}
        >
          ${this.#panelBody(this.items[open]!)}
        </div>`,
      )}
    </nav>`;
  }
}
