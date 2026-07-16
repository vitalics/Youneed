// shad <shad-drawer> — a panel that slides in from a screen edge. Toggle with the
// `open` attribute or .show()/.close(); closes on overlay click or Escape.
//   <shad-drawer direction="bottom">
//     <span slot="title">Move Goal</span>
//     <span slot="description">Set your daily activity goal.</span>
//     …body…
//     <shad-button slot="footer">Submit</shad-button>
//   </shad-drawer>
// Directions: bottom (default), top, left, right. `responsive` renders a centered
// dialog on ≥md screens and an edge drawer below — the shadcn "responsive dialog".
// Two stacked layers (overlay sibling + content), like <shad-dialog>.

import { Component, html, css, when, type OnMount, type OnUnmount } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

type Dir = "bottom" | "top" | "left" | "right";

@Component.define()
export class ShadDrawer extends Component("shad-drawer") implements OnMount, OnUnmount {
  static styles = [
    tw,
    css`
      :host { display: contents; }
      /* Slide-in per edge (and a fade/zoom when responsive-centered). */
      .slide-bottom { animation: slideBottom 0.3s cubic-bezier(0.32, 0.72, 0, 1); }
      .slide-top { animation: slideTop 0.3s cubic-bezier(0.32, 0.72, 0, 1); }
      .slide-left { animation: slideLeft 0.3s cubic-bezier(0.32, 0.72, 0, 1); }
      .slide-right { animation: slideRight 0.3s cubic-bezier(0.32, 0.72, 0, 1); }
      .zoom { animation: zoomIn 0.15s ease-out; }
      @keyframes slideBottom { from { transform: translateY(100%); } }
      @keyframes slideTop { from { transform: translateY(-100%); } }
      @keyframes slideLeft { from { transform: translateX(-100%); } }
      @keyframes slideRight { from { transform: translateX(100%); } }
      @keyframes zoomIn { from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); } }
      @keyframes fadeIn { from { opacity: 0; } }
      .overlay { animation: fadeIn 0.2s ease-out; }
    `,
  ];

  @Component.prop({ attribute: true }) open = false;
  @Component.prop({ attribute: true }) direction: Dir = "bottom";
  @Component.prop({ attribute: true }) responsive = false;

  #wide = this.signal(false); // responsive: ≥ md viewport

  show(): void {
    this.open = true;
  }
  close(): void {
    if (!this.open) return;
    this.open = false;
    this.emit("close");
  }

  onMount(): void {
    document.addEventListener("keydown", (e) => { if (this.open && (e as KeyboardEvent).key === "Escape") this.close(); }, { signal: this.abortSignal });
    if (typeof matchMedia !== "undefined") {
      const mq = matchMedia("(min-width: 768px)");
      this.#wide.set(mq.matches);
      mq.addEventListener("change", (e) => this.#wide.set(e.matches), { signal: this.abortSignal });
    }
  }
  onUpdate(): void {
    if (typeof document !== "undefined") document.body.style.overflow = this.open ? "hidden" : "";
  }
  onUnmount(): void {
    if (typeof document !== "undefined") document.body.style.overflow = "";
  }

  // Centered dialog when responsive on a wide screen; otherwise an edge drawer.
  #centered(): boolean {
    return this.responsive && this.#wide();
  }

  #contentClass(): string {
    if (this.#centered()) {
      return "zoom fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-popover text-sm text-popover-foreground shadow-lg outline-none";
    }
    const base = "fixed z-50 flex flex-col bg-popover text-sm text-popover-foreground outline-none";
    const byDir: Record<Dir, string> = {
      bottom: "slide-bottom inset-x-0 bottom-0 mt-24 max-h-[80vh] rounded-t-xl border-t border-border",
      top: "slide-top inset-x-0 top-0 mb-24 max-h-[80vh] rounded-b-xl border-b border-border",
      left: "slide-left inset-y-0 left-0 w-3/4 rounded-r-xl border-r border-border sm:max-w-sm",
      right: "slide-right inset-y-0 right-0 w-3/4 rounded-l-xl border-l border-border sm:max-w-sm",
    };
    return `${base} ${byDir[this.direction]}`;
  }

  override render() {
    if (!this.open) return html``;
    const centered = this.#centered();
    const stack = this.direction === "bottom" || this.direction === "top";
    // Bottom/top drawers center their content in a narrow column.
    const innerClass =
      !centered && stack ? "mx-auto flex w-full max-w-sm flex-1 flex-col min-h-0" : "flex flex-1 flex-col min-h-0";
    const headerAlign = !centered && stack ? "text-center md:text-left" : "text-left";
    return html`
      <div class="overlay fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" @click=${() => this.close()}></div>
      <div role="dialog" aria-modal="true" tabindex="-1" class=${this.#contentClass()} @click=${(e: Event) => e.stopPropagation()}>
        ${when(
          !centered && this.direction === "bottom",
          () => html`<div class="mx-auto mt-4 h-1 w-[100px] shrink-0 rounded-full bg-muted"></div>`,
        )}
        <div class=${innerClass}>
          <div class=${"flex flex-col gap-1 p-4 " + headerAlign}>
            <h2 class="text-base font-medium text-foreground"><slot name="title"></slot></h2>
            <p class="text-sm text-muted-foreground"><slot name="description"></slot></p>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto px-4"><slot></slot></div>
          <div class="mt-auto flex flex-col gap-2 p-4"><slot name="footer"></slot></div>
        </div>
      </div>
    `;
  }
}
