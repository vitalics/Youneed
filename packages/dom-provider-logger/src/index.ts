// ── @youneed/dom-provider-logger — a scoped logger on each component ─────────
//
// A composable `@youneed/dom` provider that hands every component its own
// `@youneed/logger` child logger as `this.logger` — a `child(...)` of an app-wide
// base, auto-stamped with the component's tag, so every line says which component
// it came from. Namespaced under `this.logger` (like `this.i18n` / `this.a11y`),
// so it reads as the provider's, not a native member.
//
//   import { Component, html } from "@youneed/dom";
//   import { loggerProvider } from "@youneed/dom-provider-logger";
//
//   class Cart extends Component("x-cart", { providers: [loggerProvider()] }) {
//     onMount() { this.logger.info("mounted"); }       // → { component: "x-cart", message: "mounted" }
//     checkout() { this.logger.warn("empty cart"); }
//   }
//
// Set the app-wide base once (transports / level / redaction), and every
// component's `this.logger` inherits it:
//
//   import { createLogger, format } from "@youneed/logger";
//   import { setBaseLogger } from "@youneed/dom-provider-logger";
//   setBaseLogger(createLogger({ level: "debug", format: format.combine(format.timestamp(), format.json()) }));
//
// Plugs into the `Component(tag, { providers: [...] })` slot — orthogonal to the
// other providers (i18n, a11y, …), composed in one array.

import type { ComponentProvider } from "@youneed/dom";
import { createLogger, type Logger } from "@youneed/logger";

// ── app-wide base logger ──────────────────────────────────────────────────────
// Children share their parent's transports, so one base feeds every component.

let base: Logger | undefined;

/** Install the app-wide base logger every `this.logger` is a `child(...)` of.
 *  Returns it. Call once at startup to set transports / level / redaction. */
export function setBaseLogger(logger: Logger): Logger {
  base = logger;
  return logger;
}

/** The app-wide base logger — lazily a default `createLogger()` (console, JSON)
 *  until {@link setBaseLogger} is called. */
export function getBaseLogger(): Logger {
  return (base ??= createLogger());
}

export interface LoggerProviderOptions {
  /** Base logger to derive the child from (default: the app-wide {@link getBaseLogger}). */
  logger?: Logger;
  /** Extra meta merged into every line (besides the component tag). */
  meta?: Record<string, unknown>;
  /** Meta field for the component's tag name (default `"component"`). */
  tagKey?: string;
}

const isLogger = (v: Logger | LoggerProviderOptions): v is Logger =>
  typeof (v as Logger).child === "function" && typeof (v as Logger).info === "function";

/**
 * A composable `Component` provider contributing `this.logger` — a child of the
 * base logger stamped with the component's tag (and any extra `meta`). Pass a
 * `Logger` to use as the base, or options; with neither, the app-wide base is
 * used.
 *
 * The child shares the base's transports, so it is NOT closed on disconnect
 * (closing it would tear down the shared destinations).
 */
export function loggerProvider(
  init: Logger | LoggerProviderOptions = {},
): ComponentProvider<{ readonly logger: Logger }> {
  const opts = isLogger(init) ? { logger: init } : init;
  const tagKey = opts.tagKey ?? "component";
  return {
    install(host) {
      const baseLogger = opts.logger ?? getBaseLogger();
      const tag = host.localName || host.tagName.toLowerCase();
      const logger = baseLogger.child({ [tagKey]: tag, ...opts.meta });
      Object.defineProperty(host, "logger", { configurable: true, value: logger });
    },
  };
}
