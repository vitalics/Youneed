// SSR/SSG self-test. Run: pnpm --filter @youneed/ssr test
//
// happy-dom must be registered before dom.ts/dom-ssr.ts load (classes extend
// HTMLElement at import), so register first, then dynamically import.
import { registerDOM } from "@youneed/dom/register";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
// registerDOM() installs happy-dom's (incomplete) stream globals — use Node's.
import { TransformStream } from "node:stream/web";

registerDOM();
const [dom, ssr] = await Promise.all([import("../../dom/src/index.ts"), import("../src/dom-ssr.ts")]);
const { Component, html, css } = dom;
const { renderToString, renderToStream, renderPage, Html, Head, Body, Title, Meta, Script } = ssr;

/** Drive renderToStream into a TransformStream and collect the decoded output. */
async function streamToString(
  root: Parameters<typeof renderToStream>[0],
  opts: Parameters<typeof renderToStream>[2] = {},
): Promise<{ html: string; chunks: number }> {
  const { readable, writable } = new TransformStream<Uint8Array>();
  const reader = readable.getReader();
  const decoder = new TextDecoder();
  let html = "";
  let chunks = 0;
  const collect = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      chunks++;
    }
    html += decoder.decode();
  })();
  await renderToStream(root, writable, { close: true, ...opts });
  await collect;
  return { html, chunks };
}

// A styling base (yellow) + a component that adds its own rule and content.
class Highlighted extends HTMLElement {
  static styles = css`
    :host {
      background: yellow;
    }
  `;
}

@Component.define()
class SsrText extends Component("ssr-text", Highlighted) {
  static override styles = css`
    div {
      font-weight: bold;
    }
  `;
  render() {
    return html`<div>hello from SSR</div>`;
  }
}

const out = renderToString(SsrText);
const page = renderPage(SsrText, { title: "SSR demo", clientScript: "./bin-dom.js" });
const doc = Html(
  { lang: "ru" },
  Head(Meta({ charset: "utf-8" }), Title("Hand-built")),
  Body(renderToString(SsrText), Script({ src: "/app.js", type: "module", defer: true })),
);

// ── Declarative adopted stylesheets (`__id`) ──
const sharedSheet = css`
  .shared-x {
    color: red;
  }
` as CSSStyleSheet & { __id?: string; __cssText?: string };
sharedSheet.__id = "tw";
sharedSheet.__cssText = ".shared-x { color: red }";

@Component.define()
class AdoptText extends Component("adopt-text") {
  static override styles = sharedSheet;
  render() {
    return html`<div class="shared-x">shared</div>`;
  }
}

const adopt = renderToString(AdoptText);
const sharedSheets = new Map<string, string>();
const collected = renderToString(AdoptText, { sharedSheets });

// Streaming counterparts (collected after the classes above are defined).
const streamed = await streamToString(SsrText);
const streamedAdopt = await streamToString(AdoptText);
const streamedCollect = new Map<string, string>();
const streamedCollected = await streamToString(AdoptText, { sharedSheets: streamedCollect });

class RenderToStringTest extends Test({ name: "ssr renderToString" }) {
  @Test.it("emits the outer custom element") outer() {
    expect(out.includes("<ssr-text>")).toBeTruthy();
  }
  @Test.it("emits declarative shadow DOM") dsd() {
    expect(out.includes('<template shadowrootmode="open">')).toBeTruthy();
  }
  @Test.it("inlines the base style (yellow)") baseStyle() {
    expect(out.includes("background: yellow")).toBeTruthy();
  }
  @Test.it("inlines the component's own style (bold)") ownStyle() {
    expect(/font-weight:\s*bold/.test(out)).toBeTruthy();
  }
  @Test.it("renders the content") content() {
    expect(out.includes("hello from SSR")).toBeTruthy();
  }
}

class RenderPageTest extends Test({ name: "ssr renderPage + primitives" }) {
  @Test.it("full page has a doctype") doctype() {
    expect(page.startsWith("<!doctype html>")).toBeTruthy();
  }
  @Test.it("full page embeds the app") embeds() {
    expect(page.includes("<ssr-text>")).toBeTruthy();
  }
  @Test.it("full page links the client bundle") clientScript() {
    expect(page.includes('src="./bin-dom.js"')).toBeTruthy();
  }
  @Test.it("Html primitive (doctype + lang)") htmlPrimitive() {
    expect(doc.startsWith("<!doctype html>") && doc.includes('<html lang="ru">')).toBeTruthy();
  }
  @Test.it("Head/Title/Meta primitives") headPrimitives() {
    expect(doc.includes("<head>") && doc.includes("<title>Hand-built</title>") && doc.includes('<meta charset="utf-8">')).toBeTruthy();
  }
  @Test.it("Body embeds the app") bodyEmbeds() {
    expect(doc.includes("<body>") && doc.includes("<ssr-text>")).toBeTruthy();
  }
  @Test.it("Script primitive (src + type + defer)") scriptPrimitive() {
    expect(doc.includes('<script src="/app.js" type="module" defer></script>')).toBeTruthy();
  }
}

class AdoptedSheetsTest extends Test({ name: "ssr declarative adopted stylesheets" }) {
  @Test.it("template references the shared sheet") refs() {
    expect(adopt.includes('shadowrootadoptedstylesheets="tw"')).toBeTruthy();
  }
  @Test.it("sheet body NOT copied into the root") notCopied() {
    expect(/<template[^>]*>[^]*\.shared-x \{ color: red \}[^]*<\/template>/.test(adopt)).toBeFalsy();
  }
  @Test.it("self-contained → one shared <style>") oneStyle() {
    expect(adopt.includes('<style data-adopted-sheet="tw">.shared-x { color: red }</style>')).toBeTruthy();
  }
  @Test.it("shared style emitted exactly once") once() {
    expect(adopt.split('data-adopted-sheet="tw"').length).toBe(2);
  }
  @Test.it("collected into the out-map") collectedMap() {
    expect(sharedSheets.get("tw")).toBe(".shared-x { color: red }");
  }
  @Test.it("body omits the shared <style> when collected") omitsWhenCollected() {
    expect(collected.includes("data-adopted-sheet")).toBeFalsy();
  }
  @Test.it("collected body still references the sheet") stillRefs() {
    expect(collected.includes('shadowrootadoptedstylesheets="tw"')).toBeTruthy();
  }
}

class RenderToStreamTest extends Test({ name: "ssr renderToStream" }) {
  @Test.it("byte-for-byte matches renderToString") matches() {
    expect(streamed.html).toBe(out);
  }
  @Test.it("arrives in multiple chunks (truly streamed)") chunked() {
    expect(streamed.chunks > 1).toBeTruthy();
  }
  @Test.it("emits declarative shadow DOM") dsd() {
    expect(streamed.html.includes('<template shadowrootmode="open">')).toBeTruthy();
  }
  @Test.it("self-contained adopted sheet trails the markup") trailing() {
    const html = streamedAdopt.html;
    expect(html.includes('shadowrootadoptedstylesheets="tw"')).toBeTruthy();
    // The shared <style> comes AFTER the referencing <template> in stream mode.
    expect(html.indexOf("data-adopted-sheet") > html.indexOf("shadowrootadoptedstylesheets")).toBeTruthy();
  }
  @Test.it("out.sharedSheets collects + omits trailing block") collects() {
    expect(streamedCollect.get("tw")).toBe(".shared-x { color: red }");
    expect(streamedCollected.html.includes("data-adopted-sheet")).toBeFalsy();
  }
  @Test.it("respects abort signal") aborts() {
    const ctrl = new AbortController();
    ctrl.abort(new Error("nope"));
    const { writable } = new TransformStream<Uint8Array>();
    return renderToStream(SsrText, writable, { signal: ctrl.signal }).then(
      () => expect(false).toBeTruthy(),
      (err) => expect((err as Error).message).toBe("nope"),
    );
  }
}

await TestApplication()
  .addTests(RenderToStringTest, RenderPageTest, AdoptedSheetsTest, RenderToStreamTest)
  .reporter(new ConsoleReporter())
  .run();
