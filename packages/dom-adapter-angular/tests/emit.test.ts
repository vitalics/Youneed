// emit bridge: fire on an Angular-style EventEmitter and dispatch a DOM
// CustomEvent from an element, both through the one `emit` entry point.
// (No Angular needed — duck-typed against the `.emit` method.)
// Run: pnpm --filter @youneed/dom-adapter-angular test

import { registerDOM } from "@youneed/dom/register";

registerDOM();

const { emit } = await import("../src/emit.ts");

let failures = 0;
const check = (label: string, ok: boolean) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
};

// ── EventEmitter path (anything with an `.emit` method) ─────────────────────────
{
  let got: unknown;
  const emitter = { emit: (v: unknown) => (got = v) };
  const ret = emit(emitter, { id: 7 });
  check("EventEmitter receives the payload", JSON.stringify(got) === JSON.stringify({ id: 7 }));
  check("EventEmitter path returns undefined", ret === undefined);
}

// ── EventTarget path: descriptor → CustomEvent ──────────────────────────────────
{
  const el = document.createElement("div");
  let detail: unknown;
  el.addEventListener("select", (e) => (detail = (e as CustomEvent).detail));
  const ret = emit(el, { type: "select", detail: { row: 3 } });
  check("element receives the CustomEvent detail", JSON.stringify(detail) === JSON.stringify({ row: 3 }));
  check("EventTarget path returns the dispatch boolean", ret === true);
}

// ── EventTarget path: bare type string ──────────────────────────────────────────
{
  const el = document.createElement("div");
  let fired = false;
  el.addEventListener("close", () => (fired = true));
  emit(el, "close");
  check("bare-string type fires the event", fired);
}

// ── EventTarget path: a ready Event is dispatched as-is ─────────────────────────
{
  const el = document.createElement("div");
  let seen = false;
  el.addEventListener("ping", () => (seen = true));
  emit(el, new CustomEvent("ping"));
  check("a ready Event is dispatched verbatim", seen);
}

// ── invalid target throws ──────────────────────────────────────────────────────
{
  let threw = false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    emit({} as any, "x");
  } catch {
    threw = true;
  }
  check("an unsupported target throws", threw);
}

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
