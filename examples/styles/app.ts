// Dynamic scoped styles: change a component's :host styles at runtime.
//
// The styles are attached via Component options as a RAW CSS STRING (the same
// shape you'd get from `import css from "./x.css?raw"`). On click we restyle the
// live instance two ways:
//   • setStyles(string) — swap in a fresh per-instance sheet (clean; the string
//     is turned into a scoped stylesheet for us);
//   • getStyles()[0].replaceSync(string) — mutate the current sheet in place.

import { Component, html, type OnMount } from "@youneed/dom";

const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c"];

// Scoped CSS for a given background — plain text, no `css` tag needed.
const styleText = (bg: string) => `
  :host {
    display: block;
    padding: 28px;
    border-radius: 12px;
    background-color: ${bg};
    color: #fff;
    font-family: system-ui, sans-serif;
    transition: background-color 0.25s ease;
  }
  button {
    font: 600 14px system-ui;
    padding: 8px 16px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    margin-right: 8px;
  }
  .hint { margin-top: 12px; opacity: 0.85; font-size: 13px; }
`;

@Component.define()
class ColorChanger
  extends Component("app-changer", { styles: styleText(COLORS[0]) })
  implements OnMount
{
  @Component.prop() index = 0;

  get color(): string {
    return COLORS[this.index % COLORS.length];
  }

  onMount(): void {
    // getStyles() returns this instance's live sheets — handy for inspection.
    console.log("[app-changer] scoped sheets:", this.getStyles().length);
  }

  // Clean per-instance swap: replace scoped styles with a fresh sheet (from a
  // string — setStyles turns it into a stylesheet).
  @Component.event()
  next(): void {
    this.index++;
    this.setStyles(styleText(this.color));
  }

  // The other documented approach: mutate the current sheet in place.
  @Component.event()
  reset(): void {
    this.index = 0;
    this.getStyles()[0].replaceSync(styleText(this.color));
  }

  render() {
    return html`
      <button @click=${this.next}>Change color</button>
      <button @click=${this.reset}>Reset</button>
      <div class="hint">background is a scoped :host style · current: ${this.color}</div>
    `;
  }
}
