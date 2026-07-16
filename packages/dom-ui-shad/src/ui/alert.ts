// shad <shad-alert> — a callout. Slots: icon, title, default (description).
//   <shad-alert variant="destructive">
//     <svg slot="icon">…</svg>
//     <span slot="title">Error</span>
//     Your session expired.
//   </shad-alert>
// The icon column only appears when an `slot="icon"` child is present, so
// icon-less alerts aren't indented.

import { Component, html, css } from "@youneed/dom";
import { tw, variants } from "../lib/shad.ts";

const alertClass = variants(
  "alert relative grid w-full gap-y-0.5 rounded-lg border px-4 py-3 text-left text-sm",
  {
    variant: {
      default: "bg-card text-card-foreground border-border",
      destructive: "border-destructive/50 text-destructive",
    },
  },
  { variant: "default" },
);

type Variant = "default" | "destructive";

@Component.define()
export class ShadAlert extends Component("shad-alert") {
  static styles = [
    tw,
    css`
      :host { display: block; }
      ::slotted([slot="icon"]) { width: 1rem; height: 1rem; }
    `,
  ];

  @Component.prop({ attribute: true }) variant: Variant = "default";

  override render() {
    // Detect the icon synchronously (works in SSR + client) so the layout has no
    // empty leading column / FOUC. `:host(:has())` is unreliable in Chromium and
    // a shadow `:has()` can't see slotted light-DOM content.
    const hasIcon = !!this.querySelector('[slot="icon"]');
    const col2 = hasIcon ? " col-start-2" : "";
    const desc = this.variant === "destructive" ? "text-destructive/90" : "text-muted-foreground";
    return html`
      <div role="alert" class=${alertClass({ variant: this.variant }) + (hasIcon ? " grid-cols-[auto_1fr] gap-x-3" : " grid-cols-1")}>
        <span class=${hasIcon ? "row-span-2 self-start translate-y-0.5" : "hidden"}><slot name="icon"></slot></span>
        <div class=${"font-medium leading-none tracking-tight" + col2}><slot name="title"></slot></div>
        <div class=${"text-sm [&_p]:leading-relaxed " + desc + col2}><slot></slot></div>
      </div>
    `;
  }
}
