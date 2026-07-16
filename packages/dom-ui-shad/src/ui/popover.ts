// shad <shad-popover> — a panel that opens on click of its trigger (default slot).
// The panel body goes in the `content` slot.
//   <shad-popover>
//     <shad-button variant="outline">Open popover</shad-button>
//     <div slot="content" class="grid gap-4">…</div>
//   </shad-popover>
// Anchored to the trigger via `side`/`align`; position:fixed so it escapes any
// overflow-hidden ancestor. Closes on outside click, Escape, or scroll.

import { Component, html, css, when, type OnMount } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

type Side = "top" | "right" | "bottom" | "left";
type Align = "start" | "center" | "end";

@Component.define()
export class ShadPopover extends Component("shad-popover") implements OnMount {
  static styles = [
    tw,
    css`
      :host { display: inline-block; }
      [data-pop] { animation: popIn 0.12s ease-out; }
      @keyframes popIn { from { opacity: 0; transform: scale(0.96); } }
    `,
  ];

  @Component.prop({ attribute: true }) side: Side = "bottom";
  @Component.prop({ attribute: true }) align: Align = "center";
  @Component.prop({ attribute: true }) width = "w-72";

  #open = this.signal(false);
  #x = this.signal(0);
  #y = this.signal(0);

  onMount(): void {
    document.addEventListener(
      "click",
      (e) => {
        if (!this.#open()) return;
        const path = e.composedPath();
        if (path.includes(this.#trigger()!) || path.some((n) => n instanceof HTMLElement && n.hasAttribute("data-pop"))) return;
        this.close();
      },
      { signal: this.abortSignal },
    );
    document.addEventListener("keydown", (e) => { if (this.#open() && (e as KeyboardEvent).key === "Escape") this.close(); }, { signal: this.abortSignal });
    addEventListener("scroll", () => this.#open() && this.close(), { capture: true, passive: true, signal: this.abortSignal });
  }

  #trigger(): HTMLElement | null {
    return (this.shadowRoot!.querySelector('slot:not([name])') as HTMLSlotElement).assignedElements()[0] as HTMLElement ?? null;
  }

  show(): void {
    if (this.#open()) return;
    this.#open.set(true);
    requestAnimationFrame(() => this.#position());
  }
  close(): void {
    this.#open.set(false);
  }
  #toggle(): void {
    this.#open() ? this.close() : this.show();
  }

  #position(): void {
    const t = this.#trigger();
    const pop = this.shadowRoot!.querySelector("[data-pop]") as HTMLElement | null;
    if (!t || !pop) return;
    const r = t.getBoundingClientRect();
    const c = pop.getBoundingClientRect();
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
      <slot @click=${() => this.#toggle()}></slot>
      ${when(
        this.#open(),
        () => html`<div
          data-pop
          role="dialog"
          class=${"fixed z-50 rounded-md border border-border bg-popover p-4 text-sm text-popover-foreground shadow-md outline-none " + this.width}
          style=${`left:${this.#x()}px;top:${this.#y()}px`}
        >
          <slot name="content"></slot>
        </div>`,
      )}
    `;
  }
}
