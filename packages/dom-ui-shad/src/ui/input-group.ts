// shad input-group primitives — an input/textarea wrapped with addons (icons,
// text, buttons, kbd, spinners) aligned on any edge.
//   <shad-input-group>
//     <shad-input-group-input placeholder="Search…"></shad-input-group-input>
//     <shad-input-group-addon><svg>…</svg></shad-input-group-addon>            inline-start
//     <shad-input-group-addon align="inline-end">12 results</shad-input-group-addon>
//   </shad-input-group>
//
// The container is a flex box; addons place themselves with `order` (set on
// :host, which Tailwind preflight doesn't reset). A `block-start`/`block-end`
// addon flips the group to a column (detected via slotchange). Border/padding
// live on inner divs so the outer-scope preflight can't nuke them; focus-within
// reaches the slotted control through the flat tree.

import { Component, html, css, type OnMount } from "@youneed/dom";
import { tw } from "../lib/shad.ts";
import "./button.ts";

type Align = "inline-start" | "inline-end" | "block-start" | "block-end";

@Component.define()
export class ShadInputGroup extends Component("shad-input-group") implements OnMount {
  static styles = [tw, css`:host { display: block; width: 100%; } slot { display: contents; }`];

  #block = this.signal(false);

  onMount(): void {
    this.#scan();
  }
  #scan(): void {
    const slot = this.shadowRoot!.querySelector("slot") as HTMLSlotElement;
    const block = slot.assignedElements().some(
      (el) => el.tagName === "SHAD-INPUT-GROUP-ADDON" && (el.getAttribute("align") ?? "").startsWith("block"),
    );
    this.#block.set(block);
  }

  override render() {
    const block = this.#block();
    return html`<div
      role="group"
      data-slot="input-group"
      class=${"relative flex w-full min-w-0 rounded-lg border border-border bg-background transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50 " +
      (block ? "h-auto flex-col items-stretch" : "h-9 items-center")}
    >
      <slot @slotchange=${() => this.#scan()}></slot>
    </div>`;
  }
}

@Component.define()
export class ShadInputGroupInput extends Component("shad-input-group-input") {
  static styles = [tw, css`:host { flex: 1 1 0%; display: block; min-width: 0; }`];

  @Component.prop({ attribute: true }) placeholder = "";
  @Component.prop({ attribute: true }) value = "";
  @Component.prop({ attribute: true }) type = "text";
  @Component.prop({ attribute: true }) disabled = false;

  override render() {
    return html`<input
      data-slot="input-group-control"
      class="h-9 w-full min-w-0 border-0 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
      type=${this.type}
      placeholder=${this.placeholder}
      .value=${this.value}
      .disabled=${this.disabled}
    />`;
  }
}

@Component.define()
export class ShadInputGroupTextarea extends Component("shad-input-group-textarea") {
  static styles = [tw, css`:host { flex: 1 1 0%; display: block; min-width: 0; width: 100%; }`];

  @Component.prop({ attribute: true }) placeholder = "";
  @Component.prop({ attribute: true }) value = "";
  @Component.prop({ attribute: true }) rows = 3;

  override render() {
    return html`<textarea
      data-slot="input-group-control"
      class="w-full resize-none border-0 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
      rows=${this.rows}
      placeholder=${this.placeholder}
      .value=${this.value}
    ></textarea>`;
  }
}

@Component.define()
export class ShadInputGroupAddon extends Component("shad-input-group-addon") {
  static styles = [
    tw,
    css`
      :host { display: flex; }
      :host([align="inline-start"]) { order: -1; }
      :host([align="inline-end"]) { order: 1; }
      :host([align="block-start"]) { order: -1; width: 100%; }
      :host([align="block-end"]) { order: 1; width: 100%; }
      slot { display: contents; }
      /* Slotted icons aren't matched by [&>svg] (they're projected); size them here. */
      ::slotted(svg) { width: 1rem; height: 1rem; }
    `,
  ];

  @Component.prop({ attribute: true, reflect: true }) align: Align = "inline-start";

  override render() {
    const pad =
      this.align === "inline-start"
        ? "pl-3"
        : this.align === "inline-end"
          ? "pr-3"
          : "w-full px-3 py-1.5";
    return html`<div
      role="group"
      data-slot="input-group-addon"
      class=${"flex cursor-text items-center gap-2 text-sm font-medium text-muted-foreground select-none [&>svg]:h-4 [&>svg]:w-4 " + pad}
    >
      <slot></slot>
    </div>`;
  }
}

// A thin wrapper over <shad-button> at its compact `xs` size — same variants,
// focus ring, disabled handling. (shadcn's InputGroupButton is likewise just a
// Button with size="xs".)
@Component.define()
export class ShadInputGroupButton extends Component("shad-input-group-button") {
  static styles = [tw, css`:host { display: inline-flex; } ::slotted(svg) { width: 0.875rem; height: 0.875rem; }`];

  @Component.prop({ attribute: true }) variant: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link" = "ghost";
  @Component.prop({ attribute: true }) disabled = false;

  override render() {
    return html`<shad-button variant=${this.variant} size="xs" .disabled=${this.disabled}><slot></slot></shad-button>`;
  }
}
