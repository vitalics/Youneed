#!/usr/bin/env node
// shad — copy shadcn-style components into your project (you own the source).
//
//   npx shad init                 set up shad.json + copy lib/shad.ts
//   npx shad add button badge     copy components (+ their deps) into your project
//   npx shad list                 list available components
//
// Components land under the directory in shad.json ("dir", default
// "src/components"), preserving the ui/ + lib/ layout so their relative imports
// (`../lib/shad.ts`) keep working. @youneed/dom stays a normal dependency.

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = join(PKG_ROOT, "src");
const REGISTRY = JSON.parse(readFileSync(join(PKG_ROOT, "registry.json"), "utf8"));
const CONFIG_FILE = resolve(process.cwd(), "shad.json");
const DEFAULT_DIR = "src/components";

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

main().catch((err) => {
  console.error(`\n${c.bold("✖")} ${err.message}`);
  process.exit(1);
});

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case "init": return init();
    case "add": return add(args);
    case "list": case "ls": return list();
    default: return help();
  }
}

function loadConfig() {
  if (existsSync(CONFIG_FILE)) return JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
  return { dir: DEFAULT_DIR };
}

function init() {
  const dir = process.argv[3] ?? DEFAULT_DIR;
  if (!existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, JSON.stringify({ dir }, null, 2) + "\n");
    console.log(`${c.green("✔")} wrote ${c.cyan("shad.json")} (dir: ${dir})`);
  } else {
    console.log(`${c.dim("•")} shad.json already exists`);
  }
  const done = new Set();
  copyItem("lib", loadConfig().dir, done);
  copyItem("theme", loadConfig().dir, done);
  console.log(`\n${c.bold("Next:")}`);
  console.log(`  1. Load ${c.cyan("theme.css")} in your <head> (its :root/.dark vars theme the components).`);
  console.log(`  2. Add the @theme inline mapping to your Tailwind entry (see theme.css header).`);
  console.log(`  3. Run ${c.cyan("registerTailwind(css)")} once with your compiled Tailwind.`);
  console.log(`  4. ${c.cyan("npx shad add button")}  — add your first component.\n`);
}

function add(names) {
  if (names.length === 0) throw new Error("Usage: shad add <component...>  (try `shad list`)");
  const { dir } = loadConfig();
  const done = new Set();
  const npmDeps = new Set();
  for (const name of names) {
    if (!REGISTRY.items[name]) throw new Error(`Unknown component "${name}". Try \`shad list\`.`);
    copyItem(name, dir, done, npmDeps);
  }
  if (npmDeps.size) {
    console.log(`\n${c.bold("Install peer deps:")}  ${[...npmDeps].join(" ")}`);
  }
  console.log("");
}

// Copy an item's files (recursing into registryDependencies) into <dir>,
// preserving each file's relative path. Skips items already handled this run.
function copyItem(name, dir, done, npmDeps) {
  if (done.has(name)) return;
  done.add(name);
  const item = REGISTRY.items[name];
  if (!item) throw new Error(`Unknown registry item "${name}".`);

  for (const dep of item.registryDependencies ?? []) copyItem(dep, dir, done, npmDeps);
  for (const d of item.dependencies ?? []) npmDeps?.add(d);

  for (const rel of item.files) {
    const from = join(SRC_DIR, rel);
    const to = resolve(process.cwd(), dir, rel);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    console.log(`${c.green("✔")} ${join(dir, rel)}`);
  }
}

function list() {
  console.log(`\n${c.bold("Available components")}  ${c.dim("(shad add <name>)")}\n`);
  for (const [name, item] of Object.entries(REGISTRY.items)) {
    if (item.internal) continue;
    console.log(`  ${c.cyan(name.padEnd(10))} ${c.dim(item.description ?? "")}`);
  }
  console.log("");
}

function help() {
  console.log(`
${c.bold("shad")} — copy shadcn-style components into your project

  ${c.cyan("shad init [dir]")}        create shad.json + copy the shared lib
  ${c.cyan("shad add <name...>")}     copy components (and their deps)
  ${c.cyan("shad list")}              list available components
`);
}
