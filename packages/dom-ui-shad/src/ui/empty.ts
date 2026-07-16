// shad empty-state primitives — composable parts for "nothing here yet" screens.
//   <shad-empty variant="outline">
//     <shad-empty-header>
//       <shad-empty-media variant="icon"><svg>…</svg></shad-empty-media>
//       <shad-empty-title>No Projects Yet</shad-empty-title>
//       <shad-empty-description>Get started by creating one.</shad-empty-description>
//     </shad-empty-header>
//     <shad-empty-content>
//       <shad-button>Create Project</shad-button>
//     </shad-empty-content>
//   </shad-empty>
//
// Pure layout: each part renders a styled inner div + a `slot { display: contents }`
// so slotted children become real flex items (Tailwind utilities live in the part's
// own shadow, so no :host/preflight cascade fights).

import { Component, html, css } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

@Component.define()
export class ShadEmpty extends Component("shad-empty") {
  static styles = [tw, css`:host { display: flex; flex: 1 1 auto; } slot { display: contents; }`];

  // outline → dashed border; background → subtle gradient surface.
  @Component.prop({ attribute: true }) variant: "default" | "outline" | "background" = "default";

  override render() {
    const variant =
      this.variant === "outline"
        ? " border border-dashed border-border bg-background"
        : this.variant === "background"
          ? " bg-gradient-to-b from-muted/50 to-background"
          : " bg-background";
    return html`<div
      data-slot="empty"
      class=${"flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-4 rounded-xl p-6 text-center" + variant}
    >
      <slot></slot>
    </div>`;
  }
}

@Component.define()
export class ShadEmptyHeader extends Component("shad-empty-header") {
  static styles = [tw, css`:host { display: block; } slot { display: contents; }`];
  override render() {
    return html`<div class="flex max-w-sm flex-col items-center gap-2"><slot></slot></div>`;
  }
}

@Component.define()
export class ShadEmptyMedia extends Component("shad-empty-media") {
  static styles = [
    tw,
    css`
      :host { display: block; }
      slot { display: contents; }
      /* Size a slotted icon without forcing the consumer to add classes. */
      ::slotted(svg) { width: 1.25rem; height: 1.25rem; }
    `,
  ];

  // icon → muted rounded box; default → bare (e.g. an avatar / avatar group).
  @Component.prop({ attribute: true }) variant: "icon" | "default" = "icon";

  override render() {
    const cls =
      this.variant === "icon"
        ? "mb-2 flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"
        : "mb-2 flex shrink-0 items-center justify-center";
    return html`<div data-variant=${this.variant} class=${cls}><slot></slot></div>`;
  }
}

@Component.define()
export class ShadEmptyTitle extends Component("shad-empty-title") {
  static styles = [tw, css`:host { display: block; } slot { display: contents; }`];
  override render() {
    return html`<div class="text-base font-medium tracking-tight"><slot></slot></div>`;
  }
}

@Component.define()
export class ShadEmptyDescription extends Component("shad-empty-description") {
  static styles = [tw, css`:host { display: block; } slot { display: contents; }`];
  override render() {
    return html`<div
      class="text-sm leading-relaxed text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-primary"
    >
      <slot></slot>
    </div>`;
  }
}

@Component.define()
export class ShadEmptyContent extends Component("shad-empty-content") {
  static styles = [tw, css`:host { display: block; width: 100%; } slot { display: contents; }`];
  override render() {
    return html`<div class="mx-auto flex w-full max-w-sm min-w-0 flex-row flex-wrap items-center justify-center gap-2 text-sm">
      <slot></slot>
    </div>`;
  }
}
