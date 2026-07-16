// ── @youneed/dom-router/provider — interact with a router from a component ───
//
// `routerProvider(router)` is a composable `@youneed/dom` provider that exposes
// the running router under a single namespaced object, `this.router` — so it's
// clearly the provider's, not a native `Component` member (same shape as
// `this.a11y` / `this.i18n`):
//
//   import { Component, html } from "@youneed/dom";
//   import { createRouter, routerProvider } from "@youneed/dom-router";
//
//   const router = createRouter({ mode: "history", routes: [/* … */] });
//
//   class Shell extends Component("app-shell", { providers: [routerProvider(router)] }) {
//     render() {
//       return html`<header><a href="/about">About</a></header>${this.router.outlet()}`;
//     }
//   }
//
// `this.router.outlet()` hands the router an outlet element the component owns —
// so the router needs no `outlet` at creation; the component supplies it. The
// router mounts the matched component there and swaps only that region on nav.
// The provider subscribes to route changes and `requestUpdate()`s the host, so
// `this.router.params` / `.path` / `.component` stay reactive in the template.

import type { ComponentProvider } from "@youneed/dom";
import type { ComponentConstructor, Router, RouterMode } from "./dom-router.ts";

/** The provider's contribution, exposed as `this.router`. */
export interface RouterApi {
  /** The outlet hole: an element the router mounts the matched component into.
   *  Stable per component instance — interpolate it in `render()`. */
  outlet(): Element;
  /** Params of the current match (e.g. `{ id: "42" }`); `{}` when none. */
  readonly params: Record<string, string>;
  /** The raw `location.hash` (including `#`). */
  readonly hash: string;
  /** The tag currently mounted in the outlet (nav or `replace`). */
  readonly component: string | undefined;
  /** The current matched path (e.g. `/users/42`). */
  readonly path: string | undefined;
  /** The router's URL strategy. */
  readonly mode: RouterMode;
  /** Navigate to `path` (pushes a history entry). */
  goto(path: string): void;
  /** Navigate to `path`, replacing the current history entry (no back step). */
  redirect(path: string): void;
  /** Go back one history entry. */
  back(): void;
  /** Swap the mounted component in place WITHOUT changing the URL — modifies the
   *  current node tree only (unlike `redirect`, which navigates). */
  replace(component: string | ComponentConstructor): void;
}

/**
 * A composable `Component` provider contributing a single `this.router` object
 * bound to `router`. Plugs into `Component(tag, { providers: [routerProvider(router)] })`,
 * orthogonal to the other providers (a11y, i18n, …).
 */
export function routerProvider(router: Router): ComponentProvider<{ readonly router: RouterApi }> {
  return {
    install(host) {
      // One outlet element per component instance — `outlet()` returns the same
      // node every render so the host's diff keeps it (and its mounted child) put.
      let outletEl: HTMLElement | undefined;

      const api: RouterApi = {
        outlet() {
          if (!outletEl) {
            outletEl = document.createElement("div");
            outletEl.setAttribute("data-router-outlet", "");
          }
          router.setOutlet(outletEl);
          return outletEl;
        },
        get params(): Record<string, string> {
          return router.current?.params ?? {};
        },
        get hash(): string {
          return typeof location !== "undefined" ? location.hash : "";
        },
        get component(): string | undefined {
          return router.component;
        },
        get path(): string | undefined {
          return router.current?.path;
        },
        get mode(): RouterMode {
          return router.mode;
        },
        goto: (path) => router.navigate(path),
        redirect: (path) => router.navigate(path, { replace: true }),
        back: () => history.back(),
        replace: (component) => router.replaceWith(component),
      };

      Object.defineProperty(host, "router", { configurable: true, value: api });
      // Re-render the host when the route changes so the reactive getters update.
      host.onCleanup(router.subscribe(() => host.requestUpdate()));
    },
  };
}
