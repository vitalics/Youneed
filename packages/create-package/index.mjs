#!/usr/bin/env node
// Internal scaffolder for @youneed/* workspace packages.
//
//   pnpm create-youneedpackage <name>      (local workspace bin)
//   pnpm create youneedpackage <name>      (once published to a registry)
//
// Creates packages/<name>/ with src/, package.json, tsconfig.build.json,
// .npmignore and a README, then registers the package in the root
// tsconfig.base.json `paths` so the monorepo resolves it during development.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const SCOPE = "@youneed";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

main().catch((err) => {
  console.error(`\n✖ ${err.message}`);
  process.exit(1);
});

async function main() {
  const raw = process.argv[2] ?? (await prompt("Package name"));
  const name = normalize(raw);

  const dir = join(root, "packages", name);
  if (existsSync(dir)) throw new Error(`packages/${name} already exists.`);

  const desc = process.argv[3] ?? (await prompt(`Description for ${SCOPE}/${name}`, ""));

  write(join(dir, "package.json"), packageJson(name, desc));
  write(join(dir, "tsconfig.build.json"), tsconfigBuild());
  write(join(dir, "src", "index.ts"), indexTs(name));
  write(join(dir, ".npmignore"), npmignore());
  write(join(dir, "README.md"), readme(name, desc));

  registerPath(name);

  console.log(`\n✔ Created ${SCOPE}/${name} in packages/${name}\n`);
  console.log("Next steps:");
  console.log("  pnpm install        # link the new workspace package");
  console.log(`  pnpm --filter ${SCOPE}/${name} run build\n`);
}

// ---- helpers ---------------------------------------------------------------

function normalize(input) {
  const name = String(input).trim().replace(/^@youneed\//, "");
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
    throw new Error(`Invalid package name: "${input}" (use lowercase letters, digits, "-", ".", "_").`);
  }
  return name;
}

async function prompt(label, fallback) {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await rl.question(`${label}${fallback !== undefined ? ` (${fallback})` : ""}: `)).trim();
    if (!answer && fallback === undefined) throw new Error("A package name is required.");
    return answer || fallback;
  } finally {
    rl.close();
  }
}

function write(file, contents) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents.endsWith("\n") ? contents : contents + "\n");
  console.log(`  + ${file.slice(root.length + 1)}`);
}

function registerPath(name) {
  const file = join(root, "tsconfig.base.json");
  const json = JSON.parse(readFileSync(file, "utf8"));
  const paths = (json.compilerOptions ??= {}).paths ??= {};
  const key = `${SCOPE}/${name}`;
  if (!paths[key]) {
    paths[key] = [`./packages/${name}/src/index.ts`];
    writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
    console.log(`  ~ tsconfig.base.json (registered ${key})`);
  }
}

// ---- templates -------------------------------------------------------------

function packageJson(name, description) {
  return JSON.stringify(
    {
      name: `${SCOPE}/${name}`,
      version: "0.1.0",
      description,
      type: "module",
      license: "ISC",
      main: "./dist/index.js",
      module: "./dist/index.js",
      types: "./dist/index.d.ts",
      exports: { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" } },
      files: ["dist"],
      sideEffects: false,
      scripts: { build: "tsc -p tsconfig.build.json" },
    },
    null,
    2,
  );
}

function tsconfigBuild() {
  return JSON.stringify(
    {
      extends: "../../tsconfig.base.json",
      compilerOptions: {
        declaration: true,
        rewriteRelativeImportExtensions: true,
        outDir: "dist",
        rootDir: "src",
      },
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
    },
    null,
    2,
  );
}

function indexTs(name) {
  return `// ${SCOPE}/${name} — public entry point.\nexport const NAME = "${SCOPE}/${name}";\n`;
}

function npmignore() {
  // `files: ["dist"]` in package.json already whitelists what ships; this is a
  // belt-and-suspenders blocklist for the source artifacts.
  return ["src/", "tsconfig*.json", "*.test.ts", ".npmignore"].join("\n");
}

function readme(name, description) {
  return `# ${SCOPE}/${name}\n\n${description || "> TODO: describe this package."}\n\n## Build\n\n\`\`\`sh\npnpm --filter ${SCOPE}/${name} run build\n\`\`\`\n`;
}
