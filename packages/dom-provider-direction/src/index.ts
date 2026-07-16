// ── @youneed/dom-provider-direction — per-component text direction (LTR / RTL) ────────
//
// A composable `@youneed/dom` provider that sets the `dir` attribute on a
// component and lets it flip direction at runtime. Its members live under a
// single namespaced object — `this.direction` — so they read as the provider's,
// not as native `HTMLElement` / `Component` members (the same shape as `this.i18n`
// and `this.a11y`). It plugs into the `Component(tag, { providers: [...] })` slot —
// orthogonal to other providers (e.g. `i18nProvider`), so an RTL locale and its
// layout direction compose in one array.
//
//   import { Component, html } from "@youneed/dom";
//   import { directionProvider } from "@youneed/dom-provider-direction";
//
//   class Panel extends Component("x-panel", { providers: [directionProvider("ltr")] }) {
//     render() {
//       return html`
//         <button @click=${() => this.direction.toggle()}>flip</button>
//         <p>dir: ${this.direction.value}</p>`;
//     }
//   }
//
// Each component instance owns its direction by default (toggling one doesn't
// affect another). Pass a SHARED `DirectionStore` instead of a literal to make a
// set of components flip together (app-wide RTL):
//
//   const dir = createDirectionStore("ltr");
//   class A extends Component("x-a", { providers: [directionProvider(dir)] }) {}
//   class B extends Component("x-b", { providers: [directionProvider(dir)] }) {}
//   dir.set("rtl"); // both A and B re-render + reflect dir="rtl"

import type { ComponentProvider } from "@youneed/dom";

/** A text-direction value — the `dir` HTML attribute's domain. */
export type Direction = "ltr" | "rtl" | "auto";

/** The provider's contribution, exposed as `this.direction`. */
export interface DirectionApi {
  /** Current direction (mirrors the host's `dir` attribute). */
  readonly value: Direction;
  /** Set the direction: reflects `dir`, re-renders, and (if shared) notifies peers. */
  set(dir: Direction): void;
  /** Flip `ltr` ⇄ `rtl` (`auto` flips to `ltr`). */
  toggle(): void;
}

/** A reactive direction value — shareable across components so they flip together. */
export interface DirectionStore {
  /** The current direction. */
  readonly direction: Direction;
  /** Set it; no-op if unchanged. Notifies subscribers. */
  set(dir: Direction): void;
  /** Flip `ltr` ⇄ `rtl` (`auto` → `ltr`). */
  toggle(): void;
  /** Run `listener` on every change. Returns an unsubscribe. */
  subscribe(listener: (dir: Direction) => void): () => void;
}

/** Create a standalone, reactive direction store (pass it to `directionProvider`
 *  to share one direction across components). */
export function createDirectionStore(initial: Direction = "ltr"): DirectionStore {
  let dir = initial;
  const subscribers = new Set<(dir: Direction) => void>();
  const set = (next: Direction): void => {
    if (next === dir) return;
    dir = next;
    for (const fn of [...subscribers]) fn(dir);
  };
  return {
    get direction(): Direction {
      return dir;
    },
    set,
    toggle: () => set(dir === "rtl" ? "ltr" : "rtl"),
    subscribe(listener) {
      subscribers.add(listener);
      return () => void subscribers.delete(listener);
    },
  };
}

const isDirectionStore = (v: Direction | DirectionStore): v is DirectionStore =>
  typeof v === "object" && v !== null && typeof v.subscribe === "function";

// RTL scripts per the Unicode bidi spec — Arabic, Hebrew, Persian, Urdu, Yiddish,
// Syriac, Thaana/Dhivehi, N'Ko. Matched on the primary subtag (e.g. `ar-EG` → ar).
const RTL_LANGUAGES: ReadonlySet<string> = new Set(["ar", "he", "fa", "ur", "yi", "syr", "dv", "nqo"]);

/** The natural direction of a BCP-47 locale (`"ar"`, `"he-IL"` → `"rtl"`, else
 *  `"ltr"`). Handy for composing with `@youneed/i18n`:
 *  `directionProvider(createDirectionStore(directionOf(i18n.locale)))`. */
export function directionOf(locale: string): Direction {
  return RTL_LANGUAGES.has(locale.toLowerCase().split("-")[0]) ? "rtl" : "ltr";
}

/**
 * A composable `Component` provider that manages a component's text direction:
 * reflects it onto the host's `dir` attribute (so the shadow content inherits
 * it), and contributes a typed `this.direction` object (`value` / `set` /
 * `toggle`).
 *
 * Pass a `Direction` literal for per-instance state (the default), or a shared
 * {@link DirectionStore} to flip several components together.
 */
export function directionProvider(
  init: Direction | DirectionStore = "ltr",
): ComponentProvider<{ readonly direction: DirectionApi }> {
  // A shared store is reused across instances; a literal seeds a FRESH per-instance
  // store on install, so toggling one component doesn't move its siblings.
  const shared = isDirectionStore(init) ? init : undefined;
  const initial: Direction = isDirectionStore(init) ? init.direction : init;
  return {
    install(host) {
      const store = shared ?? createDirectionStore(initial);
      const reflect = (): void => void host.setAttribute("dir", store.direction);
      reflect(); // set `dir` before the first render so initial layout is correct

      const api: DirectionApi = {
        get value(): Direction {
          return store.direction;
        },
        set: (dir) => store.set(dir),
        toggle: () => store.toggle(),
      };
      Object.defineProperty(host, "direction", { configurable: true, value: api });

      const off = store.subscribe(() => {
        reflect();
        host.requestUpdate();
      });
      host.onCleanup(off);
    },
  };
}
