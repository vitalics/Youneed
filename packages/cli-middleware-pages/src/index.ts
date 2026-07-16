// @youneed/cli-middleware-pages — a built-in pager for @youneed/cli.
//
//   class Log extends Command("log", { middleware: [pages()] }) {
//     async execute() { await this.pages.show(bigLogString); }
//   }
//
// `this.pages.show(text)` pages long output in the alternate screen: ↑/↓ scroll a
// line, Space/PageDn a page, g/G jump to top/bottom, q/Esc quit. Resolves when
// the user quits. Built on the shared core terminal input.

import { contribute, nodeTerminal, type CliMiddleware, type Terminal } from "@youneed/cli";

const ENTER = "\x1b[?1049h\x1b[?25l";
const LEAVE = "\x1b[?25h\x1b[?1049l";
const CLEAR_HOME = "\x1b[H\x1b[2J";
const dim = (s: string): string => `\x1b[2m${s}\x1b[22m`;

/** The `this.pages` surface. */
export interface Pager {
  /** Page through `text`; resolves when the user quits. */
  show(text: string): Promise<void>;
}

/** Options for {@link pages}. */
export interface PagesOptions {
  /** Terminal to drive (defaults to the real one). */
  terminal?: Terminal;
}

/** Pager middleware. Adds `this.pages`. */
export function pages(options: PagesOptions = {}): CliMiddleware<{ readonly pages: Pager }> {
  return {
    name: "pages",
    install(ctx) {
      const terminal = options.terminal ?? nodeTerminal();
      const show = (text: string): Promise<void> => {
        const lines = text.split("\n");
        return new Promise<void>((resolve) => {
          let top = 0;
          const view = (): number => Math.max(1, terminal.rows - 1);
          const maxTop = (): number => Math.max(0, lines.length - view());
          terminal.write(ENTER);
          const draw = (): void => {
            const body = lines.slice(top, top + view()).join("\n");
            const end = Math.min(top + view(), lines.length);
            const footer = dim(`-- ${end}/${lines.length} — ↑↓ scroll · space page · q quit --`);
            terminal.write(`${CLEAR_HOME}${body}\n${footer}`);
          };
          draw();
          const stop = terminal.capture((key) => {
            if (key.name === "q" || key.name === "escape" || (key.ctrl && key.name === "c")) {
              stop();
              terminal.write(LEAVE);
              resolve();
              return;
            }
            if (key.name === "down") top = Math.min(top + 1, maxTop());
            else if (key.name === "up") top = Math.max(0, top - 1);
            else if (key.name === "space") top = Math.min(top + view(), maxTop());
            else if (key.name === "g") top = 0;
            else if (key.name === "G") top = maxTop();
            draw();
          });
        });
      };
      contribute(ctx.command, "pages", { show });
    },
  };
}
