// @youneed/cli-middleware-fs — filesystem helpers for @youneed/cli.
//
//   class Gen extends Command("gen", { middleware: [fs()] }) {
//     async execute() {
//       const dir = this.fs.tempDir();          // removed automatically on teardown
//       this.fs.writeJson(`${dir}/out.json`, { ok: true });
//     }
//   }
//
// `this.fs` wraps the common read/write/exists/remove calls and adds temp dirs
// and files that are removed when the command tears down (built on the runtime's
// disposal) — so generators and scratch work never leak.

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { contribute, type CliMiddleware } from "@youneed/cli";

/** The `this.fs` surface. */
export interface FsApi {
  readText(path: string): string;
  writeText(path: string, content: string): void;
  readJson<T = unknown>(path: string): T;
  writeJson(path: string, value: unknown): void;
  exists(path: string): boolean;
  remove(path: string): void;
  /** Create a temp directory, removed automatically when the command ends. */
  tempDir(prefix?: string): string;
  /** Path to a file inside a fresh temp dir (also auto-removed). */
  tempFile(name?: string): string;
}

/** Filesystem middleware. Adds `this.fs`. */
export function fs(): CliMiddleware<{ readonly fs: FsApi }> {
  return {
    name: "fs",
    install(ctx) {
      const temps: string[] = [];
      const ensureParent = (path: string): void => {
        const dir = dirname(path);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      };
      const api: FsApi = {
        readText: (path) => readFileSync(path, "utf8"),
        writeText: (path, content) => {
          ensureParent(path);
          writeFileSync(path, content);
        },
        readJson: <T = unknown>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T,
        writeJson: (path, value) => {
          ensureParent(path);
          writeFileSync(path, JSON.stringify(value, null, 2));
        },
        exists: (path) => existsSync(path),
        remove: (path) => rmSync(path, { recursive: true, force: true }),
        tempDir: (prefix = "youneed-") => {
          const dir = mkdtempSync(join(tmpdir(), prefix));
          temps.push(dir);
          return dir;
        },
        tempFile: (name = "tmp") => {
          const dir = mkdtempSync(join(tmpdir(), "youneed-"));
          temps.push(dir);
          return join(dir, name);
        },
      };
      // Remove every temp dir created during the run.
      ctx.onCleanup(() => {
        for (const dir of temps) rmSync(dir, { recursive: true, force: true });
      });
      contribute(ctx.command, "fs", api);
    },
  };
}
