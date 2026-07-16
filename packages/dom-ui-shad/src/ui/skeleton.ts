// shad <shad-skeleton> — a loading placeholder. Size + shape it on the host with
// utility classes: <shad-skeleton class="h-12 w-12 rounded-full"></shad-skeleton>.
// The inner bar inherits the host's border-radius (default rounded-md).

import { Component, html, css } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

@Component.define()
export class ShadSkeleton extends Component("shad-skeleton") {
  static styles = [tw, css`:host { display: block; border-radius: 0.375rem; }`];

  override render() {
    return html`<div class="h-full w-full animate-pulse rounded-[inherit] bg-muted"></div>`;
  }
}
