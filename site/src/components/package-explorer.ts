// <yn-package-explorer> — the full package catalog on the landing page:
// a search box + category chips + the filtered table, over data generated
// from packages/*/package.json (src/data/packages.ts).
import { Component, html, css } from "@youneed/dom";
import { packages, type PackageCategory } from "../data/packages.ts";

type Filter = PackageCategory | "all";

const CATEGORIES: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "dom", label: "dom" },
  { id: "server", label: "server" },
  { id: "ssr", label: "ssr" },
  { id: "cli", label: "cli" },
  { id: "test", label: "test" },
  { id: "orm", label: "orm" },
  { id: "logger", label: "logger" },
  { id: "otel", label: "otel" },
  { id: "core", label: "core & tooling" },
];

@Component.define()
export class PackageExplorer extends Component("yn-package-explorer") {
  static styles = css`
    :host { display: block; font-family: var(--font-body); }

    .controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-sm);
      margin-bottom: var(--space-md);
    }
    input[type="search"] {
      flex: 1 1 16rem;
      min-width: 0;
      font: inherit;
      font-size: var(--text-sm, 0.9rem);
      color: var(--color-ink);
      background: var(--color-paper);
      border: 1px solid var(--color-rule-strong);
      border-radius: var(--radius-ctrl);
      min-height: 40px;
      padding: var(--space-xs) var(--space-sm);
    }
    input[type="search"]:focus-visible {
      outline: 2px solid var(--color-focus);
      outline-offset: 2px;
    }
    .chips { display: flex; flex-wrap: wrap; gap: var(--space-2xs); }
    .chip {
      font-family: var(--font-mono);
      font-size: 0.72rem;
      font-weight: 500;
      letter-spacing: 0.03em;
      color: var(--color-ink-2);
      background: var(--color-paper);
      border: 1px solid var(--color-rule-strong);
      border-radius: var(--radius-ctrl);
      min-height: 32px;
      padding: 0.2em 0.7em;
      cursor: pointer;
      transition: color var(--dur-short) var(--ease-out),
                  border-color var(--dur-short) var(--ease-out),
                  background-color var(--dur-short) var(--ease-out);
    }
    .chip:hover { color: var(--color-ink); border-color: var(--color-neutral); }
    .chip[aria-pressed="true"] {
      color: var(--color-accent-ink);
      background: var(--color-accent);
      border-color: var(--color-accent);
    }
    .count {
      font-size: var(--text-sm, 0.9rem);
      color: var(--color-neutral);
      margin-bottom: var(--space-sm);
      font-variant-numeric: tabular-nums;
    }

    .scroll {
      overflow-x: auto;
      border: 1px solid var(--color-rule);
      border-radius: var(--radius-code);
    }
    table {
      width: 100%;
      min-width: 44rem;
      border-collapse: collapse;
      font-size: var(--text-sm, 0.9rem);
    }
    th, td {
      text-align: left;
      vertical-align: top;
      padding: var(--space-sm) var(--space-lg);
      border-top: 1px solid var(--color-rule);
    }
    thead th {
      border-top: 0;
      font-family: var(--font-mono);
      font-size: 0.72rem;
      font-weight: 500;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--color-neutral);
      background: var(--color-paper-2);
    }
    tbody th {
      font-family: var(--font-mono);
      font-weight: 500;
      font-size: 0.8rem;
      white-space: nowrap;
    }
    tbody th a { color: var(--color-ink); text-decoration: none; }
    tbody th a:hover { color: var(--color-accent-deep); text-decoration: underline; }
    td.cat {
      font-family: var(--font-mono);
      font-size: 0.72rem;
      color: var(--color-accent-deep);
      white-space: nowrap;
    }
    td.desc { color: var(--color-ink-2); line-height: 1.5; }
    td.desc span {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      overflow: hidden;
    }
    tbody tr:hover { background: var(--color-paper-2); }
    .empty {
      padding: var(--space-xl) var(--space-lg);
      color: var(--color-neutral);
      text-align: center;
    }
  `;

  @Component.prop() query = "";
  @Component.prop() cat: Filter = "all";

  @Component.event() onSearch(e: Event) {
    this.query = (e.target as HTMLInputElement).value;
  }

  @Component.event() onChip(e: Event) {
    this.cat = ((e.currentTarget as HTMLElement).dataset.cat ?? "all") as Filter;
  }

  #filtered() {
    const q = this.query.trim().toLowerCase();
    return packages.filter((p) => {
      if (this.cat !== "all" && p.cat !== this.cat) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q);
    });
  }

  render() {
    const rows = this.#filtered();
    return html`
      <div class="controls">
        <input
          type="search"
          placeholder=${`Filter ${packages.length} packages — try "oauth", "router", "redis"…`}
          aria-label="Filter packages"
          .value=${this.query}
          @input=${this.onSearch}
        />
        <div class="chips" role="group" aria-label="Filter by ecosystem">
          ${CATEGORIES.map(
            (c) => html`<button
              class="chip"
              type="button"
              data-cat=${c.id}
              aria-pressed=${this.cat === c.id ? "true" : "false"}
              @click=${this.onChip}
            >${c.label}</button>`,
          )}
        </div>
      </div>
      <p class="count">${rows.length} of ${packages.length} packages</p>
      <div class="scroll" role="region" aria-label="All packages" tabindex="0">
        <table>
          <thead>
            <tr><th scope="col">Package</th><th scope="col">Ecosystem</th><th scope="col">What it does</th></tr>
          </thead>
          <tbody>
            ${rows.map(
              (p) => html`<tr>
                <th scope="row"><a href="https://github.com/vitalics/Youneed/tree/main/packages/${p.dir}">${p.name}</a></th>
                <td class="cat">${p.cat}</td>
                <td class="desc"><span title=${p.desc}>${p.desc}</span></td>
              </tr>`,
            )}
          </tbody>
        </table>
        ${rows.length === 0 ? html`<p class="empty">Nothing matches — clear the search or pick another ecosystem.</p>` : ""}
      </div>
    `;
  }
}
