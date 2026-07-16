// Run: pnpm --filter @youneed/server-plugin-storage test
// Exercises the StorageAdapter contract against both built-in adapters
// (MemoryStorage + FileStorage over a real temp dir). S3 is not tested (no creds).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { FileStorage, MemoryStorage, type StorageAdapter } from "../src/index.ts";

// A shared contract exercised by each adapter, so both get identical coverage.
function contractSuite(name: string, make: () => { adapter: StorageAdapter; cleanup?: () => void }) {
  class ContractSuite extends Test({ name }) {
    #st!: StorageAdapter;
    #cleanup?: () => void;

    @Test.beforeEach() setup() {
      const m = make();
      this.#st = m.adapter;
      this.#cleanup = m.cleanup;
    }

    @Test.afterEach() teardown() {
      this.#cleanup?.();
    }

    @Test.it("put → get round-trips bytes and contentType") async roundTrip() {
      await this.#st.put("a.txt", "hello", { contentType: "text/plain" });
      const got = await this.#st.get("a.txt");
      expect(got).not.toBe(null);
      expect(new TextDecoder().decode(got!.data)).toBe("hello");
      expect(got!.contentType).toBe("text/plain");
    }

    @Test.it("get on a missing key returns null") async missing() {
      expect(await this.#st.get("nope")).toBe(null);
    }

    @Test.it("exists reflects put/delete") async existence() {
      expect(await this.#st.exists("x")).toBe(false);
      await this.#st.put("x", "v");
      expect(await this.#st.exists("x")).toBe(true);
      await this.#st.delete("x");
      expect(await this.#st.exists("x")).toBe(false);
      expect(await this.#st.get("x")).toBe(null);
    }

    @Test.it("stores raw Uint8Array bytes") async bytes() {
      const raw = new Uint8Array([0, 1, 2, 250, 255]);
      await this.#st.put("bin", raw);
      const got = await this.#st.get("bin");
      expect(Array.from(got!.data)).toEqual([0, 1, 2, 250, 255]);
    }

    @Test.it("list returns entries with size + reports prefix filter") async listing() {
      await this.#st.put("docs/a.txt", "aaa", { contentType: "text/plain" });
      await this.#st.put("docs/b.txt", "bb");
      await this.#st.put("img/c.png", "c");
      const all = await this.#st.list();
      expect(all.length).toBe(3);
      const a = all.find((e) => e.key === "docs/a.txt");
      expect(a?.size).toBe(3);
      expect(a?.contentType).toBe("text/plain");
      const docs = await this.#st.list("docs/");
      expect(docs.map((e) => e.key).sort()).toEqual(["docs/a.txt", "docs/b.txt"]);
    }

    @Test.it("rejects path-traversal keys") async traversal() {
      const rejects = async (p: Promise<unknown>): Promise<boolean> => {
        try {
          await p;
          return false;
        } catch {
          return true;
        }
      };
      expect(await rejects(this.#st.put("../escape", "x"))).toBe(true);
      expect(await rejects(this.#st.get("../../etc/passwd"))).toBe(true);
      expect(await rejects(this.#st.put("/abs", "x"))).toBe(true);
    }
  }
  return ContractSuite;
}

const MemorySuite = contractSuite("@youneed/server-plugin-storage (memory)", () => ({ adapter: new MemoryStorage() }));

const FileSuite = contractSuite("@youneed/server-plugin-storage (file)", () => {
  const root = mkdtempSync(join(tmpdir(), "youneed-storage-"));
  return { adapter: new FileStorage(root), cleanup: () => rmSync(root, { recursive: true, force: true }) };
});

await TestApplication().addTests(MemorySuite).addTests(FileSuite).reporter(new ConsoleReporter()).run();
