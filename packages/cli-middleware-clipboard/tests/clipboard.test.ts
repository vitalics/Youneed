import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Command } from "@youneed/cli";
import { clipboard, type Clipboard } from "../src/index.ts";

class ClipboardSuite extends Test({ name: "cli-middleware-clipboard" }) {
  @Test.it("contributes this.clipboard backed by the given backend")
  async backend() {
    let store = "";
    const fake: Clipboard = {
      async write(t) {
        store = t;
      },
      async read() {
        return store;
      },
    };
    let readBack = "";
    class Copy extends Command("copy", { middleware: [clipboard({ backend: fake })] }) {
      override async execute() {
        await this.clipboard.write("token-123");
        readBack = await this.clipboard.read();
      }
    }
    const app = Application({ name: "t", commands: [Copy], autoRun: false, stdout() {}, stderr() {} });
    await app.run(["copy"]);
    expect(store).toBe("token-123");
    expect(readBack).toBe("token-123");
  }
}

await TestApplication().addTests(ClipboardSuite).reporter(new ConsoleReporter()).run();
