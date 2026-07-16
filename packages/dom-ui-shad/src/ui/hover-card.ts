// shad <shad-hover-card> — a card that appears when you hover the trigger (the
// default slot). The card markup goes in the `content` slot.
//   <shad-hover-card>
//     <shad-button variant="link">Hover Here</shad-button>
//     <div slot="content" class="flex w-64 flex-col gap-0.5">…</div>
//   </shad-hover-card>
// Opens after `open-delay` ms, closes `close-delay` ms after the pointer leaves
// both the trigger and the card. The card is position:fixed (anchored to the
// trigger via `side`/`align`) so it escapes any overflow-hidden ancestor.

import { Component, html, css, when, type OnMount } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

type Side = "top" | "right" | "bottom" | "left";
type Align = "start" | "center" | "end";

@Component.define()
export class ShadHoverCard extends Component("shad-hover-card") implements OnMount {
  static styles = [
    tw,
    css`
      :host { display: inline-block; }
      [data-card] { animation: hcIn 0.15s ease-out; }
      @keyframes hcIn { from { opacity: 0; transform: scale(0.96); } }
    `,
  ];

  @Component.prop({ attribute: "open-delay" }) openDelay = 700;
  @Component.prop({ attribute: "close-delay" }) closeDelay = 300;
  @Component.prop({ attribute: true }) side: Side = "bottom";
  @Component.prop({ attribute: true }) align: Align = "center";

  #open = this.signal(false);
  #x = this.signal(0);
  #y = this.signal(0);
  #openT = 0;
  #closeT = 0;

  onMount(): void {
    addEventListener("scroll", () => this.#open() && this.#hardClose(), { capture: true, passive: true, signal: this.abortSignal });
  }

  #trigger(): HTMLElement | null {
    return (this.shadowRoot!.querySelector('slot:not([name])') as HTMLSlotElement).assignedElements()[0] as HTMLElement ?? null;
  }

  #scheduleOpen(): void {
    clearTimeout(this.#closeT);
    if (this.#open()) return;
    this.#openT = window.setTimeout(() => {
      this.#open.set(true);
      requestAnimationFrame(() => this.#position());
    }, this.openDelay);
  }
  #scheduleClose(): void {
    clearTimeout(this.#openT);
    this.#closeT = window.setTimeout(() => this.#open.set(false), this.closeDelay);
  }
  #hardClose(): void {
    clearTimeout(this.#openT);
    clearTimeout(this.#closeT);
    this.#open.set(false);
  }

  #position(): void {
    const t = this.#trigger();
    const card = this.shadowRoot!.querySelector("[data-card]") as HTMLElement | null;
    if (!t || !card) return;
    const r = t.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const gap = 8;
    let x = 0, y = 0;
    if (this.side === "bottom" || this.side === "top") {
      y = this.side === "bottom" ? r.bottom + gap : r.top - c.height - gap;
      x = this.align === "start" ? r.left : this.align === "end" ? r.right - c.width : r.left + r.width / 2 - c.width / 2;
    } else {
      x = this.side === "right" ? r.right + gap : r.left - c.width - gap;
      y = this.align === "start" ? r.top : this.align === "end" ? r.bottom - c.height : r.top + r.height / 2 - c.height / 2;
    }
    x = Math.max(8, Math.min(x, innerWidth - c.width - 8));
    y = Math.max(8, Math.min(y, innerHeight - c.height - 8));
    this.#x.set(x);
    this.#y.set(y);
  }

  override render() {
    return html`
      <slot
        @pointerenter=${() => this.#scheduleOpen()}
        @pointerleave=${() => this.#scheduleClose()}
        @focusin=${() => this.#scheduleOpen()}
        @focusout=${() => this.#scheduleClose()}
      ></slot>
      ${when(
        this.#open(),
        () => html`<div
          data-card
          role="dialog"
          class="fixed z-50 rounded-md border border-border bg-popover p-4 text-sm text-popover-foreground shadow-md outline-none"
          style=${`left:${this.#x()}px;top:${this.#y()}px`}
          @pointerenter=${() => clearTimeout(this.#closeT)}
          @pointerleave=${() => this.#scheduleClose()}
        >
          <slot name="content"></slot>
        </div>`,
      )}
    `;
  }
}
