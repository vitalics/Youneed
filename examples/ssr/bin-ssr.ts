// bin-ssr.ts — server-side render the DOM framework over the HTTP framework.
// Run: pnpm examples:ssr  ->  http://localhost:3010
//
// Two routes show the two rendering primitives of @youneed/ssr:
//   GET /         renderToString — buffer the whole document, send it at once.
//   GET /stream   renderToStream — write the document into a web WritableStream
//                 as it serializes; piped straight to the HTTP response.
//
// happy-dom is registered first so dom.ts can render server-side.

import { registerDOM } from "@youneed/dom/register";
import { Readable } from "node:stream";
// registerDOM() swaps in happy-dom's (incomplete) stream globals — use Node's.
import { TransformStream } from "node:stream/web";

registerDOM();

Promise.all([
  import("@youneed/dom"),
  import("@youneed/ssr"),
  import("@youneed/server"),
]).then(([dom, ssr, server]) => {
  const { Component, html, css } = dom;
  const { renderToString, renderToStream, Html, Head, Body, Title, Meta, Script } = ssr;
  const { Application, Response } = server;

  // A reusable styling base (yellow) — same one as the client demo.
  class Highlighted extends HTMLElement {
    static styles = css`
      :host {
        background: yellow;
        display: block;
        padding: 8px;
      }
    `;
  }

  @Component.define()
  class SsrText extends Component("ssr-text", { base: Highlighted }) {
    static override styles = css`
      div {
        font-weight: bold;
      }
    `;
    render() {
      return html`<div>hello from SSR</div>`;
    }
  }

  // ── GET / : renderToString (buffered) ───────────────────────────────────────
  // Compose the document by hand (Next.js _document style).
  const page = () =>
    Html(
      { lang: "en" },
      Head(
        Meta({ charset: "utf-8" }),
        Meta({ name: "viewport", content: "width=device-width, initial-scale=1" }),
        Title("SSR demo"),
      ),
      Body(
        renderToString(SsrText), // the app (Declarative Shadow DOM)
        Script({ src: "/bin-dom.js", type: "module" }),
      ),
    );

  // ── GET /stream : renderToStream (web WritableStream → HTTP response) ────────
  // Write the shell, stream the component, then the tail; the readable side is
  // adapted to a Node stream the server pipes to the socket.
  const streamDocument = (): Readable => {
    const { readable, writable } = new TransformStream<Uint8Array>();
    const enc = new TextEncoder();
    void (async () => {
      const head = writable.getWriter();
      await head.write(
        enc.encode(
          '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Streamed SSR</title></head><body>',
        ),
      );
      head.releaseLock();
      // Stream the component itself (keeps the writer open for the tail below).
      await renderToStream(SsrText, writable, { close: false });
      const tail = writable.getWriter();
      await tail.write(enc.encode('<script src="/bin-dom.js" type="module"></script></body></html>'));
      await tail.close();
      tail.releaseLock();
    })();
    return Readable.fromWeb(readable);
  };

  const app = Application()
    .get("/", () =>
      Response({
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
        body: page(), // re-rendered per request (SSR)
      }),
    )
    .get("/stream", () =>
      Response({
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
        body: streamDocument(), // streamed per request
      }),
    );

  app.listen(3010, (ctx) => {
    console.log(`SSR server on http://localhost:${ctx.port}`);
    console.log("  GET /        (renderToString)");
    console.log("  GET /stream  (renderToStream)");
  });
});
