// The page: GET / renders the VideoLab shell. Isomorphic — same render() runs
// on the server here and could run in an SPA later.

import { Page } from "@youneed/ssr";
import { html } from "@youneed/dom";
import { VideoLab } from "./components.ts";

export class VideoPage extends Page("/", {
  title: "Video island demo",
  clientScript: () => import("./client.ts"),
}) {
  override render() {
    // Inject static slot content into the shell via the new of(props, slot) API.
    // It's server-rendered into the page's <slot> and never re-rendered.
    return VideoLab.of(
      {},
      html`Slot content injected by the Page via
        <code>VideoLab.of(props, slot)</code> — static, server-rendered, survives hydration.`,
    );
  }
}
