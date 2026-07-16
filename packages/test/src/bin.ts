// Runnable demo of @youneed/test: fixtures (with scopes), suite lifecycle,
// assertions, and benchmarks.  Run: tsx src/bin.ts
//
// Output uses the built-in quiet DefaultReporter (failures + benchmarks +
// summary). For rich, colored per-test output or an HTML file, install a
// reporter package and pass it via `.reporter(...)`:
//   import { ConsoleReporter } from "@youneed/test-reporter-console";
//   import { HTMLReporter } from "@youneed/test-reporter-html";
import { Test, Fixture, TestApplication, expect } from "./index.ts";

// ── a fixture: a fresh counter per test (default "test" scope) ────────────────
class Counter {
  value = 0;
  inc() {
    return ++this.value;
  }
}
class CounterFixture extends Fixture<Counter>({ name: "counter", scope: "test" }) {
  setup() {
    return new Counter();
  }
}

// ── a "run"-scoped fixture: created once, shared across the whole run ──────────
let dbInstances = 0;
class Database {
  readonly id = ++dbInstances;
  users: string[] = [];
}
class DbFixture extends Fixture<Database>({ name: "db", scope: "run" }) {
  setup() {
    return new Database();
  }
  teardown(db: Database) {
    db.users.length = 0;
  }
}

// ── suites ────────────────────────────────────────────────────────────────────
class CounterTest extends Test({ name: "Counter" }) {
  @Test.use(CounterFixture) counter!: Counter;

  @Test.it("starts at zero")
  startsAtZero() {
    expect(this.counter.value).toBe(0);
  }

  @Test.it("increments")
  increments() {
    expect(this.counter.inc()).toBe(1);
    expect(this.counter.inc()).toBe(2);
  }

  @Test.it("is isolated per test (fresh fixture)")
  isolated() {
    // If the "test"-scoped fixture leaked, value would not be 0 here.
    expect(this.counter.value).toBe(0);
  }
}

class DatabaseTest extends Test({ name: "Database" }) {
  // Decorator-free fixture injection: the field initializer registers DbFixture
  // and the runner fills `db` with the resolved value before each test.
  db: Database = DbFixture.get();

  @Test.beforeEach()
  seed() {
    this.db.users.push("alice");
  }

  @Test.it("shares one run-scoped instance")
  sharedInstance() {
    expect(this.db.id).toBe(1);
  }

  @Test.it("accumulates because the db is shared across the run")
  accumulates() {
    // beforeEach pushed "alice" in both tests → the shared db grows.
    expect(this.db.users.length).toBeGreaterThan(0);
    expect(this.db.users).toContain("alice");
  }
}

// ── data-driven tests: a single computed input, and a table via @Test.each ────
class MathTest extends Test({ name: "Math" }) {
  // One computed input → first argument; the name interpolates it ($1).
  @Test.test({ name: "doubles $1 → 42", input: () => 21 })
  doubles(input: number) {
    expect(input * 2).toBe(42);
  }

  // A table → one case per row; the row is the first argument. The name uses a
  // positional template ("$1 + $2"); a `(row, i) => string` function works too.
  @Test.each(
    [
      [1, 1, 2],
      [2, 3, 5],
      [10, 5, 15],
    ] as Array<[number, number, number]>,
    "$1 + $2",
  )
  adds([a, b, sum]: [number, number, number]) {
    expect(a + b).toBe(sum);
  }
}

await TestApplication()
  .addTests(CounterTest, DatabaseTest, MathTest)
  // .addPattern("./**/*.test.ts")   // discover suites by glob
  // ── parallel / sharded run modes (all optional) ──────────────────────────────
  // .parallel(4)                    // 4 in-process async lanes (no child procs)
  // .workers(4)                     // 4 worker processes, blobs merged into one report
  // .shard("2/4").blob()            // run shard 2 of 4 (one CI job), write a blob
  //   …then on the merge job: await mergeReports({ dir: "blob-report" })
  // ── extensions & reporters are pluggable packages — add what you want ─────────
  // .use(benchmark())                                         // @youneed/test-plugin-benchmark
  // .reporter(new ConsoleReporter())                          // @youneed/test-reporter-console
  // .reporter(new BenchmarkReporter())                        // @youneed/test-plugin-benchmark
  // .reporter(new HTMLReporter({ output: "report.html" }))    // @youneed/test-reporter-html
  .run(); // no reporter → the built-in quiet DefaultReporter
