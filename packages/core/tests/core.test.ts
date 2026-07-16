// @youneed/core self-test. Run: pnpm --filter @youneed/core test
import assert from "node:assert/strict";
import { createRegistry, classChain, ctorOf, dispose, isDisposable, disposeValue } from "../src/index.ts";

let passed = 0;
const check = (name: string, cond: boolean) => {
  assert.ok(cond, name);
  console.log("  ✓", name);
  passed++;
};

console.log("registry:");
{
  const reg = createRegistry<string[]>(() => []);
  class A {}
  class B {}
  check("for() creates on first access", Array.isArray(reg.for(A)) && reg.for(A).length === 0);
  reg.for(A).push("x");
  check("for() returns the same entry on repeat access", reg.for(A)[0] === "x");
  check("read() sees a created entry", reg.read(A)?.[0] === "x");
  check("read() is undefined for an untouched class", reg.read(B) === undefined);
  check("has() reflects creation", reg.has(A) && !reg.has(B));
}

console.log("classChain:");
{
  class Base {}
  class Mid extends Base {}
  class Leaf extends Mid {}
  const chain = [...classChain(Leaf)];
  check("walks most-derived first, stops before Object", chain.length === 3 && chain[0] === Leaf && chain[2] === Base);
  const stopped = [...classChain(Leaf, Mid)];
  check("stopAt excludes the stop class and its ancestors", stopped.length === 1 && stopped[0] === Leaf);
}

console.log("ctorOf:");
{
  class Widget {}
  // Mimic an addInitializer callback: `this` is the instance, ctorOf → its class.
  const fromInstance = (function (this: unknown) {
    return ctorOf(this);
  }).call(new Widget());
  check("returns the instance's constructor", fromInstance === Widget);
}

console.log("dispose:");
await (async () => {
  const log: string[] = [];
  const sync = dispose(() => log.push("sync"));
  check("sync cleanup → Symbol.dispose", typeof (sync as Record<symbol, unknown>)[Symbol.dispose] === "function");
  const async = dispose(async () => log.push("async"));
  check("async cleanup → Symbol.asyncDispose", typeof (async as Record<symbol, unknown>)[Symbol.asyncDispose] === "function");

  const value = { name: "res" };
  const wrapped = dispose(value, () => log.push("value-cleanup"));
  check("dispose(value, fn) returns the same value", wrapped === value);
  check("isDisposable detects a disposer", isDisposable(wrapped) && !isDisposable({}));

  await disposeValue(wrapped);
  await disposeValue(async);
  check("disposeValue runs sync + awaits async disposers", log.includes("value-cleanup") && log.includes("async"));
  check("disposeValue is a no-op on non-disposables", (await disposeValue({}), true));
})();

console.log(`\nall checks passed (${passed})`);
