import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Command } from "@youneed/cli";
import { cache, createCache } from "../src/index.ts";

function tmp() {
  return mkdtempSync(join(tmpdir(), "cache-test-"));
}

class CacheSuite extends Test({ name: "cli-middleware-cache" }) {
  @Test.it("set/get round-trips JSON values")
  roundtrip() {
    const dir = tmp();
    const c = createCache({ dir, namespace: "t" });
    c.set("k", { a: 1, b: [2, 3] });
    expect(c.get("k")).toEqual({ a: 1, b: [2, 3] });
    expect(c.get("missing")).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  }

  @Test.it("honours TTL")
  ttl() {
    const dir = tmp();
    const c = createCache({ dir });
    c.set("k", "v", -1); // already expired
    expect(c.get("k")).toBeUndefined();
    c.set("k2", "v2", 10_000);
    expect(c.get("k2")).toBe("v2");
    rmSync(dir, { recursive: true, force: true });
  }

  @Test.it("wrap computes once then serves from cache")
  async wrap() {
    const dir = tmp();
    const c = createCache({ dir });
    let calls = 0;
    const factory = () => {
      calls++;
      return Promise.resolve(42);
    };
    expect(await c.wrap("x", factory)).toBe(42);
    expect(await c.wrap("x", factory)).toBe(42);
    expect(calls).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  }

  @Test.it("contributes this.cache namespaced to the program")
  contributes() {
    const dir = tmp();
    let value: unknown;
    class Run extends Command("run", { middleware: [cache({ dir })] }) {
      execute() {
        this.cache.set("k", "hello");
        value = this.cache.get("k");
      }
    }
    const app = Application({ name: "t", commands: [Run], autoRun: false, stdout() {}, stderr() {} });
    return app.run(["run"]).then(() => {
      expect(value).toBe("hello");
      rmSync(dir, { recursive: true, force: true });
    });
  }
}

await TestApplication().addTests(CacheSuite).reporter(new ConsoleReporter()).run();
