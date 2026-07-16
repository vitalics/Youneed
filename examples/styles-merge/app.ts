// Three style sources merged onto ONE component, to show the adoption order and
// who wins the cascade. All become entries in the shadow root's
// `adoptedStyleSheets`, collected base-first; lazy sheets are appended last:
//
//   [ options styles ]  →  [ static styles ]  →  [ lazy () => import() ]
//        adopted 1st            adopted 2nd            adopted last (wins)
//
// Each layer sets a unique rule (so all three visibly merge) AND the shared
// `:host { background }` (so you can see the LAST-adopted layer win it).

import { Component, css, html } from "@youneed/dom";
import optionsCss from "./options.css"; // esbuild text loader → string

@Component.define()
export class StyleMerge extends Component("style-merge", {
  // Layer 1: a CSS string passed via the options — adopted first.
  styles: optionsCss,
}) {
  // Layer 2: the component's own `css` sheet — adopted after the options layer,
  // so its `:host { background }` beats layer 1. Layer 3 (lazy) is appended after
  // this and beats both.
  static styles = [
    css`
      :host {
        background: #fee2e2; /* red bg — beats layer 1, loses to layer 3 */
        border: 3px solid #f87171; /* unique: border */
        border-radius: 14px; /* unique: radius */
        font: 14px/1.6 system-ui, sans-serif;
        color: #18181b;
        max-width: 460px;
      }
      .lazy-only { display: none; } /* hidden until the lazy sheet reveals it */
      ul { margin: 8px 0; padding-left: 18px; }
      code { background: #00000010; padding: 1px 4px; border-radius: 4px; }
      .readout { margin-top: 12px; font: 12px ui-monospace, monospace; color: #52525b; }
      .badge { font-weight: 700; }
    `,
    // Layer 3: lazy — resolves to { default: "<css text>" }; adopted last.
    () => import("./lazy.css"),
  ];

  onMount(): void {
    // The component renders before the lazy sheet arrives, so refresh the live
    // readout a couple of times to reflect the merged result once it lands.
    for (const ms of [0, 60, 200]) setTimeout(() => this.requestUpdate(), ms);
  }

  render() {
    const bg = getComputedStyle(this).backgroundColor;
    return html`
      <h2 class="label badge">Style merging</h2>
      <p>The card merges three style sources. Background should end up <strong>green</strong>:</p>
      <ul>
        <li><code>options.styles</code> (imported text) — padding + indigo bg <em>(overridden)</em></li>
        <li><code>static styles</code> (<code>css\`\`</code>) — border + radius + red bg <em>(overridden)</em></li>
        <li><code>() => import()</code> (lazy) — green bg <strong>(wins)</strong> + reveals ↓</li>
      </ul>
      <p class="lazy-only">✅ This line is styled only by the lazily-loaded sheet.</p>
      <div class="readout">
        adopted sheets: ${this.getStyles().length} · resolved :host background: ${bg}
      </div>
    `;
  }
}
