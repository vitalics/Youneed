// shad <shad-card> — a content container. Slots (all optional; empty ones add no
// spacing): image (full-bleed top), title, description, action (header top-end),
// default (content), footer.
//   <shad-card>
//     <span slot="title">Title</span>
//     <span slot="description">Subtitle</span>
//     <shad-button slot="action" variant="ghost" size="sm">…</shad-button>
//     Body content…
//     <shad-button slot="footer">Save</shad-button>
//   </shad-card>
// `--card-gap` (default 1.5rem) controls the section gap + padding.

import { Component, html, css, when } from "@youneed/dom";
import { tw, cn } from "../lib/shad.ts";

@Component.define()
export class ShadCard extends Component("shad-card") {
  static styles = [
    tw,
    css`
      :host { display: block; --card-gap: 1.5rem; }
      ::slotted([slot="image"]) { display: block; width: 100%; }
      ::slotted([slot="image"]) { object-fit: cover; }
    `,
  ];

  override render() {
    const has = (sel: string) => !!this.querySelector(sel);
    const hasTitle = has('[slot="title"]');
    const hasDesc = has('[slot="description"]');
    const hasAction = has('[slot="action"]');
    const hasHeader = hasTitle || hasDesc || hasAction;
    const hasFooter = has('[slot="footer"]');
    const hasImage = has('[slot="image"]');
    // Any light child WITHOUT a slot attribute → default (content) slot is used.
    const hasContent = [...this.childNodes].some((n) =>
      n.nodeType === 1 ? !(n as Element).getAttribute("slot") : !!n.textContent?.trim(),
    );

    return html`
      <div
        class=${cn("flex flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm")}
        style="row-gap: var(--card-gap); padding-block: var(--card-gap)"
      >
        ${when(
          hasImage,
          () => html`<div style="margin-top: calc(var(--card-gap) * -1)"><slot name="image"></slot></div>`,
        )}
        ${when(
          hasHeader,
          () => html`<div
            class=${cn("grid items-start gap-y-1.5", hasAction && "grid-cols-[1fr_auto]")}
            style="padding-inline: var(--card-gap)"
          >
            ${when(hasTitle, () => html`<div class="font-semibold leading-none tracking-tight"><slot name="title"></slot></div>`)}
            ${when(hasDesc, () => html`<div class="text-sm text-muted-foreground"><slot name="description"></slot></div>`)}
            ${when(hasAction, () => html`<div class="col-start-2 row-span-2 row-start-1 self-start justify-self-end"><slot name="action"></slot></div>`)}
          </div>`,
        )}
        ${when(hasContent, () => html`<div style="padding-inline: var(--card-gap)"><slot></slot></div>`)}
        ${when(hasFooter, () => html`<div class="flex items-center" style="padding-inline: var(--card-gap)"><slot name="footer"></slot></div>`)}
      </div>
    `;
  }
}
