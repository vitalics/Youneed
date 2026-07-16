import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Command, defaultOptions, option } from "@youneed/cli";
import {
  assembleCommand,
  createCatalog,
  devtools,
  renderPage,
  requestHandler,
  toArgv,
  type Catalog,
  type CatalogCommand,
} from "../src/index.ts";

const SPLIT: CatalogCommand = {
  name: "split",
  description: "split a string",
  aliases: [],
  args: [{ name: "string", required: true, variadic: false }],
  options: [
    { flags: "-s, --separator <char>", key: "separator", long: "separator", short: "s", takesValue: true, optional: false, required: false, default: "," },
    { flags: "-f, --first", key: "first", long: "first", short: "f", takesValue: false, optional: false, required: false },
  ],
  middleware: ["color"],
};

function mockRes() {
  return {
    status: 0,
    headers: {} as Record<string, string>,
    body: "",
    writeHead(status: number, headers: Record<string, string>) {
      this.status = status;
      this.headers = headers;
    },
    end(body?: string) {
      this.body = body ?? "";
    },
  };
}

class CatalogSuite extends Test({ name: "devtools: catalogue" }) {
  @Test.it("createCatalog serialises commands/options from the plugin host")
  fromHost() {
    let catalog: Catalog | undefined;
    const capture = { name: "capture", setup: (host: never) => void (catalog = createCatalog(host)) };
    const sep = option("-s, --separator <char>", { description: "separator", default: "," });
    class Split extends Command("split <string>", { description: "split", options: [sep, ...defaultOptions()] }) {
      execute() {}
    }
    Application({
      name: "tool",
      version: "1.2.3",
      commands: [Split],
      plugins: [capture],
      autoRun: false,
      stdout() {},
      stderr() {},
    });
    expect(catalog!.name).toBe("tool");
    expect(catalog!.version).toBe("1.2.3");
    const cmd = catalog!.commands.find((c) => c.name === "split")!;
    expect(cmd.args[0]).toEqual({ name: "string", required: true, variadic: false });
    const sepOpt = cmd.options.find((o) => o.key === "separator")!;
    expect(sepOpt.takesValue).toBe(true);
    expect(sepOpt.long).toBe("separator");
    expect(sepOpt.default).toBe(",");
  }

  @Test.it("toArgv / assembleCommand build a runnable invocation")
  assemble() {
    const argv = toArgv(SPLIT, { args: { string: "a,b" }, options: { separator: "|", first: true } });
    expect(argv).toEqual(["split", "a,b", "--separator", "|", "--first"]);
    expect(assembleCommand("tool", SPLIT, { args: { string: "a b" }, options: {} })).toBe('tool split "a b"');
    // Unset / false options are omitted.
    expect(toArgv(SPLIT, { args: {}, options: { first: false, separator: "" } })).toEqual(["split"]);
  }
}

class ServerSuite extends Test({ name: "devtools: request handler" }) {
  #catalog: Catalog = { name: "tool", commands: [SPLIT], options: [] };

  @Test.it("GET / serves the HTML page")
  page() {
    const res = mockRes();
    requestHandler(this.#catalog)({ method: "GET", url: "/" }, res);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]!.includes("text/html")).toBe(true);
    expect(res.body.includes("tool")).toBe(true);
    expect(res.body.includes("split")).toBe(true);
  }

  @Test.it("GET /catalog serves the catalogue JSON")
  catalog() {
    const res = mockRes();
    requestHandler(this.#catalog)({ method: "GET", url: "/catalog?x=1" }, res);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).commands[0].name).toBe("split");
  }

  @Test.it("POST /run is refused when running is disabled")
  runDisabled() {
    const res = mockRes();
    requestHandler(this.#catalog, { run: false })({ method: "POST", url: "/run" }, res);
    expect(res.status).toBe(403);
  }

  @Test.it("unknown routes 404")
  notFound() {
    const res = mockRes();
    requestHandler(this.#catalog)({ method: "GET", url: "/nope" }, res);
    expect(res.status).toBe(404);
  }

  @Test.it("renderPage inlines the catalogue and honours canRun")
  render() {
    expect(renderPage(this.#catalog, true).includes("CAN_RUN = true")).toBe(true);
    expect(renderPage(this.#catalog, false).includes("CAN_RUN = false")).toBe(true);
    expect(renderPage(this.#catalog).includes("CATALOG = ")).toBe(true);
  }
}

class PluginSuite extends Test({ name: "devtools: plugin" }) {
  @Test.it("registers a devtools command (configurable name)")
  registers() {
    let names: string[] = [];
    const capture = {
      name: "capture",
      // runs after devtools because it's listed last → sees the added command
      setup: (host: { commands: readonly { name: string }[] }) => void (names = host.commands.map((c) => c.name)),
    };
    class Real extends Command("real", {}) {
      execute() {}
    }
    Application({
      name: "tool",
      commands: [Real],
      plugins: [devtools({ command: "inspect" }), capture],
      autoRun: false,
      stdout() {},
      stderr() {},
    });
    expect(names.includes("real")).toBe(true);
    expect(names.includes("inspect")).toBe(true);
  }
}

await TestApplication()
  .addTests(CatalogSuite)
  .addTests(ServerSuite)
  .addTests(PluginSuite)
  .reporter(new ConsoleReporter())
  .run();
