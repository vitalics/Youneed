// <docs-view name="Outline"> — one example "view", shadcn style: a tall
// rectangular preview area that frames the slotted demo, plus an expandable
// code block underneath. The code IS the example's own slotted markup (its
// light DOM), normalized — no second source to keep in sync.

import { Component, html, css, when } from "@youneed/dom";
import { tw } from "@youneed/dom-ui-shad";
import { highlight, tokenStyles } from "./highlight.ts";

/** Normalize slotted markup for display: drop framework binding comments, strip
 *  blank edge lines, and dedent to the shallowest line. */
function formatMarkup(raw: string): string {
  const lines = raw
    .replace(/<!--[\s\S]*?-->/g, "") // binding markers the runtime injects
    .replace(/\r/g, "")
    .split("\n");
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (lines.length === 0) return "";
  const indent = Math.min(
    ...lines.filter((l) => l.trim()).map((l) => /^ */.exec(l)![0].length),
  );
  return lines.map((l) => l.slice(indent)).join("\n").trim();
}

@Component.define()
export class DocsView extends Component("docs-view") {
  static styles = [
    tw,
    css`
      :host { display: block; --line: hsl(var(--border)); }
      /* In dark mode the default border is nearly invisible against the
         near-black page, so the "view" doesn't read as a separate surface.
         Brighten the frame/divider lines and lift the preview onto its own
         slightly-elevated background. */
      :host-context(.dark) { --line: hsl(240 5% 24%); }
      :host-context(.dark) .preview { background-color: hsl(240 6% 10%); }
      .frame { border-color: var(--line); }
      .divider { border-color: var(--line); }
      /* Faint dotted backdrop on the preview, like shadcn. */
      .preview {
        background-image: radial-gradient(hsl(var(--border)) 1px, transparent 1px);
        background-size: 16px 16px;
      }
    `,
    tokenStyles,
  ];

  @Component.prop({ attribute: true }) name = "";
  // Explicit source override — for examples configured via JS props (e.g.
  // <shad-breadcrumb .items=…>) whose markup wouldn't appear in the slotted DOM.
  @Component.prop() code = "";
  expanded = this.signal(false);
  copied = this.signal(false);

  // Copy the example source to the clipboard, with a brief "copied" state.
  #copy(text: string): void {
    void navigator.clipboard?.writeText(text);
    this.copied.set(true);
    setTimeout(() => {
      if (!this.abortSignal.aborted) this.copied.set(false);
    }, 1400);
  }

  override render() {
    const code = this.code || formatMarkup(this.innerHTML);
    // Short snippets show in full; only longer ones get the collapse + toggle.
    const collapsible = code.split("\n").length > 4;
    const collapsed = collapsible && !this.expanded();
    return html`
      ${when(
        this.name,
        () => html`<h3 class="mb-2 text-sm font-medium text-muted-foreground">${this.name}</h3>`,
      )}
      <div class="frame group rounded-xl border">
        <div class=${"preview flex min-h-[280px] items-center justify-center p-10 " + (code ? "rounded-t-xl" : "rounded-xl")}>
          <slot></slot>
        </div>
        ${when(
          code,
          () => html`
            <div class="divider relative overflow-hidden rounded-b-xl border-t bg-muted">
              <button
                class="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground opacity-0 shadow-sm transition-all hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                title="Copy code"
                aria-label="Copy code"
                @click=${() => this.#copy(code)}
              >
                ${this.copied()
                  ? html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><path d="M20 6 9 17l-5-5"></path></svg>`
                  : html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`}
              </button>
              <pre
                class=${"overflow-auto p-4 text-sm leading-relaxed " +
                (collapsed ? "max-h-[104px]" : "")}
              ><code>${highlight(code)}</code></pre>
              ${when(
                collapsible,
                () => html`<div
                  class=${collapsed
                    ? "pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-3 pt-10"
                    : "divider flex justify-center border-t p-2"}
                  style=${collapsed
                    ? "background:linear-gradient(to top, hsl(var(--muted)) 35%, transparent)"
                    : ""}
                >
                  <button
                    class="pointer-events-auto rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                    @click=${() => this.expanded.update((v) => !v)}
                  >
                    ${this.expanded() ? "Hide Code" : "View Code"}
                  </button>
                </div>`,
              )}
            </div>
          `,
        )}
      </div>
    `;
  }
}
