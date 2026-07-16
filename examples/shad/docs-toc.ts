// <docs-toc .items=${[{label,id}]}> — the right-rail "On this page" nav. Dumb /
// presentational: it renders anchor links and emits a `select` event with the
// target id; <docs-app> owns the actual scroll (the target lives in another
// shadow root, so a native #hash anchor can't reach it).

import { Component, html, css, map } from "@youneed/dom";
import { tw } from "@youneed/dom-ui-shad";

export interface TocItem {
  label: string;
  id: string;
}

@Component.define()
export class DocsToc extends Component("docs-toc") {
  static styles = [tw, css`:host { display: block }`];

  @Component.prop() items: TocItem[] = [];

  override render() {
    if (!this.items.length) return html``;
    return html`
      <div class="text-sm">
        <div class="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          On this page
        </div>
        ${map(
          this.items,
          (it) => html`<a
            href=${"#" + it.id}
            class="block rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
            @click=${(e: Event) => {
              e.preventDefault();
              this.emit("select", it.id);
            }}
            >${it.label}</a
          >`,
        )}
      </div>
    `;
  }
}
