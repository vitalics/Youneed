// @youneed/cli-plugin-update-notifier — "a newer version is available" notices.
//
//   Application({ name: "ops", version: "1.0.0", plugins: [updateNotifier({ current: "1.0.0" })] });
//
// After a command runs, it checks the npm registry for the latest version and,
// if newer, prints a notice to stderr. The check is throttled (once a day by
// default) via a stamp file, and the network fetch is best-effort and injectable
// for tests. Never blocks or fails the command.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CliPlugin } from "@youneed/cli";

/** Options for {@link updateNotifier}. */
export interface UpdateNotifierOptions {
  /** The currently-running version. */
  current: string;
  /** Package name to query. Defaults to the program name. */
  name?: string;
  /** Min ms between checks (throttled via a stamp file). Default 1 day; `0` disables throttling. */
  interval?: number;
  /** Fetch the latest version (injectable). Default queries the npm registry. */
  fetchLatest?: (name: string) => Promise<string | undefined>;
}

/** Parse `a > b` for `major.minor.patch` versions. */
export function isNewer(latest: string, current: string): boolean {
  const parse = (v: string): number[] => v.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) > (b[i] ?? 0)) return true;
    if ((a[i] ?? 0) < (b[i] ?? 0)) return false;
  }
  return false;
}

async function npmLatest(name: string): Promise<string | undefined> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`);
    if (!res.ok) return undefined;
    return ((await res.json()) as { version?: string }).version;
  } catch {
    return undefined;
  }
}

function throttled(name: string, interval: number): boolean {
  if (interval <= 0) return false;
  try {
    const dir = join(tmpdir(), "youneed-cli-update");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const stamp = join(dir, `${name}.txt`);
    const last = existsSync(stamp) ? Number(readFileSync(stamp, "utf8")) : 0;
    if (Date.now() - last < interval) return true;
    writeFileSync(stamp, String(Date.now()));
    return false;
  } catch {
    return false;
  }
}

/** Update-notifier plugin. Prints a notice after commands when a newer version exists. */
export function updateNotifier(options: UpdateNotifierOptions): CliPlugin {
  let name = options.name;
  const interval = options.interval ?? 24 * 60 * 60 * 1000;
  const fetchLatest = options.fetchLatest ?? npmLatest;
  return {
    name: "update-notifier",
    setup(host) {
      name = name ?? host.name;
    },
    async afterCommand() {
      const pkg = name ?? "";
      if (!pkg || throttled(pkg, interval)) return;
      const latest = await fetchLatest(pkg);
      if (latest && isNewer(latest, options.current)) {
        console.error(
          `\nUpdate available: ${options.current} → ${latest}\nRun \`npm i -g ${pkg}\` to update.\n`,
        );
      }
    },
  };
}
