import { existsSync } from "node:fs";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Command } from "@youneed/cli";
import { fs as fsMiddleware, type FsApi } from "../src/index.ts";

function runWith(body: (fs: FsApi) => void | Promise<void>) {
  class Run extends Command("run", { middleware: [fsMiddleware()] }) {
    override async execute() {
      await body((this as unknown as { fs: FsApi }).fs);
    }
  }
  const app = Application({ name: "t", commands: [Run], autoRun: false, stdout() {}, stderr() {} });
  return app.run(["run"]);
}

class FsSuite extends Test({ name: "cli-middleware-fs" }) {
  @Test.it("writes and reads text + json under a temp dir")
  async readWrite() {
    let read = "";
    let json: unknown;
    await runWith((fs) => {
      const dir = fs.tempDir();
      fs.writeText(`${dir}/a.txt`, "hello");
      fs.writeJson(`${dir}/b.json`, { ok: true });
      read = fs.readText(`${dir}/a.txt`);
      json = fs.readJson(`${dir}/b.json`);
      expect(fs.exists(`${dir}/a.txt`)).toBe(true);
    });
    expect(read).toBe("hello");
    expect(json).toEqual({ ok: true });
  }

  @Test.it("removes temp dirs on teardown")
  async tempCleanup() {
    let dir = "";
    await runWith((fs) => {
      dir = fs.tempDir();
      fs.writeText(`${dir}/x`, "1");
      expect(existsSync(dir)).toBe(true);
    });
    expect(existsSync(dir)).toBe(false); // gone after the command settled
  }
}

await TestApplication().addTests(FsSuite).reporter(new ConsoleReporter()).run();
