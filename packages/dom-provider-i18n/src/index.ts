// ── @youneed/dom-provider-i18n — translations inside @youneed/dom components ──────────
//
// Use an `@youneed/i18n` translator straight in an `html` template, and have the
// component re-render when the locale changes:
//
//   import { Component, html } from "@youneed/dom";
//   import { createI18n } from "@youneed/i18n";
//   import { provideI18n, i18n, localized } from "@youneed/dom-provider-i18n";
//
//   provideI18n(createI18n({
//     resources: { en: { hello: "Hello {name}" }, de: { hello: "Hallo {name}" } },
//     locale: "en",
//   }));
//
//   class Greeting extends Component() {
//     constructor() { super(); localized(this); }  // re-render on locale change
//     render() { return html`<div>${i18n("hello", { name: "Ada" })}</div>`; }
//   }
//
// `i18n(...)` reads the app-wide instance set by `provideI18n(...)` — it returns a
// plain string, so it drops into any template hole. Reactivity is opt-in per
// component via `localized(this)`: it subscribes the host to the translator and
// calls `requestUpdate()` on every `setLocale(...)`, auto-unsubscribing on
// disconnect (it registers an `onCleanup`).
//
// For full key AUTOCOMPLETE, call your typed instance directly instead of the
// global — `myI18n("hel…")` autocompletes; `localized(this, myI18n)` still wires
// the reactivity. The global `i18n` is the untyped convenience binding.

import type { ComponentProvider } from "@youneed/dom";
import type { I18n, TParams } from "@youneed/i18n";

/** Minimal host surface `localized` needs — satisfied by any `@youneed/dom`
 *  component (`ReactiveHost`). */
export interface LocalizableHost {
  requestUpdate(): void;
  onCleanup(teardown: () => void): void;
}

let current: I18n | undefined;

/** Install the app-wide translator that `i18n(...)` / `t(...)` / `localized(...)`
 *  read from. Returns the instance so you can keep a typed reference. */
export function provideI18n<T extends I18n>(instance: T): T {
  current = instance;
  return instance;
}

/** The active translator. Throws if `provideI18n(...)` hasn't run yet. */
export function getI18n(): I18n {
  if (!current) throw new Error("[i18n-dom] no translator — call provideI18n(...) first");
  return current;
}

/** Translate `key` (interpolating `params`) via the app-wide translator — for
 *  use directly in `html` template holes. */
export function i18n(key: string, params?: TParams): string {
  return getI18n().t(key, params);
}

/** Alias of {@link i18n}. */
export const t = i18n;

/**
 * Subscribe a component to locale changes: every `setLocale(...)` triggers a
 * `requestUpdate()`, so templates that call `i18n(...)` re-render with the new
 * language. Unsubscribes automatically on disconnect. Call it once, e.g. in the
 * constructor or `onMount`. Pass an explicit `instance` to bind to a specific
 * (typed) translator instead of the app-wide one.
 *
 * Returns the unsubscribe (also registered via `host.onCleanup`).
 */
export function localized(host: LocalizableHost, instance: I18n = getI18n()): () => void {
  const off = instance.subscribe(() => host.requestUpdate());
  host.onCleanup(off);
  return off;
}

// ── withI18n — a TYPED `this.i18n` on a component (autocomplete) ─────────────────
//
// The global `i18n(...)` is loosely typed (`key: string`) — convenient, but no
// key autocomplete. To get autocomplete, bind the *typed* translator onto the
// component itself. `withI18n` is a base-class mixin (the framework's own
// composition mechanism — same as `Component(tag, Base)`): it adds a typed
// `this.i18n` AND auto-wires reactivity (re-render on locale change, unsubscribe
// on disconnect — `localized` for free).
//
//   const appI18n = createI18n({ resources, locale: "en" });
//
//   class Greeting extends withI18n(Component("greeting"), appI18n) {
//     render() {
//       return html`<div>${this.i18n("hello", { name: "Ada" })}</div>`;
//       //                       ^ autocompletes "hello" | "bye" | … and type-checks
//     }
//   }

/** A constructor that may be `abstract` — so the `Component(...)` factory's
 *  abstract result can be used as a mixin base. */
export type AbstractConstructor<T = object> = abstract new (...args: any[]) => T;

/** What the mixin needs from its base: a reactive `@youneed/dom` component. */
type ReactiveBase = HTMLElement & LocalizableHost;

/**
 * Mix a typed translator onto a Component base as `this.i18n`, with reactivity
 * auto-wired. `this.i18n` keeps the translator's narrowed key type, so
 * `this.i18n("…")` autocompletes — unlike the global `i18n(...)`.
 *
 * Composition mirrors `Component(tag, Base)`: `withI18n(Component("x"), t)`
 * returns a base your component `extends`. Chainable with other mixins.
 */
export function withI18n<TBase extends AbstractConstructor<ReactiveBase>, T extends I18n>(
  Base: TBase,
  translator: T,
): TBase & AbstractConstructor<{ readonly i18n: T }> {
  abstract class WithI18n extends Base {
    readonly i18n: T = translator;
    constructor(...args: any[]) {
      super(...args);
      localized(this, translator);
    }
  }
  return WithI18n as TBase & AbstractConstructor<{ readonly i18n: T }>;
}

// ── i18nProvider — the same thing as a composable Component provider ─────────────
//
// `withI18n` wraps the base class; `i18nProvider` plugs into the framework's
// `Component(tag, { providers: [...] })` slot — the DOM analogue of a server
// `Controller`'s `guards` / `interceptors`. Identical effect (typed `this.i18n` +
// auto reactivity), but composes orthogonally with other providers (theme, a11y,
// …) in one array:
//
//   class Card extends Component("x-card", {
//     providers: [i18nProvider(appI18n), themeProvider(theme)],
//   }) {
//     render() { return html`${this.i18n("hello", { name: "Ada" })}`; } // typed
//   }

/** A composable `Component` provider adding a TYPED `this.i18n` translator and
 *  auto-wiring reactivity (re-render on locale change, cleanup on disconnect). */
export function i18nProvider<T extends I18n>(translator: T): ComponentProvider<{ readonly i18n: T }> {
  return {
    install(host) {
      (host as { i18n?: T }).i18n = translator;
      localized(host, translator);
    },
  };
}
