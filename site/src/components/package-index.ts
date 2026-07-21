// <yn-package-index> — the STATIC, anchorable full package index for the docs
// page: one block per package (`id="pkg-<dir>"`), SSR'd into the #naming
// section. The left sidebar (<yn-docs-nav>) links every non-curated package to
// these anchors; the interactive <yn-package-explorer> stays on the landing.
// Each block shows the package's usage example (first code fence of its README)
// as a data-hl snippet — highlighted by the docs page's render-time pipeline,
// same as the hand-written sections. Light DOM, no client behavior — pure render.
import { Component, html } from "@youneed/dom";
import { packages } from "../data/packages.ts";
import { packageExamples } from "../data/package-examples.ts";

@Component.define()
export class PackageIndex extends Component("yn-package-index", { shadow: false }) {
  render() {
    return html`<div class="pkg-index">
      ${packages.map((p) => {
        const example = packageExamples[p.dir];
        return html`<article class="pkg" id=${`pkg-${p.dir}`}>
          <h3 class="pkg__name"><code>${p.name}</code></h3>
          <p class="pkg__desc">${p.desc}</p>
          ${example ? html`<pre class="code" tabindex="0" data-hl><code>${example}</code></pre>` : ""}
          <a class="pkg__link" href=${`https://github.com/vitalics/Youneed/tree/main/packages/${p.dir}`}>README →</a>
        </article>`;
      })}
    </div>`;
  }
}
