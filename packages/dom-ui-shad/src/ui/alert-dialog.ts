// shad <shad-alert-dialog> — a modal that interrupts the user and REQUIRES an
// explicit response. Unlike <shad-dialog> it has no close button and clicking
// the overlay does NOT dismiss it; the user must pick a footer action. Toggle
// with the `open` attribute or .show()/.close(). Slots: title, description,
// footer (Cancel / Action buttons).
//   <shad-alert-dialog open>
//     <span slot="title">Are you absolutely sure?</span>
//     <span slot="description">This cannot be undone.</span>
//     <shad-button slot="footer" variant="outline">Cancel</shad-button>
//     <shad-button slot="footer">Continue</shad-button>
//   </shad-alert-dialog>

import { Component, html, css, type OnMount } from "@youneed/dom";
import { tw, cn } from "../lib/shad.ts";

@Component.define()
export class ShadAlertDialog extends Component("shad-alert-dialog") implements OnMount {
  static styles = [
    tw,
    css`
      :host { display: contents; }
      @keyframes overlay-in { from { opacity: 0; } to { opacity: 1; } }
      @keyframes content-in { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
      .overlay { animation: overlay-in 150ms ease; }
      .content { animation: content-in 150ms ease; }
    `,
  ];

  @Component.prop({ attribute: true }) open = false;
  @Component.prop({ attribute: true }) size: "default" | "sm" = "default";

  show(): void {
    this.open = true;
  }
  close(): void {
    this.open = false;
    this.emit("close");
  }

  onMount(): void {
    // Escape acts as Cancel (Radix AlertDialog does the same).
    document.addEventListener(
      "keydown",
      (e) => {
        if (this.open && (e as KeyboardEvent).key === "Escape") this.close();
      },
      { signal: this.abortSignal },
    );
  }

  override render() {
    if (!this.open) return html``;
    // A `slot="media"` child (image/illustration) centers the dialog content,
    // shadcn-style. `size="sm"` narrows it. Ids are scoped to this shadow root,
    // so aria-labelledby/describedby resolve locally.
    const hasMedia = !!this.querySelector('[slot="media"]');
    const maxW = this.size === "sm" ? "max-w-sm" : "max-w-lg";
    const center = hasMedia ? " text-center" : "";
    return html`
      <div class="overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="title"
          aria-describedby="desc"
          class=${cn("content relative grid w-full gap-4 rounded-lg border border-border bg-background p-6 shadow-lg", maxW)}
        >
          <div class=${hasMedia ? "overflow-hidden rounded-md" : "hidden"}><slot name="media"></slot></div>
          <div class=${"flex flex-col gap-2" + center}>
            <h2 id="title" class="text-lg font-semibold"><slot name="title"></slot></h2>
            <p id="desc" class="text-sm text-muted-foreground"><slot name="description"></slot></p>
          </div>
          <div class=${"flex flex-col-reverse gap-2 sm:flex-row " + (hasMedia ? "sm:justify-center" : "sm:justify-end")}>
            <slot name="footer"></slot>
          </div>
        </div>
      </div>
    `;
  }
}
