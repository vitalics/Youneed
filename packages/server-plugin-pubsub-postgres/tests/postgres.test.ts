// Run: pnpm --filter @youneed/server-plugin-pubsub-postgres test
import { Test, expect, TestApplication } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { PostgresPubSub, PostgresKV, type PgListenClient } from "../src/index.ts";

// A fake `pg` client: pg_notify immediately fans out a notification (as a real
// LISTENing connection would), and KV statements run against an in-memory table.
function fakeClient(): PgListenClient & { table: Map<string, { value: string; expires_at: number | null }> } {
  const listeners: Array<(m: { channel: string; payload?: string }) => void> = [];
  const table = new Map<string, { value: string; expires_at: number | null }>();
  return {
    table,
    on(_e, l) {
      listeners.push(l);
      return this;
    },
    async query(text: string, values: unknown[] = []) {
      if (text.includes("pg_notify")) {
        for (const l of listeners) l({ channel: String(values[0]), payload: String(values[1]) });
        return { rows: [] };
      }
      if (text.startsWith("INSERT")) {
        const inserted = !table.has(String(values[0]));
        const prev = table.get(String(values[0]));
        const value = text.includes("::bigint") ? String((prev ? Number(prev.value) : 0) + Number(values[1])) : String(values[1]);
        table.set(String(values[0]), { value, expires_at: null });
        return { rows: [{ value, inserted }] };
      }
      if (text.startsWith("SELECT value")) {
        const row = table.get(String(values[0]));
        return { rows: row ? [{ value: row.value }] : [] };
      }
      return { rows: [] }; // CREATE TABLE / LISTEN / UNLISTEN / etc
    },
  };
}

class PostgresSuite extends Test({ name: "server-plugin-pubsub-postgres" }) {
  @Test.it("PubSub: NOTIFY → LISTEN delivers to the subscriber") async pubsub() {
    const bus = new PostgresPubSub({ client: fakeClient() });
    const got: string[] = [];
    await bus.subscribe("jobs", (m, ch) => void got.push(`${ch}:${m}`));
    await bus.publish("jobs", "run-42");
    expect(got[0] === "jobs:run-42").toBeTruthy();
  }

  @Test.it("PubSub: a closed subscription stops receiving") async unsub() {
    const bus = new PostgresPubSub({ client: fakeClient() });
    const got: string[] = [];
    const sub = await bus.subscribe("c", (m) => void got.push(m));
    await sub.close();
    await bus.publish("c", "x");
    expect(got.length).toBe(0);
  }

  @Test.it("KV: set then get round-trips; incr accumulates") async kv() {
    const kv = new PostgresKV({ client: fakeClient() });
    await kv.set("greeting", "hi");
    const g = await kv.get("greeting");
    const a = await kv.incr("count", { by: 2 });
    const b = await kv.incr("count");
    expect(g === "hi" && a === 2 && b === 3).toBeTruthy();
  }
}

await TestApplication().addTests(PostgresSuite).reporter(new ConsoleReporter()).run();
