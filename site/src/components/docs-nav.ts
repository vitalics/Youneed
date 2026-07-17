// <yn-docs-nav> — the docs sidebar, data-driven and rendered in light DOM so
// the page's .rail__* styles keep applying. Grouped by ecosystem (dom / server /
// ssr / cli); the scroll-spy lives inside the component, and the filter box is
// debounced through @youneed/dom-provider-timers — the site uses the provider
// it documents.
import { Component, html, type OnMount, type OnUnmount } from "@youneed/dom";
import { timersProvider } from "@youneed/dom-provider-timers";

interface NavItem {
  id: string;
  label: string;
}
interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Start",
    items: [
      { id: "intro", label: "Introduction" },
      { id: "quick-start", label: "Installation & quick start" },
    ],
  },
  {
    title: "dom",
    items: [
      { id: "dom", label: "dom" },
      { id: "dom-router", label: "dom-router" },
      { id: "devtools", label: "devtools" },
      { id: "dom-adapter-react", label: "adapter: react" },
      { id: "dom-provider-i18n", label: "provider: i18n" },
      { id: "dom-provider-timers", label: "provider: timers" },
    ],
  },
  {
    title: "server",
    items: [
      { id: "server", label: "server" },
      { id: "schema", label: "schema" },
      { id: "orm-sql", label: "orm-sql" },
      { id: "server-middleware-rate-limit", label: "middleware: rate-limit" },
      { id: "server-plugin-jobs", label: "plugin: jobs" },
    ],
  },
  {
    title: "ssr",
    items: [
      { id: "ssr", label: "ssr" },
      { id: "ssr-plugin-meta", label: "plugin: meta" },
      { id: "ssr-plugin-sitemap", label: "plugin: sitemap" },
      { id: "ssr-plugin-robots", label: "plugin: robots" },
    ],
  },
  {
    title: "cli",
    items: [
      { id: "cli", label: "cli" },
      { id: "cli-middleware-prompt", label: "middleware: prompt" },
      { id: "cli-plugin-help", label: "plugin: help" },
    ],
  },
  {
    title: "Standalone",
    items: [
      { id: "test", label: "test" },
      { id: "logger", label: "logger" },
    ],
  },
  {
    title: "Reference",
    items: [{ id: "naming", label: "Naming & the full index" }],
  },
];

@Component.define()
export class DocsNav
  extends Component("yn-docs-nav", { shadow: false, providers: [timersProvider()] })
  implements OnMount, OnUnmount
{
  @Component.prop() active = "";
  @Component.prop() query = "";

  // Debounced through this.timers — dropped automatically on disconnect.
  #applyQuery = this.timers.debounce((q: string) => {
    this.query = q;
  }, 120);

  @Component.event() onSearch(e: Event) {
    this.#applyQuery((e.target as HTMLInputElement).value);
  }

  #io?: IntersectionObserver;

  onMount(): void {
    if (!("IntersectionObserver" in window)) return;
    const sections = Array.from(document.querySelectorAll<HTMLElement>("section.doc-sec[id]"));
    this.#io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) this.active = entry.target.id;
        }
      },
      { rootMargin: "-10% 0px -70% 0px", threshold: 0 },
    );
    sections.forEach((s) => this.#io!.observe(s));
  }

  onUnmount(): void {
    this.#io?.disconnect();
  }

  #filtered(): NavGroup[] {
    const q = this.query.trim().toLowerCase();
    if (!q) return NAV_GROUPS;
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((it) => it.label.toLowerCase().includes(q) || it.id.includes(q)),
    })).filter((g) => g.items.length > 0);
  }

  render() {
    const groups = this.#filtered();
    return html`<nav aria-label="Docs sections">
      <input
        class="rail__search"
        type="search"
        placeholder="Filter sections…"
        aria-label="Filter docs sections"
        @input=${this.onSearch}
      />
      ${groups.length === 0 ? html`<p class="rail__empty">No section matches.</p>` : ""}
      ${groups.map(
        (g) => html`<div class="rail__group">
          <h2>${g.title}</h2>
          <ul>
            ${g.items.map(
              (it) => html`<li>
                <a class=${this.active === it.id ? "rail__link is-active" : "rail__link"} href=${`#${it.id}`}>${it.label}</a>
              </li>`,
            )}
          </ul>
        </div>`,
      )}
    </nav>`;
  }
}
