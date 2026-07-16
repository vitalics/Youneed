// @youneed/cli-middleware-progress — progress bars for @youneed/cli.
//
//   class Download extends Command("download", { middleware: [progress()] }) {
//     async execute() {
//       const bar = this.progress.bar({ total: files.length, label: "downloading" });
//       for (const f of files) { await fetchFile(f); bar.tick(); }
//     }
//   }
//
// `this.progress.bar()` returns a reactive bar — `update`/`tick`/`complete`
// repaint the live region (it's wired to the host like a task), and `render()`
// draws `[███░░] 60% · eta 3s`. Use it as a field/value and read it from
// `render`, or just tick it from an imperative `execute`.

import { contribute, type CliMiddleware, type ReactiveHost } from "@youneed/cli";

/** A single progress bar. */
export interface ProgressBar {
  readonly total: number;
  readonly value: number;
  /** `value / total`, clamped to 0..1. */
  readonly fraction: number;
  /** True once `value` reaches `total`. */
  readonly done: boolean;
  /** Set the absolute value and repaint. */
  update(value: number): void;
  /** Advance by `n` (default 1) and repaint. */
  tick(n?: number): void;
  /** Jump to complete. */
  complete(): void;
  /** Render the bar to a string for the current state. */
  render(width?: number): string;
}

/** Options for {@link ProgressApi.bar}. */
export interface BarOptions {
  total?: number;
  label?: string;
  width?: number;
}

/** The `this.progress` surface. */
export interface ProgressApi {
  bar(options?: BarOptions): ProgressBar;
}

const FULL = "█";
const EMPTY = "░";

/** Render a bar of `width` cells for a 0..1 `fraction` (pure helper). */
export function renderProgressBar(fraction: number, width = 24): string {
  const f = Math.max(0, Math.min(1, fraction));
  const filled = Math.round(f * width);
  return FULL.repeat(filled) + EMPTY.repeat(Math.max(0, width - filled));
}

function eta(fraction: number, startedAt: number): string {
  if (fraction <= 0 || fraction >= 1) return "";
  const elapsed = (Date.now() - startedAt) / 1000;
  const remaining = elapsed / fraction - elapsed;
  return ` · eta ${Math.ceil(remaining)}s`;
}

/** Progress middleware. Adds `this.progress`. */
export function progress(): CliMiddleware<{ readonly progress: ProgressApi }> {
  return {
    name: "progress",
    install(ctx) {
      const host = ctx.command as unknown as ReactiveHost;
      const api: ProgressApi = {
        bar(options = {}) {
          const total = options.total ?? 100;
          const width = options.width ?? 24;
          const label = options.label ?? "";
          const startedAt = Date.now();
          let value = 0;
          const clamp = (v: number): number => Math.max(0, Math.min(total, v));
          const bar: ProgressBar = {
            total,
            get value() {
              return value;
            },
            get fraction() {
              return total > 0 ? clamp(value) / total : 0;
            },
            get done() {
              return value >= total;
            },
            update(v) {
              value = clamp(v);
              host.requestUpdate();
            },
            tick(n = 1) {
              value = clamp(value + n);
              host.requestUpdate();
            },
            complete() {
              value = total;
              host.requestUpdate();
            },
            render(w = width) {
              const pct = Math.round(bar.fraction * 100);
              const head = label ? `${label} ` : "";
              return `${head}[${renderProgressBar(bar.fraction, w)}] ${pct}%${eta(bar.fraction, startedAt)}`;
            },
          };
          return bar;
        },
      };
      contribute(ctx.command, "progress", api);
    },
  };
}
