// ── @youneed/dom-provider-color-scheme — light / dark / auto per component ───
//
// A composable `@youneed/dom` provider that manages a component's color scheme:
// it sets the CSS `color-scheme` property (so native form controls, scrollbars
// and `light-dark()` follow it) and a `data-color-scheme` attribute (a hook for
// your own CSS), and lets the component flip at runtime via
// `this.setColorScheme(...)`. Plugs into the `Component(tag, { providers: [...] })`
// slot — orthogonal to other providers.
//
//   import { Component, html } from "@youneed/dom";
//   import { colorSchemeProvider } from "@youneed/dom-provider-color-scheme";
//
//   class Card extends Component("x-card", { providers: [colorSchemeProvider("auto")] }) {
//     render() {
//       return html`
//         <button @click=${() => this.toggleColorScheme()}>theme</button>
//         <p>scheme: ${this.colorScheme} (${this.resolvedColorScheme})</p>`;
//     }
//   }
//
// Per-instance by default; pass a SHARED store for app-wide theming (every bound
// component flips together):
//
//   const theme = createColorSchemeStore("auto");
//   class A extends Component("x-a", { providers: [colorSchemeProvider(theme)] }) {}
//   theme.set("dark"); // A (and any other follower) re-renders in dark

import type { ComponentProvider } from "@youneed/dom";

/** A color-scheme preference. `auto` follows the OS (`prefers-color-scheme`). */
export type ColorScheme = "light" | "dark" | "auto";

/** The provider's contribution, exposed as `this.colorScheme`. */
export interface ColorSchemeApi {
  /** The chosen preference (`light` / `dark` / `auto`). */
  readonly value: ColorScheme;
  /** The concrete scheme in effect — `auto` resolved against the OS preference. */
  readonly resolved: "light" | "dark";
  /** Set the preference: reflects CSS + `data-color-scheme`, re-renders, notifies peers. */
  set(scheme: ColorScheme): void;
  /** Flip to the opposite of what's currently in effect (`auto` resolves first). */
  toggle(): void;
}

/** A reactive color-scheme value — shareable so components flip together. */
export interface ColorSchemeStore {
  /** The current preference. */
  readonly colorScheme: ColorScheme;
  /** The concrete scheme in effect (`auto` resolved against the OS preference). */
  readonly resolvedColorScheme: "light" | "dark";
  /** Set it; no-op if unchanged. Notifies subscribers. */
  set(scheme: ColorScheme): void;
  /** Flip to the opposite of what's in effect. */
  toggle(): void;
  /** Run `listener` on every change. Returns an unsubscribe. */
  subscribe(listener: (scheme: ColorScheme) => void): () => void;
}

/** Whether the OS currently prefers a dark scheme (false where `matchMedia` is
 *  unavailable, e.g. SSR / non-DOM environments). */
export function systemPrefersDark(): boolean {
  return (
    typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches === true
  );
}

/** Resolve a preference to a concrete scheme (`auto` → the OS preference). */
export function resolveColorScheme(scheme: ColorScheme): "light" | "dark" {
  return scheme === "auto" ? (systemPrefersDark() ? "dark" : "light") : scheme;
}

// `auto` maps to the CSS `color-scheme: light dark` (UA renders per OS preference);
// an explicit choice maps to itself.
const toCssColorScheme = (scheme: ColorScheme): string => (scheme === "auto" ? "light dark" : scheme);

/** Create a standalone, reactive color-scheme store (pass it to
 *  `colorSchemeProvider` to share one scheme across components). */
export function createColorSchemeStore(initial: ColorScheme = "auto"): ColorSchemeStore {
  let scheme = initial;
  const subscribers = new Set<(scheme: ColorScheme) => void>();
  const set = (next: ColorScheme): void => {
    if (next === scheme) return;
    scheme = next;
    for (const fn of [...subscribers]) fn(scheme);
  };
  return {
    get colorScheme(): ColorScheme {
      return scheme;
    },
    get resolvedColorScheme(): "light" | "dark" {
      return resolveColorScheme(scheme);
    },
    set,
    toggle: () => set(resolveColorScheme(scheme) === "dark" ? "light" : "dark"),
    subscribe(listener) {
      subscribers.add(listener);
      return () => void subscribers.delete(listener);
    },
  };
}

const isColorSchemeStore = (v: ColorScheme | ColorSchemeStore): v is ColorSchemeStore =>
  typeof v === "object" && v !== null && typeof v.subscribe === "function";

/**
 * A composable `Component` provider that manages a component's color scheme:
 * reflects it onto the host's CSS `color-scheme` property + a `data-color-scheme`
 * attribute, and contributes a typed `this.colorScheme` object (`value` /
 * `resolved` / `set` / `toggle`).
 *
 * Pass a `ColorScheme` literal for per-instance state (the default), or a shared
 * {@link ColorSchemeStore} to theme several components together.
 */
export function colorSchemeProvider(
  init: ColorScheme | ColorSchemeStore = "auto",
): ComponentProvider<{ readonly colorScheme: ColorSchemeApi }> {
  const shared = isColorSchemeStore(init) ? init : undefined;
  const initial: ColorScheme = isColorSchemeStore(init) ? init.colorScheme : init;
  return {
    install(host) {
      const store = shared ?? createColorSchemeStore(initial);
      const reflect = (): void => {
        host.style.setProperty("color-scheme", toCssColorScheme(store.colorScheme));
        host.setAttribute("data-color-scheme", store.colorScheme);
      };
      reflect(); // apply before the first render so initial paint is correct

      const api: ColorSchemeApi = {
        get value(): ColorScheme {
          return store.colorScheme;
        },
        get resolved(): "light" | "dark" {
          return store.resolvedColorScheme;
        },
        set: (scheme) => store.set(scheme),
        toggle: () => store.toggle(),
      };
      Object.defineProperty(host, "colorScheme", { configurable: true, value: api });

      const off = store.subscribe(() => {
        reflect();
        host.requestUpdate();
      });
      host.onCleanup(off);
    },
  };
}
