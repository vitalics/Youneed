// shad <shad-spinner> — a spinning loading indicator. Size it on the host
// (default 1rem): <shad-spinner class="size-6"></shad-spinner>. Color follows
// currentColor, so it inherits from its surroundings (button, badge, etc.).

import { Component, html, css } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

@Component.define()
export class ShadSpinner extends Component("shad-spinner") {
  static styles = [tw, css`:host { display: inline-flex; width: 1rem; height: 1rem; }`];

  override render() {
    return html`<svg
      class="h-full w-full animate-spin"
      role="status"
      aria-label="Loading"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>`;
  }
}
