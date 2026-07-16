import assert from "node:assert/strict";
import { AssertionError } from "@youneed/test";
import { expect } from "../src/index.ts";

let checks = 0;
const ok = (label: string, cond: boolean) => {
  assert.ok(cond, label);
  console.log(`  ✓ ${label}`);
  checks++;
};
const safe = (fn: () => void) => {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
};
const throwsAssert = (fn: () => void) => {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof AssertionError;
  }
};

// ── sync extra matchers ───────────────────────────────────────────────────────
ok("toMatchObject does a subset match", safe(() => expect({ a: 1, b: 2, c: 3 }).toMatchObject({ a: 1, c: 3 })));
ok("toMatchObject fails on a missing/different key", throwsAssert(() => expect({ a: 1 }).toMatchObject({ a: 2 })));
ok("toBeInstanceOf", safe(() => expect(new Error("x")).toBeInstanceOf(Error)));
ok("toBeCloseTo", safe(() => expect(0.1 + 0.2).toBeCloseTo(0.3)));
ok("toMatch (regex)", safe(() => expect("hello world").toMatch(/wor/)));
ok("toHaveProperty (nested path)", safe(() => expect({ a: { b: { c: 5 } } }).toHaveProperty("a.b.c", 5)));
ok("toHaveProperty fails on wrong value", throwsAssert(() => expect({ a: 1 }).toHaveProperty("a", 2)));
ok("toBeGreaterThanOrEqual / toBeLessThanOrEqual", safe(() => {
  expect(3).toBeGreaterThanOrEqual(3);
  expect(3).toBeLessThanOrEqual(3);
}));
ok("toBeNaN", safe(() => expect(Number("x")).toBeNaN()));
ok(".not inverts", safe(() => expect({ a: 1 }).not.toMatchObject({ a: 2 })));

// ── async resolves / rejects ──────────────────────────────────────────────────
await expect(Promise.resolve(42)).resolves.toBe(42);
ok("resolves matches the resolved value", true);
await expect(Promise.resolve({ a: 1, b: 2 })).resolves.toMatchObject({ a: 1 });
ok("resolves composes with extra matchers", true);
await expect(Promise.reject(new Error("boom"))).rejects.toThrow("boom");
ok("rejects matches the rejection (via toThrow)", true);

let asyncFailed = false;
try {
  await expect(Promise.resolve(1)).rejects.toBe(1); // resolved, but we asked for reject
} catch (e) {
  asyncFailed = e instanceof AssertionError;
}
ok("rejects fails when the promise resolves", asyncFailed);

let resolveFailed = false;
try {
  await expect(Promise.resolve(1)).resolves.toBe(2);
} catch (e) {
  resolveFailed = e instanceof AssertionError;
}
ok("resolves surfaces a value mismatch", resolveFailed);

console.log(`\nall checks passed (${checks})`);
