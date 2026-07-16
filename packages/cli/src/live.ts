// @youneed/cli — the live region renderer.
//
// Draws a block of lines to the terminal and, on each subsequent draw, repaints
// only the lines that changed — by moving the cursor up over the region and
// rewriting just those rows with ANSI control sequences. This is the terminal
// counterpart of dom's hole patching: the dynamic spans (holes/tasks) decide
// what changed; the cursor-control codes apply the change without redrawing the
// whole screen, so a table's cells can fill in as their tasks resolve.

import { renderTemplate, type CliTemplateResult } from "./template.ts";

/** Move the cursor up `n` rows. */
const cursorUp = (n: number): string => (n > 0 ? `\x1b[${n}A` : "");
/** Carriage return + clear the whole line. */
const CLEAR_LINE = "\r\x1b[2K";

/**
 * A re-paintable block of terminal output. Construct with a raw write sink
 * (e.g. `process.stdout.write`); call {@link LiveRenderer.draw} with each new
 * snapshot.
 */
export class LiveRenderer {
  #prev: string[] | undefined;

  constructor(private readonly write: (chunk: string) => void) {}

  /** Draw a snapshot (a template or a plain string), patching changed lines. */
  draw(snapshot: CliTemplateResult | string): void {
    const clean = typeof snapshot === "string" ? snapshot : renderTemplate(snapshot);
    const next = clean.split("\n");

    if (this.#prev === undefined) {
      this.write(next.join("\n") + "\n");
      this.#prev = next;
      return;
    }

    const prev = this.#prev;
    const height = Math.max(prev.length, next.length);
    // Cursor sits just below the region (we ended the last draw with "\n").
    let buf = cursorUp(prev.length);
    for (let i = 0; i < height; i++) {
      const line = next[i] ?? "";
      // Repaint only changed (or newly-added) rows; otherwise step past intact.
      buf += line !== prev[i] ? CLEAR_LINE + line : "\r";
      buf += "\n";
    }
    this.write(buf);
    this.#prev = next;
  }
}
