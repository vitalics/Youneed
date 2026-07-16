// One component, SIX providers — i18n, direction, color-scheme, a11y, logger and
// a Zustand store — all composed in a single `providers: [...]` array and all
// typed onto `this` (`this.i18n`, `this.direction`, `this.colorScheme`,
// `this.a11y`, `this.logger`, `this.store`). This is the showcase.
import { Component, css, html } from "@youneed/dom";
import { i18nProvider } from "@youneed/dom-provider-i18n";
import { directionProvider } from "@youneed/dom-provider-direction";
import { colorSchemeProvider } from "@youneed/dom-provider-color-scheme";
import { a11yProvider } from "@youneed/dom-provider-a11y";
import { loggerProvider } from "@youneed/dom-provider-logger";
import { zustandProvider } from "@youneed/dom-provider-zustand";
import { cart, dir, i18n, theme } from "./stores.ts";

@Component.define()
class Showcase extends Component("showcase-card", {
  providers: [
    i18nProvider(i18n), // → this.i18n (typed keys, params from templates)
    directionProvider(dir), // → this.direction (LTR/RTL)
    colorSchemeProvider(theme), // → this.colorScheme (light/dark/auto)
    a11yProvider({ audit: true }), // → this.a11y (announce, roving, …) + dev CSS audit
    loggerProvider({ meta: { feature: "showcase" } }), // → this.logger (scoped child)
    zustandProvider(cart, { selector: (s) => s.count }), // → this.store (re-render on count)
  ],
  styles: css`
    :host { display: block; color-scheme: light dark; }
    .card {
      background: light-dark(#ffffff, #1b1b1f);
      color: light-dark(#1b1b1f, #e7e7ea);
      border: 1px solid light-dark(#e2e8f0, #3a3a40);
      border-radius: 14px; padding: 22px 24px; max-width: 480px;
      font: 15px/1.5 system-ui, sans-serif; transition: background 0.2s, color 0.2s;
    }
    h2 { margin: 0 0 14px; font-size: 20px; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0; }
    .count { font-weight: 700; font-size: 18px; }
    button {
      background: light-dark(#eef2ff, #312e81); color: light-dark(#3730a3, #c7d2fe);
      border: 1px solid light-dark(#c7d2fe, #4338ca); border-radius: 8px;
      padding: 6px 12px; font: inherit; cursor: pointer; transition: background 0.15s;
    }
    button:hover { background: light-dark(#e0e7ff, #3730a3); }
    .controls button { background: transparent; color: inherit; border-color: light-dark(#cbd5e1, #475569); }
    @media (prefers-reduced-motion: reduce) { .card, button { transition: none; } }
  `,
}) {
  #add() {
    this.store.set((s) => ({ count: s.count + 1, items: [...s.items, `item ${s.count + 1}`] }));
    const count = this.store.state.count;
    this.logger.info("item added", { count }); // → devtools "logger" via console + the i18n/a11y panels
    this.a11y.announce(this.i18n("added", { count })); // → screen reader + a11y devtools tail
  }
  #reset() {
    this.store.set({ count: 0, items: [] });
    this.logger.warn("cart reset");
  }
  render() {
    return html`
      <div class="card">
        <h2>${this.i18n("greeting", { name: "youneed" })}</h2>
        <div class="row">
          <button @click=${() => this.#add()}>${this.i18n("add")}</button>
          <button @click=${() => this.#reset()}>${this.i18n("reset")}</button>
        </div>
        <p>${this.i18n("cart")}: <span class="count">${this.store.state.count}</span></p>
        <div class="row controls">
          <button @click=${() => i18n.setLocale("en")}>EN</button>
          <button @click=${() => i18n.setLocale("de")}>DE</button>
          <button @click=${() => i18n.setLocale("ar")}>AR (rtl)</button>
          <button @click=${() => this.colorScheme.toggle()}>theme: ${this.colorScheme.value}</button>
          <button @click=${() => this.direction.toggle()}>dir: ${this.direction.value}</button>
        </div>
      </div>
    `;
  }
}
