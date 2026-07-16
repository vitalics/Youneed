// shad <shad-label> — a form label. <shad-label>Email</shad-label>.
//
// With `for`, it associates with a control in the SAME root (works across shadow
// DOM, where a native <label for> can't): clicking focuses + activates the
// control, and the label donates its text as the control's accessible name.

import { Component, html, css, type OnMount } from "@youneed/dom";
import { tw, cn } from "../lib/shad.ts";

// Controls a label may toggle on click (those whose host.click() flips a value).
const ACTIVATABLE = "shad-checkbox, shad-radio-group-item, shad-switch";

@Component.define()
export class ShadLabel extends Component("shad-label") implements OnMount {
  static styles = [tw, css`:host { display: inline-block }`];

  /** Id of the associated control, resolved within this label's root. */
  @Component.prop({ attribute: true }) for = "";

  // querySelector on getRootNode(), not document — so an id reference resolves
  // inside the current shadow root (a native `for` IDREF can't cross that line).
  #target(): (HTMLElement & { focus(): void }) | null {
    if (!this.for) return null;
    return (this.getRootNode() as ParentNode).querySelector(`#${CSS.escape(this.for)}`);
  }

  onMount(): void {
    if (!this.for) return;
    // Donate the label text as the control's accessible name if it lacks one.
    // Deferred so a control declared AFTER this label is connected by now.
    queueMicrotask(() => {
      const t = this.#target();
      const name = this.textContent?.trim();
      if (t && name && !t.getAttribute("aria-label")) t.setAttribute("aria-label", name);
    });
  }

  #activate = (): void => {
    const t = this.#target();
    if (!t) return;
    t.focus();
    if (t.matches(ACTIVATABLE)) t.click();
  };

  override render() {
    // display:contents → the inner <label> never constrains layout, so classes on
    // the host control the slotted content directly (e.g. a clickable choice-card
    // wrapping a radio + title/description). Text styles are inherited; the click
    // still bubbles through for activation.
    return html`<label
      class=${cn("contents text-sm font-medium leading-none", this.for && "cursor-pointer select-none")}
      @click=${this.for ? this.#activate : null}
      ><slot></slot
    ></label>`;
  }
}
