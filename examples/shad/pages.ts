// The SSR page: GET /components/:slug renders the docs shell for that slug.
import { Page, Link, type RouteContext } from "@youneed/ssr";
import { DocsApp } from "./docs-app.ts";

export class ComponentsPage extends Page("/components/:slug", {
  title: "youneed/shad — components",
  head: [
    // Tailwind v4 @property registrations — must be document-level so utilities
    // like `border` resolve inside the components' shadow roots (Chromium ignores
    // @property declared only inside a shadow/constructable sheet).
    Link({ rel: "stylesheet", href: "/tw-properties.css" }),
    Link({ rel: "stylesheet", href: "/theme.css" }),
    "<style>body{margin:0;background:hsl(var(--background));color:hsl(var(--foreground));font-family:system-ui,sans-serif}</style>",
  ],
  clientScript: () => import("./client.ts"),
}) {
  override render(ctx: RouteContext) {
    return DocsApp.of({ slug: ctx.params.slug || "button" });
  }
}
