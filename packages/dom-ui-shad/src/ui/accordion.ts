// shad <shad-accordion> + <shad-accordion-item> — collapsible sections.
//   <shad-accordion type="single">
//     <shad-accordion-item title="Is it accessible?">Yes.</shad-accordion-item>
//     <shad-accordion-item title="Is it styled?">Yes.</shad-accordion-item>
//   </shad-accordion>

import { Component, html, css, type OnMount } from "@youneed/dom";
import { tw, cn } from "../lib/shad.ts";

@Component.define()
export class ShadAccordionItem extends Component("shad-accordion-item") {
  static styles = [
    tw,
    css`
      :host { display: block; border-bottom: 1px solid hsl(var(--border)); }
      .chevron { transition: transform 200ms ease; }
      button[aria-expanded="true"] .chevron { transform: rotate(180deg); }
      /* Smooth open/close: animate the grid track from 0fr to 1fr — pure CSS,
         no height measuring, and it interpolates to the content's natural size. */
      .content {
        display: grid;
        grid-template-rows: 0fr;
        transition: grid-template-rows 200ms ease;
      }
      .content[data-open] { grid-template-rows: 1fr; }
      .content > div { overflow: hidden; }
    `,
  ];

  @Component.prop({ attribute: true }) override title = "";
  @Component.prop({ attribute: true }) open = false;

  @Component.event() toggle(): void {
    this.open = !this.open;
    this.emit("toggle", this.open); // a parent <shad-accordion> may coordinate
  }

  override render() {
    // Ids are scoped to THIS item's shadow root, so "trigger"/"content" are
    // unique per item and aria-controls/aria-labelledby resolve locally.
    return html`
      <h3 class="flex">
        <button
          type="button"
          id="trigger"
          aria-controls="content"
          aria-expanded=${String(this.open)}
          class=${cn(
            "group flex flex-1 items-center justify-between py-4 text-sm font-medium transition-all",
            "hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
          @click=${this.toggle}
        >
          ${this.title}
          <svg
            class="chevron h-4 w-4 shrink-0 text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </h3>
      <div
        id="content"
        role="region"
        aria-labelledby="trigger"
        class="content text-sm"
        data-open=${this.open}
      >
        <div><div class="pb-4 pt-0 text-muted-foreground"><slot></slot></div></div>
      </div>
    `;
  }
}

@Component.define()
export class ShadAccordion extends Component("shad-accordion") implements OnMount {
  static styles = [tw, css`:host { display: block }`];

  // "single" closes the others when one opens; "multiple" leaves them be.
  @Component.prop({ attribute: true }) type: "single" | "multiple" = "single";

  onMount(): void {
    this.addEventListener(
      "toggle",
      (e) => {
        if (this.type !== "single") return;
        const opened = e.target as Element & { open?: boolean };
        if (!opened.open) return; // only collapse siblings when one just opened
        for (const item of this.querySelectorAll("shad-accordion-item")) {
          if (item !== opened) (item as Element & { open: boolean }).open = false;
        }
      },
      { signal: this.abortSignal },
    );
  }

  override render() {
    return html`<slot></slot>`;
  }
}
