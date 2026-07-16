// @youneed/cli-middleware-clipboard — system clipboard for @youneed/cli.
//
//   class Token extends Command("token", { middleware: [clipboard()] }) {
//     async execute() {
//       const t = generate();
//       await this.clipboard.write(t);
//       console.log("copied to clipboard");
//     }
//   }
//
// `this.clipboard.write/read` shells out to the platform clipboard tool
// (pbcopy/pbpaste on macOS, xclip/xsel on Linux, clip/PowerShell on Windows).
// Best-effort: if no tool is available it resolves quietly. The backend is
// injectable for tests.

import { contribute, type CliMiddleware } from "@youneed/cli";

/** The `this.clipboard` surface. */
export interface Clipboard {
  write(text: string): Promise<void>;
  read(): Promise<string>;
}

/** Options for {@link clipboard}. */
export interface ClipboardOptions {
  /** Replace the backend (e.g. an in-memory clipboard for tests). */
  backend?: Clipboard;
}

function commandsFor(): { copy: [string, string[]]; paste: [string, string[]] } | undefined {
  const p = typeof process !== "undefined" ? process.platform : "";
  if (p === "darwin") return { copy: ["pbcopy", []], paste: ["pbpaste", []] };
  if (p === "win32")
    return { copy: ["clip", []], paste: ["powershell", ["-NoProfile", "-Command", "Get-Clipboard"]] };
  return { copy: ["xclip", ["-selection", "clipboard"]], paste: ["xclip", ["-selection", "clipboard", "-o"]] };
}

/** The default OS-backed {@link Clipboard}. */
export function systemClipboard(): Clipboard {
  const run = async (cmd: [string, string[]], input?: string): Promise<string> => {
    const { spawn } = await import("node:child_process");
    return new Promise<string>((resolve) => {
      try {
        const child = spawn(cmd[0], cmd[1], { stdio: ["pipe", "pipe", "ignore"] });
        let out = "";
        child.stdout?.on("data", (d) => (out += d));
        child.on("error", () => resolve(""));
        child.on("close", () => resolve(out));
        if (input !== undefined) {
          child.stdin?.end(input);
        } else {
          child.stdin?.end();
        }
      } catch {
        resolve("");
      }
    });
  };
  return {
    async write(text) {
      const cmds = commandsFor();
      if (cmds) await run(cmds.copy, text);
    },
    async read() {
      const cmds = commandsFor();
      return cmds ? run(cmds.paste) : "";
    },
  };
}

/** Clipboard middleware. Adds `this.clipboard`. */
export function clipboard(options: ClipboardOptions = {}): CliMiddleware<{ readonly clipboard: Clipboard }> {
  return {
    name: "clipboard",
    install(ctx) {
      contribute(ctx.command, "clipboard", options.backend ?? systemClipboard());
    },
  };
}
