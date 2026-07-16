// @youneed/test-snapshot — snapshot testing as a @youneed/test plugin.
//
//   import { snapshot, toMatchSnapshot } from "@youneed/test-snapshot";
//
//   class S extends Test() {
//     @Test.it() render() { toMatchSnapshot(buildTree()); }
//   }
//   TestApplication().addTests(S).use(snapshot()).run();
//
// First run writes the snapshot to `__snapshots__/<Suite>.snap.json`; later runs
// compare. Update with `snapshot({ update: true })` or `YOUNEED_UPDATE_SNAPSHOTS=1`.
// The plugin sets the "current test" so the standalone `toMatchSnapshot(value)`
// knows which test + counter it belongs to.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { AssertionError, type TestExecution, type TestPlugin } from "@youneed/test";

interface Store {
  file: string;
  data: Record<string, string>;
  dirty: boolean;
}
interface Active {
  store: Store;
  testName: string;
  counter: number;
  update: boolean;
}

let active: Active | undefined;
const cache = new Map<string, Store>(); // file → store (per process)

const sanitize = (s: string) => s.replace(/[^\w.-]+/g, "_");

function loadStore(file: string): Store {
  let store = cache.get(file);
  if (!store) {
    let data: Record<string, string> = {};
    if (existsSync(file)) {
      try {
        data = JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;
      } catch {
        /* corrupt snapshot file — treat as empty, will be rewritten */
      }
    }
    cache.set(file, (store = { file, data, dirty: false }));
  }
  return store;
}

function flush(store: Store): void {
  if (!store.dirty) return;
  mkdirSync(dirname(store.file), { recursive: true });
  writeFileSync(store.file, JSON.stringify(store.data, Object.keys(store.data).sort(), 2) + "\n");
  store.dirty = false;
}

function serialize(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2) ?? String(value);
}

export interface SnapshotOptions {
  /** Snapshot directory (default `<cwd>/__snapshots__`). */
  dir?: string;
  /** Overwrite snapshots instead of comparing (or set `YOUNEED_UPDATE_SNAPSHOTS`). */
  update?: boolean;
}

/** The snapshot plugin — register with `.use(snapshot())`. */
export function snapshot(opts: SnapshotOptions = {}): TestPlugin {
  const dir = opts.dir ?? join(process.cwd(), "__snapshots__");
  const update = opts.update ?? !!process.env.YOUNEED_UPDATE_SNAPSHOTS;
  return {
    name: "snapshot",
    async runTest(exec: TestExecution) {
      const store = loadStore(join(dir, `${sanitize(exec.ctx.suite)}.snap.json`));
      const prev = active;
      active = { store, testName: exec.ctx.name, counter: 0, update };
      try {
        await exec.next();
      } finally {
        flush(store);
        active = prev;
      }
    },
  };
}

/**
 * Assert `received` matches its stored snapshot. Must run inside a test with the
 * `snapshot()` plugin. Auto-keyed by `<test name> <n>` (incrementing per call);
 * pass `hint` to disambiguate. First run (or update mode) records; otherwise a
 * mismatch throws an `AssertionError`.
 */
export function toMatchSnapshot(received: unknown, hint?: string): void {
  if (!active) {
    throw new Error("toMatchSnapshot() must be called inside a test running under the snapshot() plugin");
  }
  const key = `${active.testName} ${++active.counter}${hint ? ` (${hint})` : ""}`;
  const serialized = serialize(received);
  const stored = active.store.data[key];

  if (active.update || stored === undefined) {
    if (stored !== serialized) {
      active.store.data[key] = serialized;
      active.store.dirty = true;
    }
    return; // recorded (or first-seen) → pass
  }
  if (stored !== serialized) {
    throw new AssertionError(`snapshot "${key}" mismatch\n- stored:   ${stored}\n+ received: ${serialized}`);
  }
}
