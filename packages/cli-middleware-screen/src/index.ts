// @youneed/cli-middleware-screen — full-screen TUI buffer for @youneed/cli.
//
//   class Top extends Command("top", { middleware: [screen()] }) {
//     async execute() {
//       this.screen.draw(renderDashboard());
//       this.screen.onResize(() => this.screen.draw(renderDashboard()));
//       await untilQuit();
//     }
//   }
//
// `this.screen` switches the terminal to the alternate screen buffer (so the app
// owns the whole screen and the user's scrollback is restored on exit), hides the
// cursor, and gives `draw(content)` (clear + home + write) plus size and resize.
// Entering happens on first draw; the runtime leaves the alt screen and restores
// the cursor on teardown.

import { contribute, nodeTerminal, type CliMiddleware, type Terminal } from "@youneed/cli";

const ENTER = "\x1b[?1049h\x1b[?25l"; // alt screen on, hide cursor
const LEAVE = "\x1b[?25h\x1b[?1049l"; // show cursor, alt screen off
const CLEAR_HOME = "\x1b[H\x1b[2J"; // cursor home, clear screen

/** The `this.screen` surface. */
export interface Screen {
  readonly columns: number;
  readonly rows: number;
  /** Clear the screen and draw `content` from the top-left. */
  draw(content: string): void;
  /** Clear the screen. */
  clear(): void;
  /** Subscribe to terminal resize; returns an unsubscribe. */
  onResize(handler: () => void): () => void;
}

/** Options for {@link screen}. */
export interface ScreenOptions {
  /** Terminal to drive (defaults to the real one). */
  terminal?: Terminal;
}

/** Alternate-screen middleware. Adds `this.screen`. */
export function screen(options: ScreenOptions = {}): CliMiddleware<{ readonly screen: Screen }> {
  return {
    name: "screen",
    install(ctx) {
      const terminal = options.terminal ?? nodeTerminal();
      let entered = false;
      const enter = (): void => {
        if (!entered) {
          entered = true;
          terminal.write(ENTER);
        }
      };
      const api: Screen = {
        get columns() {
          return terminal.columns;
        },
        get rows() {
          return terminal.rows;
        },
        draw(content) {
          enter();
          terminal.write(CLEAR_HOME + content);
        },
        clear() {
          enter();
          terminal.write(CLEAR_HOME);
        },
        onResize(handler) {
          return terminal.onResize?.(handler) ?? (() => {});
        },
      };
      // Leave the alt screen and restore the cursor when the command ends.
      ctx.onCleanup(() => {
        if (entered) terminal.write(LEAVE);
      });
      contribute(ctx.command, "screen", api);
    },
  };
}
