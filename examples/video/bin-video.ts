// bin-video.ts — SSR server for the video-island demo.
// Run: pnpm video  ->  http://localhost:3012
//
// happy-dom is registered first (dom.ts extends HTMLElement at import). The
// components register themselves via @Component.define(when); renderToString
// flushes those deferred/"server" registrations synchronously, so SSR emits
// every shadow tree without any imperative define() here.

import { registerDOM } from "@youneed/dom/register";

registerDOM();

Promise.all([
  import("@youneed/ssr"),
  import("@youneed/server"),
  import("./components.ts"), // evaluating it runs the @Component.define decorators
  import("./app.ts"),
]).then(([page, server, _components, app]) => {
  const { mountPages, enablePageDevtools } = page;
  const { Application, File } = server;

  enablePageDevtools();

  const http = mountPages(Application(), app.VideoPage)
    .get("/client.js", File("examples/video/client.js"));

  http.listen(3012, (ctx) => {
    console.log(`Video demo on http://localhost:${ctx.port}`);
    console.log("  Watch the right (shadow) video reset when islands hydrate (~3s).");
  });
});
