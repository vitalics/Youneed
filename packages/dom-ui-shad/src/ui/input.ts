// shad <shad-input> — a styled text input. Mirrors `value` to/from the attribute
// and re-emits `input` so a host can listen: <shad-input placeholder="Email" />.

import { Component, html, css } from "@youneed/dom";
import { tw, cn } from "../lib/shad.ts";

@Component.define()
export class ShadInput extends Component("shad-input") {
  static styles = [tw, css`:host { display: block }`];

  @Component.prop({ attribute: true }) type = "text";
  @Component.prop({ attribute: true }) placeholder = "";
  @Component.prop({ attribute: true }) value = "";
  @Component.prop({ attribute: true }) disabled = false;
  @Component.prop({ attribute: true }) invalid = false;
  // Accessible name forwarded onto the inner <input> (donated by <shad-label for>
  // or set via `aria-label` on the host).
  @Component.prop({ attribute: "aria-label" }) accessibleName = "";

  @Component.event() onInput(e: Event): void {
    this.value = (e.target as HTMLInputElement).value;
    this.emit("input", this.value); // bubbling/composed, so hosts outside the shadow hear it
  }

  /** Delegate focus to the inner <input> so `<shad-label for>` can focus us. */
  override focus(options?: FocusOptions): void {
    this.shadowRoot?.querySelector("input")?.focus(options);
  }

  override render() {
    return html`
      <input
        class=${cn(
          "flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm",
          "ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          this.invalid && "border-destructive focus-visible:ring-destructive",
        )}
        type=${this.type}
        placeholder=${this.placeholder}
        .value=${this.value}
        .disabled=${this.disabled}
        aria-invalid=${this.invalid ? "true" : "false"}
        aria-label=${this.accessibleName || null}
        @input=${this.onInput}
      />
    `;
  }
}
