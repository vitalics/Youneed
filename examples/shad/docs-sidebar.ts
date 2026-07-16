// <docs-sidebar active="button"> — the left nav. Presentational: it renders the
// NAV groups as history links and highlights `active`. <docs-app> owns routing.

import { Component, html, css, classMap, map } from "@youneed/dom";
import { tw } from "@youneed/dom-ui-shad";
import { NAV } from "./demos.ts";

@Component.define()
export class DocsSidebar extends Component("docs-sidebar") {
  static styles = [tw, css`:host { display: block }`];

  @Component.prop({ attribute: true }) active = "button";

  override render() {
    return html`
      <nav class="text-sm">
        ${map(
          NAV,
          (g) => html`<div class="mb-5">
            <div class="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              ${g.group}
            </div>
            ${map(
              g.items,
              (it) => html`<a
                href=${"/components/" + it.slug}
                class=${classMap({
                  "block rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:text-foreground": true,
                  "bg-accent font-medium text-accent-foreground": it.slug === this.active,
                })}
                >${it.title}</a
              >`,
            )}
          </div>`,
        )}
      </nav>
    `;
  }
}
