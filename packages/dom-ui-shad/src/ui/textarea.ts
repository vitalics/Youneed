// shad <shad-textarea> — a styled multi-line input. Mirrors `value` and re-emits
// `input`: <shad-textarea placeholder="Message" rows="4"></shad-textarea>.

import { Component, html, css } from "@youneed/dom";
import { tw, cn } from "../lib/shad.ts";

@Component.define()
export class ShadTextarea extends Component("shad-textarea") {
  static styles = [tw, css`:host { display: block }`];

  @Component.prop({ attribute: true }) placeholder = "";
  @Component.prop({ attribute: true }) value = "";
  @Component.prop({ attribute: true }) rows = 3;
  @Component.prop({ attribute: true }) disabled = false;

  @Component.event() onInput(e: Event): void {
    this.value = (e.target as HTMLTextAreaElement).value;
    this.emit("input", this.value);
  }

  override render() {
    return html`
      <textarea
        class=${cn(
          "flex min-h-[80px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm",
          "ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        )}
        placeholder=${this.placeholder}
        rows=${this.rows}
        .value=${this.value}
        .disabled=${this.disabled}
        @input=${this.onInput}
      ></textarea>
    `;
  }
}
