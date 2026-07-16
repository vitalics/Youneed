import { Command, defaultOptions, flow, table, task, text } from "@youneed/cli";
import { color } from "@youneed/cli-middleware-color";

const SERVICES = ["api", "database", "cache", "queue", "search"];

export class StatusCommand extends Command({
  name: "status",
  description: "Ping services and render their latency as a live table",
  options: [...defaultOptions()],
  middleware: [color()],
}) {
  // One task per service — a simulated latency check. Created as fields so
  // `render` stays a pure read of their state and can be re-invoked freely.
  #checks = SERVICES.map((name) =>
    task(this, async (signal: AbortSignal) => {
      const latency = 250 + Math.floor(Math.random() * 1600);
      await new Promise((resolve, reject) => {
        const id = setTimeout(resolve, latency);
        signal.addEventListener("abort", () => {
          clearTimeout(id);
          reject(new DOMException("aborted", "AbortError"));
        });
      });
      if (latency > 1400) throw new Error("timeout");
      return latency;
    }),
  );

  constructor() {
    super();
    for (const check of this.#checks) check.run();
  }

  override render() {
    const c = this.color;
    const rows = flow.map(SERVICES, (name, i) => {
      const check = this.#checks[i]!;
      const status = flow.switch(
        check.pending ? "pending" : check.error ? "down" : "up",
        {
          pending: () => c.yellow("checking…"),
          down: () => c.background.red(c.white(" DOWN ")),
          up: () =>
            check.value! < 800
              ? c.green(`${check.value}ms ✓`)
              : c.yellow(`${check.value}ms ⚠`),
          default: () => "",
        },
      );
      return [c.bold(name), status];
    }) as string[][];

    const done = this.#checks.every((t) => t.settled);
    const healthy = this.#checks.every((t) => !t.error);
    const summary = flow.if(
      !done,
      () => c.dim("checking services…"),
      () =>
        healthy
          ? c.green("✓ all systems operational")
          : c.background.red(c.white(" incidents detected ")),
    );

    return text`${summary}\n${table(rows, { head: ["service", "status"], align: ["left", "right"] })}`;
  }
}
