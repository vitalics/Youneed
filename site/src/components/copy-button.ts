// <yn-copy> — the site's copy-to-clipboard control, as a @youneed/dom component.
// The payload comes from the `text` attribute, or (preferred on code figures)
// from the nearest figure/install wrapper's <pre>/<code> text, so the code is
// never duplicated into an attribute.
import { Component, html, css, type OnMount } from "@youneed/dom";

@Component.define()
export class CopyButton extends Component("yn-copy") implements OnMount {
  static styles = css`
    :host { display: inline-flex; }
    button {
      font-family: var(--font-mono);
      font-size: 0.72rem;
      font-weight: 500;
      letter-spacing: 0.04em;
      color: var(--color-code-muted);
      background: var(--color-graphite-2);
      border: 1px solid var(--color-graphite-rule);
      border-radius: var(--radius-ctrl);
      min-height: 30px;
      padding: 0.2em 0.6em;
      cursor: pointer;
      transition: color var(--dur-short) var(--ease-out), border-color var(--dur-short) var(--ease-out);
    }
    button:hover { color: var(--color-code-str); border-color: var(--color-code-muted); }
    :host([copied]) button { color: var(--color-code-accent); border-color: var(--color-code-accent); }
  `;

  @Component.prop() label = "Copy";
  @Component.prop() copied = false;

  #text = "";

  onMount(): void {
    this.#text = this.getAttribute("text") ?? "";
    const label = this.getAttribute("label");
    if (label) this.label = label;
  }

  /** The clipboard payload: explicit `text` attr, else the nearest code block. */
  #payload(): string {
    if (this.#text) return this.#text;
    const scope = this.closest(".code-fig__wrap, .install, .install-line");
    const code = scope?.querySelector("pre, code");
    // strip a leading shell prompt ("$ ") from install lines
    return (code?.textContent?.trim() ?? "").replace(/^\$\s+/, "");
  }

  @Component.event() async copy() {
    try {
      await navigator.clipboard.writeText(this.#payload());
      this.copied = true;
      this.setAttribute("copied", "");
      setTimeout(() => {
        this.copied = false;
        this.removeAttribute("copied");
      }, 2000);
    } catch {
      /* clipboard unavailable — the code stays selectable */
    }
  }

  render() {
    return html`<button type="button" aria-label="Copy to clipboard" @click=${this.copy}>
      ${this.copied ? "Copied ✓" : this.label}
    </button>`;
  }
}
