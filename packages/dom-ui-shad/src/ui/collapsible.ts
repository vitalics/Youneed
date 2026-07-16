// shad <shad-collapsible> — a generic expand/collapse region. The `trigger` slot
// is the clickable header; the default slot is the collapsible body (animated).
//   <shad-collapsible chevron>
//     <span slot="trigger">@peduarte starred 3 repositories</span>
//     <div>@radix-ui/primitives</div>
//     <div>@radix-ui/colors</div>
//   </shad-collapsible>
// `open` is controllable; emits `change`. Add `chevron` for a built-in caret.

import { Component, html, css, when } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

@Component.define()
export class ShadCollapsible extends Component("shad-collapsible") {
  static styles = [
    tw,
    css`
      :host { display: block; }
      /* Smooth height via an animated grid track (no JS measuring). */
      .content { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 200ms ease; }
      .content[data-open] { grid-template-rows: 1fr; }
      .content > div { overflow: hidden; }
      .chevron { transition: transform 200ms ease; }
      :host([open]) .chevron { transform: rotate(180deg); }
    `,
  ];

  @Component.prop({ attribute: true, reflect: true }) open = false;
  @Component.prop({ attribute: true }) chevron = false;

  @Component.event() toggle(): void {
    this.open = !this.open;
    this.emit("change", this.open);
  }

  override render() {
    return html`
      <button
        type="button"
        id="trigger"
        aria-controls="content"
        aria-expanded=${String(this.open)}
        class="flex w-full items-center justify-between gap-2 text-left"
        @click=${this.toggle}
      >
        <slot name="trigger"></slot>
        ${when(
          this.chevron,
          () => html`<svg
            class="chevron h-4 w-4 shrink-0 text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>`,
        )}
      </button>
      <div id="content" role="region" aria-labelledby="trigger" class="content" data-open=${this.open}>
        <div><div><slot></slot></div></div>
      </div>
    `;
  }
}
