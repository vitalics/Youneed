import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Command } from "@youneed/cli";
import { progress, renderProgressBar, type ProgressApi } from "../src/index.ts";

const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

class ProgressSuite extends Test({ name: "cli-middleware-progress" }) {
  @Test.it("renderProgressBar fills proportionally")
  bar() {
    expect(renderProgressBar(0.5, 10)).toBe("█████░░░░░");
    expect(renderProgressBar(0, 4)).toBe("░░░░");
    expect(renderProgressBar(1, 4)).toBe("████");
  }

  @Test.it("a bar tracks value/fraction and renders a percentage")
  tracks() {
    let line = "";
    let frac = 0;
    let done = false;
    class Run extends Command("run", { middleware: [progress()] }) {
      execute() {
        const api = (this as unknown as { progress: ProgressApi }).progress;
        const b = api.bar({ total: 4, label: "work" });
        b.tick();
        b.tick();
        frac = b.fraction;
        line = plain(b.render(8));
        b.complete();
        done = b.done;
      }
    }
    const app = Application({ name: "t", commands: [Run], autoRun: false, stdout() {}, stderr() {} });
    return app.run(["run"]).then(() => {
      expect(frac).toBe(0.5);
      expect(line.startsWith("work [")).toBe(true);
      expect(line.includes("50%")).toBe(true);
      expect(done).toBe(true);
    });
  }
}

await TestApplication().addTests(ProgressSuite).reporter(new ConsoleReporter()).run();
