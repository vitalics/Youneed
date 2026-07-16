// Run: pnpm --filter @youneed/dom-provider-logger test
import { registerDOM } from "@youneed/dom/register";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createLogger, createTransport, format, type TransformableInfo } from "@youneed/logger";
import { loggerProvider, setBaseLogger, getBaseLogger } from "../src/index.ts";

registerDOM();
const { Component, html, flushSync } = await import("@youneed/dom");

const sink: TransformableInfo[] = [];
const capture = createTransport({ log: (i) => sink.push(i) });
// App-wide base → every component's this.logger is a child of it.
setBaseLogger(createLogger({ format: format.json(), transports: [capture] }));

@Component.define()
class LogCard extends Component("log-card", { providers: [loggerProvider()] }) {
  render() {
    return html`<span>card</span>`;
  }
}

// Extra meta + custom base.
@Component.define()
class TaggedCard extends Component("tagged-card", {
  providers: [loggerProvider({ meta: { area: "cart" }, tagKey: "widget" })],
}) {
  render() {
    return html`<span>tagged</span>`;
  }
}

// ── type-level checks (never executed) ───────────────────────────────────────────
() => {
  const el = document.createElement("log-card") as InstanceType<typeof LogCard>;
  el.logger.info("hi"); // ✓ namespaced + typed Logger
  el.logger.warn("careful", { code: 1 }); // ✓
  el.logger.child({ x: 1 }); // ✓
  // @ts-expect-error — not a Logger method
  el.logger.nope();
};

const root = document.createElement("div");
document.body.appendChild(root);

class LoggerSuite extends Test({ name: "dom-provider-logger" }) {
  @Test.afterEach() reset() {
    sink.length = 0;
  }

  @Test.it("this.logger is a child stamped with the component tag") tag() {
    const el = document.createElement("log-card") as HTMLElement & {
      logger: { info(m: string): void };
    };
    root.appendChild(el);
    flushSync();
    el.logger.info("mounted");
    expect(sink.length).toBe(1);
    expect(sink[0].message).toBe("mounted");
    expect(sink[0].component).toBe("log-card");
    el.remove();
  }

  @Test.it("per-call meta merges over the component meta") meta() {
    const el = document.createElement("log-card") as HTMLElement & {
      logger: { warn(m: string, meta?: Record<string, unknown>): void };
    };
    root.appendChild(el);
    flushSync();
    el.logger.warn("low", { stock: 3 });
    expect(sink[0].component).toBe("log-card");
    expect(sink[0].stock).toBe(3);
    expect(sink[0].level).toBe("warn");
    el.remove();
  }

  @Test.it("options: extra meta + custom tagKey") options() {
    const el = document.createElement("tagged-card") as HTMLElement & {
      logger: { info(m: string): void };
    };
    root.appendChild(el);
    flushSync();
    el.logger.info("x");
    expect(sink[0].widget).toBe("tagged-card"); // custom tagKey
    expect(sink[0].area).toBe("cart"); // extra meta
    el.remove();
  }

  @Test.it("loggerProvider(logger) uses the passed logger as the base") explicitBase() {
    const localSink: TransformableInfo[] = [];
    const local = createLogger({ format: format.json(), transports: [createTransport({ log: (i) => localSink.push(i) })] });
    @Component.define()
    class Explicit extends Component("explicit-card", { providers: [loggerProvider(local)] }) {
      render() {
        return html`<span>e</span>`;
      }
    }
    const el = document.createElement("explicit-card") as HTMLElement & { logger: { info(m: string): void } };
    root.appendChild(el);
    flushSync();
    el.logger.info("routed");
    expect(localSink.length).toBe(1); // went to the explicit base, not the app-wide sink
    expect(sink.length).toBe(0);
    el.remove();
  }

  @Test.it("getBaseLogger returns the configured base") base() {
    expect(typeof getBaseLogger().info).toBe("function");
  }
}

await TestApplication().addTests(LoggerSuite).reporter(new ConsoleReporter()).run();
