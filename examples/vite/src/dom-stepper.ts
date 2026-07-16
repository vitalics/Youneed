// Our framework's contribution: a standard Custom Element (dom.ts). Because it
// IS a Web Component, React and Vue can both embed and drive it with zero glue.
// It reads an initial `value` attribute (so SSR markup carries state) and emits
// a bubbling/composed `change` CustomEvent (so host frameworks can listen).

import { Component, html, css, type OnMount } from "@youneed/dom";

@Component.define()
export class DomStepper extends Component("dom-stepper") implements OnMount {
  static styles = css`
    :host {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 6px 10px;
      border: 2px solid #6366f1;
      border-radius: 8px;
      font: 16px system-ui, sans-serif;
    }
    button {
      width: 28px;
      height: 28px;
      border: 1px solid #a1a1aa;
      border-radius: 6px;
      background: #fff;
      cursor: pointer;
      font: inherit;
    }
    strong {
      min-width: 2ch;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
  `;

  @Component.prop() value = 0;

  onMount(): void {
    const attr = this.getAttribute("value");
    if (attr != null) this.value = Number(attr); // hydrate initial state from SSR markup
  }

  @Component.event() dec(): void {
    this.value--;
    this.emit("change", this.value);
  }
  @Component.event() inc(): void {
    this.value++;
    this.emit("change", this.value);
  }

  render() {
    return html`
      <button @click=${this.dec} aria-label="decrement">−</button>
      <strong>${this.value}</strong>
      <button @click=${this.inc} aria-label="increment">+</button>
    `;
  }
}
