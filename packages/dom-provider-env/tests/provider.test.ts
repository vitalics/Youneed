// @youneed/dom-provider-env: envProvider exposes the validated env as `this.env`.
// Run: pnpm --filter @youneed/dom-provider-env test
import { registerDOM } from "@youneed/dom/register";

registerDOM();

import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";

const { Component, html, flushSync } = await import("@youneed/dom");
const { defineEnvironmentVariables, envProvider, t } = await import("../src/index.ts");

const env = defineEnvironmentVariables(
  { API_URL: "https://api.example.com", FLAG: "yes" },
  { schema: { API_URL: t.url(), FLAG: t.boolean().default(false) }, name: "provider-test" },
);

@Component.define()
class Widget extends Component("x-env-widget", { providers: [envProvider(env)] }) {
  seenUrl = "";
  seenFlag = false;
  render() {
    this.seenUrl = this.env.API_URL; // ← typed: string
    this.seenFlag = this.env.FLAG; //  ← typed: boolean
    return html`<a href=${this.env.API_URL}>open</a>`;
  }
}

type Host = HTMLElement & { seenUrl: string; seenFlag: boolean; env: typeof env; flushSync(): void };

function mount(): Host {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const el = document.createElement("x-env-widget") as Host;
  root.appendChild(el);
  el.flushSync();
  return el;
}

class ProviderTest extends Test({ name: "@youneed/dom-provider-env (provider)" }) {
  @Test.it("this.env exposes the validated env") thisEnv() {
    const el = mount();
    expect(el.env.API_URL).toBe("https://api.example.com");
    expect(el.env.FLAG).toBe(true);
  }
  @Test.it("this.env is readable inside render()") inRender() {
    const el = mount();
    expect(el.seenUrl).toBe("https://api.example.com");
    expect(el.seenFlag).toBe(true);
    expect(el.shadowRoot?.querySelector("a")?.getAttribute("href")).toBe("https://api.example.com");
  }
  @Test.it("the same env object is shared across instances") shared() {
    const a = mount();
    const b = mount();
    expect(a.env === b.env).toBe(true);
  }
}

await TestApplication().addTests(ProviderTest).reporter(new ConsoleReporter()).run();
