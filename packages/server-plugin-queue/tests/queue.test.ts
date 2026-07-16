// Run: pnpm --filter @youneed/server-plugin-queue test
// The durable queue over the in-process MemoryKV — no server, deterministic clock.
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Queue, MemoryKV } from "../src/index.ts";

let clock = 1000;
const now = () => clock;

class QueueSuite extends Test({ name: "@youneed/server-plugin-queue" }) {
  @Test.beforeEach() reset() {
    clock = 1000;
  }

  @Test.it("runs a job to completion") async completes() {
    const seen: string[] = [];
    const q = new Queue({ store: new MemoryKV({ now }), now }).register("greet", (p: { who: string }) => void seen.push(p.who));
    await q.add("greet", { who: "ada" });
    const n = await q.runPending();
    expect(n).toBe(1);
    expect(seen).toEqual(["ada"]);
    const stats = await q.stats();
    expect(stats.completed).toBe(1);
    expect(stats.waiting).toBe(0);
  }

  @Test.it("retries then dead-letters after maxAttempts") async deadLetters() {
    let calls = 0;
    const q = new Queue({ store: new MemoryKV({ now }), now, maxAttempts: 2, backoff: () => 0 }).register("boom", () => {
      calls++;
      throw new Error("nope");
    });
    const job = await q.add("boom", {});
    await q.runPending(); // attempt 1 (retry, runAt=now) → attempt 2 (dead-letter)
    expect(calls).toBe(2);
    const after = await q.get(job.id);
    expect(after?.state).toBe("failed");
    expect(after?.attempts).toBe(2);
    expect(after?.error).toBe("nope");
    expect((await q.stats()).failed).toBe(1);
  }

  @Test.it("respects delayMs (not eligible until the clock advances)") async delayed() {
    let ran = false;
    const q = new Queue({ store: new MemoryKV({ now }), now }).register("later", () => void (ran = true));
    await q.add("later", {}, { delayMs: 5000 }); // runAt = 6000
    expect(await q.runPending()).toBe(0); // clock is 1000 → not due
    expect(ran).toBe(false);
    expect((await q.stats()).delayed).toBe(1);
    clock = 7000;
    expect(await q.runPending()).toBe(1);
    expect(ran).toBe(true);
  }

  @Test.it("retry() requeues a dead-lettered job") async requeue() {
    let succeed = false;
    const q = new Queue({ store: new MemoryKV({ now }), now, maxAttempts: 1 }).register("flaky", () => {
      if (!succeed) throw new Error("later");
    });
    const job = await q.add("flaky", {});
    await q.runPending();
    expect((await q.get(job.id))?.state).toBe("failed");
    succeed = true;
    expect(await q.retry(job.id)).toBe(true);
    await q.runPending();
    expect((await q.get(job.id))?.state).toBe("completed");
  }

  @Test.it("processes up to `concurrency` jobs together") async concurrency() {
    let peak = 0;
    let inFlight = 0;
    const q = new Queue({ store: new MemoryKV({ now }), now, concurrency: 3 }).register("work", async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 15)); // real overlap: all 3 enter before any exits
      inFlight--;
    });
    await q.add("work", 1);
    await q.add("work", 2);
    await q.add("work", 3);
    const n = await q.runPending();
    expect(n).toBe(3);
    expect(peak).toBe(3);
  }

  @Test.it("dead-letters a job with no registered handler") async noHandler() {
    const q = new Queue({ store: new MemoryKV({ now }), now, maxAttempts: 1 });
    const job = await q.add("orphan", {});
    await q.runPending();
    const after = await q.get(job.id);
    expect(after?.state).toBe("failed");
    expect(after?.error).toContain("no handler");
  }
}

await TestApplication().addTests(QueueSuite).reporter(new ConsoleReporter()).run();
