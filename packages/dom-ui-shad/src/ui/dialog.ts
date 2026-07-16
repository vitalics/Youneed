// shad <shad-dialog> — a modal window. Toggle with the `open` attribute or
// .show()/.close(). Closes on overlay click or Escape; emits `close`.
//   <shad-dialog>
//     <span slot="title">Edit profile</span>
//     <span slot="description">Make changes here.</span>
//     …body…
//     <shad-button slot="footer" @click=…>Save</shad-button>
//   </shad-dialog>
// Two stacked layers, shadcn-style: a full-screen overlay sibling + the centered
// content. The top-right close (X) is a `close` slot with the X as fallback —
// hide it with close-button="false", or replace it by slotting your own button.
// `sticky-footer` gives the footer a top border + muted background that bleeds to
// the edges; long bodies scroll while the header/footer stay put.

import { Component, html, css, when, type OnMount, type OnUnmount } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

const X_ICON = html`<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>`;

@Component.define()
export class ShadDialog extends Component("shad-dialog") implements OnMount, OnUnmount {
  static styles = [tw, css`:host { display: contents; }`];

  @Component.prop({ attribute: true }) open = false;
  @Component.prop({ attribute: "close-button" }) closeButton = true;
  @Component.prop({ attribute: "sticky-footer" }) stickyFooter = false;

  show(): void {
    this.open = true;
  }
  close(): void {
    if (!this.open) return;
    this.open = false;
    this.emit("close");
  }

  onMount(): void {
    document.addEventListener(
      "keydown",
      (e) => { if (this.open && (e as KeyboardEvent).key === "Escape") this.close(); },
      { signal: this.abortSignal },
    );
  }

  // Lock page scroll while open; restore when closed or removed.
  onUpdate(): void {
    if (typeof document !== "undefined") document.body.style.overflow = this.open ? "hidden" : "";
  }
  onUnmount(): void {
    if (typeof document !== "undefined") document.body.style.overflow = "";
  }

  override render() {
    if (!this.open) return html``;
    const footerClass = this.stickyFooter
      ? "-mx-6 -mb-6 mt-2 flex flex-col-reverse gap-2 rounded-b-xl border-t border-border bg-muted/50 p-4 sm:flex-row sm:justify-end"
      : "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end";
    return html`
      <div
        class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in-0"
        @click=${() => this.close()}
      ></div>
      <div
        role="dialog"
        aria-modal="true"
        class="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-border bg-popover p-6 text-sm text-popover-foreground shadow-lg outline-none sm:max-w-lg"
        tabindex="-1"
        @click=${(e: Event) => e.stopPropagation()}
      >
        <div class="flex flex-col gap-2">
          <h2 class="text-base font-medium leading-none"><slot name="title"></slot></h2>
          <p class="text-sm text-muted-foreground"><slot name="description"></slot></p>
        </div>
        <div class="-mx-6 min-h-0 flex-1 overflow-y-auto px-6"><slot></slot></div>
        <div class=${footerClass}><slot name="footer"></slot></div>
        <div class="absolute right-3 top-3">
          <slot name="close">${when(this.closeButton, () => html`<button
            type="button"
            aria-label="Close"
            class="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            @click=${() => this.close()}
          >${X_ICON}<span class="sr-only">Close</span></button>`)}</slot>
        </div>
      </div>
    `;
  }
}
