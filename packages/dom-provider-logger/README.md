# @youneed/dom-provider-logger

A scoped [`@youneed/logger`](../logger) child on every [`@youneed/dom`](../dom)
component. The provider hands each component `this.logger` — a `child(...)` of an
app-wide base, auto-stamped with the component's tag, so every line says which
component it came from. Namespaced under `this.logger` (like `this.i18n` /
`this.a11y`).

```ts
import { Component, html } from "@youneed/dom";
import { loggerProvider } from "@youneed/dom-provider-logger";

class Cart extends Component("x-cart", { providers: [loggerProvider()] }) {
  onMount() { this.logger.info("mounted"); }      // → { component: "x-cart", message: "mounted", … }
  checkout() { this.logger.warn("empty cart"); }
}
```

Set the app-wide base once (transports / level / redaction) and every
component's `this.logger` inherits it (children share the base's transports):

```ts
import { createLogger, format } from "@youneed/logger";
import { setBaseLogger } from "@youneed/dom-provider-logger";

setBaseLogger(createLogger({
  level: "debug",
  format: format.combine(format.timestamp(), format.json()),
}));
```

It plugs into the `Component(tag, { providers: [...] })` slot — orthogonal to the
other providers (`i18nProvider`, `a11yProvider`, …), composed in one array.

| API | meaning |
| --- | --- |
| `loggerProvider(init?)` | the `ComponentProvider`; `init` is a `Logger` (the base) or `LoggerProviderOptions` |
| `this.logger` | a child `Logger` stamped with the component tag — `info` / `warn` / `error` / `child` / … |
| `setBaseLogger(logger)` | install the app-wide base every `this.logger` derives from |
| `getBaseLogger()` | the base (a default `createLogger()` until set) |

| option | default | meaning |
| --- | --- | --- |
| `logger` | the app-wide base | base logger to derive the child from |
| `meta` | — | extra fields stamped on every line |
| `tagKey` | `"component"` | meta field holding the component's tag name |

The child shares the base's transports, so it is **not** closed on disconnect
(closing it would tear down the shared destinations).
