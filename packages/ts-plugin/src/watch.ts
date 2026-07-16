// A live inspector for @youneed/ts-plugin. It runs the SAME pure analysis the
// editor plugin runs — the component index (AST scan) and the html`` binding
// checks — over a project and REPRINTS the result on every file change. So you can
// watch, in real time, exactly what the plugin "sees" (tags, .props, @events, and
// the squiggles it would draw) WITHOUT an editor or a running tsserver.
//
// Run:
//   pnpm --filter @youneed/ts-plugin watch [tsconfig.json | dir | file.ts …]
//
//   • no args        → ./tsconfig.json if present, else every *.ts under cwd
//   • a tsconfig.json → watch that project (picks up newly added files too)
//   • a directory     → watch every *.ts under it
//   • one or more .ts → watch just those files
//
// Driven by `ts.createWatchProgram` (incremental, file-watching via `ts.sys`), so
// edits re-trigger the analysis with the same incremental machinery tsserver uses.
//
// This is a dev/inspection tool, not part of the shipped plugin — it's excluded
// from the dist build and run through tsx (like the tests), which is why it can use
// Node's `process` while the plugin itself stays dependency-light.
import ts from "typescript";
import { buildComponentIndex, type ComponentIndex } from "./component-index.ts";
import { checkBindings } from "./html.ts";
import { findAllTemplates } from "./template.ts";

// Minimal ambient `process` — this package builds WITHOUT @types/node; the watcher
// only needs argv/cwd/stdout/exit, and runs via tsx where these exist at runtime.
declare const process: {
  argv: string[];
  exit(code?: number): never;
  stdout: { write(s: string): void };
};

// ── tiny ANSI palette (no dependency) ──
const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};
const paint = (color: string, s: string) => `${color}${s}${c.reset}`;
const out = (s: string) => process.stdout.write(s);

/** True for files we don't want in the per-file template scan (deps / build out). */
const isProjectFile = (f: string) => !f.includes("/node_modules/") && !f.includes("/dist/");

/** Posix basename for compact display. */
const baseName = (f: string) => f.slice(f.lastIndexOf("/") + 1);

/** Translate a file-relative offset to "line:col" for human-readable diagnostics. */
const lineCol = (sf: ts.SourceFile, pos: number) => {
  const { line, character } = sf.getLineAndCharacterOfPosition(pos);
  return `${line + 1}:${character + 1}`;
};

/** Render the whole report for the current program. */
function render(program: ts.Program): void {
  const sources = program.getSourceFiles();
  const index: ComponentIndex = buildComponentIndex(ts, sources);
  const projectFiles = sources.filter((sf) => !sf.isDeclarationFile && isProjectFile(sf.fileName));

  // clear screen + scrollback, home the cursor → a clean, in-place repaint.
  out("\x1b[2J\x1b[3J\x1b[H");
  out(paint(c.bold, "@youneed/ts-plugin — live inspector") + paint(c.gray, "  (Ctrl-C to quit)\n"));
  out(paint(c.gray, `scanned ${projectFiles.length} project file(s)\n\n`));

  // ── components ──
  out(paint(c.bold + c.cyan, `Components (${index.size})\n`));
  if (index.size === 0) {
    out(paint(c.gray, "  none found — a component is `class X extends Component(\"tag\", …)`\n"));
  }
  for (const comp of [...index.values()].sort((a, b) => a.tag.localeCompare(b.tag))) {
    const where = comp.fileName ? paint(c.gray, `  ${baseName(comp.fileName)}${comp.pos != null ? `:${lineCol(program.getSourceFile(comp.fileName)!, comp.pos)}` : ""}`) : "";
    out(`  ${paint(c.green, `<${comp.tag}>`)} ${paint(c.dim, comp.className)}${where}\n`);
    const props = comp.props.map((p) => `${paint(c.blue, "." + p.name)}${p.type ? paint(c.gray, ":" + p.type) : ""}`);
    const events = comp.events.map((e) => paint(c.magenta, "@" + e.name));
    out(`      ${paint(c.gray, "props ")}${props.length ? props.join(" ") : paint(c.gray, "—")}\n`);
    out(`      ${paint(c.gray, "events")} ${events.length ? events.join(" ") : paint(c.gray, "—")}\n`);
  }

  // ── templates + binding diagnostics ──
  let templateCount = 0;
  let issues = 0;
  const lines: string[] = [];
  for (const sf of projectFiles) {
    const templates = findAllTemplates(ts, sf);
    const html = templates.filter((t) => t.kind === "html");
    templateCount += templates.length;
    for (const tpl of html) {
      for (const d of checkBindings(tpl.raw, tpl.base, index)) {
        issues++;
        const tag = d.kind === "prop" ? paint(c.red, "error  ") : paint(c.yellow, "warning");
        lines.push(`  ${tag} ${paint(c.gray, `${baseName(sf.fileName)}:${lineCol(sf, d.start)}`)}  ${d.messageText}`);
      }
    }
  }
  out("\n" + paint(c.bold + c.cyan, `Templates (${templateCount}) · binding issues (${issues})\n`));
  if (issues === 0) out(paint(c.green, "  ✓ all .prop / @event bindings resolve\n"));
  else out(lines.join("\n") + "\n");

  out(paint(c.gray, `\nwatching… last run ${new Date().toLocaleTimeString()}\n`));
}

// ── argument handling → either a tsconfig project, a dir, or explicit files ──
const argv = process.argv.slice(2);

const reportWatchStatus: ts.WatchStatusReporter = (diagnostic) => {
  // Quietly surface tsc's own "starting compilation" / error-count notes; our
  // render() handles the substance. Keep them dim so they don't dominate.
  const msg = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  out(paint(c.gray, `  ${msg}\n`));
};
const reportDiagnostic: ts.DiagnosticReporter = () => {
  // Project type errors are irrelevant to the AST scan — swallow them so the
  // inspector output stays focused on what the plugin would show.
};

const baseOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.Latest,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
  allowJs: false,
  skipLibCheck: true,
};

function watchConfig(configPath: string): void {
  out(paint(c.gray, `using tsconfig ${configPath}\n`));
  const host = ts.createWatchCompilerHost(
    configPath,
    { noEmit: true },
    ts.sys,
    ts.createSemanticDiagnosticsBuilderProgram,
    reportDiagnostic,
    reportWatchStatus,
  );
  host.afterProgramCreate = (builder) => render(builder.getProgram());
  ts.createWatchProgram(host);
}

function watchFiles(files: string[]): void {
  if (files.length === 0) {
    out(paint(c.red, "no .ts files to watch\n"));
    process.exit(1);
  }
  const host = ts.createWatchCompilerHost(
    files,
    baseOptions,
    ts.sys,
    ts.createSemanticDiagnosticsBuilderProgram,
    reportDiagnostic,
    reportWatchStatus,
  );
  host.afterProgramCreate = (builder) => render(builder.getProgram());
  ts.createWatchProgram(host);
}

/** Expand a directory to its *.ts files (excluding declarations / node_modules). */
const tsFilesIn = (dir: string): string[] =>
  ts.sys.readDirectory(dir, [".ts"], ["node_modules", "dist", "**/*.d.ts"], undefined);

if (argv.length === 0) {
  // Default: prefer a tsconfig in cwd, else every *.ts under cwd.
  const cfg = ts.findConfigFile(ts.sys.getCurrentDirectory(), ts.sys.fileExists, "tsconfig.json");
  if (cfg) watchConfig(cfg);
  else watchFiles(tsFilesIn(ts.sys.getCurrentDirectory()));
} else if (argv.length === 1 && argv[0].endsWith(".json")) {
  watchConfig(argv[0]);
} else if (argv.length === 1 && ts.sys.directoryExists(argv[0])) {
  watchFiles(tsFilesIn(argv[0]));
} else {
  watchFiles(argv);
}
