// shad <shad-toggle> — a two-state button. Reflects `pressed`, emits `change`:
//   <shad-toggle variant="outline">B</shad-toggle>

import { Component, html, css, classMap } from "@youneed/dom";
import { tw, variants } from "../lib/shad.ts";

const toggleClass = variants(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variant: {
      default: "bg-transparent",
      outline: "border border-border bg-transparent hover:bg-accent",
    },
    size: { default: "h-10 px-3", sm: "h-9 px-2.5", lg: "h-11 px-5" },
  },
  { variant: "default", size: "default" },
);

type Variant = "default" | "outline";
type Size = "default" | "sm" | "lg";

@Component.define()
export class ShadToggle extends Component("shad-toggle") {
  static styles = [tw, css`:host { display: inline-block }`];

  @Component.prop({ attribute: true }) pressed = false;
  @Component.prop({ attribute: true }) variant: Variant = "default";
  @Component.prop({ attribute: true }) size: Size = "default";
  @Component.prop({ attribute: true }) disabled = false;

  @Component.event() toggle(): void {
    if (this.disabled) return;
    this.pressed = !this.pressed;
    this.emit("change", this.pressed);
  }

  override render() {
    return html`
      <button
        aria-pressed=${String(this.pressed)}
        class=${classMap({
          [toggleClass({ variant: this.variant, size: this.size })]: true,
          "bg-input text-foreground": this.pressed,
        })}
        .disabled=${this.disabled}
        @click=${this.toggle}
      >
        <slot></slot>
      </button>
    `;
  }
}
