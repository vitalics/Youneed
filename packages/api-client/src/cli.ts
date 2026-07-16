#!/usr/bin/env node
// youneed-api-codegen — generate a typed client from an OpenAPI spec.
//
//   youneed-api-codegen --input ./openapi.json --output ./client.ts
//   youneed-api-codegen --input http://localhost:3000/openapi.json -o src/api.ts --name PetStore
//
// `--input` is a JSON file path or an http(s) URL to the spec. Writes the
// generated `.ts` module to `--output` (or stdout when omitted).
import { generateClient, type OpenApiDoc } from "./codegen.ts";

interface Args {
  input?: string;
  output?: string;
  name?: string;
  runtime?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--input" || a === "-i") args.input = next();
    else if (a === "--output" || a === "-o") args.output = next();
    else if (a === "--name" || a === "-n") args.name = next();
    else if (a === "--runtime") args.runtime = next();
  }
  return args;
}

async function loadSpec(input: string): Promise<OpenApiDoc> {
  if (/^https?:\/\//.test(input)) {
    const res = await fetch(input);
    if (!res.ok) throw new Error(`Failed to fetch spec: HTTP ${res.status}`);
    return (await res.json()) as OpenApiDoc;
  }
  const { readFile } = await import("node:fs/promises");
  return JSON.parse(await readFile(input, "utf8")) as OpenApiDoc;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error("usage: youneed-api-codegen --input <spec.json|url> [--output <file.ts>] [--name ClientName]");
    process.exitCode = 1;
    return;
  }
  const doc = await loadSpec(args.input);
  const code = generateClient(doc, { className: args.name, runtimeModule: args.runtime });
  if (args.output) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(args.output, code, "utf8");
    console.error(`wrote ${args.output}`);
  } else {
    process.stdout.write(code);
  }
}

void main();
