import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Test, TestApplication, expect } from "@youneed/test";
import { JUnitReporter } from "../src/index.ts";

let checks = 0;
const ok = (label: string, cond: boolean) => {
  assert.ok(cond, label);
  console.log(`  ✓ ${label}`);
  checks++;
};

class Demo extends Test({ name: "Demo" }) {
  @Test.it("passes") a() {}
  @Test.it("fails") b() {
    expect(1).toBe(2);
  }
  @Test.skip("skipped") c() {}
}

const dir = mkdtempSync(join(tmpdir(), "youneed-junit-"));
const output = join(dir, "junit.xml");
await TestApplication().addTests(Demo).reporter(new JUnitReporter({ output, name: "demo" })).run({ setExitCode: false });
const xml = readFileSync(output, "utf8");

ok("writes a valid XML prolog", xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
ok("a <testsuites> root with the name + counts", xml.includes('<testsuites name="demo"') && xml.includes('tests="3"') && xml.includes('failures="1"'));
ok("a <testsuite> per suite", xml.includes('<testsuite name="Demo"'));
ok("a <testcase> per test", xml.includes('<testcase name="passes" classname="Demo"'));
ok("failures become <failure>", xml.includes("<failure message=") && xml.includes("expected 1 to be 2"));
ok("skips become <skipped/>", xml.includes('<testcase name="skipped"') && xml.includes("<skipped/>"));

rmSync(dir, { recursive: true, force: true });
console.log(`\nall checks passed (${checks})`);
