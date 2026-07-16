// shad <shad-scroll-area> — a scroll container with a slim, themed scrollbar.
//   <shad-scroll-area class="h-72 w-48 rounded-md border">
//     <div class="p-4">…</div>
//   </shad-scroll-area>
//   <shad-scroll-area orientation="horizontal" class="w-96 rounded-md border">…</shad-scroll-area>
// Native overflow scrolling; the scrollbar is styled in this component's shadow
// (::-webkit-scrollbar + scrollbar-width) so it stays slim and on-theme.

import { Component, html, css } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

@Component.define()
export class ShadScrollArea extends Component("shad-scroll-area") {
  static styles = [
    tw,
    css`
      :host { display: block; overflow: hidden; position: relative; background: hsl(var(--background)); }
      .viewport {
        height: 100%;
        width: 100%;
        border-radius: inherit;
        scrollbar-width: thin;
        scrollbar-color: hsl(var(--border)) transparent;
      }
      :host([orientation="vertical"]) .viewport,
      :host(:not([orientation])) .viewport { overflow-x: hidden; overflow-y: auto; }
      :host([orientation="horizontal"]) .viewport { overflow-x: auto; overflow-y: hidden; }
      :host([orientation="both"]) .viewport { overflow: auto; }

      /* WebKit: a thin, rounded thumb inset from the edge (transparent track). */
      .viewport::-webkit-scrollbar { width: 10px; height: 10px; }
      .viewport::-webkit-scrollbar-track { background: transparent; }
      .viewport::-webkit-scrollbar-thumb {
        background-color: hsl(var(--border));
        border-radius: 9999px;
        border: 3px solid transparent;
        background-clip: padding-box;
      }
      .viewport::-webkit-scrollbar-thumb:hover { background-color: hsl(var(--muted-foreground) / 0.5); background-clip: padding-box; }
      .viewport::-webkit-scrollbar-corner { background: transparent; }
    `,
  ];

  @Component.prop({ attribute: true, reflect: true }) orientation: "vertical" | "horizontal" | "both" = "vertical";

  override render() {
    return html`<div class="viewport" tabindex="0"><slot></slot></div>`;
  }
}
