import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Command } from "@youneed/cli";
import { worker, type WorkerApi } from "../src/index.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Run a command that uses this.worker, capturing via the callback.
function runWith(body: (w: WorkerApi) => Promise<void> | void) {
  class Run extends Command("run", { middleware: [worker()] }) {
    override async execute() {
      await body((this as unknown as { worker: WorkerApi }).worker);
    }
  }
  const app = Application({ name: "t", commands: [Run], autoRun: false, stdout() {}, stderr() {} });
  return app.run(["run"]);
}

class RunSuite extends Test({ name: "cli-middleware-worker: run" }) {
  @Test.it("runs a pure function on a thread and returns the result")
  async compute() {
    let result: number | undefined;
    await runWith(async (w) => {
      const job = w.run((n: number) => n * 2, 21);
      expect(job.running).toBe(true);
      result = await job.exited;
    });
    expect(result).toBe(42);
  }

  @Test.it("awaits an async worker function")
  async asyncFn() {
    let result: number | undefined;
    await runWith(async (w) => {
      result = await w.run(async (n: number) => {
        await new Promise((r) => setTimeout(r, 5));
        return n + 1;
      }, 41).exited;
    });
    expect(result).toBe(42);
  }

  @Test.it("passes structured data and uses require() inside the worker")
  async dataAndRequire() {
    let hash = "";
    await runWith(async (w) => {
      hash =
        (await w
          .run((input: { text: string }, require) => {
            const { createHash } = require("node:crypto") as typeof import("node:crypto");
            return createHash("sha256").update(input.text).digest("hex");
          }, { text: "hello" })
          .exited) ?? "";
    });
    // sha256("hello")
    expect(hash).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  }

  @Test.it("captures a thrown error without rejecting exited")
  async error() {
    let res: unknown;
    let err: unknown;
    await runWith(async (w) => {
      const job = w.run(() => {
        throw new Error("nope");
      });
      res = await job.exited;
      err = job.error;
    });
    expect(res).toBeUndefined();
    expect((err as Error).message).toBe("nope");
  }

  @Test.it("terminate() stops a busy worker")
  async terminate() {
    let running = true;
    await runWith(async (w) => {
      const job = w.run(() => {
        while (true) {
          /* spin forever */
        }
      });
      expect(job.running).toBe(true);
      job.terminate();
      await job.exited;
      running = job.running;
    });
    expect(running).toBe(false);
  }
}

class SpawnSuite extends Test({ name: "cli-middleware-worker: spawn" }) {
  @Test.it("spawns a worker module and exchanges messages")
  async messaging() {
    const echo = `
      import { parentPort } from "node:worker_threads";
      parentPort.on("message", (m) => parentPort.postMessage({ echo: m }));
    `;
    const url = new URL("data:text/javascript," + encodeURIComponent(echo));
    let got: unknown;
    await runWith(async (w) => {
      const inst = w.spawn(url);
      const received = new Promise((resolve) => inst.onMessage(resolve));
      inst.postMessage("ping");
      got = await received;
      inst.terminate();
      await inst.exited;
    });
    expect(got).toEqual({ echo: "ping" });
  }
}

class CleanupSuite extends Test({ name: "cli-middleware-worker: lifecycle" }) {
  @Test.it("a worker left running is terminated when the command tears down")
  async killedOnTeardown() {
    let handle: { running: boolean } | undefined;
    await runWith((w) => {
      handle = w.run(() => {
        while (true) {
          /* never returns */
        }
      });
    });
    await sleep(80); // teardown terminated it; let the exit event land
    expect(handle!.running).toBe(false);
  }
}

await TestApplication()
  .addTests(RunSuite)
  .addTests(SpawnSuite)
  .addTests(CleanupSuite)
  .reporter(new ConsoleReporter())
  .run();
