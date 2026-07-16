// @youneed/cli-middleware-hotkeys — global key handlers for @youneed/cli.
//
//   class Watch extends Command("watch", { middleware: [hotkeys()] }) {
//     async execute() {
//       await new Promise<void>((done) => {
//         this.keys.on("r", () => rebuild());
//         this.keys.on("q", done);
//       });
//     }
//   }
//
// `this.keys.on(name, handler)` registers a key listener over the raw terminal
// (shared core input layer). Keys dispatch by logical name (`"up"`, `"q"`, …) and
// by `"ctrl-<name>"` (e.g. `"ctrl-c"`). Capture starts on install and is released
// on teardown.

import { contribute, nodeTerminal, type CliMiddleware, type Key, type Terminal } from "@youneed/cli";

/** The `this.keys` surface. */
export interface Hotkeys {
  /** Listen for a key (`"up"`, `"q"`, `"ctrl-c"`, …); returns an unsubscribe. */
  on(name: string, handler: (key: Key) => void): () => void;
  /** Remove a previously-registered handler. */
  off(name: string, handler: (key: Key) => void): void;
}

/** Options for {@link hotkeys}. */
export interface HotkeysOptions {
  /** Terminal to capture (defaults to the real one). */
  terminal?: Terminal;
}

/** Hotkey middleware. Adds `this.keys`. */
export function hotkeys(options: HotkeysOptions = {}): CliMiddleware<{ readonly keys: Hotkeys }> {
  return {
    name: "hotkeys",
    install(ctx) {
      const terminal = options.terminal ?? nodeTerminal();
      const handlers = new Map<string, Set<(key: Key) => void>>();
      const dispatch = (name: string, key: Key): void => handlers.get(name)?.forEach((h) => h(key));

      const stop = terminal.capture((key) => {
        dispatch(key.name, key);
        if (key.ctrl) dispatch(`ctrl-${key.name}`, key);
      });
      ctx.onCleanup(stop);

      const api: Hotkeys = {
        on(name, handler) {
          let set = handlers.get(name);
          if (!set) handlers.set(name, (set = new Set()));
          set.add(handler);
          return () => set!.delete(handler);
        },
        off(name, handler) {
          handlers.get(name)?.delete(handler);
        },
      };
      contribute(ctx.command, "keys", api);
    },
  };
}
