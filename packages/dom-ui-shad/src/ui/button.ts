// shad <shad-button> — a shadcn-style button as a Custom Element.
// Content goes in the light DOM (slotted): <shad-button>Click me</shad-button>.
// Variants/size are attributes: <shad-button variant="outline" size="sm">.

import { Component, html, css } from "@youneed/dom";
import { tw, base, variants } from "../lib/shad.ts";

const buttonClass = variants(
  "inline-flex cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variant: {
      default: "bg-primary text-primary-foreground hover:bg-primary/90",
      secondary: "bg-secondary text-foreground hover:bg-accent/80",
      destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      outline: "border border-border bg-background hover:bg-accent hover:text-accent-foreground",
      ghost: "hover:bg-accent hover:text-accent-foreground",
      link: "text-foreground underline-offset-4 hover:underline",
    },
    size: {
      default: "h-10 px-4 py-2",
      sm: "h-9 rounded-md px-3",
      lg: "h-11 rounded-md px-8",
      icon: "h-10 w-10",
      // Compact sizes for tight contexts (e.g. inside an input group addon).
      xs: "h-6 gap-1 rounded-md px-2 text-xs [&_svg:not([class*='size-'])]:size-3.5",
      "icon-xs": "h-6 w-6 [&_svg:not([class*='size-'])]:size-3.5",
    },
  },
  { variant: "default", size: "default" },
);

type Variant = "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";
type Size = "default" | "sm" | "lg" | "icon" | "xs" | "icon-xs";

@Component.define()
export class ShadButton extends Component("shad-button") {
  static styles = [
    tw,
    base,
    css`
      :host { display: inline-block; }
      /* Inside <shad-button-group>: flatten the joined edges and collapse the
         shared 1px border so the buttons read as one segmented control. Logical
         radii keep it correct in RTL. */
      :host-context(shad-button-group) button { border-radius: 0; }
      :host-context(shad-button-group) button:focus-visible { position: relative; z-index: 1; }
      :host-context(shad-button-group:not([orientation="vertical"])):host(:not(:first-child)) button { margin-inline-start: -1px; }
      :host-context(shad-button-group:not([orientation="vertical"])):host(:first-child) button { border-start-start-radius: 0.375rem; border-end-start-radius: 0.375rem; }
      :host-context(shad-button-group:not([orientation="vertical"])):host(:last-child) button { border-start-end-radius: 0.375rem; border-end-end-radius: 0.375rem; }
      :host-context(shad-button-group[orientation="vertical"]) button { width: 100%; }
      :host-context(shad-button-group[orientation="vertical"]):host(:not(:first-child)) button { margin-top: -1px; }
      :host-context(shad-button-group[orientation="vertical"]):host(:first-child) button { border-start-start-radius: 0.375rem; border-start-end-radius: 0.375rem; }
      :host-context(shad-button-group[orientation="vertical"]):host(:last-child) button { border-end-start-radius: 0.375rem; border-end-end-radius: 0.375rem; }
    `,
  ];

  @Component.prop({ attribute: true }) variant: Variant = "default";
  @Component.prop({ attribute: true }) size: Size = "default";
  @Component.prop({ attribute: true }) disabled = false;

  override render() {
    return html`
      <button
        type="button"
        class=${buttonClass({ variant: this.variant, size: this.size })}
        .disabled=${this.disabled}
      >
        <slot></slot>
      </button>
    `;
  }
}
