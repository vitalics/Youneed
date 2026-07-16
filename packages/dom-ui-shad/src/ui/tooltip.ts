// shad <shad-tooltip> — wraps a trigger and shows a tip on hover/focus (CSS only,
// no positioning lib). <shad-tooltip text="Copy"><shad-button>📋</shad-button></shad-tooltip>

import { Component, html, css } from "@youneed/dom";
import { tw, cn } from "../lib/shad.ts";

@Component.define()
export class ShadTooltip extends Component("shad-tooltip") {
  // Positioning + show/hide are local CSS (real `transform`, not Tailwind's
  // var-based `translate-x`, so it works in a minimal Tailwind build).
  static styles = [
    tw,
    css`
      :host { display: inline-block; position: relative }
      .tip {
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        margin-bottom: 6px;
        opacity: 0;
        transition: opacity 0.15s;
        pointer-events: none;
      }
      :host(:hover) .tip,
      :host(:focus-within) .tip { opacity: 1 }
    `,
  ];

  @Component.prop({ attribute: true }) text = "";

  override render() {
    return html`
      <slot></slot>
      <span
        role="tooltip"
        class=${cn(
          "tip z-50 inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground shadow-md",
        )}
        data-slot="tooltip-content"
        >${this.text || html`<slot name="content"></slot>`}</span
      >
    `;
  }
}
