// shad <shad-input-otp> — a one-time-password field: a row of slot boxes backed
// by a single (transparent, overlaid) <input> that owns focus + the real value.
//   <shad-input-otp maxlength="6"></shad-input-otp>            six digit slots
//   <shad-input-otp maxlength="6" .groups=${[3, 3]}></shad-input-otp>  with separator
//   <shad-input-otp pattern="alphanumeric"></shad-input-otp>
// `pattern`: "digits" (default) | "alphanumeric" | a custom RegExp source string.
// Emits `input` (value) on every change and `complete` (value) when full.

import { Component, html, css, map, when, type OnMount } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

const PATTERNS: Record<string, RegExp> = {
  digits: /[^0-9]/g,
  alphanumeric: /[^a-z0-9]/gi,
};

@Component.define()
export class ShadInputOtp extends Component("shad-input-otp") implements OnMount {
  static styles = [
    tw,
    css`
      :host { display: inline-block; }
      /* The caret blink shown in the active, empty slot while focused. */
      .caret { animation: otpCaret 1s steps(1) infinite; }
      @keyframes otpCaret { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0; } }
    `,
  ];

  @Component.prop({ attribute: true }) maxlength = 6;
  @Component.prop({ attribute: true }) value = "";
  @Component.prop({ attribute: true }) pattern = "digits"; // digits | alphanumeric | <regex source>
  @Component.prop({ attribute: true }) disabled = false;
  @Component.prop({ attribute: true }) invalid = false;
  @Component.prop({ attribute: true }) separator = false; // split into two equal halves
  @Component.prop() groups: number[] = []; // explicit group sizes, e.g. [3, 3]

  #focused = this.signal(false);

  onMount(): void {
    // Seed the overlay input with any initial value.
    const input = this.shadowRoot!.querySelector("input");
    if (input) input.value = this.value;
  }

  #filterRe(): RegExp {
    return PATTERNS[this.pattern] ?? new RegExp(this.pattern.startsWith("[^") ? this.pattern : `[^${this.pattern}]`, "gi");
  }
  #onInput(e: Event): void {
    // The native <input> event is composed and would bubble out of the host,
    // colliding with our own detail-carrying "input" event — stop it here.
    e.stopPropagation();
    const el = e.target as HTMLInputElement;
    const clean = el.value.replace(this.#filterRe(), "").slice(0, this.maxlength);
    el.value = clean;
    this.value = clean;
    this.emit("input", clean);
    if (clean.length === this.maxlength) this.emit("complete", clean);
  }

  // Group boundaries: explicit `groups`, else two halves when `separator`, else one.
  #groupSizes(): number[] {
    if (this.groups.length) return this.groups;
    if (this.separator) {
      const half = Math.ceil(this.maxlength / 2);
      return [half, this.maxlength - half];
    }
    return [this.maxlength];
  }

  #slot(i: number) {
    const ch = this.value[i] ?? "";
    const active = this.#focused() && i === Math.min(this.value.length, this.maxlength - 1) && this.value.length < this.maxlength;
    const activeFilled = this.#focused() && i === this.value.length - 1 && this.value.length === this.maxlength;
    const on = active || activeFilled;
    return html`<div
      data-slot="input-otp-slot"
      data-active=${String(on)}
      aria-invalid=${this.invalid ? "true" : null}
      class=${"relative flex size-10 items-center justify-center border-y border-r border-input bg-background text-sm transition-all first:rounded-l-md first:border-l last:rounded-r-md " +
      (this.invalid ? "border-destructive " : "") +
      (on ? "z-10 border-ring ring-2 ring-ring/50 " + (this.invalid ? "ring-destructive/30 " : "") : "")}
    >
      ${ch}
      ${when(active && !ch, () => html`<div class="caret pointer-events-none absolute h-4 w-px bg-foreground"></div>`)}
    </div>`;
  }

  override render() {
    const sizes = this.#groupSizes();
    let idx = 0;
    const groups = sizes.map((size) => {
      const start = idx;
      idx += size;
      return { start, size };
    });
    return html`<div
      class=${"relative flex items-center gap-2 " + (this.disabled ? "pointer-events-none opacity-50" : "")}
    >
      ${map(
        groups,
        (g, gi) => html`
          ${when(gi > 0, () => html`<div class="text-muted-foreground" aria-hidden="true">–</div>`)}
          <div data-slot="input-otp-group" class="flex items-center">
            ${map(Array.from({ length: g.size }, (_, k) => g.start + k), (i) => this.#slot(i))}
          </div>
        `,
      )}
      <input
        data-slot="input-otp"
        class="absolute inset-0 h-full w-full cursor-text opacity-0 disabled:cursor-not-allowed"
        autocomplete="one-time-code"
        inputmode=${this.pattern === "alphanumeric" ? "text" : "numeric"}
        maxlength=${this.maxlength}
        .disabled=${this.disabled}
        @input=${(e: Event) => this.#onInput(e)}
        @focus=${() => this.#focused.set(true)}
        @blur=${() => this.#focused.set(false)}
      />
    </div>`;
  }
}
