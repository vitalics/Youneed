// shad <shad-kbd> / <shad-kbd-group> — keyboard key hints.
//   <shad-kbd-group>
//     <shad-kbd>⌘</shad-kbd><shad-kbd>K</shad-kbd>
//   </shad-kbd-group>
//   <shad-kbd-group><shad-kbd>Ctrl</shad-kbd><span>+</span><shad-kbd>B</shad-kbd></shad-kbd-group>
// Styling lives on an inner <kbd> (Tailwind in its own shadow); the host stays
// inline so keys flow with surrounding text.

import { Component, html, css } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

@Component.define()
export class ShadKbd extends Component("shad-kbd") {
  static styles = [
    tw,
    css`
      :host { display: inline-flex; vertical-align: middle; }
      slot { display: contents; }
      ::slotted(svg) { width: 0.75rem; height: 0.75rem; }
    `,
  ];
  override render() {
    return html`<kbd
      data-slot="kbd"
      class="pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none"
    >
      <slot></slot>
    </kbd>`;
  }
}

@Component.define()
export class ShadKbdGroup extends Component("shad-kbd-group") {
  static styles = [tw, css`:host { display: inline-flex; vertical-align: middle; } slot { display: contents; }`];
  override render() {
    return html`<kbd data-slot="kbd-group" class="inline-flex items-center gap-1 text-muted-foreground"><slot></slot></kbd>`;
  }
}
