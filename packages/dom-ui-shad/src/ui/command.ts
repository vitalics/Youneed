// shad <shad-command> — an inline command menu (search + filterable list with
// groups, icons and shortcuts). Data-driven via `items`; emits `select`.
//   command.items = [
//     { value: "profile", label: "Profile", icon: "👤", shortcut: "⌘P", group: "Settings" },
//     …
//   ];
// Keyboard: type to filter, ↑/↓ to move, Enter to run, Esc to clear.

import { Component, html, css, map, when, type TemplateResult } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

export interface CommandItem {
  value: string;
  label: string;
  group?: string;
  shortcut?: string;
  /** Leading icon — an SVG `html\`…\`` template (recommended) or an emoji/string. */
  icon?: string | TemplateResult;
}

@Component.define()
export class ShadCommand extends Component("shad-command") {
  static styles = [tw, css`:host { display: block; }`];

  @Component.prop() items: CommandItem[] = [];
  @Component.prop({ attribute: true }) placeholder = "Type a command or search…";

  #query = this.signal("");
  #active = this.signal(0);

  #filtered(): CommandItem[] {
    const q = this.#query().toLowerCase();
    return this.items.filter((i) => i.label.toLowerCase().includes(q));
  }
  #select(it: CommandItem): void {
    this.emit("select", it.value);
  }
  #onKey(e: KeyboardEvent): void {
    const f = this.#filtered();
    if (e.key === "ArrowDown") (e.preventDefault(), this.#active.set(Math.min(this.#active() + 1, f.length - 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), this.#active.set(Math.max(this.#active() - 1, 0)));
    else if (e.key === "Enter") {
      e.preventDefault();
      const it = f[this.#active()];
      if (it) this.#select(it);
    } else if (e.key === "Escape") this.#query.set("");
  }

  #row(it: CommandItem, i: number) {
    return html`<div
      role="option"
      aria-selected=${String(i === this.#active())}
      class=${"flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm" + (i === this.#active() ? " bg-accent text-accent-foreground" : "")}
      @click=${() => this.#select(it)}
      @pointerenter=${() => this.#active.set(i)}
    >
      ${when(it.icon, () => html`<span class="flex shrink-0 items-center [&>svg]:h-4 [&>svg]:w-4">${it.icon}</span>`)}
      <span class="flex-1">${it.label}</span>
      ${when(it.shortcut, () => html`<span class="ml-auto text-xs tracking-widest text-muted-foreground">${it.shortcut}</span>`)}
    </div>`;
  }

  override render() {
    const filtered = this.#filtered();
    const grouped = this.items.some((i) => i.group);
    return html`
      <div class="overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground">
        <div class="flex items-center gap-2 border-b border-border px-3">
          <svg class="h-4 w-4 shrink-0 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
          <input
            class="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder=${this.placeholder}
            .value=${this.#query()}
            @input=${(e: Event) => (this.#query.set((e.target as HTMLInputElement).value), this.#active.set(0))}
            @keydown=${(e: KeyboardEvent) => this.#onKey(e)}
          />
        </div>
        <div class="max-h-80 overflow-auto p-1">
          ${filtered.length === 0
            ? html`<div class="py-6 text-center text-sm text-muted-foreground">No results found.</div>`
            : grouped
              ? this.#groups(filtered)
              : map(filtered, (it, i) => this.#row(it, i))}
        </div>
      </div>
    `;
  }

  #groups(filtered: CommandItem[]) {
    const names = [...new Set(filtered.map((i) => i.group ?? ""))];
    return map(
      names,
      (g, gi) => html`
        ${when(gi > 0, () => html`<div class="-mx-1 my-1 h-px bg-border"></div>`)}
        ${when(g, () => html`<div class="px-2 py-1.5 text-xs font-medium text-muted-foreground">${g}</div>`)}
        ${map(
          filtered.filter((i) => (i.group ?? "") === g),
          (it) => this.#row(it, filtered.indexOf(it)),
        )}
      `,
    );
  }
}
