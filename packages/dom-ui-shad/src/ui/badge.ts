// shad <shad-badge> — a small status pill. <shad-badge variant="destructive">.
// Renders as a link when `href` is set. Slotted icons are auto-sized; pass extra
// utility classes on the host (e.g. `class="bg-sky-500 text-white"`) for custom
// colors — they're forwarded onto the inner element and reliably WIN, because
// the variant colors are applied at zero specificity via :where().

import { Component, html, css } from "@youneed/dom";
import { tw, cn } from "../lib/shad.ts";

const BASE =
  "badge inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none";

type Variant = "default" | "secondary" | "destructive" | "outline";

@Component.define()
export class ShadBadge extends Component("shad-badge") {
  static styles = [
    tw,
    css`
      :host { display: inline-block; }
      /* display:contents lets a slotted icon + text be flex items of the pill. */
      slot { display: contents; }
      ::slotted(svg) { width: 0.75rem; height: 0.75rem; }
      /* Variant colors live in @layer components — BELOW Tailwind's utilities
         layer — so forwarded utility classes (custom colors on the host) always
         win, deterministically, without a cn() tailwind-merge. */
      @layer components {
        .badge { border-color: transparent; }
        .badge[data-variant="default"] { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
        .badge[data-variant="default"]:hover { background: hsl(var(--primary) / 0.8); }
        .badge[data-variant="secondary"] { background: hsl(var(--secondary)); color: hsl(var(--foreground)); }
        .badge[data-variant="secondary"]:hover { background: hsl(var(--accent) / 0.8); }
        .badge[data-variant="destructive"] { background: hsl(var(--destructive)); color: hsl(var(--destructive-foreground)); }
        .badge[data-variant="destructive"]:hover { background: hsl(var(--destructive) / 0.8); }
        .badge[data-variant="outline"] { color: hsl(var(--foreground)); border-color: hsl(var(--border)); }
      }
    `,
  ];

  @Component.prop({ attribute: true }) variant: Variant = "default";
  @Component.prop({ attribute: true }) href = "";

  override render() {
    // Forward host utility classes onto the inner element for custom colors.
    const extra = this.getAttribute("class") ?? "";
    const cls = cn(BASE, this.href && "cursor-pointer hover:underline", extra);
    return this.href
      ? html`<a class=${cls} data-variant=${this.variant} href=${this.href}><slot></slot></a>`
      : html`<span class=${cls} data-variant=${this.variant}><slot></slot></span>`;
  }
}
