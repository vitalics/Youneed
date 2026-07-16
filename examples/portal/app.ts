// Demo of two directives: `portal` (render outside the Shadow DOM) and
// `classMap` (conditional classes). The dialog lives in a card with
// `overflow:hidden` + a transform context — a normally-rendered dialog would be
// clipped/mis-stacked. `portal(document.body, …)` lets it escape and cover the
// viewport, while `classMap` flips its look between the normal/danger variants.

import { Component, html, css, portal, classMap, when } from "@youneed/dom";

@Component.define()
export class PortalDemo extends Component("portal-demo") {
  @Component.prop() open = false;
  @Component.prop() danger = false;

  @Component.event() show() {
    this.open = true;
  }
  @Component.event() close() {
    this.open = false;
  }
  @Component.event() confirm() {
    this.open = false;
    console.log(this.danger ? "deleted" : "confirmed");
  }
  @Component.event() toggleVariant(e: Event) {
    this.danger = (e.target as HTMLInputElement).checked;
  }

  static styles = css`
    :host { display: block; font: 15px/1.5 system-ui, sans-serif; color: #18181b; }
    code { background: #f4f4f5; padding: 1px 5px; border-radius: 4px; }
    /* This card CLIPS its content and creates a transform/stacking context — a
       dialog rendered inline here would be cut off. portal() escapes it. */
    .card {
      border: 1px solid #e4e4e7; border-radius: 12px; padding: 16px;
      max-width: 460px; overflow: hidden; transform: translateZ(0);
    }
    h2 { font-size: 1.1rem; margin: 0 0 8px; }
    .row { display: flex; gap: 10px; align-items: center; margin-top: 12px; }
    label { font-size: 13px; color: #52525b; display: inline-flex; gap: 5px; align-items: center; }
    button {
      font: inherit; padding: 6px 14px; border-radius: 8px;
      border: 1px solid #d4d4d8; background: #fff; cursor: pointer;
    }
    button.primary { background: #4f46e5; border-color: #4f46e5; color: #fff; }
    button.danger { background: #dc2626; border-color: #dc2626; color: #fff; }
    button.ghost { background: transparent; }

    /* The dialog is portaled into <body>, so these fixed/overlay styles are not
       affected by the card's overflow/transform. */
    .backdrop {
      position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45);
      display: grid; place-items: center; z-index: 9999;
    }
    .dialog {
      background: #fff; border-radius: 14px; padding: 22px; min-width: 320px;
      box-shadow: 0 12px 48px rgba(0, 0, 0, 0.28); border-top: 4px solid #4f46e5;
    }
    .dialog.danger { border-top-color: #dc2626; }
    .dialog h3 { margin: 0 0 6px; }
    .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 18px; }
  `;

  render() {
    return html`
      <div class="card">
        <h2>Portal + classMap</h2>
        <p>
          This card has <code>overflow: hidden</code> and a transform context, yet
          the dialog still covers the whole viewport — because <code>portal()</code>
          renders it into <code>document.body</code>. The button and dialog styling
          flip via <code>classMap</code>.
        </p>
        <div class="row">
          <button
            class=${classMap({ primary: !this.danger, danger: this.danger })}
            @click=${this.show}
          >
            Open dialog
          </button>
          <label>
            <input type="checkbox" .checked=${this.danger} @change=${this.toggleVariant} />
            danger variant
          </label>
        </div>
      </div>

      ${portal(
        document.body,
        when(this.open, () => html`
          <div class="backdrop" @click=${this.close}>
            <div
              class=${classMap({ dialog: true, danger: this.danger })}
              @click=${(e: Event) => e.stopPropagation()}
            >
              <h3>${this.danger ? "Delete item?" : "Confirm"}</h3>
              <p>
                ${this.danger
                  ? "This action cannot be undone."
                  : "Are you sure you want to continue?"}
              </p>
              <div class="actions">
                <button class="ghost" @click=${this.close}>Cancel</button>
                <button
                  class=${classMap({ primary: !this.danger, danger: this.danger })}
                  @click=${this.confirm}
                >
                  ${this.danger ? "Delete" : "OK"}
                </button>
              </div>
            </div>
          </div>
        `),
      )}
    `;
  }
}
