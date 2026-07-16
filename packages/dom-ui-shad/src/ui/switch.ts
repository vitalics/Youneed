// shad <shad-switch> — a toggle. Reflects `checked`, emits `change` (boolean).
//   <shad-switch checked></shad-switch>  ·  <shad-switch size="sm"></shad-switch>
// A <shad-label for> toggles it across shadow DOM (host-level click); set
// `invalid` for the destructive ring.

import { Component, html, css, classMap, styleMap, type OnMount } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

const SIZES = {
  default: { track: "h-[1.15rem] w-8", thumb: "size-4", on: "14px", off: "2px" },
  sm: { track: "h-4 w-7", thumb: "size-3", on: "14px", off: "2px" },
};

@Component.define()
export class ShadSwitch extends Component("shad-switch") implements OnMount {
  static styles = [
    tw,
    css`
      :host { display: inline-block; }
      .thumb { transition: transform 0.2s ease; }
    `,
  ];

  // reflected → a parent can style off [checked] (e.g. a choice-card border).
  @Component.prop({ attribute: true, reflect: true }) checked = false;
  @Component.prop({ attribute: true }) disabled = false;
  @Component.prop({ attribute: true }) invalid = false;
  @Component.prop({ attribute: true }) size: "default" | "sm" = "default";
  // Accessible name forwarded onto the inner role=switch (a <shad-label for>
  // donates its text here; or set aria-label directly on the host).
  @Component.prop({ attribute: "aria-label" }) accessibleName = "";

  @Component.event() toggle(): void {
    if (this.disabled) return;
    this.checked = !this.checked;
    this.emit("change", this.checked);
  }

  onMount(): void {
    // Toggle at the HOST level so a <shad-label for> (which calls host.click())
    // works too — the inner button's clicks bubble up here.
    this.addEventListener("click", () => this.toggle(), { signal: this.abortSignal });
  }

  /** Delegate focus to the focusable inner control. */
  override focus(options?: FocusOptions): void {
    this.shadowRoot?.querySelector("button")?.focus(options);
  }

  override render() {
    const sz = SIZES[this.size] ?? SIZES.default;
    return html`
      <button
        type="button"
        role="switch"
        aria-checked=${String(this.checked)}
        aria-invalid=${this.invalid ? "true" : "false"}
        aria-label=${this.accessibleName || null}
        data-size=${this.size}
        class=${classMap({
          [`relative inline-flex shrink-0 cursor-pointer items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 ${sz.track}`]: true,
          "bg-primary": this.checked && !this.invalid,
          "bg-input": !this.checked && !this.invalid,
          "bg-destructive/20 ring-2 ring-destructive/30": this.invalid,
        })}
        .disabled=${this.disabled}
      >
        <span
          class=${"thumb pointer-events-none block rounded-full bg-background shadow-sm " + sz.thumb}
          style=${styleMap({ transform: `translateX(${this.checked ? sz.on : sz.off})` })}
        ></span>
      </button>
    `;
  }
}
