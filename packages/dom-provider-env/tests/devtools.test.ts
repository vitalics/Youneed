// @youneed/dom-provider-env/devtools: the env panel lists defined environments
// with values + flags, masking secrets, and repaints when a new env is defined.
// Run: pnpm --filter @youneed/dom-provider-env test
import { registerDOM } from "@youneed/dom/register";

registerDOM();

import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";

const { defineEnvironmentVariables, t, clearRegisteredEnvironments } = await import("../src/index.ts");
const { envPanel } = await import("../src/devtools.ts");

class EnvDevtoolsTest extends Test({ name: "@youneed/dom-provider-env (devtools)" }) {
  @Test.it("panel identity") identity() {
    const panel = envPanel();
    expect(panel.id).toBe("env");
    expect(panel.title).toBe("env");
  }

  @Test.it("lists variables and masks secrets") lists() {
    clearRegisteredEnvironments();
    defineEnvironmentVariables(
      { PORT: "8080", TOKEN: "super-secret-value", API: "https://x.io" },
      { schema: { PORT: t.port().default(3000), TOKEN: t.string().secret(), API: t.url() }, name: "app" },
    );
    const container = document.createElement("div");
    const dispose = envPanel().render(container, {} as never);
    const text = container.textContent ?? "";
    expect(text.includes("app")).toBe(true); // section label
    expect(text.includes("PORT") && text.includes("8080")).toBe(true);
    expect(text.includes("TOKEN") && text.includes("[REDACTED]")).toBe(true);
    expect(text.includes("super-secret-value")).toBe(false); // secret never shown
    expect(text.includes("API") && text.includes("https://x.io")).toBe(true);
    dispose();
  }

  @Test.it("empty registry shows a hint") empty() {
    clearRegisteredEnvironments();
    const container = document.createElement("div");
    const dispose = envPanel().render(container, {} as never);
    expect((container.textContent ?? "").includes("no environments defined")).toBe(true);
    dispose();
  }

  @Test.it("repaints when a new env is defined") repaint() {
    clearRegisteredEnvironments();
    const container = document.createElement("div");
    const dispose = envPanel().render(container, {} as never);
    expect((container.textContent ?? "").includes("no environments defined")).toBe(true);
    defineEnvironmentVariables({ HOST: "example.com" }, { schema: { HOST: t.string() }, name: "late" });
    const text = container.textContent ?? "";
    expect(text.includes("late") && text.includes("HOST") && text.includes("example.com")).toBe(true);
    dispose();
  }
}

await TestApplication().addTests(EnvDevtoolsTest).reporter(new ConsoleReporter()).run();
