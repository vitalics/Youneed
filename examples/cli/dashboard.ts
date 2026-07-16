import { Command, task, text } from "@youneed/cli";
import { color } from "@youneed/cli-middleware-color";

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class DashboardCommand extends Command("dashboard", {
  description:
    "Live dashboard — independent ticks via this.scheduler (run in a terminal)",
  middleware: [color()],
}) {
  #clock = "";
  #elapsed = 0;
  #spin = 0;
  #gauge = 0;
  // Ends after ~8s (or on Ctrl-C). Polls the clock counter the scheduler drives.
  #ended = task(
    this,
    () =>
      new Promise<void>((resolve) => {
        const poll = (): void =>
          void (this.#elapsed >= 8 || this.abortSignal.aborted
            ? resolve()
            : setTimeout(poll, 100));
        setTimeout(poll, 100);
      }),
  );

  constructor() {
    super();
    this.#ended.run();
    // Three elements, three independent cadences — the scheduler coalesces the
    // repaints and disposes every timer when the command ends.
    this.scheduler.every(1000, () => {
      this.#clock = new Date().toLocaleTimeString();
      this.#elapsed++;
    }); // clock: 1Hz
    this.scheduler.every(
      80,
      () => (this.#spin = (this.#spin + 1) % SPINNER.length),
    ); // spinner: ~12Hz
    this.scheduler.frame(
      () => (this.#gauge = (Math.sin(Date.now() / 250) + 1) / 2),
      20,
    ); // gauge: 20fps
  }

  override render() {
    const c = this.color;
    const width = 24;
    const filled = Math.round(this.#gauge * width);
    const gauge =
      c.green("█".repeat(filled)) + c.dim("░".repeat(width - filled));
    return text`${c.bold("Dashboard")}  ${c.dim(this.#clock || "--:--:--")}
${c.cyan(SPINNER[this.#spin]!)} working…  ${c.dim("elapsed " + this.#elapsed + "s")}
load  ${gauge} ${c.dim(Math.round(this.#gauge * 100) + "%")}
${c.dim("(each line ticks at its own rate; ~8s)")}`;
  }
}
