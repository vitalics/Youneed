import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Command } from "@youneed/cli";
import { childprocess, type ChildProcessApi, type ProcessHandle, type SpawnResult } from "../src/index.ts";

const NODE = process.execPath;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Run a command that uses this.childprocess, capturing via the callback.
function runWith(body: (cp: ChildProcessApi) => Promise<void> | void) {
  class Run extends Command("run", { middleware: [childprocess()] }) {
    override async execute() {
      await body((this as unknown as { childprocess: ChildProcessApi }).childprocess);
    }
  }
  const app = Application({ name: "t", commands: [Run], autoRun: false, stdout() {}, stderr() {} });
  return app.run(["run"]);
}

class SpawnSuite extends Test({ name: "cli-middleware-childprocess: spawn" }) {
  @Test.it("captures stdout and the exit code")
  async stdout() {
    let result: SpawnResult | undefined;
    await runWith(async (cmd) => {
      const p = cmd.spawn(NODE, ["-e", "process.stdout.write('hello')"]);
      expect(p.running).toBe(true);
      result = await p.exited;
    });
    expect(result?.code).toBe(0);
    expect(result?.stdout).toBe("hello");
  }

  @Test.it("surfaces a non-zero exit code and stderr")
  async nonZero() {
    let result: SpawnResult | undefined;
    await runWith(async (cmd) => {
      result = await cmd.spawn(NODE, ["-e", "process.stderr.write('boom'); process.exit(3)"]).exited;
    });
    expect(result?.code).toBe(3);
    expect(result?.stderr).toBe("boom");
  }

  @Test.it("kill() stops a long-running process promptly")
  async kill() {
    let captured: { running: boolean; signal: NodeJS.Signals | null } | undefined;
    await runWith(async (cmd) => {
      const p = cmd.spawn(NODE, ["-e", "setInterval(() => {}, 1000)"]);
      expect(p.running).toBe(true);
      p.kill();
      const r = await p.exited;
      captured = { running: p.running, signal: r?.signal ?? null };
    });
    expect(captured!.running).toBe(false);
    expect(captured!.signal).toBe("SIGTERM");
  }
}

class ExecSuite extends Test({ name: "cli-middleware-childprocess: exec" }) {
  @Test.it("runs a shell command and returns its output")
  async exec() {
    let result: SpawnResult | undefined;
    await runWith(async (cmd) => {
      result = await cmd.exec(`"${NODE}" -e "process.stdout.write('x'+'y')"`);
    });
    expect(result?.code).toBe(0);
    expect(result?.stdout).toBe("xy");
  }
}

class CleanupSuite extends Test({ name: "cli-middleware-childprocess: lifecycle" }) {
  @Test.it("a process left running is killed when the command tears down")
  async killedOnTeardown() {
    let handle: ProcessHandle | undefined;
    await runWith((cmd) => {
      // Spawn but DON'T await — execute returns immediately.
      handle = cmd.spawn(NODE, ["-e", "setInterval(() => {}, 1000)"]);
    });
    // Teardown (onCleanup) hard-kills it; give the close event a moment.
    await sleep(80);
    expect(handle!.running).toBe(false);
  }
}

await TestApplication()
  .addTests(SpawnSuite)
  .addTests(ExecSuite)
  .addTests(CleanupSuite)
  .reporter(new ConsoleReporter())
  .run();
