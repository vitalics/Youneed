// Encapsulated Node DOM environment for @youneed/dom.
//
// In a browser the DOM is native and you never touch this. In Node — SSR/SSG,
// tests, benches — @youneed/dom needs a DOM, which this provides via happy-dom
// (a dependency of @youneed/dom). So nothing downstream has to depend on
// happy-dom or call GlobalRegistrator itself; it goes through here:
//
//   import { registerDOM } from "@youneed/dom/register";
//   registerDOM();            // before you define / render components
//
// It lives behind the `@youneed/dom/register` subpath so a browser bundle of
// `@youneed/dom` never pulls happy-dom in.
import { GlobalRegistrator } from "@happy-dom/global-registrator";

/** Options forwarded to happy-dom's registrator (url, viewport, settings, …). */
export type RegisterDOMOptions = Parameters<typeof GlobalRegistrator.register>[0];

let active = false;

/**
 * Install a Node DOM (happy-dom) onto `globalThis`. Idempotent, and a no-op when
 * a real DOM is already present (a browser, or a prior registration) — so it's
 * safe to call from a shared test/SSR setup without guarding.
 */
export function registerDOM(options?: RegisterDOMOptions): void {
  if (active) return;
  if (typeof (globalThis as { document?: unknown }).document !== "undefined") {
    active = true; // a DOM already exists — don't clobber it
    return;
  }
  GlobalRegistrator.register(options);
  active = true;
}

/** Tear the Node DOM back down (test isolation). No-op if we never registered. */
export async function unregisterDOM(): Promise<void> {
  if (!active) return;
  await GlobalRegistrator.unregister();
  active = false;
}

/** Whether a Node DOM registered through `registerDOM()` is currently active. */
export function isDOMRegistered(): boolean {
  return active;
}
