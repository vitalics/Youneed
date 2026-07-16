// shad <shad-radio-group> + <shad-radio-group-item> — single-choice controls.
//   <shad-radio-group value="comfortable">
//     <div class="flex items-center gap-3">
//       <shad-radio-group-item value="default" id="r1"></shad-radio-group-item>
//       <shad-label for="r1">Default</shad-label>
//     </div>
//     …
//   </shad-radio-group>
// The group owns the selected `value`, syncs each item's checked state, and emits
// `change`. Click an item (or its <shad-label for>) or use arrow keys to pick.

import { Component, html, css, when, type OnMount, type OnUpdate } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

@Component.define()
export class ShadRadioGroup extends Component("shad-radio-group") implements OnMount, OnUpdate {
  static styles = [tw, css`:host { display: block; } slot { display: contents; }`];

  @Component.prop({ attribute: true, reflect: true }) value = "";
  @Component.prop({ attribute: true }) disabled = false;
  @Component.prop({ attribute: true }) invalid = false;

  #items(): (HTMLElement & { value: string; checked: boolean; disabled: boolean; invalid: boolean })[] {
    return [...this.querySelectorAll("shad-radio-group-item")] as never;
  }

  onMount(): void {
    this.addEventListener("click", (e) => {
      const item = e.composedPath().find((n) => (n as Element)?.tagName === "SHAD-RADIO-GROUP-ITEM") as
        | (HTMLElement & { value: string; disabled: boolean })
        | undefined;
      if (item && !item.disabled && !this.disabled) this.#select(item.value);
    }, { signal: this.abortSignal });

    this.addEventListener("keydown", (e) => {
      const k = (e as KeyboardEvent).key;
      if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(k)) return;
      e.preventDefault();
      const items = this.#items().filter((i) => !i.disabled);
      if (!items.length) return;
      const cur = items.findIndex((i) => i.value === this.value);
      const dir = k === "ArrowDown" || k === "ArrowRight" ? 1 : -1;
      const next = items[(cur + dir + items.length) % items.length];
      this.#select(next.value);
      next.focus?.();
    }, { signal: this.abortSignal });

    this.#sync();
  }
  // Re-sync children after any (re)render — covers programmatic `value` changes.
  onUpdate(): void {
    this.#sync();
  }

  #select(v: string): void {
    if (v === this.value) return;
    this.value = v;
    this.#sync();
    this.emit("change", v);
  }
  #sync(): void {
    for (const it of this.#items()) {
      it.checked = it.value === this.value;
      it.invalid = this.invalid;
      if (this.disabled) it.disabled = true;
    }
  }

  override render() {
    return html`<div role="radiogroup" aria-required="false" class="grid gap-3"><slot @slotchange=${() => this.#sync()}></slot></div>`;
  }
}

@Component.define()
export class ShadRadioGroupItem extends Component("shad-radio-group-item") {
  static styles = [tw, css`:host { display: inline-flex; }`];

  @Component.prop({ attribute: true }) value = "";
  // reflected → a parent can style off [checked] (e.g. a choice-card border).
  @Component.prop({ attribute: true, reflect: true }) checked = false;
  @Component.prop({ attribute: true }) disabled = false;
  @Component.prop({ attribute: true }) invalid = false;

  /** Delegate focus to the inner button (host has no tabindex). */
  override focus(opts?: FocusOptions): void {
    this.shadowRoot?.querySelector("button")?.focus(opts);
  }

  override render() {
    return html`<button
      type="button"
      role="radio"
      aria-checked=${String(this.checked)}
      aria-invalid=${this.invalid ? "true" : "false"}
      data-state=${this.checked ? "checked" : "unchecked"}
      class=${"relative flex aspect-square size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 " +
      (this.invalid ? "border-destructive " : "") +
      (this.checked ? "border-primary bg-primary" : "border-input")}
      .disabled=${this.disabled}
    >
      ${when(
        this.checked,
        () => html`<span class="size-2 rounded-full bg-primary-foreground"></span>`,
      )}
    </button>`;
  }
}
