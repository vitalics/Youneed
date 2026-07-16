// Our framework's island — the dom.ts twin of ReactIsland/VueIsland. It wraps
// the same <dom-stepper>, mirrors its value into reactive state via the bubbling
// `change` event, and shows it — exactly like the React/Vue cards. `start` comes
// from the SSR attribute; `.value=${this.val}` binds to the mirror (not a
// constant), so re-applying on change is a no-op, never fighting the stepper.

import { Component, html, css, type OnMount } from "@youneed/dom";
import "./dom-stepper.ts"; // ensure <dom-stepper> is registered

@Component.define()
export class OurIsland extends Component("our-island", {
  styles: css`
    :host {
      display: block;
    }
    h3 {
      margin: 0 0 6px;
    }
    b {
      font-variant-numeric: tabular-nums;
    }
  `,
}) implements OnMount {
  @Component.prop() val = 0;

  onMount(): void {
    this.val = Number(this.getAttribute("start") ?? 0); // seed from SSR markup
    this.listen(this, "change", (e) => {
      this.val = (e as CustomEvent<number>).detail; // mirror the stepper's state
    });
  }

  render() {
    return html`
      <h3>🧩 Our framework</h3>
      <p>Our state mirrors the Web Component: <b>${this.val}</b></p>
      <dom-stepper .value=${this.val}></dom-stepper>
    `;
  }
}
