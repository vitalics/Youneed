import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Command } from "@youneed/cli";
import { isNewer, updateNotifier } from "../src/index.ts";

async function runWith(plugin: ReturnType<typeof updateNotifier>): Promise<string> {
  class Ping extends Command("ping") {
    execute() {}
  }
  const app = Application({ name: "ops", commands: [Ping], plugins: [plugin], autoRun: false, stdout() {}, stderr() {} });
  const original = console.error;
  let captured = "";
  console.error = (...a: unknown[]) => void (captured += a.join(" ") + "\n");
  try {
    await app.run(["ping"]);
  } finally {
    console.error = original;
  }
  return captured;
}

class UpdateSuite extends Test({ name: "cli-plugin-update-notifier" }) {
  @Test.it("compares semver versions")
  semver() {
    expect(isNewer("2.0.0", "1.0.0")).toBe(true);
    expect(isNewer("1.2.0", "1.1.9")).toBe(true);
    expect(isNewer("1.0.0", "1.0.0")).toBe(false);
    expect(isNewer("1.2.0", "1.10.0")).toBe(false); // 10 > 2
  }

  @Test.it("notifies when a newer version is available")
  async notifies() {
    const out = await runWith(
      updateNotifier({ current: "1.0.0", name: "ops", interval: 0, fetchLatest: async () => "2.3.0" }),
    );
    expect(out.includes("Update available")).toBe(true);
    expect(out.includes("2.3.0")).toBe(true);
  }

  @Test.it("stays quiet when up to date")
  async quiet() {
    const out = await runWith(
      updateNotifier({ current: "2.3.0", name: "ops", interval: 0, fetchLatest: async () => "2.3.0" }),
    );
    expect(out.includes("Update available")).toBe(false);
  }
}

await TestApplication().addTests(UpdateSuite).reporter(new ConsoleReporter()).run();
