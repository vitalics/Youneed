// shad <shad-avatar> — an image with a fallback. The slotted content (e.g.
// initials) shows until the image loads, or if it fails. An optional
// `slot="badge"` adds a corner indicator (status dot / icon):
//   <shad-avatar src="/me.jpg" alt="Me" size="lg">
//     ME
//     <span slot="badge" class="size-3 rounded-full bg-green-500 ring-2 ring-background"></span>
//   </shad-avatar>
// Stack several inside <shad-avatar-group> to overlap them.

import { Component, html, css, when } from "@youneed/dom";
import { tw, cn } from "../lib/shad.ts";

const SIZES: Record<string, string> = {
  sm: "h-8 w-8 text-xs",
  default: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base",
};

@Component.define()
export class ShadAvatar extends Component("shad-avatar") {
  static styles = [tw, css`:host { display: inline-flex }`];

  @Component.prop({ attribute: true }) src = "";
  @Component.prop({ attribute: true }) alt = "";
  @Component.prop({ attribute: true }) size: "sm" | "default" | "lg" = "default";
  @Component.prop() failed = false;

  @Component.event() onError(): void {
    this.failed = true; // fall back to the slot
  }

  override render() {
    const sz = SIZES[this.size] ?? SIZES.default;
    const hasBadge = !!this.querySelector('[slot="badge"]');
    return html`
      <span class=${cn("relative inline-flex shrink-0", sz)}>
        <span class="flex h-full w-full overflow-hidden rounded-full bg-secondary">
          ${when(
            this.src && !this.failed,
            () => html`<img
              class="aspect-square h-full w-full object-cover"
              src=${this.src}
              alt=${this.alt}
              @error=${this.onError}
            />`,
            () => html`<span class="flex h-full w-full items-center justify-center font-medium text-muted-foreground"
              ><slot></slot
            ></span>`,
          )}
        </span>
        <span class=${"absolute bottom-0 right-0 " + (hasBadge ? "flex" : "hidden")}><slot name="badge"></slot></span>
      </span>
    `;
  }
}

@Component.define()
export class ShadAvatarGroup extends Component("shad-avatar-group") {
  // Overlap children and ring each with the page background so they read as a
  // stack. `margin-inline-start` (not -left) keeps the overlap correct in RTL.
  static styles = [
    tw,
    css`
      :host { display: inline-flex; }
      /* !important beats the slotted avatar's OWN-tree Tailwind preflight
         (* { margin: 0 }), which otherwise wins via shadow-cascade proximity. */
      ::slotted(*) {
        margin-inline-start: -0.5rem !important;
        border-radius: 9999px;
        box-shadow: 0 0 0 2px hsl(var(--background));
      }
      ::slotted(:first-child) { margin-inline-start: 0 !important; }
    `,
  ];

  override render() {
    return html`<slot></slot>`;
  }
}
