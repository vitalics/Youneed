// Integrating Tailwind with a Shadow-DOM framework.
//
// Tailwind ships GLOBAL utility CSS, but it can't cross a component's shadow
// boundary. The fix is one line: adopt the compiled Tailwind stylesheet into the
// shadow root via `static styles`. The framework already applies styles through
// `adoptedStyleSheets`, and a constructable sheet is shared by reference, so
// adopting the same Tailwind CSS in many components is cheap.
//
// `tailwind.gen.css` is produced by build.mjs (the real `tailwindcss` CLI,
// scanning this file for the classes used) and imported as text by esbuild.

import { Component, html, css, classMap } from "@youneed/dom";
import tailwind from "./tailwind.gen.css";

// One constructable stylesheet from the compiled Tailwind CSS. It's shared by
// reference, so adopting it into many components' shadow roots is cheap — the
// browser stores the parsed sheet once.
const tailwindSheet = new CSSStyleSheet();
tailwindSheet.replaceSync(tailwind);

@Component.define()
export class TwCard extends Component("tw-card") {
  // Adopt the Tailwind sheet (so utilities work inside this shadow root) + a tiny
  // host rule so the custom element lays out as a block.
  static styles = [tailwindSheet, css`:host { display: block; }`];

  @Component.prop() on = false;

  @Component.event() toggle() {
    this.on = !this.on;
  }

  render() {
    return html`
      <div class="max-w-sm mx-auto p-6 bg-white rounded-2xl shadow-lg ring-1 ring-zinc-200">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-zinc-900">Tailwind in Shadow DOM</h2>
          <span
            class=${classMap({
              "px-2 py-0.5 rounded-full text-xs font-medium": true,
              "bg-emerald-100 text-emerald-700": this.on,
              "bg-zinc-100 text-zinc-500": !this.on,
            })}
            >${this.on ? "ON" : "OFF"}</span
          >
        </div>
        <p class="mt-2 text-sm text-zinc-600">
          These utilities are scoped to this component's shadow root via an adopted
          stylesheet. Toggle to watch
          <code class="text-indigo-600">classMap</code> swap the colors.
        </p>
        <button
          @click=${this.toggle}
          class=${classMap({
            "mt-4 w-full rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors": true,
            "bg-indigo-600 hover:bg-indigo-500": !this.on,
            "bg-emerald-600 hover:bg-emerald-500": this.on,
          })}
        >
          ${this.on ? "Enabled" : "Enable"}
        </button>
      </div>
    `;
  }
}
