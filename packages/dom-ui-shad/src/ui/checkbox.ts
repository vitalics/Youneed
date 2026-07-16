// shad <shad-checkbox> — reflects `checked`, emits `change`:
//   <shad-checkbox checked></shad-checkbox>
// The box fades its border/background (transition-colors) and the check mark
// "draws" itself in via an animated stroke-dashoffset.

import { Component, html, css, classMap, type OnMount } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

@Component.define()
export class ShadCheckbox extends Component("shad-checkbox") implements OnMount {
  static styles = [
    tw,
    css`
      :host { display: inline-block; }
      /* Check mark draw-in: the path is dashed to its own length and offset out
         of view, then offset back to 0 when checked. */
      .check {
        width: 0.75rem;
        height: 0.75rem;
      }
      .check path {
        stroke-dasharray: 24;
        stroke-dashoffset: 24;
        transition: stroke-dashoffset 200ms cubic-bezier(0.65, 0, 0.35, 1);
      }
      button[aria-checked="true"] .check path {
        stroke-dashoffset: 0;
      }
    `,
  ];

  @Component.prop({ attribute: true }) checked = false;
  @Component.prop({ attribute: true }) disabled = false;
  @Component.prop({ attribute: true }) invalid = false;
  // Accessible name forwarded onto the inner role=checkbox (a <shad-label for>
  // donates its text here; or set `aria-label` directly on the host).
  @Component.prop({ attribute: "aria-label" }) accessibleName = "";

  @Component.event() toggle(): void {
    if (this.disabled) return;
    this.checked = !this.checked;
    this.emit("change", this.checked);
  }

  onMount(): void {
    // Toggle at the HOST level: the inner button's native clicks (mouse +
    // Space/Enter) bubble up here, and a `<shad-label for>` activates us via
    // host.click() too — one handler, no double-fire.
    this.addEventListener("click", () => this.toggle(), { signal: this.abortSignal });
  }

  /** Delegate focus to the focusable inner control (host has no tabindex). */
  override focus(options?: FocusOptions): void {
    this.shadowRoot?.querySelector("button")?.focus(options);
  }

  override render() {
    return html`
      <button
        type="button"
        role="checkbox"
        aria-checked=${String(this.checked)}
        aria-invalid=${this.invalid ? "true" : "false"}
        aria-label=${this.accessibleName || null}
        class=${classMap({
          "peer flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50": true,
          "border-primary focus-visible:ring-ring": !this.invalid,
          "border-destructive focus-visible:ring-destructive": this.invalid,
          "bg-primary text-primary-foreground": this.checked,
          "bg-background": !this.checked,
        })}
        .disabled=${this.disabled}
      >
        <svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <path d="M20 6 9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    `;
  }
}
