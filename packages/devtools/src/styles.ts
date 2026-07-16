// styles.ts — the Styles plugin (Chrome-DevTools-style), rendered with
// @youneed/dom itself. Reads the selected component's live adoptedStyleSheets and
// lets you toggle individual declarations or whole rules; edits mutate the real
// stylesheet so the page updates instantly. Disabled declarations are remembered
// (keyed by the live CSSRule) and render struck-through. Dead rules are flagged.
//
// `static devtools = false` keeps this component out of the tree it inspects.

import { Component, classMap, css, html, ref } from "@youneed/dom";
import { componentPlugin, type DevtoolsContext, type DevtoolsPanel, type StyleRule } from "./core.ts";

interface Decl {
  prop: string;
  value: string;
}

const declList = new WeakMap<CSSStyleRule, Decl[]>();
const disabledProps = new WeakMap<CSSRule, Set<string>>();

function authoredDecls(rule: CSSStyleRule): Decl[] {
  let list = declList.get(rule);
  if (!list) {
    list = [];
    const text = rule.cssText;
    const body = text.slice(text.indexOf("{") + 1, text.lastIndexOf("}"));
    for (const part of body.split(";")) {
      const i = part.indexOf(":");
      if (i < 0) continue;
      const prop = part.slice(0, i).trim();
      const value = part.slice(i + 1).trim();
      if (prop) list.push({ prop, value });
    }
    declList.set(rule, list);
  }
  return list;
}

function disabledOf(rule: CSSRule): Set<string> {
  let s = disabledProps.get(rule);
  if (!s) disabledProps.set(rule, (s = new Set()));
  return s;
}

function toggleDecl(rule: CSSStyleRule, decl: Decl): void {
  const dis = disabledOf(rule);
  if (dis.has(decl.prop)) {
    rule.style.setProperty(decl.prop, decl.value);
    dis.delete(decl.prop);
  } else {
    rule.style.removeProperty(decl.prop);
    dis.add(decl.prop);
  }
}

/** Add or update a declaration on a live rule (Chrome-DevTools-style editing).
 *  An empty value removes the property. A trailing `!important` is honoured. The
 *  cached authored-decls list is updated in place so the panel re-renders it. */
function setDecl(rule: CSSStyleRule, rawProp: string, rawValue: string): void {
  const prop = rawProp.trim();
  if (!prop) return;
  const list = authoredDecls(rule);
  const dis = disabledOf(rule);
  let value = rawValue.trim();
  if (!value) {
    rule.style.removeProperty(prop);
    const i = list.findIndex((d) => d.prop === prop);
    if (i >= 0) list.splice(i, 1);
    dis.delete(prop);
    return;
  }
  let priority = "";
  const bang = value.match(/!\s*important\s*$/i);
  if (bang) {
    priority = "important";
    value = value.slice(0, bang.index).trim();
  }
  rule.style.setProperty(prop, value, priority);
  dis.delete(prop); // (re)adding a prop enables it
  const display = priority ? `${value} !important` : value;
  const existing = list.find((d) => d.prop === prop);
  if (existing) existing.value = display;
  else list.push({ prop, value: display });
}

function toggleRule(rule: CSSStyleRule): void {
  const decls = authoredDecls(rule);
  const dis = disabledOf(rule);
  const anyOn = decls.some((d) => !dis.has(d.prop));
  for (const d of decls) {
    if (anyOn && !dis.has(d.prop)) {
      rule.style.removeProperty(d.prop);
      dis.add(d.prop);
    } else if (!anyOn && dis.has(d.prop)) {
      rule.style.setProperty(d.prop, d.value);
      dis.delete(d.prop);
    }
  }
}

/** Does `selector` match the host or a shadow descendant? (dead-CSS detection) */
function selectorApplies(host: Element, selector: string): boolean {
  const sr = (host as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
  for (const raw of selector.split(",")) {
    const group = raw.trim();
    try {
      if (group === ":host") return true;
      const m = group.match(/^:host\((.+)\)$/);
      if (m) {
        if (host.matches(m[1])) return true;
        continue;
      }
      const inner = group.startsWith(":host ") ? group.slice(6) : group;
      if (sr?.querySelector(inner.replace(/::[\w-]+$/, ""))) return true;
    } catch {
      return true;
    }
  }
  return false;
}

/** True if EVERY selector group targets the host itself (`:host` / `:host(...)`).
 *  Then all its declarations style the same element (the host), so the cascade
 *  winner per property can be resolved by adoption order. */
function isHostRule(selector: string): boolean {
  return selector.split(",").every((g) => {
    const s = g.trim();
    return s === ":host" || /^:host\([^)]*\)$/.test(s);
  });
}

/** For the host element, the winning rule per property among host-targeting
 *  rules (later adoption wins — equal specificity). Declarations of the same
 *  property on earlier rules are "overridden": present, matching, but not in
 *  effect. Only host rules are resolved (descendant selectors may target many
 *  elements, so we don't claim a winner there). */
function hostWinners(host: Element, rules: CSSStyleRule[]): Map<string, CSSStyleRule> {
  const won = new Map<string, CSSStyleRule>();
  for (const rule of rules) {
    if (!isHostRule(rule.selectorText) || !selectorApplies(host, rule.selectorText)) continue;
    const dis = disabledOf(rule);
    for (const d of authoredDecls(rule)) if (!dis.has(d.prop)) won.set(d.prop, rule);
  }
  return won;
}

// Lazily defined (see time-travel.ts): keeps importing @youneed/devtools free of
// a DOM requirement (Component()/css need one).
let StylesView: ReturnType<typeof defineStylesView> | undefined;

function defineStylesView() {
  return class StylesViewImpl extends Component("dt-styles") {
  static devtools = false;
  static styles = css`
    :host { display: block; padding: 6px 10px; color: #d4d4d8; font: 12px/1.5 ui-monospace, Menlo, monospace; }
    .bar { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
    .bar button { background: #131316; color: #e4e4e7; border: 1px solid #3a3a40; border-radius: 4px; cursor: pointer; font: inherit; padding: 1px 9px; }
    .bar button:disabled { opacity: .35; cursor: default; }
    .bar button.on { background: #3730a3; border-color: #6366f1; color: #fff; }
    .section { margin: 4px 0; color: #a1a1aa; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; font-size: 10px; }
    .cssck { width: 11px; height: 11px; margin: 0 4px 0 0; vertical-align: middle; accent-color: #6366f1; cursor: pointer; }
    .csshead { display: flex; align-items: baseline; gap: 2px; margin-top: 6px; }
    .csshead .sel { color: #93c5fd; white-space: pre-wrap; word-break: break-word; }
    .csshead.dead .sel { opacity: .5; text-decoration: line-through; }
    .csshead .deadtag { margin-left: 6px; color: #f87171; font-size: 10px; }
    .decl { display: flex; align-items: baseline; gap: 2px; padding-left: 16px; cursor: pointer; }
    .decl .prop { color: #f0abfc; }
    .decl .val { color: #a5f3fc; }
    .decl.off { opacity: .45; text-decoration: line-through; }
    .decl.over { opacity: .6; }
    .decl.over .prop, .decl.over .val { text-decoration: line-through; }
    .decl .overtag { margin-left: 6px; color: #fbbf24; font-size: 10px; }
    .decl .val, .decl .prop { cursor: text; }
    .csshead .sel { cursor: text; }
    .editin { background: #18181b; color: #a5f3fc; border: 1px solid #6366f1; border-radius: 3px;
              font: inherit; padding: 0 3px; min-width: 60px; }
    .addrow { padding-left: 16px; }
    .addrow input { background: #131316; color: #f0abfc; border: 1px dashed #3a3a40; border-radius: 3px;
                    font: inherit; padding: 0 4px; width: 180px; }
    .addrow input:focus { border-color: #6366f1; outline: none; }
    .newrule { margin-top: 8px; background: #131316; color: #e4e4e7; border: 1px solid #3a3a40;
               border-radius: 4px; cursor: pointer; font: inherit; padding: 2px 10px; }
    .newrule:hover { background: #27272a; }
    .cssfoot { color: #93c5fd; }
    .rule { display: flex; gap: 6px; padding: 1px 0; align-items: baseline; }
    .rule .mark { width: 12px; flex: none; text-align: center; }
    .rule.on .mark { color: #4ade80; }
    .rule.off { opacity: .5; }
    .rule.off .mark { color: #f87171; }
    .rule.off .sel { text-decoration: line-through; }
    .muted { color: #71717a; }
  `;

  @Component.prop() ctx?: DevtoolsContext;
  #highlight = false; // keep the selected element outlined on the page
  #cleanup: Array<() => void> = [];
  // The declaration field being edited inline (Chrome-style), or null. `field`
  // distinguishes renaming the property from editing its value.
  #editing: { rule: CSSStyleRule; prop: string; field: "prop" | "value" } | null = null;
  // The rule whose SELECTOR is being edited inline, or null.
  #editingSel: CSSStyleRule | null = null;

  onMount(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.#cleanup.push(ctx.subscribe(() => (this.requestUpdate(), this.#paintHighlight())));
    this.#cleanup.push(ctx.onSelect(() => (this.requestUpdate(), this.#paintHighlight())));
    // Keep the overlay glued to the element as the page scrolls / resizes.
    const refresh = () => this.#paintHighlight();
    this.listen(window, "scroll", refresh, { passive: true, capture: true });
    this.listen(window, "resize", refresh);
  }

  onUnmount(): void {
    for (const fn of this.#cleanup) fn();
    this.#cleanup = [];
    this.ctx?.highlight(undefined); // drop the overlay when the tab closes
  }

  /** Draw (or clear) the on-page overlay for the current selection. */
  #paintHighlight(): void {
    this.ctx?.highlight(this.#highlight ? this.ctx.current() : undefined);
  }

  /** Toggle the persistent highlight; scroll the element into view when turning on. */
  #toggleHighlight(): void {
    this.#highlight = !this.#highlight;
    if (this.#highlight) {
      (this.ctx?.current()?.elRef?.deref() as Element | undefined)?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    }
    this.#paintHighlight();
    this.requestUpdate();
  }

  #isEditing(rule: CSSStyleRule, prop: string, field: "prop" | "value"): boolean {
    return this.#editing?.rule === rule && this.#editing.prop === prop && this.#editing.field === field;
  }

  #startEdit(rule: CSSStyleRule, prop: string, field: "prop" | "value"): void {
    this.#editing = { rule, prop, field };
    this.#editingSel = null;
    this.requestUpdate();
  }

  /** Commit an inline value edit (empty value removes the declaration). */
  #commitEdit(rule: CSSStyleRule, prop: string, value: string): void {
    setDecl(rule, prop, value);
    this.#editing = null;
    this.requestUpdate();
    this.#paintHighlight(); // an edit can resize the element
  }

  /** Commit a property RENAME — move the value from `oldProp` to `newProp`
   *  (empty new name removes it). Keeps the declaration's position semantics. */
  #commitRename(rule: CSSStyleRule, oldProp: string, newProp: string): void {
    const value = authoredDecls(rule).find((d) => d.prop === oldProp)?.value ?? "";
    setDecl(rule, oldProp, ""); // remove the old property
    if (newProp.trim()) setDecl(rule, newProp, value);
    this.#editing = null;
    this.requestUpdate();
    this.#paintHighlight();
  }

  #startSelEdit(rule: CSSStyleRule): void {
    this.#editingSel = rule;
    this.#editing = null;
    this.requestUpdate();
  }

  /** Commit a selector edit. An invalid selector is rejected (kept as-is). */
  #commitSelector(rule: CSSStyleRule, text: string): void {
    const next = text.trim();
    try {
      if (next && next !== rule.selectorText) rule.selectorText = next;
    } catch {
      /* invalid selector — ignore, keep the old one */
    }
    this.#editingSel = null;
    this.requestUpdate();
    this.#paintHighlight();
  }

  /** Insert a fresh, empty `:host {}` rule into the element's styles (then fill it
   *  via its add-row) — like Chrome's "new style rule". Creates an adopted sheet
   *  if the element has none. */
  #addRule(host: Element): void {
    const sr = (host as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
    if (!sr) return;
    let sheet = sr.adoptedStyleSheets[0];
    if (!sheet) {
      sheet = new CSSStyleSheet();
      sr.adoptedStyleSheets = [...sr.adoptedStyleSheets, sheet];
    }
    sheet.insertRule(":host {}", sheet.cssRules.length);
    this.requestUpdate();
  }

  /** Add a `prop: value` declaration typed into a rule's add-row (Chrome-style). */
  #addDecl(rule: CSSStyleRule, text: string): void {
    const i = text.indexOf(":");
    if (i < 0) return; // need both a property and a value
    setDecl(rule, text.slice(0, i), text.slice(i + 1));
    this.requestUpdate();
    this.#paintHighlight();
  }

  #rule(host: Element, rule: CSSStyleRule, won: Map<string, CSSStyleRule>) {
    const decls = authoredDecls(rule);
    const dis = disabledOf(rule);
    const matched = selectorApplies(host, rule.selectorText);
    const hostRule = isHostRule(rule.selectorText);
    const ruleOn = decls.some((d) => !dis.has(d.prop));
    return html`
      <div class=${matched ? "csshead" : "csshead dead"}>
        <input
          type="checkbox"
          class="cssck"
          .checked=${ruleOn}
          @change=${() => {
            toggleRule(rule);
            this.requestUpdate();
            this.#paintHighlight(); // toggling styles can resize the element
          }}
        />
        ${this.#editingSel === rule
          ? html`<input
                class="editin sel"
                type="text"
                value=${rule.selectorText}
                ${ref((el) => (el as HTMLInputElement | null)?.focus())}
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === "Enter") this.#commitSelector(rule, (e.target as HTMLInputElement).value);
                  else if (e.key === "Escape") (this.#editingSel = null), this.requestUpdate();
                }}
                @blur=${(e: FocusEvent) => this.#commitSelector(rule, (e.target as HTMLInputElement).value)}
              /><span> {</span>`
          : html`<span class="sel" @click=${() => this.#startSelEdit(rule)}>${rule.selectorText}</span><span> {</span>`}
        ${matched ? html`` : html`<span class="deadtag">unused</span>`}
      </div>
      ${decls.map((decl) => {
        const on = !dis.has(decl.prop);
        // Present + matching, but a later host rule sets the same property →
        // it's overridden: a "possible" style that isn't actually applied.
        const overridden = on && matched && hostRule && won.has(decl.prop) && won.get(decl.prop) !== rule;
        const editingProp = this.#isEditing(rule, decl.prop, "prop");
        const editingVal = this.#isEditing(rule, decl.prop, "value");
        return html`
          <div class=${overridden ? "decl over" : on ? "decl" : "decl off"}>
            <input
              type="checkbox"
              class="cssck"
              .checked=${on}
              @change=${() => {
                toggleDecl(rule, decl);
                this.requestUpdate();
                this.#paintHighlight(); // toggling styles can resize the element
              }}
            />
            ${editingProp
              ? html`<input
                  class="editin prop"
                  type="text"
                  value=${decl.prop}
                  ${ref((el) => (el as HTMLInputElement | null)?.focus())}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === "Enter") this.#commitRename(rule, decl.prop, (e.target as HTMLInputElement).value);
                    else if (e.key === "Escape") (this.#editing = null), this.requestUpdate();
                  }}
                  @blur=${(e: FocusEvent) => this.#commitRename(rule, decl.prop, (e.target as HTMLInputElement).value)}
                />`
              : html`<span class="prop" @click=${() => this.#startEdit(rule, decl.prop, "prop")}>${decl.prop}</span>`}${editingVal
              ? html`<span>: </span><input
                    class="editin"
                    type="text"
                    value=${decl.value}
                    ${ref((el) => (el as HTMLInputElement | null)?.focus())}
                    @keydown=${(e: KeyboardEvent) => {
                      if (e.key === "Enter") this.#commitEdit(rule, decl.prop, (e.target as HTMLInputElement).value);
                      else if (e.key === "Escape") (this.#editing = null), this.requestUpdate();
                    }}
                    @blur=${(e: FocusEvent) => this.#commitEdit(rule, decl.prop, (e.target as HTMLInputElement).value)}
                  /><span>;</span>`
              : html`<span class="val" @click=${() => this.#startEdit(rule, decl.prop, "value")}>: ${decl.value};</span>`}
            ${overridden ? html`<span class="overtag">overridden</span>` : html``}
          </div>
        `;
      })}
      <div class="addrow">
        <input
          type="text"
          placeholder="+ add property (e.g. color: red)"
          @keydown=${(e: KeyboardEvent) => {
            if (e.key !== "Enter") return;
            const input = e.target as HTMLInputElement;
            this.#addDecl(rule, input.value);
            input.value = "";
          }}
        />
      </div>
      <div class="cssfoot">}</div>
    `;
  }

  override render() {
    const ctx = this.ctx;
    if (!ctx) return html``;
    const rec = ctx.current();
    if (!rec) return html`<div class="muted">select a component in the Components tab</div>`;

    const host = rec.elRef?.deref();
    const elementLive = rec.alive && !!host;
    const sheets = host
      ? [...((host as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot?.adoptedStyleSheets ?? [])]
      : null;

    const toolbar = html`
      <div class="bar">
        <button
          class=${classMap({ on: this.#highlight })}
          .disabled=${!elementLive}
          @click=${() => this.#toggleHighlight()}
          title="Highlight the selected element on the page"
        >⌖</button>
        <span class="muted">${`<${rec.tag}> #${rec.id}`}</span>
      </div>
    `;

    // Unmounted / GC'd → read-only snapshot from the recorded rules.
    if (!host || !sheets) {
      const snap = rec.styles as StyleRule[];
      return html`
        ${toolbar}
        <div class="section">styles (snapshot)</div>
        ${snap.length === 0
          ? html`<div class="muted">—</div>`
          : snap.map(
              (s) => html`
                <div class=${s.applied ? "rule on" : "rule off"}>
                  <span class="mark">${s.applied ? "✓" : "✗"}</span><span class="sel">${s.cssText}</span>
                </div>
              `,
            )}
      `;
    }

    const rules: CSSStyleRule[] = [];
    for (const sheet of sheets) {
      for (const rule of sheet.cssRules) if (rule instanceof CSSStyleRule) rules.push(rule);
    }
    const won = hostWinners(host, rules); // cascade winners, to flag overridden decls

    return html`
      ${toolbar}
      <div class="section">styles (${rules.length} rules)</div>
      ${rules.length === 0
        ? html`<div class="muted">—</div>`
        : rules.map((rule) => this.#rule(host, rule, won))}
      <button class="newrule" @click=${() => this.#addRule(host)}>+ new rule</button>
    `;
    }
  };
}

/** The Styles editor plugin (built with @youneed/dom). */
export function stylesPanel(): DevtoolsPanel {
  StylesView ??= defineStylesView();
  return componentPlugin("styles", "Styles", StylesView);
}
