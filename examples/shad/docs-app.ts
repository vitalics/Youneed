// <docs-app slug="button"> — the SSR'd shell: sticky header, left nav, content.
// One component tree → one renderToString on the server, hydrated on the client.
// It owns history routing: intercepts internal /components/* link clicks and
// popstate, updating `slug` (which re-renders the sidebar highlight + content).

import { Component, html, css, when, type OnMount } from "@youneed/dom";
import { tw } from "@youneed/dom-ui-shad";
import { DEMOS, slugify } from "./demos.ts";
import "./docs-sidebar.ts";
import "./docs-page.ts";
import "./docs-toc.ts";
import type { TocItem } from "./docs-toc.ts";

@Component.define()
export class DocsApp extends Component("docs-app") implements OnMount {
  static styles = [
    tw,
    css`
      :host { display: block; }
      header {
        position: sticky; top: 0; z-index: 10;
        display: flex; align-items: center; justify-content: space-between;
        height: 56px; padding: 0 20px;
        border-bottom: 1px solid hsl(var(--border));
        background: hsl(var(--background));
      }
      .brand { font-weight: 700; }
      .brand span { color: hsl(var(--muted-foreground)); font-weight: 400; }
      .layout { display: flex; align-items: flex-start; max-width: 1400px; margin: 0 auto; }
      aside.nav {
        position: sticky; top: 56px; flex: 0 0 240px; height: calc(100vh - 56px);
        overflow-y: auto; padding: 24px 12px;
        border-right: 1px solid hsl(var(--border));
      }
      aside.toc {
        position: sticky; top: 56px; flex: 0 0 200px; height: calc(100vh - 56px);
        overflow-y: auto; padding: 32px 16px;
      }
      main { flex: 1; min-width: 0; padding: 40px 32px; }
      @media (max-width: 1024px) { aside.toc { display: none; } }
    `,
  ];

  // reflect → SSR emits <docs-app slug="…"> so the client hydrates the same route.
  @Component.prop({ attribute: true, reflect: true }) slug = "button";

  onMount(): void {
    if (typeof window === "undefined") return; // server: no navigation
    document.addEventListener(
      "click",
      (e) => {
        const me = e as MouseEvent;
        if (me.metaKey || me.ctrlKey || me.shiftKey || me.button !== 0) return;
        const a = e.composedPath().find((n) => (n as Element)?.tagName === "A") as Element | undefined;
        const href = a?.getAttribute("href");
        if (!href || !href.startsWith("/components/")) return;
        e.preventDefault();
        history.pushState({}, "", href);
        this.slug = href.slice("/components/".length);
      },
      { signal: this.abortSignal },
    );
    window.addEventListener(
      "popstate",
      () => (this.slug = location.pathname.replace(/^\/components\//, "") || "button"),
      { signal: this.abortSignal },
    );
  }

  // "On this page" entries for the current component: named examples + the
  // API/Extending sections when present. Ids match docs-page's anchor ids.
  #toc(): TocItem[] {
    const demo = DEMOS[this.slug];
    if (!demo) return [];
    const items: TocItem[] = demo.examples
      .filter((e) => e.name)
      .map((e) => ({ label: e.name!, id: slugify(e.name!) }));
    if (demo.api?.props?.length || demo.api?.slots?.length || demo.api?.events?.length)
      items.push({ label: "API Reference", id: "api-reference" });
    if (demo.api?.extend) items.push({ label: "Extending", id: "extending" });
    return items;
  }

  // The anchor target lives inside docs-page's shadow root, so a native #hash
  // can't reach it — scroll it into view by hand.
  #scrollTo(id: string): void {
    const page = this.shadowRoot?.querySelector("docs-page");
    const target = (page as Element & { shadowRoot?: ShadowRoot } | null)?.shadowRoot?.getElementById(id);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  override render() {
    const toc = this.#toc();
    return html`
      <header>
        <div class="brand">youneed<span>/shad</span></div>
        <shad-button
          variant="outline"
          size="sm"
          @click=${() => document.documentElement.classList.toggle("dark")}
          >🌓 Theme</shad-button
        >
      </header>
      <div class="layout">
        <aside class="nav"><docs-sidebar active=${this.slug}></docs-sidebar></aside>
        <main><docs-page slug=${this.slug}></docs-page></main>
        ${when(
          toc.length,
          () => html`<aside class="toc">
            <docs-toc
              .items=${toc}
              @select=${(e: Event) => this.#scrollTo((e as CustomEvent<string>).detail)}
            ></docs-toc>
          </aside>`,
        )}
      </div>
    `;
  }
}
