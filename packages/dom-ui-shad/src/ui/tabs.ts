// shad <shad-tabs> + <shad-tab> — tabbed panels.
//   <shad-tabs value="account">
//     <shad-tab value="account" title="Account">…</shad-tab>
//     <shad-tab value="password" title="Password">…</shad-tab>
//   </shad-tabs>

import { Component, html, css, classMap, map, type OnMount } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

@Component.define()
export class ShadTab extends Component("shad-tab") {
  static styles = [tw, css`
    :host { display: block }
    :host(:not([active])) { display: none }
  `];

  @Component.prop({ attribute: true }) value = "";
  @Component.prop({ attribute: true }) override title = "";
  // `reflect` writes the prop back to the attribute, so `:host([active])` above
  // shows/hides the panel when the parent flips this prop.
  @Component.prop({ reflect: true }) active = false;

  override render() {
    return html`<div role="tabpanel" class="mt-2 text-sm"><slot></slot></div>`;
  }
}

@Component.define()
export class ShadTabs extends Component("shad-tabs") implements OnMount {
  static styles = [tw, css`:host { display: block }`];

  @Component.prop({ attribute: true }) value = "";

  onMount(): void {
    this.#sync();
    // Children may upgrade after this element — re-sync when slotted content changes.
    this.shadowRoot?.querySelector("slot")?.addEventListener("slotchange", () => this.#sync(), {
      signal: this.abortSignal,
    });
  }

  #tabs(): Element[] {
    return [...this.querySelectorAll("shad-tab")];
  }

  // Flip each child's `active` prop; `reflect` mirrors it to the attribute so the
  // child's `:host([active])` CSS shows the matching panel. Re-render the triggers.
  #sync(): void {
    const tabs = this.#tabs();
    if (!this.value && tabs[0]) this.value = tabs[0].getAttribute("value") ?? "";
    for (const t of tabs) {
      (t as Element & { active: boolean }).active = t.getAttribute("value") === this.value;
    }
    this.requestUpdate();
  }

  #select(value: string): void {
    this.value = value;
    this.#sync();
  }

  override render() {
    const tabs = this.#tabs().map((t) => ({
      value: t.getAttribute("value") ?? "",
      title: t.getAttribute("title") || t.getAttribute("value") || "",
    }));
    return html`
      <div
        role="tablist"
        class="inline-flex h-10 items-center justify-center rounded-md bg-secondary p-1 text-muted-foreground"
      >
        ${map(
          tabs,
          (t) => html`<button
            role="tab"
            aria-selected=${String(t.value === this.value)}
            class=${classMap({
              "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring": true,
              "bg-background text-foreground shadow-sm": t.value === this.value,
            })}
            @click=${() => this.#select(t.value)}
          >
            ${t.title}
          </button>`,
        )}
      </div>
      <slot></slot>
    `;
  }
}
