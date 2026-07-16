// Shared state for the providers showcase — one place every provider reads from.
import { createI18n } from "@youneed/i18n";
import { createColorSchemeStore } from "@youneed/dom-provider-color-scheme";
import { createDirectionStore, directionOf } from "@youneed/dom-provider-direction";
import type { StoreApi } from "@youneed/dom-provider-zustand";

export const resources = {
  en: { greeting: "Hello, {name}!", add: "Add item", reset: "Reset", cart: "In cart", added: "Added — {count} in cart" },
  de: { greeting: "Hallo, {name}!", add: "Artikel hinzufügen", reset: "Zurücksetzen", cart: "Im Warenkorb", added: "Hinzugefügt — {count} im Warenkorb" },
  ar: { greeting: "مرحبا، {name}!", add: "أضف عنصرا", reset: "إعادة تعيين", cart: "في السلة", added: "أضيف — {count} في السلة" },
} as const;

// i18n translator (typed keys + per-key params), shared by the i18n provider + panel.
export const i18n = createI18n({ resources, locale: "en", fallbackLocale: "en" });

// App-wide color scheme + text direction stores (shared → flip every bound component).
export const theme = createColorSchemeStore("auto");
export const dir = createDirectionStore(directionOf(i18n.locale));
// Keep direction in sync with the locale (Arabic → RTL) — providers composing!
i18n.subscribe((locale) => dir.set(directionOf(locale)));

// A minimal Zustand-compatible vanilla store. A real `createStore` from
// `zustand/vanilla` is structurally identical — swap it in and nothing changes.
export interface CartState {
  count: number;
  items: string[];
}
function createStore<T>(init: (set: StoreApi<T>["setState"], get: () => T) => T): StoreApi<T> {
  let state: T;
  const subs = new Set<(s: T, p: T) => void>();
  const setState: StoreApi<T>["setState"] = (partial, replace) => {
    const part = typeof partial === "function" ? partial(state) : partial;
    const prev = state;
    state = replace ? (part as T) : { ...state, ...part };
    for (const fn of [...subs]) fn(state, prev);
  };
  const getState = (): T => state;
  state = init(setState, getState);
  return { getState, setState, subscribe: (fn) => (subs.add(fn), () => void subs.delete(fn)) };
}

export const cart = createStore<CartState>(() => ({ count: 0, items: [] }));
