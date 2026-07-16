// The WebSocket adapter (src/ws.ts) end-to-end: a real node:http server bridges a
// CLI target over /ws, and a WebSocket client drives the CLI domain — the same
// path the bundled shell uses. Run: pnpm --filter @youneed/cli-plugin-devtools test
import { createServer, type Server } from "node:http";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createClient, fromWebSocket } from "@youneed/devtools-protocol";
import { createCliTarget } from "../src/protocol.ts";
import { serveWebSocket } from "../src/ws.ts";

const host = {
  name: "myapp",
  version: "1.2.3",
  description: "demo cli",
  options: [],
  commands: [{ name: "build", description: "build it", aliases: [], args: [], options: [], middleware: [] }],
} as never;

/** Start a server serving the discovery JSON + the /ws target; return its port + a disposer. */
async function start(): Promise<{ port: number; server: Server }> {
  const target = createCliTarget(host, { exclude: "devtools", run: false });
  const server = createServer((req, res) => {
    if ((req.url ?? "/").split("?")[0] === "/json") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify([{ ...target.info(), webSocketDebuggerUrl: "/ws" }]));
    }
    res.writeHead(404);
    res.end();
  });
  serveWebSocket(server, "/ws", (transport) => target.serve(transport));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return { port, server };
}

class WsSuite extends Test({ name: "cli-plugin-devtools · ws transport" }) {
  @Test.it("/json advertises the CLI target with a WS url") async discovery() {
    const { port, server } = await start();
    try {
      const list = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as Array<{ kind: string; domains: string[]; webSocketDebuggerUrl: string }>;
      expect(list[0].kind).toBe("cli");
      expect(list[0].domains.includes("CLI")).toBeTruthy();
      expect(list[0].webSocketDebuggerUrl).toBe("/ws");
    } finally {
      server.close();
    }
  }

  @Test.it("a WebSocket client drives CLI.getCatalog over /ws") async roundtrip() {
    const { port, server } = await start();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve(), { once: true });
      ws.addEventListener("error", () => reject(new Error("ws error")), { once: true });
    });
    try {
      const client = createClient(fromWebSocket(ws));
      const cat = await client.command<{ name: string; commands: Array<{ name: string }> }>("CLI.getCatalog");
      expect(cat.name).toBe("myapp");
      expect(cat.commands.some((c) => c.name === "build")).toBeTruthy();
      client.close();
    } finally {
      ws.close();
      server.close();
    }
  }
}

await TestApplication().addTests(WsSuite).reporter(new ConsoleReporter()).run();
