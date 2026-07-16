// ── @youneed/dom-provider-zustand — a Zustand store on a component ───────────
//
// A composable `@youneed/dom` provider that wires a Zustand store into a
// component: it contributes a reactive `this.store` (read state, write it, select
// slices) and re-renders the component when the store changes — optionally only
// when a selected slice changes, so unrelated updates don't repaint.
//
//   import { createStore } from "zustand/vanilla";
//   import { Component, html } from "@youneed/dom";
//   import { zustandProvider } from "@youneed/dom-provider-zustand";
//
//   const cart = createStore<CartState>((set) => ({
//     items: [],
//     add: (item) => set((s) => ({ items: [...s.items, item] })),
//   }));
//
//   class Cart extends Component("x-cart", { providers: [zustandProvider(cart)] }) {
//     render() {
//       return html`
//         <span>items: ${this.store.state.items.length}</span>
//         <button @click=${() => this.store.state.add(newItem)}>add</button>`;
//     }
//   }
//
// Re-render only when a slice changes:
//
//   zustandProvider(cart, { selector: (s) => s.items.length })  // ignores other fields
//
// The package has NO hard dependency on Zustand — it types against a structural,
// Zustand-compatible `StoreApi`, so any vanilla store (or compatible) works.
// Plugs into the `Component(tag, { providers: [...] })` slot — orthogonal to the
// other providers, composed in one array.

import type { ComponentProvider } from "@youneed/dom";

/** The structural shape of a Zustand vanilla store (a real `StoreApi<T>` from
 *  `zustand/vanilla` satisfies this). */
export interface StoreApi<T> {
  getState(): T;
  setState(partial: Partial<T> | ((state: T) => Partial<T>), replace?: boolean): void;
  subscribe(listener: (state: T, prevState: T) => void): () => void;
}

/** The provider's contribution, exposed as `this.store`. */
export interface BoundStore<T> {
  /** The current store state (a live snapshot). */
  readonly state: T;
  /** Read the current state. */
  get(): T;
  /** Update the store (object patch or updater). */
  set(partial: Partial<T> | ((state: T) => Partial<T>), replace?: boolean): void;
  /** Read a derived slice of the current state. */
  select<S>(selector: (state: T) => S): S;
}

export interface ZustandProviderOptions<T, S = T> {
  /** Re-render only when this slice changes (vs. on any store change). */
  selector?: (state: T) => S;
  /** Equality for the selected slice (default `Object.is`). */
  equals?: (a: S, b: S) => boolean;
}

/**
 * A composable `Component` provider that binds a Zustand `store` as `this.store`
 * and re-renders the component on store changes. Pass a `selector` (+ optional
 * `equals`) to repaint only when a chosen slice changes. The store subscription
 * is removed on disconnect.
 */
export function zustandProvider<T, S = T>(
  store: StoreApi<T>,
  options: ZustandProviderOptions<T, S> = {},
): ComponentProvider<{ readonly store: BoundStore<T> }> {
  const equals = options.equals ?? Object.is;
  const selector = options.selector;
  return {
    install(host) {
      const api: BoundStore<T> = {
        get state(): T {
          return store.getState();
        },
        get: () => store.getState(),
        set: (partial, replace) => store.setState(partial, replace),
        select: (sel) => sel(store.getState()),
      };
      Object.defineProperty(host, "store", { configurable: true, value: api });

      let prev = selector ? selector(store.getState()) : undefined;
      const off = store.subscribe((state) => {
        if (selector) {
          const next = selector(state);
          if (equals(prev as S, next)) return; // slice unchanged → skip the re-render
          prev = next;
        }
        host.requestUpdate();
      });
      host.onCleanup(off);
    },
  };
}
