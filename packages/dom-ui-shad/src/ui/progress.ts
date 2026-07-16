// shad <shad-progress> — a determinate progress bar. <shad-progress value="60">.

import { Component, html, css, styleMap } from "@youneed/dom";
import { tw, cn } from "../lib/shad.ts";

@Component.define()
export class ShadProgress extends Component("shad-progress") {
  static styles = [tw, css`:host { display: block }`];

  @Component.prop({ attribute: true }) value = 0; // 0–100

  override render() {
    const pct = Math.max(0, Math.min(100, this.value));
    return html`
      <div
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow=${String(pct)}
        class=${cn("relative flex h-1 w-full items-center overflow-hidden rounded-full bg-muted")}
      >
        <div
          class="size-full flex-1 bg-primary transition-all"
          style=${styleMap({ transform: `translateX(-${100 - pct}%)` })}
        ></div>
      </div>
    `;
  }
}
