// @youneed/ts-plugin — a TypeScript language-service plugin that adds completions
// inside `html`…`` and `css`…`` tagged templates of @youneed/dom:
//   • tag names    → known custom-element tags;
//   • `.prop=`     → the element's @Component.prop() fields;
//   • `@event=`    → the element's @Component.event() / this.emit() names;
//   • css`` props  → common CSS property names.
//
// Enable it in your tsconfig:
//   { "compilerOptions": { "plugins": [{ "name": "@youneed/ts-plugin" }] } }
// and select the workspace TypeScript version in your editor.
//
// Loaded by tsserver via require() → this module is CommonJS (`export =`). The
// completion logic lives in pure, unit-tested modules; this file only wires them
// into a language-service proxy.
import type * as ts from "typescript";
import { buildComponentIndex, type ComponentIndex } from "./component-index.ts";

// Minimal ambient `require` — this package builds WITHOUT @types/node (to stay
// dependency-light); we only need it for an optional, guarded child_process spawn.
declare const require: (id: string) => any;
import { cssCompletions } from "./css.ts";
import { htmlCompletions, htmlEntryDetail, htmlQuickInfoAt, htmlDefinitionAt } from "./html.ts";
import { findTemplate, findAllTemplates } from "./template.ts";
import { type Audit, type AuditContext, type AuditEntry, type AuditFactory, severityToCategory } from "./audit.ts";
import domAudit from "./audits/dom.ts";

// Built-in audits resolved locally (no require of our own subpath inside tsserver);
// external specifiers (e.g. "@youneed/dom-provider-a11y/ts-plugin") go through require().
const BUILTIN_AUDITS: Record<string, AuditFactory> = { "@youneed/ts-plugin/dom": domAudit };

// Fallback diagnostic code for audit findings that don't carry their own.
const CODE_AUDIT_DEFAULT = 990000;

/** Resolve a relative path against an absolute source-file path → an absolute
 *  posix-style path. Pure string math so the plugin needs no `node:path` types. */
function resolveFrom(fromFile: string, rel: string): string {
  const cut = Math.max(fromFile.lastIndexOf("/"), fromFile.lastIndexOf("\\"));
  const dir = cut >= 0 ? fromFile.slice(0, cut) : "";
  const out: string[] = [];
  for (const part of `${dir}/${rel}`.split(/[\\/]+/)) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return `/${out.join("/")}`;
}

/** Pull the `preview` options out of the `@youneed/ts-plugin/dom` audit entry of a
 *  plugin `audits` list (the home of the preview config in the modern shape).
 *  Returns undefined when there's no `audits` array or no dom-audit preview block. */
function previewFromAudits(cfg: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!Array.isArray(cfg.audits)) return undefined;
  for (const entry of cfg.audits as AuditEntry[]) {
    const [specifier, options] = Array.isArray(entry) ? entry : [entry, undefined];
    if (typeof specifier === "string" && specifier.replace(/\/+$/, "") === "@youneed/ts-plugin/dom" && options && typeof options === "object") {
      const preview = (options as Record<string, unknown>).preview;
      if (preview && typeof preview === "object") return preview as Record<string, unknown>;
    }
  }
  return undefined;
}

/** Turn a `@preview` value into a markdown image. Absolute URLs (http/https/data/
 *  file) are used as-is; a relative path is resolved against the source file's dir
 *  to a `file://` URL. NOTE: editors gate image loading — https renders in VS Code
 *  hovers; local `file:` images and Zed may show nothing (it's a static preview,
 *  not a live render). */
function previewMarkdown(preview: string, fileName: string): string {
  const url = /^(https?:|data:|file:)/.test(preview) ? preview : `file://${resolveFrom(fileName, preview)}`;
  return `\n\n![preview](${url})`;
}

/** Render `@see` entries as a markdown "See:" line. A bare URL becomes a link;
 *  free text (or `{@link …}`) is passed through and linkified by the editor. */
function seeMarkdown(see: string[]): string {
  if (!see.length) return "";
  const items = see.map((s) => (/^https?:\/\/\S+$/.test(s) ? `[${s}](${s})` : s));
  return `\n\nSee: ${items.join(" · ")}`;
}

function init(modules: { typescript: typeof ts }) {
  const tsm = modules.typescript;

  function create(info: ts.server.PluginCreateInfo): ts.LanguageService {
    const ls = info.languageService;
    const log = (msg: string) => info.project.projectService.logger.info(`[youneed/ts-plugin] ${msg}`);
    // If you DON'T see this line in the TS Server log, the plugin isn't loaded
    // (wrong TypeScript version / dist not built / not resolvable).
    log(`initialized — TypeScript ${tsm.version}`);

    // Cache the tag→component index per Program; rebuild only when the program
    // identity changes (cheap: the LS hands back the same Program between edits
    // that don't reparse).
    let cachedProgram: ts.Program | undefined;
    let cachedIndex: ComponentIndex = new Map();
    const indexFor = (program: ts.Program): ComponentIndex => {
      if (program !== cachedProgram) {
        cachedProgram = program;
        cachedIndex = buildComponentIndex(tsm, program.getSourceFiles());
        log(`indexed ${cachedIndex.size} component(s): ${[...cachedIndex.keys()].join(", ") || "(none)"}`);
      }
      return cachedIndex;
    };

    // ── plugin config ──
    // Everything is driven by the `audits` list — each `[moduleSpecifier, options]`
    // loads an audit module (built-in or from another package) that contributes
    // diagnostics. Hover previews aren't a diagnostic, so their options are read by
    // the core from the "@youneed/ts-plugin/dom" audit entry's `preview` block.
    // No `audits` → no diagnostics and no previews (completions/hover/definition
    // still work). Declare the checks you want explicitly:
    //
    //   "plugins": [{
    //     "name": "@youneed/ts-plugin",
    //     "audits": [
    //       ["@youneed/ts-plugin/dom", {
    //         "unusedCss": { "enabled": true, "kind": "error" },
    //         "preview":   { "dir": "preview", "capture": true, "command": "node generate-previews.mjs" }
    //       }],
    //       ["@youneed/dom-provider-a11y/ts-plugin", { "reduceMotion": { "kind": "warning" } }]
    //     ]
    //   }]
    const cfg = (info.config ?? {}) as Record<string, unknown>;
    const auditEntries: AuditEntry[] = Array.isArray(cfg.audits) ? (cfg.audits as AuditEntry[]) : [];

    // Preview options come from the "@youneed/ts-plugin/dom" audit entry's `preview`
    // block; absent → previews off (no hover screenshots, no background capture).
    const previewCfg = previewFromAudits(cfg);
    const previews = {
      enabled: previewCfg ? previewCfg.enabled !== false : false,
      dir: typeof previewCfg?.dir === "string" ? (previewCfg.dir as string) : "preview",
      exts: Array.isArray(previewCfg?.exts) ? (previewCfg!.exts as string[]) : ["png", "webp", "svg"],
      capture: previewCfg?.capture === true,
      command: typeof previewCfg?.command === "string" ? (previewCfg.command as string) : undefined,
    };
    log(`previews: ${previews.enabled ? `on (dir=${previews.dir}${previews.capture ? ", capture" : ""})` : "off"}`);

    // Load the configured audits (built-in + external). Failures are logged, not fatal.
    const loadedAudits: { specifier: string; audit: Audit }[] = [];
    for (const entry of auditEntries) {
      const [specifier, options] = Array.isArray(entry) ? entry : [entry, undefined];
      if (typeof specifier !== "string") continue;
      try {
        const factory = BUILTIN_AUDITS[specifier.replace(/\/+$/, "")] ?? (((mod) => mod?.default ?? mod)(require(specifier)) as AuditFactory);
        const made = typeof factory === "function" ? factory(options) : undefined;
        const audits = Array.isArray(made) ? made : made ? [made] : [];
        for (const audit of audits) loadedAudits.push({ specifier, audit });
        log(`audit "${specifier}" → ${audits.map((a) => a.name).join(", ") || "(none)"}`);
      } catch (e) {
        log(`audit "${specifier}" failed to load: ${(e as Error).message}`);
      }
    }

    const dirOf = (file: string) => file.slice(0, Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\")));
    const capturedTags = new Set<string>();
    // Prefer the serverHost's fileExists; fall back to the LS host or a no-op so a
    // missing host never breaks the hover.
    const fileExists = (p: string): boolean =>
      (info.serverHost?.fileExists ?? info.languageServiceHost.fileExists)?.call(info.serverHost ?? info.languageServiceHost, p) ?? false;
    // Last-modified time (ms) of a file, or undefined — used to cache-bust the
    // preview image URL so a regenerated screenshot actually refreshes in the hover
    // (editors cache markdown images by URL; a stable file:// URL shows the old one).
    const mtimeOf = (p: string): number | undefined => {
      try {
        return info.serverHost?.getModifiedTime?.(p)?.getTime();
      } catch {
        return undefined;
      }
    };

    // Opt-in: kick the configured generator command in the background (never blocks
    // the LS) when a component has no screenshot yet. Gated by `previewCapture`.
    const maybeCapture = (tag: string, defFile: string) => {
      if (!previews.capture || !previews.command || capturedTags.has(tag)) return;
      capturedTags.add(tag);
      try {
        const { exec } = require("node:child_process");
        const cwd = dirOf(defFile);
        log(`preview capture: "${previews.command}" (cwd=${cwd})`);
        exec(previews.command, { cwd }, (err: unknown) =>
          log(err ? `preview capture failed: ${(err as Error).message}` : `preview capture done (${tag})`),
        );
      } catch (e) {
        log(`preview capture error: ${(e as Error).message}`);
      }
    };

    // Auto-resolve a generated screenshot by convention: <defDir>/<previewDir>/<tag>.<ext>.
    // Returns a file:// URL, or undefined (and may trigger a background capture).
    const resolvePreview = (tag: string | undefined, defFile: string | undefined): string | undefined => {
      if (!previews.enabled || !tag || !defFile) return undefined;
      const base = `${dirOf(defFile)}/${previews.dir}/${tag}`;
      for (const ext of previews.exts) {
        const p = `${base}.${ext}`;
        if (fileExists(p)) {
          const t = mtimeOf(p);
          return `file://${p}${t ? `?t=${t}` : ""}`; // ?t= busts the editor's image cache
        }
      }
      maybeCapture(tag, defFile);
      return undefined;
    };

    const proxy = Object.create(null) as ts.LanguageService;
    for (const key of Object.keys(ls) as (keyof ts.LanguageService)[]) {
      const member = ls[key];
      (proxy as unknown as Record<string, unknown>)[key] =
        typeof member === "function" ? (member as (...a: unknown[]) => unknown).bind(ls) : member;
    }

    proxy.getCompletionsAtPosition = (fileName, position, options, formatting) => {
      try {
        const program = ls.getProgram();
        const sourceFile = program?.getSourceFile(fileName);
        if (program && sourceFile) {
          const match = findTemplate(tsm, sourceFile, position);
          if (match) {
            const result =
              match.kind === "css" ? cssCompletions(tsm, match) : htmlCompletions(tsm, match, indexFor(program));
            log(`completion @${position} in ${match.kind}\`\` → ${result ? `${result.entries.length} entries` : "deferred to TS"}`);
            if (result) return result;
          }
        }
      } catch (e) {
        log(`completion error: ${(e as Error).stack ?? (e as Error).message}`);
      }
      return ls.getCompletionsAtPosition(fileName, position, options, formatting);
    };

    // Completion-entry details popup: for entries WE produced (.prop/@event in an
    // html`` template), surface the source JSDoc as the documentation. tsserver
    // calls this when the user highlights an entry in the completion list.
    proxy.getCompletionEntryDetails = (fileName, position, entryName, formatOptions, source, preferences, data) => {
      try {
        const program = ls.getProgram();
        const sourceFile = program?.getSourceFile(fileName);
        if (program && sourceFile) {
          const match = findTemplate(tsm, sourceFile, position);
          if (match && match.kind === "html") {
            const entry = htmlEntryDetail(tsm, match, indexFor(program), entryName);
            if (entry) {
              return {
                name: entry.name,
                kind: entry.kind,
                kindModifiers: "",
                displayParts: [{ text: entry.detail, kind: "text" }],
                documentation: entry.doc ? [{ text: entry.doc, kind: "text" }] : undefined,
              };
            }
          }
        }
      } catch (e) {
        log(`entry-details error: ${(e as Error).stack ?? (e as Error).message}`);
      }
      return ls.getCompletionEntryDetails(fileName, position, entryName, formatOptions, source, preferences, data);
    };

    // Hover: over a `.prop`/`@event` binding name in an html`` template, show the
    // member's JSDoc (or the standard-DOM + MDN note). Inside a `${…}` value or on
    // anything we don't recognise we defer to TS's own quick-info.
    proxy.getQuickInfoAtPosition = (fileName, position) => {
      try {
        const program = ls.getProgram();
        const sourceFile = program?.getSourceFile(fileName);
        if (program && sourceFile) {
          const match = findTemplate(tsm, sourceFile, position);
          if (match && match.kind === "html") {
            const qi = htmlQuickInfoAt(tsm, match, indexFor(program));
            if (qi) {
              // documentation is rendered as markdown → append @see links + a preview
              // image. An explicit `@preview` wins; otherwise auto-discover a
              // generated screenshot. A relative `@preview` resolves against the
              // component's OWN file (where the JSDoc lives), not the usage site.
              const previewSrc = qi.preview ?? resolvePreview(qi.tag, qi.tagFileName);
              const docText =
                (qi.doc ?? "") +
                seeMarkdown(qi.see ?? []) +
                (previewSrc ? previewMarkdown(previewSrc, qi.tagFileName ?? fileName) : "");
              return {
                kind: qi.kind,
                kindModifiers: "",
                textSpan: { start: qi.start, length: qi.length },
                displayParts: [{ text: qi.detail, kind: "text" }],
                documentation: docText ? [{ text: docText, kind: "text" }] : undefined,
              };
            }
          }
        }
      } catch (e) {
        log(`quickinfo error: ${(e as Error).stack ?? (e as Error).message}`);
      }
      return ls.getQuickInfoAtPosition(fileName, position);
    };

    // Go-to-definition: jump from a tag / `.prop` / `@event` in an html`` template
    // to the component class / `@Component.prop()` / `@Component.event()` it refers
    // to. Returns undefined → defer to TS (e.g. cursor inside a `${…}` value).
    const definitionAt = (fileName: string, position: number): ts.DefinitionInfo[] | undefined => {
      const program = ls.getProgram();
      const sourceFile = program?.getSourceFile(fileName);
      if (!program || !sourceFile) return undefined;
      const match = findTemplate(tsm, sourceFile, position);
      if (!match || match.kind !== "html") return undefined;
      const def = htmlDefinitionAt(match, indexFor(program));
      if (!def) return undefined;
      const kind =
        def.kind === "tag"
          ? tsm.ScriptElementKind.classElement
          : def.kind === "event"
            ? tsm.ScriptElementKind.memberFunctionElement
            : tsm.ScriptElementKind.memberVariableElement;
      return [
        {
          fileName: def.target.fileName,
          textSpan: { start: def.target.pos, length: def.target.name.length },
          kind,
          name: def.target.name,
          containerName: def.target.container,
          containerKind: tsm.ScriptElementKind.classElement,
        },
      ];
    };

    proxy.getDefinitionAndBoundSpan = (fileName, position) => {
      try {
        const program = ls.getProgram();
        const sourceFile = program?.getSourceFile(fileName);
        if (program && sourceFile) {
          const match = findTemplate(tsm, sourceFile, position);
          if (match && match.kind === "html") {
            const def = htmlDefinitionAt(match, indexFor(program));
            const defs = definitionAt(fileName, position);
            if (def && defs) {
              log(`definition @${position} → ${def.kind} ${def.target.container}.${def.target.name}`);
              return { textSpan: { start: def.boundStart, length: def.boundLength }, definitions: defs };
            }
          }
        }
      } catch (e) {
        log(`definition error: ${(e as Error).stack ?? (e as Error).message}`);
      }
      return ls.getDefinitionAndBoundSpan(fileName, position);
    };

    proxy.getDefinitionAtPosition = (fileName, position) => {
      try {
        const defs = definitionAt(fileName, position);
        if (defs) return defs;
      } catch (e) {
        log(`definition error: ${(e as Error).stack ?? (e as Error).message}`);
      }
      return ls.getDefinitionAtPosition(fileName, position);
    };

    // Audit diagnostics: run every loaded audit over the file and append its
    // findings (mapped severity → category) to the normal semantic diagnostics, so
    // they show as squiggles in the editor. Each audit owns its checks + severities.
    proxy.getSemanticDiagnostics = (fileName) => {
      const base = ls.getSemanticDiagnostics(fileName);
      if (!loadedAudits.length) return base;
      try {
        const program = ls.getProgram();
        const sourceFile = program?.getSourceFile(fileName);
        if (program && sourceFile) {
          const ctx: AuditContext = {
            ts: tsm,
            program,
            sourceFile,
            componentIndex: () => indexFor(program),
            templates: () => findAllTemplates(tsm, sourceFile),
            log,
          };
          const extra: ts.Diagnostic[] = [];
          for (const { specifier, audit } of loadedAudits) {
            let findings;
            try {
              findings = audit.diagnostics?.(ctx);
            } catch (e) {
              log(`audit "${specifier}" diagnostics error: ${(e as Error).stack ?? (e as Error).message}`);
              continue;
            }
            for (const d of findings ?? []) {
              const category = severityToCategory(tsm, d.severity);
              if (category === undefined) continue; // "none" → silenced
              extra.push({
                file: sourceFile,
                start: d.start,
                length: d.length,
                category,
                code: d.code ?? CODE_AUDIT_DEFAULT,
                messageText: d.messageText,
                source: "youneed",
              });
            }
          }
          if (extra.length) {
            log(`diagnostics ${fileName.split("/").pop()}: ${extra.length} finding(s) from ${loadedAudits.length} audit(s)`);
            return [...base, ...extra];
          }
        }
      } catch (e) {
        log(`diagnostics error: ${(e as Error).stack ?? (e as Error).message}`);
      }
      return base;
    };

    return proxy;
  }

  return { create };
}

export = init;
