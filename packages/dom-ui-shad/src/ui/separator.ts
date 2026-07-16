// shad <shad-separator> — a thin divider. <shad-separator orientation="vertical">.
// The host itself is the line (1px), so it works as a flex item: horizontal fills
// the width, vertical stretches to the row height (self-stretch).

import { Component, html, css, type OnMount } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

@Component.define()
export class ShadSeparator extends Component("shad-separator") implements OnMount {
  static styles = [
    tw,
    css`
      :host { display: block; flex-shrink: 0; background-color: hsl(var(--border)); }
      :host(:not([orientation="vertical"])) { height: 1px; width: 100%; }
      :host([orientation="vertical"]) { width: 1px; align-self: stretch; }
    `,
  ];

  @Component.prop({ attribute: true, reflect: true }) orientation: "horizontal" | "vertical" = "horizontal";

  onMount(): void {
    this.setAttribute("role", "none"); // decorative
  }

  override render() {
    return html``;
  }
}
