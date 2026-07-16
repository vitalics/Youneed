// Workload generator for the @youneed/test runner shoot-out.
//
//   node gen.mjs
//
// Emits one folder per runner under bench/workloads/<runner>/, each holding the
// SAME logical workload (FILES × TESTS_PER_FILE identical cases), expressed in
// that runner's native syntax. The cases are deterministic (no randomness), so
// every runner does provably the same arithmetic and the same micro-asserts —
// what differs between runs is only the runner's own overhead, which is the
// thing we want to measure.
//
// Each case: a pinch of arithmetic + a couple of sync expect-style asserts, and
// (on a fixed cadence) one `await Promise.resolve()` so the runner has to handle
// async cases too. No disk / network / sleeps — the runner dominates wall-clock.
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ── knobs (tweak these to scale the workload) ────────────────────────────────
const FILES = 20; // test files per runner
const TESTS_PER_FILE = 50; // cases per file  → FILES × TESTS_PER_FILE total
const ASYNC_EVERY = 7; // every Nth case awaits a resolved promise

const BENCH = dirname(fileURLToPath(import.meta.url));
const ROOT = join(BENCH, "workloads");

// Deterministic per-(file,test) operands so the assertions are non-trivial but
// identical across every runner.
const A = (f, t) => (f * 31 + t * 7 + 3) % 97;
const B = (f, t) => (f * 13 + t * 5 + 11) % 89;
const isAsync = (f, t) => (f * TESTS_PER_FILE + t) % ASYNC_EVERY === 0;

// ── per-runner body emitters ─────────────────────────────────────────────────
// Each returns the source for ONE test file (index `f`, 0-based).

function youneed(f) {
  let s = `// generated — do not edit\nimport { Test, expect } from "@youneed/test";\n\n`;
  s += `export class Suite${f} extends Test({ name: "suite-${f}" }) {\n`;
  for (let t = 0; t < TESTS_PER_FILE; t++) {
    const a = A(f, t), b = B(f, t);
    const async = isAsync(f, t);
    s += `  @Test.it("case ${f}-${t}")\n  ${async ? "async " : ""}case_${t}() {\n`;
    if (async) s += `    return Promise.resolve().then(() => {\n`;
    const ind = async ? "      " : "    ";
    s += `${ind}const sum = ${a} + ${b};\n`;
    s += `${ind}expect(sum).toBe(${a + b});\n`;
    s += `${ind}expect(${a} * ${b}).toBe(${a * b});\n`;
    s += `${ind}expect(sum).toBeGreaterThan(${a + b - 1});\n`;
    s += `${ind}expect([${a}, ${b}]).toHaveLength(2);\n`;
    if (async) s += `    });\n`;
    s += `  }\n`;
  }
  s += `}\n`;
  return s;
}

function node(f) {
  let s = `// generated — do not edit\nimport { test } from "node:test";\nimport assert from "node:assert/strict";\n\n`;
  for (let t = 0; t < TESTS_PER_FILE; t++) {
    const a = A(f, t), b = B(f, t);
    const async = isAsync(f, t);
    s += `test("case ${f}-${t}", ${async ? "async " : ""}() => {\n`;
    if (async) s += `  await Promise.resolve();\n`;
    s += `  const sum = ${a} + ${b};\n`;
    s += `  assert.equal(sum, ${a + b});\n`;
    s += `  assert.equal(${a} * ${b}, ${a * b});\n`;
    s += `  assert.ok(sum > ${a + b - 1});\n`;
    s += `  assert.equal([${a}, ${b}].length, 2);\n`;
    s += `});\n`;
  }
  return s;
}

function vitest(f) {
  let s = `// generated — do not edit\nimport { test, expect } from "vitest";\n\n`;
  for (let t = 0; t < TESTS_PER_FILE; t++) {
    const a = A(f, t), b = B(f, t);
    const async = isAsync(f, t);
    s += `test("case ${f}-${t}", ${async ? "async " : ""}() => {\n`;
    if (async) s += `  await Promise.resolve();\n`;
    s += `  const sum = ${a} + ${b};\n`;
    s += `  expect(sum).toBe(${a + b});\n`;
    s += `  expect(${a} * ${b}).toBe(${a * b});\n`;
    s += `  expect(sum).toBeGreaterThan(${a + b - 1});\n`;
    s += `  expect([${a}, ${b}]).toHaveLength(2);\n`;
    s += `});\n`;
  }
  return s;
}

function jest(f) {
  // CJS — jest's default; no transform needed, fairest baseline for jest.
  let s = `// generated — do not edit\n`;
  for (let t = 0; t < TESTS_PER_FILE; t++) {
    const a = A(f, t), b = B(f, t);
    const async = isAsync(f, t);
    s += `test("case ${f}-${t}", ${async ? "async " : ""}() => {\n`;
    if (async) s += `  await Promise.resolve();\n`;
    s += `  const sum = ${a} + ${b};\n`;
    s += `  expect(sum).toBe(${a + b});\n`;
    s += `  expect(${a} * ${b}).toBe(${a * b});\n`;
    s += `  expect(sum).toBeGreaterThan(${a + b - 1});\n`;
    s += `  expect([${a}, ${b}]).toHaveLength(2);\n`;
    s += `});\n`;
  }
  return s;
}

function playwright(f) {
  let s = `// generated — do not edit\nimport { test, expect } from "@playwright/test";\n\n`;
  for (let t = 0; t < TESTS_PER_FILE; t++) {
    const a = A(f, t), b = B(f, t);
    const async = isAsync(f, t);
    s += `test("case ${f}-${t}", ${async ? "async " : ""}() => {\n`;
    if (async) s += `  await Promise.resolve();\n`;
    s += `  const sum = ${a} + ${b};\n`;
    s += `  expect(sum).toBe(${a + b});\n`;
    s += `  expect(${a} * ${b}).toBe(${a * b});\n`;
    s += `  expect(sum).toBeGreaterThan(${a + b - 1});\n`;
    s += `  expect([${a}, ${b}]).toHaveLength(2);\n`;
    s += `});\n`;
  }
  return s;
}

const RUNNERS = {
  youneed: { ext: "test.ts", emit: youneed },
  node: { ext: "test.mjs", emit: node },
  vitest: { ext: "test.mjs", emit: vitest },
  jest: { ext: "test.js", emit: jest },
  playwright: { ext: "spec.mjs", emit: playwright },
};

rmSync(ROOT, { recursive: true, force: true });
let total = 0;
for (const [name, { ext, emit }] of Object.entries(RUNNERS)) {
  const dir = join(ROOT, name);
  mkdirSync(dir, { recursive: true });
  for (let f = 0; f < FILES; f++) {
    writeFileSync(join(dir, `f${String(f).padStart(2, "0")}.${ext}`), emit(f));
    total++;
  }
}

console.log(
  `generated ${total} files — ${Object.keys(RUNNERS).length} runners × ${FILES} files × ${TESTS_PER_FILE} tests ` +
    `(${FILES * TESTS_PER_FILE} cases each)`,
);
