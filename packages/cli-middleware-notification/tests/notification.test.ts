import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Command } from "@youneed/cli";
import { bellNotifier, notifications, type NotificationSpec, type Notifier } from "../src/index.ts";

/** A fake backend that records every notification it's asked to send. */
function recordingNotifier(): { notifier: Notifier; calls: NotificationSpec[] } {
  const calls: NotificationSpec[] = [];
  return {
    calls,
    notifier: {
      async notify(spec) {
        calls.push(spec);
      },
    },
  };
}

class NotifySuite extends Test({ name: "cli-middleware-notification" }) {
  @Test.it("contributes this.notify and forwards level shortcuts to the backend")
  async levels() {
    const { notifier, calls } = recordingNotifier();
    class Run extends Command("run", { middleware: [notifications({ notifier, title: "MyApp" })] }) {
      async execute() {
        await this.notify.success("done");
        await this.notify.error("oops", "Failure");
        await this.notify.info("fyi");
      }
    }
    const app = Application({ name: "tool", commands: [Run], autoRun: false, stdout() {}, stderr() {} });
    const code = await app.run(["run"]);
    expect(code).toBe(0);
    expect(calls.length).toBe(3);
    expect(calls[0]).toEqual({ message: "done", title: "MyApp", sound: false });
    expect(calls[1]).toEqual({ message: "oops", title: "Failure", sound: true });
    expect(calls[2]!.sound).toBe(false);
  }

  @Test.it("send() applies default title and icon")
  async sendDefaults() {
    const { notifier, calls } = recordingNotifier();
    class Run extends Command("run", {
      middleware: [notifications({ notifier, title: "App", icon: "/icon.png" })],
    }) {
      async execute() {
        await this.notify.send({ message: "raw" });
        await this.notify.send({ message: "custom", title: "Override" });
      }
    }
    const app = Application({ name: "tool", commands: [Run], autoRun: false, stdout() {}, stderr() {} });
    await app.run(["run"]);
    expect(calls[0]).toEqual({ message: "raw", title: "App", icon: "/icon.png" });
    expect(calls[1]!.title).toBe("Override");
  }

  @Test.it("title defaults to the program name when not configured")
  async programTitle() {
    const { notifier, calls } = recordingNotifier();
    class Run extends Command("run", { middleware: [notifications({ notifier })] }) {
      async execute() {
        await this.notify.info("hi");
      }
    }
    const app = Application({ name: "string-util", commands: [Run], autoRun: false, stdout() {}, stderr() {} });
    await app.run(["run"]);
    expect(calls[0]!.title).toBe("string-util");
  }

  @Test.it("bellNotifier rings the terminal bell (the no-dependency fallback)")
  async fallback() {
    let written = "";
    const original = process.stderr.write.bind(process.stderr);
    (process.stderr as { write: (s: string) => boolean }).write = (s: string) => {
      written += s;
      return true;
    };
    try {
      await bellNotifier().notify({ message: "ping" });
    } finally {
      (process.stderr as { write: typeof original }).write = original;
    }
    expect(written.includes("\x07")).toBe(true);
  }
}

await TestApplication().addTests(NotifySuite).reporter(new ConsoleReporter()).run();
