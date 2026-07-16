// shad <shad-button-group> — joins buttons (and group text/separators) into one
// segmented control. The connecting (flattened corners + collapsed border) is
// done by the children via :host-context(shad-button-group) — see shad-button.
//   <shad-button-group>
//     <shad-button variant="outline">Prev</shad-button>
//     <shad-button variant="outline">Next</shad-button>
//   </shad-button-group>
//   <shad-button-group orientation="vertical"> … </shad-button-group>

import { Component, html, css, type OnMount } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

@Component.define()
export class ShadButtonGroup extends Component("shad-button-group") implements OnMount {
  static styles = [
    tw,
    css`
      :host { display: inline-flex; align-items: stretch; }
      :host([orientation="vertical"]) { flex-direction: column; }
    `,
  ];

  @Component.prop({ attribute: true }) orientation: "horizontal" | "vertical" = "horizontal";

  onMount(): void {
    this.setAttribute("role", "group");
  }

  override render() {
    return html`<slot></slot>`;
  }
}

@Component.define()
export class ShadButtonGroupSeparator extends Component("shad-button-group-separator") {
  // A thin divider between segments; orients with the group.
  static styles = [
    tw,
    css`
      :host { display: block; align-self: stretch; background: hsl(var(--border)); flex: none; }
      :host-context(shad-button-group:not([orientation="vertical"])) { width: 1px; }
      :host-context(shad-button-group[orientation="vertical"]) { height: 1px; }
    `,
  ];

  override render() {
    return html``;
  }
}

@Component.define()
export class ShadButtonGroupText extends Component("shad-button-group-text") {
  // A non-interactive labelled segment (e.g. a unit / addon) styled like a button.
  static styles = [
    tw,
    css`
      :host { display: inline-flex; }
      .text { border-radius: 0; }
      :host-context(shad-button-group:not([orientation="vertical"])):host(:first-child) .text { border-start-start-radius: 0.375rem; border-end-start-radius: 0.375rem; }
      :host-context(shad-button-group:not([orientation="vertical"])):host(:last-child) .text { border-start-end-radius: 0.375rem; border-end-end-radius: 0.375rem; }
      :host-context(shad-button-group:not([orientation="vertical"])):host(:not(:first-child)) .text { margin-inline-start: -1px; }
    `,
  ];

  override render() {
    return html`<span
      class="text inline-flex items-center gap-2 border border-border bg-muted px-3 text-sm font-medium text-muted-foreground [&>svg]:size-4"
      ><slot></slot
    ></span>`;
  }
}
