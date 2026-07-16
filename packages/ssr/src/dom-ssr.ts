// dom-ssr.ts — render dom.ts components to an HTML string (SSR / SSG).
//
// Requires a server DOM to be registered BEFORE this module loads, since dom.ts
// classes `extends HTMLElement` at import time. @youneed/dom encapsulates that
// (happy-dom is its dependency) — just call registerDOM():
//
//   import { registerDOM } from "@youneed/dom/register";
//   registerDOM();
//   const { renderToString } = await import("./dom-ssr.ts");
//
// Shadow DOM is emitted as Declarative Shadow DOM (`<template shadowrootmode>`)
// with adoptedStyleSheets inlined as <style> — so the markup hydrates natively.

import {
  Mount,
  setDefaultScheduler,
  syncScheduler,
  flushSync,
  flushPendingDefines,
  type ComponentConstructor,
} from "@youneed/dom";

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img",
  "input", "link", "meta", "param", "source", "track", "wbr",
]);

const escapeText = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

// adoptedStyleSheets don't serialize, so we materialize them for the Declarative
// Shadow DOM. A sheet may carry (in priority order):
//   • `__id` — DECLARATIVE ADOPTED: emit the body ONCE at the document level and
//     reference it from every root via `shadowrootadoptedstylesheets="<id>"`.
//     No per-root copy at all — the highest-priority branch. (See note below.)
//   • `__critical(used)` — return only the rules the shadow's classes need
//     (+ prerequisites). Smallest self-contained output; computed per root.
//   • `__href` — a URL it's served at: emit a shadow-scoped `<link>` (fetched
//     once and cached, so a shared sheet isn't duplicated across roots).
//   • `__cssText` — its raw source: inline verbatim (a server DOM can't always
//     re-serialize big CSS like Tailwind via cssRules).
//   • otherwise — re-serialize its cssRules.
//
// On `__id` (declarative adopted): `shadowrootadoptedstylesheets` is the
// standards-track attribute for sharing a constructable sheet into Declarative
// Shadow DOM by reference. Browsers are still shipping it, so today the SHARING
// is realized at hydration — our components re-adopt the live `tw` sheet (by
// reference, parsed once) when they upgrade, so all roots share one sheet in
// memory. The document carries one copy as `<style data-adopted-sheet="<id>">`
// so a) the markup is styled the instant the attribute is honored natively, and
// b) it's the single pre-hydration source. Trade-off vs `__critical`: smallest
// HTML and zero duplication, but no FOUC-guarantee until the attribute ships.
type SsrSheet = CSSStyleSheet & {
  __id?: string;
  __critical?: (used: Set<string>) => string;
  __href?: string;
  __cssText?: string;
};

/** Render-scoped accumulator threaded through serialization. */
interface RenderCtx {
  /** Declaratively-adopted shared sheets seen this render: id → css body. */
  shared: Map<string, string>;
}

/** Class names used by elements within a shadow root (not crossing nested roots). */
function usedClasses(root: ShadowRoot): Set<string> {
  const set = new Set<string>();
  for (const el of root.querySelectorAll("*")) el.classList.forEach((c) => set.add(c));
  return set;
}

/**
 * Materialize a shadow root's adopted sheets. Returns the ids to reference via
 * `shadowrootadoptedstylesheets` (collected once into `ctx.shared`) plus the
 * `<link>`/`<style>` head to inline into the `<template>`.
 */
function shadowStyleHead(root: ShadowRoot, ctx: RenderCtx): { adopt: string[]; head: string } {
  const adopt: string[] = [];
  let links = "";
  let inline = "";
  let used: Set<string> | undefined;
  for (const s of root.adoptedStyleSheets as Iterable<SsrSheet>) {
    if (s.__id) {
      // Reference the shared sheet; emit its body once at the document level.
      if (!ctx.shared.has(s.__id)) {
        ctx.shared.set(s.__id, s.__cssText ?? [...s.cssRules].map((r) => r.cssText).join("\n"));
      }
      adopt.push(s.__id);
    } else if (s.__critical) inline += s.__critical((used ??= usedClasses(root))) + "\n";
    else if (s.__href) links += `<link rel="stylesheet" href="${escapeAttr(s.__href)}">`;
    else inline += (s.__cssText ?? [...s.cssRules].map((r) => r.cssText).join("\n")) + "\n";
  }
  return { adopt, head: links + (inline.trim() ? `<style>${inline}</style>` : "") };
}

/**
 * Serialize a node into HTML chunks, lazily. The string and stream renderers
 * share this single source of truth: `serializeNode` joins the chunks; the
 * streaming path pulls them one at a time so the document never lives in memory
 * as a whole. Chunk boundaries fall at natural tag edges, which is enough
 * granularity to give the HTTP layer something to flush early.
 */
function* serializeNodeChunks(node: Node, ctx: RenderCtx): Generator<string> {
  if (node.nodeType === 3) {
    yield escapeText((node as Text).data); // text
    return;
  }
  if (node.nodeType !== 1) return; // skip comments / others
  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  let attrs = "";
  for (const attr of el.attributes) attrs += ` ${attr.name}="${escapeAttr(attr.value)}"`;

  if (VOID.has(tag)) {
    yield `<${tag}${attrs}>`;
    return;
  }

  yield `<${tag}${attrs}>`;

  // Declarative Shadow DOM for components
  const shadow = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
  if (shadow) {
    const { adopt, head } = shadowStyleHead(shadow, ctx);
    const adoptAttr = adopt.length ? ` shadowrootadoptedstylesheets="${escapeAttr(adopt.join(" "))}"` : "";
    yield `<template shadowrootmode="open"${adoptAttr}>`;
    if (head) yield head;
    for (const child of shadow.childNodes) yield* serializeNodeChunks(child, ctx);
    yield `</template>`;
  }

  for (const child of el.childNodes) yield* serializeNodeChunks(child, ctx);
  yield `</${tag}>`;
}

function serializeNode(node: Node, ctx: RenderCtx): string {
  let html = "";
  for (const chunk of serializeNodeChunks(node, ctx)) html += chunk;
  return html;
}

/** Emit collected declaratively-adopted sheets once: `<style data-adopted-sheet>`. */
export function sharedSheetsHead(shared: Map<string, string>): string {
  let out = "";
  for (const [id, css] of shared) {
    out += `<style data-adopted-sheet="${escapeAttr(id)}">${css}</style>`;
  }
  return out;
}

/**
 * Render a component to an HTML string (with Declarative Shadow DOM).
 *
 * If a sheet uses declarative-adopted mode (`__id`), its body is referenced
 * rather than copied per root. Pass `out.sharedSheets` (a Map) to collect those
 * bodies so the caller can place them once in `<head>` (see `sharedSheetsHead`);
 * if omitted, they're inlined once at the front of the returned HTML so the
 * result stays self-contained.
 */
export function renderToString(
  root: ComponentConstructor | HTMLElement,
  out?: { sharedSheets?: Map<string, string> },
): string {
  const { element, container } = mountForRender(root);
  const ctx: RenderCtx = { shared: out?.sharedSheets ?? new Map() };
  const html = serializeNode(element, ctx);
  element.remove(); // disconnect -> dispose (cleanups, abort)
  container.remove();
  // Caller is collecting shared sheets → it places them. Otherwise self-contain.
  const prefix = out?.sharedSheets ? "" : sharedSheetsHead(ctx.shared);
  return prefix + html;
}

/** Mount a class/instance into a detached container, ready for serialization. */
function mountForRender(root: ComponentConstructor | HTMLElement): {
  element: HTMLElement;
  container: HTMLElement;
} {
  setDefaultScheduler(syncScheduler); // renders run inline — no microtask waiting
  flushPendingDefines(); // SSR can't await triggers — register deferred components now
  const container = document.createElement("div");
  document.body.appendChild(container);
  // A class is mounted via createElement; a ready instance (e.g. View.of({…})
  // with props already set) is appended as-is so its props survive into SSR.
  let element: HTMLElement;
  if (typeof root === "function") {
    element = Mount(container, root).element;
  } else {
    container.appendChild(root);
    element = root;
  }
  flushSync(); // drain anything a synchronous update scheduled
  return { element, container };
}

/** A sink for streamed HTML: a WHATWG WritableStream, or anything with a
 *  compatible `getWriter()`. Chunks are UTF-8 encoded `Uint8Array`s. */
type HtmlWritable = WritableStream<Uint8Array>;

export interface RenderToStreamOptions {
  /** Collect declaratively-adopted (`__id`) sheet bodies for the caller to place
   *  in `<head>`. If omitted, those sheets are emitted as a trailing block AFTER
   *  the markup (the document stays self-contained, at the cost of late styles —
   *  per-component inline styles already stream inside each `<template>`). */
  sharedSheets?: Map<string, string>;
  /** Close the writer when rendering finishes. Default `false` — the caller owns
   *  the stream lifecycle (e.g. it still has to write `</body></html>`). */
  close?: boolean;
  /** Abort early: when it fires, streaming stops and the writer is aborted. */
  signal?: AbortSignal;
}

/**
 * Render a component to an HTML stream, writing chunks into a web
 * `WritableStream<Uint8Array>` as they are produced — the document is never held
 * in memory as a single string. Honors writer backpressure (`await writer.ready`
 * between chunks), so piping straight to an HTTP response body throttles
 * rendering to the socket's drain rate.
 *
 *   const { readable, writable } = new TransformStream<Uint8Array>();
 *   const done = renderToStream(App, writable, { close: true });
 *   return new Response(readable, { headers: { "content-type": "text/html" } });
 *   await done;
 *
 * The render itself is synchronous (happy-dom can't suspend), so this streams the
 * *serialization* of an already-built tree — the win is TTFB and zero document
 * buffering, not async data fetching mid-render.
 *
 * Declarative-adopted (`__id`) sheets: pass `out.sharedSheets` to collect them
 * for `<head>` placement; otherwise they trail the markup (see options).
 */
export async function renderToStream(
  root: ComponentConstructor | HTMLElement,
  writable: HtmlWritable,
  out: RenderToStreamOptions = {},
): Promise<void> {
  const { element, container } = mountForRender(root);
  const ctx: RenderCtx = { shared: out.sharedSheets ?? new Map() };
  const encoder = new TextEncoder();
  const writer = writable.getWriter();

  const write = async (text: string): Promise<void> => {
    if (out.signal?.aborted) throw out.signal.reason ?? new Error("aborted");
    await writer.ready; // respect backpressure
    await writer.write(encoder.encode(text));
  };

  try {
    for (const chunk of serializeNodeChunks(element, ctx)) {
      if (chunk) await write(chunk);
    }
    // Self-contained mode: the shared map is fully populated only after the walk,
    // so its sheets can only trail the markup. With `out.sharedSheets`, the caller
    // placed them in <head> already — nothing to emit here.
    if (!out.sharedSheets && ctx.shared.size) await write(sharedSheetsHead(ctx.shared));
    if (out.close) await writer.close();
  } catch (err) {
    // Tear the stream down so a piped Response surfaces the failure.
    await writer.abort(err).catch(() => {});
    throw err;
  } finally {
    element.remove(); // disconnect -> dispose (cleanups, abort)
    container.remove();
    writer.releaseLock();
  }
}

// ============================================================
// Document primitives (Next.js _document style)
// ------------------------------------------------------------
// String builders for the document shell — NOT custom elements (the <html>,
// <head>, <body> live above the component tree). Compose them by hand for full
// control, or use the renderPage() convenience.
// ============================================================

type Attr = string | number | boolean | undefined;

function attrs(map: Record<string, Attr>): string {
  let out = "";
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined || value === false) continue;
    out += value === true ? ` ${key}` : ` ${key}="${escapeAttr(String(value))}"`;
  }
  return out;
}

/** `<!doctype html><html>…</html>` */
export function Html(
  opts: { lang?: string } = {},
  ...children: string[]
): string {
  return `<!doctype html>\n<html${attrs({ lang: opts.lang })}>\n${children.join("\n")}\n</html>\n`;
}

export function Head(...children: string[]): string {
  return `<head>\n${children.join("\n")}\n</head>`;
}

export function Body(...children: string[]): string {
  return `<body>\n${children.join("\n")}\n</body>`;
}

export function Title(text: string): string {
  return `<title>${escapeText(text)}</title>`;
}

export function Meta(map: Record<string, Attr>): string {
  return `<meta${attrs(map)}>`;
}

export function Link(map: Record<string, Attr>): string {
  return `<link${attrs(map)}>`;
}

/** `<script>` — external (`src`) or inline (`children`). */
export function Script(
  opts: {
    src?: string;
    type?: string;
    defer?: boolean;
    async?: boolean;
    children?: string;
  } = {},
): string {
  const open = `<script${attrs({
    src: opts.src,
    type: opts.type,
    defer: opts.defer,
    async: opts.async,
  })}>`;
  return `${open}${opts.children ?? ""}</script>`;
}

/** Convenience full-document render (built on the primitives above). */
export function renderPage(
  Root: ComponentConstructor,
  opts?: {
    title?: string;
    lang?: string;
    head?: string[]; // extra <head> entries (Meta/Link/Script/…)
    scripts?: Array<{ src: string; type?: string; defer?: boolean }>;
    clientScript?: string; // shorthand for a single body script
  },
): string {
  const scripts = [
    ...(opts?.scripts ?? []),
    ...(opts?.clientScript ? [{ src: opts.clientScript }] : []),
  ];
  const sharedSheets = new Map<string, string>();
  const body = renderToString(Root, { sharedSheets });
  return Html(
    { lang: opts?.lang ?? "en" },
    Head(
      Meta({ charset: "utf-8" }),
      Meta({ name: "viewport", content: "width=device-width, initial-scale=1" }),
      Title(opts?.title ?? "App"),
      ...(opts?.head ?? []),
      ...(sharedSheets.size ? [sharedSheetsHead(sharedSheets)] : []),
    ),
    Body(body, ...scripts.map((s) => Script(s))),
  );
}
