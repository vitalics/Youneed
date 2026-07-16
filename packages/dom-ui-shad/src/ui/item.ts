// shad item primitives — a flex container for a title/description/media/actions
// row. Compose the parts; group them with <shad-item-group>.
//   <shad-item variant="outline">
//     <shad-item-media variant="icon"><svg>…</svg></shad-item-media>
//     <shad-item-content>
//       <shad-item-title>Basic Item</shad-item-title>
//       <shad-item-description>A simple item.</shad-item-description>
//     </shad-item-content>
//     <shad-item-actions><shad-button size="sm">Action</shad-button></shad-item-actions>
//   </shad-item>
//
// Layout lives on inner divs (Tailwind in each part's own shadow); flex/order/width
// sit on :host (Tailwind preflight doesn't reset those). Set `href` to render the
// item as an <a> (a clickable list row).

import { Component, html, css } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

@Component.define()
export class ShadItem extends Component("shad-item") {
  static styles = [tw, css`:host { display: block; } slot { display: contents; }`];

  @Component.prop({ attribute: true, reflect: true }) variant: "default" | "outline" | "muted" = "default";
  @Component.prop({ attribute: true, reflect: true }) size: "default" | "sm" | "xs" = "default";
  @Component.prop({ attribute: true }) href = "";

  #cls(): string {
    const base =
      "group/item flex w-full flex-wrap items-center gap-2.5 rounded-lg text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
    const variant =
      this.variant === "outline"
        ? " border border-border bg-background"
        : this.variant === "muted"
          ? " bg-muted/50"
          : " bg-background";
    const size = this.size === "xs" ? " px-2.5 py-1.5" : this.size === "sm" ? " px-3 py-2.5" : " px-4 py-3";
    const link = this.href ? " cursor-pointer hover:bg-muted" : "";
    return base + variant + size + link;
  }

  override render() {
    const cls = this.#cls();
    return this.href
      ? html`<a href=${this.href} data-slot="item" data-variant=${this.variant} data-size=${this.size} class=${cls}><slot></slot></a>`
      : html`<div data-slot="item" data-variant=${this.variant} data-size=${this.size} class=${cls}><slot></slot></div>`;
  }
}

@Component.define()
export class ShadItemGroup extends Component("shad-item-group") {
  static styles = [tw, css`:host { display: block; width: 100%; } slot { display: contents; }`];
  override render() {
    return html`<div role="list" data-slot="item-group" class="flex w-full flex-col"><slot></slot></div>`;
  }
}

@Component.define()
export class ShadItemSeparator extends Component("shad-item-separator") {
  static styles = [tw, css`:host { display: block; width: 100%; }`];
  override render() {
    return html`<div role="separator" class="my-0 h-px w-full bg-border"></div>`;
  }
}

@Component.define()
export class ShadItemMedia extends Component("shad-item-media") {
  static styles = [
    tw,
    css`
      :host { flex: 0 0 auto; display: block; align-self: center; }
      slot { display: contents; }
      ::slotted(svg) { width: 1.25rem; height: 1.25rem; }
      ::slotted(img) { width: 100%; height: 100%; object-fit: cover; }
    `,
  ];

  @Component.prop({ attribute: true, reflect: true }) variant: "default" | "icon" | "image" = "default";

  override render() {
    const cls =
      this.variant === "icon"
        ? "flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground"
        : this.variant === "image"
          ? "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md"
          : "flex shrink-0 items-center justify-center gap-2 bg-transparent";
    return html`<div data-slot="item-media" data-variant=${this.variant} class=${cls}><slot></slot></div>`;
  }
}

@Component.define()
export class ShadItemContent extends Component("shad-item-content") {
  static styles = [tw, css`:host { flex: 1 1 auto; display: block; min-width: 0; } slot { display: contents; }`];
  override render() {
    return html`<div data-slot="item-content" class="flex flex-1 flex-col justify-center gap-1"><slot></slot></div>`;
  }
}

@Component.define()
export class ShadItemTitle extends Component("shad-item-title") {
  static styles = [tw, css`:host { display: block; } slot { display: contents; }`];
  override render() {
    return html`<div data-slot="item-title" class="flex w-fit items-center gap-2 text-sm font-medium leading-snug">
      <slot></slot>
    </div>`;
  }
}

@Component.define()
export class ShadItemDescription extends Component("shad-item-description") {
  static styles = [tw, css`:host { display: block; } slot { display: contents; }`];
  override render() {
    return html`<p
      data-slot="item-description"
      class="line-clamp-2 text-sm font-normal leading-normal text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-primary"
    >
      <slot></slot>
    </p>`;
  }
}

@Component.define()
export class ShadItemActions extends Component("shad-item-actions") {
  static styles = [tw, css`:host { flex: 0 0 auto; display: block; align-self: center; } slot { display: contents; }`];
  override render() {
    return html`<div data-slot="item-actions" class="flex items-center gap-2"><slot></slot></div>`;
  }
}

@Component.define()
export class ShadItemHeader extends Component("shad-item-header") {
  // Full-width → wraps to its own line at the top of the flex-wrap item.
  static styles = [tw, css`:host { display: block; width: 100%; order: -1; } slot { display: contents; }`];
  override render() {
    return html`<div data-slot="item-header" class="flex w-full items-center justify-between gap-2"><slot></slot></div>`;
  }
}

@Component.define()
export class ShadItemFooter extends Component("shad-item-footer") {
  static styles = [tw, css`:host { display: block; width: 100%; order: 1; } slot { display: contents; }`];
  override render() {
    return html`<div data-slot="item-footer" class="flex w-full items-center justify-between gap-2"><slot></slot></div>`;
  }
}
