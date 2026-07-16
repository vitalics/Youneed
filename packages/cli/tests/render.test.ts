import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import {
  alert,
  Application,
  box,
  Command,
  createScheduler,
  flow,
  HOLE_END,
  HOLE_START,
  input,
  LiveRenderer,
  parseHoles,
  renderMarked,
  renderTemplate,
  select,
  spinner,
  stepper,
  table,
  task,
  text,
  visibleWidth,
  type ReactiveHost,
} from "../src/index.ts";

// Strip ANSI for legible assertions.
const plain = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

const defer = () => {
  let resolve!: (v: string) => void;
  const promise = new Promise<string>((r) => (resolve = r));
  return { promise, resolve };
};

class TaskSuite extends Test({ name: "render: task" }) {
  @Test.it("tracks pending → value and notifies the host")
  async lifecycle() {
    let updates = 0;
    const host: ReactiveHost = { requestUpdate: () => updates++ };
    const d = defer();
    const t = task(host, () => d.promise);
    expect(t.pending).toBe(false);
    const run = t.run();
    expect(t.pending).toBe(true);
    d.resolve("ok");
    const result = await run;
    expect(result).toBe("ok");
    expect(t.pending).toBe(false);
    expect(t.value).toBe("ok");
    expect(t.settled).toBe(true);
    expect(updates).toBe(2); // one on start, one on settle
  }

  @Test.it("captures errors without rejecting run()")
  async error() {
    const host: ReactiveHost = { requestUpdate() {} };
    const t = task(host, async () => {
      throw new Error("nope");
    });
    const result = await t.run();
    expect(result).toBeUndefined();
    expect(t.error instanceof Error).toBe(true);
  }

  @Test.it("passes an AbortSignal and marks aborted")
  async abort() {
    const host: ReactiveHost = { requestUpdate() {} };
    let signal: AbortSignal | undefined;
    const t = task(host, (s: AbortSignal) => {
      signal = s;
      return new Promise<string>((_, reject) => {
        s.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });
    const run = t.run();
    expect(signal?.aborted).toBe(false);
    t.abort();
    await run;
    expect(t.aborted).toBe(true);
  }
}

class TemplateSuite extends Test({ name: "render: text templates & holes" }) {
  @Test.it("renders interpolated values to a clean string")
  clean() {
    expect(renderTemplate(text`a=${1} b=${"x"}`)).toBe("a=1 b=x");
    expect(renderTemplate(text`empty=${null}${false}${undefined}`)).toBe("empty=");
  }

  @Test.it("wraps holes in control characters in the marked form")
  marked() {
    const m = renderMarked(text`v=${42}`);
    expect(m).toBe(`v=${HOLE_START}42${HOLE_END}`);
  }

  @Test.it("locates holes by line and column")
  holes() {
    const holes = parseHoles(renderMarked(text`name: ${"alice"}\nage:  ${30}`));
    expect(holes.length).toBe(2);
    expect(holes[0]).toEqual({ index: 0, line: 0, column: 6, text: "alice" });
    expect(holes[1]).toEqual({ index: 1, line: 1, column: 6, text: "30" });
  }

  @Test.it("flattens nested templates and arrays")
  nested() {
    expect(renderTemplate(text`[${text`${1}-${2}`}]`)).toBe("[1-2]");
    expect(renderTemplate(text`${["a", "b", "c"]}`)).toBe("abc");
  }
}

class TableSuite extends Test({ name: "render: table" }) {
  @Test.it("renders a box-drawing table with a header")
  basic() {
    const out = table([["alice", "12"], ["bob", "7"]], { head: ["name", "score"] });
    const lines = out.split("\n");
    expect(lines[0]).toBe("┌───────┬───────┐");
    expect(lines[1]).toBe("│ name  │ score │");
    expect(lines[2]).toBe("├───────┼───────┤");
    expect(lines[3]).toBe("│ alice │ 12    │");
    expect(lines[5]).toBe("└───────┴───────┘");
  }

  @Test.it("right-aligns a column and ignores ANSI width")
  alignAndColor() {
    const out = table([["x", "\x1b[32m100\x1b[39m"]], { head: ["a", "n"], align: ["left", "right"] });
    const lines = out.split("\n");
    // "n" column width fits the visible "100" (3), not the escape codes;
    // both header and cell are right-aligned in that column.
    expect(lines[1]).toBe("│ a │   n │");
    expect(lines[3]).toBe("│ x │ \x1b[32m100\x1b[39m │");
  }
}

class LiveSuite extends Test({ name: "render: live renderer" }) {
  @Test.it("writes the full block on first draw")
  firstDraw() {
    const chunks: string[] = [];
    const live = new LiveRenderer((c) => chunks.push(c));
    live.draw("line1\nline2");
    expect(chunks).toEqual(["line1\nline2\n"]);
  }

  @Test.it("repaints only changed lines via cursor control on redraw")
  patch() {
    const chunks: string[] = [];
    const live = new LiveRenderer((c) => chunks.push(c));
    live.draw("a\nb\nc");
    live.draw("a\nB\nc");
    // up 3 lines; line0 unchanged (\r), line1 cleared+rewritten, line2 unchanged.
    expect(chunks[1]).toBe("\x1b[3A\r\n\r\x1b[2KB\n\r\n");
  }
}

class LiveCommandSuite extends Test({ name: "render: live command (static snapshot)" }) {
  @Test.it("waits for tasks then writes the final template snapshot")
  async tableFillsIn() {
    const out: string[] = [];
    class Report extends Command({ name: "report" }) {
      #rows = task(this, async () => [["alice", "12"], ["bob", "7"]] as string[][]);
      constructor() {
        super();
        this.#rows.run();
      }
      render() {
        if (this.#rows.pending) return text`loading…`;
        return text`${table(this.#rows.value!, { head: ["name", "score"] })}`;
      }
    }
    const app = Application({
      name: "tool",
      commands: [Report],
      autoRun: false,
      tty: false,
      stdout: (l) => out.push(l),
    });
    const code = await app.run(["report"]);
    expect(code).toBe(0);
    // Final snapshot (not "loading…") since we wait for the task to settle.
    expect(out[0]).toBe("┌───────┬───────┐");
    expect(out.join("\n").includes("alice")).toBe(true);
    expect(out.join("\n").includes("loading")).toBe(false);
  }
}

class FlowSuite extends Test({ name: "render: flow control" }) {
  @Test.it("flow.if / flow.when render only the taken branch")
  conditional() {
    expect(renderTemplate(text`${flow.if(true, () => "yes", () => "no")}`)).toBe("yes");
    expect(renderTemplate(text`${flow.if(false, () => "yes", () => "no")}`)).toBe("no");
    expect(renderTemplate(text`${flow.if(false, () => "yes")}`)).toBe("");
    expect(renderTemplate(text`${flow.when(1, () => "a")}`)).toBe("a");
  }

  @Test.it("flow.switch matches a case or falls back to default")
  multiway() {
    const render = (s: string) =>
      renderTemplate(
        text`${flow.switch(s, { ok: () => "✓", fail: () => "✗", default: () => "?" })}`,
      );
    expect(render("ok")).toBe("✓");
    expect(render("fail")).toBe("✗");
    expect(render("other")).toBe("?");
  }

  @Test.it("flow.for and flow.while build lists")
  loops() {
    expect(renderTemplate(text`${flow.for(1, 4, (i) => i)}`)).toBe("123");
    expect(renderTemplate(text`${flow.for(0, 6, 2, (i) => `${i},`)}`)).toBe("0,2,4,");
    expect(renderTemplate(text`${flow.while((i) => i < 3, (i) => i)}`)).toBe("012");
  }

  @Test.it("flow.map maps an iterable")
  mapping() {
    expect(renderTemplate(text`${flow.map(["a", "b"], (x, i) => `${i}:${x} `)}`)).toBe("0:a 1:b ");
  }

  @Test.it("flow.await renders pending then the resolved branch in a live command")
  async awaitResolves() {
    const out: string[] = [];
    let resolve!: (v: string) => void;
    const config = new Promise<string>((r) => (resolve = r));
    class Show extends Command({ name: "show" }) {
      #config = config;
      render() {
        return text`config: ${flow.await(this.#config, {
          pending: () => "loading…",
          then: (name) => name,
          catch: () => "failed",
        })}`;
      }
    }
    const app = Application({ name: "tool", commands: [Show], autoRun: false, tty: false, stdout: (l) => out.push(l) });
    const run = app.run(["show"]);
    resolve("production");
    const code = await run;
    expect(code).toBe(0);
    expect(out.join("\n")).toBe("config: production");
  }

  @Test.it("flow.await renders the catch branch on rejection")
  async awaitRejects() {
    const out: string[] = [];
    const failing = Promise.reject(new Error("nope"));
    failing.catch(() => {}); // avoid unhandled-rejection noise
    class Show extends Command({ name: "show" }) {
      #p = failing;
      render() {
        return text`${flow.await(this.#p, { pending: () => "…", then: () => "ok", catch: (e) => `err: ${(e as Error).message}` })}`;
      }
    }
    const app = Application({ name: "tool", commands: [Show], autoRun: false, tty: false, stdout: (l) => out.push(l) });
    const code = await app.run(["show"]);
    expect(code).toBe(0);
    expect(out.join("\n")).toBe("err: nope");
  }

  @Test.it("flow.await rejects awaiting a Task at runtime")
  async rejectsTask() {
    const err: string[] = [];
    class Show extends Command({ name: "show" }) {
      #t = task(this, async () => "x");
      render() {
        // Bypass the type-level guard to exercise the runtime guard.
        return text`${flow.await(this.#t as never, { then: () => "" })}`;
      }
    }
    const app = Application({ name: "tool", commands: [Show], autoRun: false, tty: false, stdout() {}, stderr: (l) => err.push(l) });
    const code = await app.run(["show"]);
    expect(code).toBe(1);
    expect(err.some((l) => l.includes("flow.await"))).toBe(true);
  }
}

class ElementsSuite extends Test({ name: "render: elements (pure renderers)" }) {
  @Test.it("box frames content with an ANSI-aware width")
  boxElement() {
    const lines = box("hello", { title: "Hi" }).split("\n");
    expect(lines[0]!.startsWith("┌─ Hi ")).toBe(true);
    expect(lines[1]!.startsWith("│ hello")).toBe(true);
    expect(lines[2]!.startsWith("└")).toBe(true);
    expect(visibleWidth(lines[0]!)).toBe(visibleWidth(lines[1]!));
  }

  @Test.it("stepper marks done / current / pending steps")
  stepperElement() {
    const out = plain(stepper(["Plan", "Build", "Ship"], { current: 1 }));
    expect(out).toBe("① Plan → ② Build → ③ Ship");
  }

  @Test.it("select renders a single-select cursor list")
  selectSingle() {
    const out = plain(
      select({ message: "Pick", items: [{ label: "a", value: "a" }, { label: "b", value: "b" }], cursor: 1 }),
    );
    const lines = out.split("\n");
    expect(lines[0]).toBe("? Pick");
    expect(lines[1]).toBe("  a");
    expect(lines[2]).toBe("❯ b");
  }

  @Test.it("select renders checkboxes when given a selection set (multiple)")
  selectMultiple() {
    const out = plain(
      select({
        message: "Pick",
        items: [{ label: "a", value: "a" }, { label: "b", value: "b" }],
        cursor: 0,
        selected: new Set([1]),
      }),
    );
    expect(out.includes("◯ a")).toBe(true);
    expect(out.includes("◉ b")).toBe(true);
  }

  @Test.it("select honours a custom format")
  selectFormat() {
    const out = plain(
      select({
        message: "Pick",
        items: [{ label: "a", value: "a" }],
        cursor: 0,
        format: (item, { active }) => `${active ? ">>" : "  "} [${item.label}]`,
      }),
    );
    expect(out.includes(">> [a]")).toBe(true);
  }

  @Test.it("input renders a field, optionally boxed")
  inputElement() {
    expect(plain(input({ message: "Name", value: "bob" })).startsWith("? Name bob")).toBe(true);
    const boxed = plain(input({ message: "Name", value: "bob", box: "Enter" }));
    expect(boxed.startsWith("┌─ Enter ")).toBe(true);
    expect(boxed.includes("bob")).toBe(true);
  }

  @Test.it("alert and spinner render their states")
  alertSpinner() {
    expect(plain(alert("Done")).startsWith("Done")).toBe(true);
    expect(plain(spinner("Load", { frame: 0 }))).toBe("⠋ Load");
    expect(plain(spinner("Load", { state: "success" }))).toBe("✓ Load");
    expect(plain(spinner("Load", { state: "fail" }))).toBe("✗ Load");
  }
}

class SchedulerSuite extends Test({ name: "render: scheduler" }) {
  @Test.it("every ticks and repaints until stopped, then disposes")
  async every() {
    let ticks = 0;
    let repaints = 0;
    const sched = createScheduler({ requestUpdate: () => repaints++ });
    const stop = sched.every(5, () => ticks++);
    await new Promise((r) => setTimeout(r, 40));
    expect(ticks > 0).toBe(true);
    expect(repaints > 0).toBe(true);
    expect(repaints).toBe(ticks); // a repaint per tick
    stop();
    const afterStop = ticks;
    await new Promise((r) => setTimeout(r, 25));
    expect(ticks).toBe(afterStop); // stopped → no more ticks
    sched.dispose();
  }

  @Test.it("frame reports positive dt and dispose stops all timers")
  async frame() {
    let total = 0;
    let calls = 0;
    const sched = createScheduler({ requestUpdate() {} });
    sched.frame((dt) => {
      total += dt;
      calls++;
    }, 60);
    await new Promise((r) => setTimeout(r, 40));
    sched.dispose();
    const afterDispose = calls;
    expect(calls > 0).toBe(true);
    expect(total > 0).toBe(true); // accumulated real seconds
    await new Promise((r) => setTimeout(r, 25));
    expect(calls).toBe(afterDispose); // dispose stopped the frame loop
  }

  @Test.it("a command drives animation via this.scheduler and is disposed by the runtime")
  async commandScheduler() {
    let frames = 0;
    class Anim extends Command("anim") {
      #ticks = 0;
      #done = task(this, () =>
        new Promise<void>((resolve) => {
          const poll = (): void => void (this.#ticks >= 3 ? resolve() : setTimeout(poll, 5));
          setTimeout(poll, 5);
        }),
      );
      constructor() {
        super();
        this.#done.run();
        this.scheduler.frame(() => {
          this.#ticks++;
          frames++;
        }, 120);
      }
      render() {
        return text`frame ${this.#ticks}`;
      }
    }
    const out: string[] = [];
    const app = Application({ name: "t", commands: [Anim], autoRun: false, tty: false, stdout: (l) => out.push(l) });
    await app.run(["anim"]);
    expect(frames >= 3).toBe(true);
    const settled = frames;
    // Scheduler disposed on teardown → no more frames after the run.
    await new Promise((r) => setTimeout(r, 25));
    expect(frames).toBe(settled);
  }
}

class ShutdownSuite extends Test({ name: "render: graceful shutdown" }) {
  @Test.it("SIGINT aborts a live command, runs teardown, exits 130")
  async sigint() {
    let disposed = false;
    let sawAbort = false;
    class Serve extends Command("serve") {
      #pending = task(this, () => new Promise<void>(() => {})); // never settles
      constructor() {
        super();
        this.#pending.run();
      }
      render() {
        if (this.abortSignal.aborted) sawAbort = true;
        return text`serving…`;
      }
      [Symbol.dispose]() {
        disposed = true;
      }
    }
    const app = Application({ name: "t", commands: [Serve], autoRun: false, tty: false, stdout() {}, stderr() {} });
    const p = app.run(["serve"]);
    await new Promise((r) => setTimeout(r, 20)); // let it start + install handlers
    process.emit("SIGINT");
    const code = await p;
    expect(code).toBe(130);
    expect(disposed).toBe(true); // teardown ran
    expect(sawAbort).toBe(true); // the final draw saw the aborted signal
  }

  @Test.it("a custom signal set fires the onShutdown hook and uses its exit code")
  async customSignal() {
    let hookSignal = "";
    class Serve extends Command("serve") {
      #pending = task(this, () => new Promise<void>(() => {}));
      constructor() {
        super();
        this.#pending.run();
      }
      render() {
        return text`x`;
      }
    }
    const app = Application({
      name: "t",
      commands: [Serve],
      autoRun: false,
      tty: false,
      stdout() {},
      stderr() {},
      shutdown: { signals: ["SIGTERM"], onShutdown: (s) => (hookSignal = s) },
    });
    const p = app.run(["serve"]);
    await new Promise((r) => setTimeout(r, 20));
    process.emit("SIGTERM");
    const code = await p;
    expect(code).toBe(143);
    expect(hookSignal).toBe("SIGTERM");
  }

  @Test.it("shutdown:false leaves abortSignal un-aborted")
  async disabled() {
    let aborted = true;
    class Quick extends Command("quick") {
      execute() {
        aborted = this.abortSignal.aborted;
      }
    }
    const app = Application({ name: "t", commands: [Quick], autoRun: false, shutdown: false, stdout() {}, stderr() {} });
    await app.run(["quick"]);
    expect(aborted).toBe(false);
  }
}

await TestApplication()
  .addTests(TaskSuite)
  .addTests(TemplateSuite)
  .addTests(TableSuite)
  .addTests(LiveSuite)
  .addTests(LiveCommandSuite)
  .addTests(FlowSuite)
  .addTests(ElementsSuite)
  .addTests(SchedulerSuite)
  .addTests(ShutdownSuite)
  .reporter(new ConsoleReporter())
  .run();
