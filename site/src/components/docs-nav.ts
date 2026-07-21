// <yn-docs-nav> — the docs sidebar, data-driven and rendered in light DOM so
// the page's .rail__* styles keep applying. Groups are BUILT FROM the generated
// package catalog (src/data/packages.ts): every package of every ecosystem is
// listed — the ~20 with a hand-written section link to it, the rest anchor into
// the static <yn-package-index> blocks (#pkg-<dir>) in the #naming section.
// The scroll-spy lives inside the component, and the filter box is debounced
// through @youneed/dom-provider-timers — the site uses the provider it documents.
import { Component, html, type OnMount, type OnUnmount } from "@youneed/dom";
import { timersProvider } from "@youneed/dom-provider-timers";
import { packages, type PackageCategory } from "../data/packages.ts";

interface NavItem {
  id: string;
  label: string;
}
interface NavGroup {
  title: string;
  items: NavItem[];
}

/** Ecosystem groups in sidebar order. */
const GROUP_ORDER: { cat: PackageCategory; title: string }[] = [
  { cat: "dom", title: "dom" },
  { cat: "server", title: "server" },
  { cat: "ssr", title: "ssr" },
  { cat: "cli", title: "cli" },
  { cat: "test", title: "test" },
  { cat: "orm", title: "orm" },
  { cat: "logger", title: "logger" },
  { cat: "otel", title: "otel" },
  { cat: "core", title: "core & tooling" },
];

/**
 * Packages with a hand-written section in docs.html (id === dir), in sidebar
 * order — these link to their section instead of the flat index.
 */
const CURATED: [dir: string, label: string][] = [
  ["dom", "dom"],
  ["dom-router", "dom-router"],
  ["devtools", "devtools"],
  ["dom-adapter-react", "adapter: react"],
  ["dom-provider-i18n", "provider: i18n"],
  ["dom-provider-timers", "provider: timers"],
  ["server", "server"],
  ["schema", "schema"],
  ["orm-sql", "orm-sql"],
  ["server-middleware-rate-limit", "middleware: rate-limit"],
  ["server-plugin-jobs", "plugin: jobs"],
  ["ssr", "ssr"],
  ["ssr-plugin-meta", "plugin: meta"],
  ["ssr-plugin-sitemap", "plugin: sitemap"],
  ["ssr-plugin-robots", "plugin: robots"],
  ["cli", "cli"],
  ["cli-middleware-prompt", "middleware: prompt"],
  ["cli-plugin-help", "plugin: help"],
  ["test", "test"],
  ["logger", "logger"],
];

const CURATED_LABEL = new Map(CURATED);

/** Short label from the naming convention: server-middleware-cors → "middleware: cors". */
const KIND_PREFIXES: [string, string][] = [
  ["dom-provider-", "provider: "],
  ["dom-adapter-", "adapter: "],
  ["dom-ui-", "ui: "],
  ["server-middleware-", "middleware: "],
  ["server-plugin-", "plugin: "],
  ["server-adapter-", "adapter: "],
  ["ssr-plugin-", "plugin: "],
  ["cli-middleware-", "middleware: "],
  ["cli-plugin-", "plugin: "],
  ["test-plugin-", "plugin: "],
  ["test-reporter-", "reporter: "],
  ["logger-plugin-", "plugin: "],
  ["logger-transport-", "transport: "],
  ["orm-adapter-", "adapter: "],
];
function labelOf(dir: string): string {
  for (const [prefix, kind] of KIND_PREFIXES) if (dir.startsWith(prefix)) return kind + dir.slice(prefix.length);
  return dir;
}

function buildNavGroups(): NavGroup[] {
  const groups: NavGroup[] = [
    {
      title: "Start",
      items: [
        { id: "intro", label: "Introduction" },
        { id: "quick-start", label: "Installation & quick start" },
      ],
    },
  ];
  for (const { cat, title } of GROUP_ORDER) {
    const entries = packages.filter((p) => p.cat === cat);
    if (entries.length === 0) continue;
    // Hand-written sections first (in CURATED order), then the rest A→Z into the index.
    const curated = CURATED.filter(([dir]) => entries.some((p) => p.dir === dir));
    const rest = entries.filter((p) => !CURATED_LABEL.has(p.dir));
    groups.push({
      title,
      items: [
        ...curated.map(([dir, label]) => ({ id: dir, label })),
        ...rest.map((p) => ({ id: `pkg-${p.dir}`, label: labelOf(p.dir) })),
      ],
    });
  }
  groups.push({
    title: "Reference",
    items: [{ id: "naming", label: "Naming & the full index" }],
  });
  return groups;
}

export const NAV_GROUPS: NavGroup[] = buildNavGroups();

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
