// Cache demo: coalescing (single-flight) + invalidation + stale-while-revalidate
// + response compilation. Self-contained — starts a server, drives it, prints,
// asserts. Run: pnpm cache   (or: tsx examples/cache/bin-cache.ts)
import { Application, Response, createCache } from "@youneed/server";
import type { AppBuilder, HTTP } from "@youneed/server";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 41020;
const base = `http://127.0.0.1:${PORT}`;

// "Expensive" data sources; the counters show how often the real work ran.
let computeCount = 0;
let swrCount = 0;
let compiledCount = 0;
const db = { revenue: 100 };

const cache = createCache({ ttl: 2_000 }); // coalesce defaults to true
// Serve stale for up to 3s past the 300ms TTL while refreshing in the background.
const swrCache = createCache({ ttl: 300, staleWhileRevalidate: 3_000 });
// Cache the serialized bytes — repeat hits skip the handler AND serialization.
const compiledCache = createCache({ ttl: 10_000, compile: true });

const app = Application()
  // Scoped caches: each path prefix gets its own policy.
  .use("/report", cache.middleware())
  .use("/feed", swrCache.middleware())
  .use("/page", compiledCache.middleware())
  .get("/report", async () => {
    computeCount++;
    await sleep(150); // simulate a slow query / upstream call
    return Response.json({ revenue: db.revenue, computedTimes: computeCount });
  })
  .post("/report", () => {
    db.revenue += 50;
    const dropped = cache.invalidate("GET /report"); // invalidate on write
    return Response.json({ revenue: db.revenue, invalidated: dropped });
  })
  .get("/feed", async () => {
    swrCount++;
    await sleep(80);
    return Response.json({ version: swrCount });
  })
  .get("/page", () => {
    compiledCount++;
    return Response.json({ rendered: compiledCount, html: "<h1>".concat("x".repeat(200), "</h1>") });
  });

function listen(a: AppBuilder, port: number): Promise<HTTP> {
  return new Promise((resolve) => {
    const h = a.listen(port, () => resolve(h));
  });
}

async function xcache(path: string, init?: RequestInit) {
  const res = await fetch(base + path, init);
  const body = await res.json();
  return { status: res.status, cache: res.headers.get("x-cache"), body };
}

async function main() {
  const server = await listen(app, PORT);
  try {
    console.log("① 5 concurrent cold requests — coalescing (single-flight):");
    const start = computeCount;
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => fetch(`${base}/report`)),
    );
    const tags = responses.map((r) => r.headers.get("x-cache"));
    await Promise.all(responses.map((r) => r.body?.cancel()));
    const ran = computeCount - start;
    console.log(`   x-cache tags : ${tags.join(", ")}`);
    console.log(`   handler ran  : ${ran}× for 5 requests  (1 MISS leader + 4 COALESCED)`);
    assert.equal(ran, 1, "handler must run once under coalescing");
    assert.equal(tags.filter((t) => t === "MISS").length, 1, "exactly one leader");
    assert.equal(tags.filter((t) => t === "COALESCED").length, 4, "four coalesced waiters");

    console.log("\n② warm request — served from cache:");
    const warm = await xcache("/report");
    console.log(`   x-cache=${warm.cache}  computedTimes=${warm.body.computedTimes}`);
    assert.equal(warm.cache, "HIT");
    assert.equal(computeCount, 1, "no recompute on a warm hit");

    console.log("\n③ mutate via POST — invalidate the cached entry:");
    const post = await xcache("/report", { method: "POST" });
    console.log(`   revenue=${post.body.revenue}  invalidated=${post.body.invalidated} entr(y/ies)`);
    assert.equal(post.body.invalidated, 1, "one entry invalidated");

    console.log("\n④ next GET — MISS, recomputed with fresh data:");
    const after = await xcache("/report");
    console.log(`   x-cache=${after.cache}  revenue=${after.body.revenue}  computedTimes=${after.body.computedTimes}`);
    assert.equal(after.cache, "MISS");
    assert.equal(after.body.revenue, 150, "sees the mutated value");
    assert.equal(computeCount, 2, "recomputed exactly once after invalidation");

    console.log("\n⑤ wait out the 2s TTL — entry expires, next GET is a MISS:");
    await sleep(2_100);
    const expired = await xcache("/report");
    console.log(`   x-cache=${expired.cache}  computedTimes=${expired.body.computedTimes}`);
    assert.equal(expired.cache, "MISS");
    assert.equal(computeCount, 3, "TTL expiry forces a recompute");

    console.log("\n⑥ stale-while-revalidate — never block on the origin:");
    const f1 = await xcache("/feed");
    console.log(`   cold      : x-cache=${f1.cache} version=${f1.body.version}`);
    assert.equal(f1.cache, "MISS");
    await sleep(350); // past the 300ms TTL, inside the 3s SWR window
    const f2 = await xcache("/feed");
    console.log(`   stale     : x-cache=${f2.cache} version=${f2.body.version}  (served instantly, refreshing…)`);
    assert.equal(f2.cache, "STALE");
    assert.equal(f2.body.version, 1, "stale copy returned immediately");
    await sleep(150); // background refresh completes
    const f3 = await xcache("/feed");
    console.log(`   refreshed : x-cache=${f3.cache} version=${f3.body.version}  (background revalidation landed)`);
    assert.equal(f3.cache, "HIT");
    assert.equal(f3.body.version, 2, "next request gets the refreshed value, still fast");

    console.log("\n⑦ response compilation — skip the handler AND serialization:");
    const p1 = await fetch(`${base}/page`);
    const p1text = await p1.text();
    const p2 = await fetch(`${base}/page`);
    const p2text = await p2.text();
    console.log(`   first  : x-cache=${p1.headers.get("x-cache")} rendered=${compiledCount}`);
    console.log(`   repeat : x-cache=${p2.headers.get("x-cache")} rendered=${compiledCount} (handler skipped, bytes replayed)`);
    assert.equal(p1.headers.get("x-cache"), "MISS");
    assert.equal(p2.headers.get("x-cache"), "HIT");
    assert.equal(compiledCount, 1, "compiled hit never re-runs the handler");
    assert.equal(p1text, p2text, "replayed bytes are identical");

    console.log("\n✓ coalescing + invalidation + SWR + compilation behaved as expected");
  } finally {
    await server[Symbol.asyncDispose]();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
