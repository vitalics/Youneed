// CLI domain over devtools-protocol. Run: pnpm --filter @youneed/cli-plugin-devtools test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createClient, inProcessTransport } from "@youneed/devtools-protocol";
import { createCliTarget } from "../src/protocol.ts";

// Minimal PluginHost (catalog only reads name/version/description/options/commands).
const host = {
  name: "myapp",
  version: "1.2.3",
  description: "demo cli",
  options: [],
  commands: [{ name: "build", description: "build it", aliases: [], args: [], options: [], middleware: [] }],
} as never;

function wire() {
  const { a, b } = inProcessTransport();
  createCliTarget(host, { exclude: "devtools" }).serve(b);
  return createClient(a);
}

class CliProtocolSuite extends Test({ name: "cli-plugin-devtools · protocol" }) {
  @Test.it("CLI.getCatalog returns the command catalogue") async catalog() {
    const c = wire();
    const cat = await c.command<{ name: string; commands: Array<{ name: string }> }>("CLI.getCatalog");
    expect(cat.name).toBe("myapp");
    expect(cat.commands.some((cmd) => cmd.name === "build")).toBeTruthy();
  }
  @Test.it("Target advertises the CLI domain") async info() {
    const c = wire();
    const info = await c.getInfo();
    expect(info.kind).toBe("cli");
    expect(info.domains.includes("CLI")).toBeTruthy();
  }
}

await TestApplication().addTests(CliProtocolSuite).reporter(new ConsoleReporter()).run();
