// shad table primitives — composable <table> parts. Each part is its own custom
// element, yet they lay out as a single grid via the CSS *table display* model:
//
//   <shad-table>
//     <shad-table-header>
//       <shad-table-row>
//         <shad-table-head>Name</shad-table-head>
//         <shad-table-head align="end">Amount</shad-table-head>
//       </shad-table-row>
//     </shad-table-header>
//     <shad-table-body>
//       <shad-table-row>
//         <shad-table-cell>Acme</shad-table-cell>
//         <shad-table-cell align="end">$120.00</shad-table-cell>
//       </shad-table-row>
//     </shad-table-body>
//   </shad-table>
//
// The trick: every part renders a `<slot>` set to `display: contents`, which
// hoists its slotted children into the part's own box tree. So a row's host is
// `display: table-row` and its slotted cells become real `table-cell` children —
// columns align across rows exactly like a native <table>.

import { Component, html, css } from "@youneed/dom";
import { tw } from "../lib/shad.ts";

@Component.define()
export class ShadTable extends Component("shad-table") {
  static styles = [
    tw,
    css`
      :host { display: block; }
      /* overflow:visible (not auto): an overflow-x:auto container forces
         overflow-y to auto too (CSS spec), which spawns phantom scrollbars and
         would clip absolutely-positioned row-action menus. Wrap in your own
         overflow-x-auto element if a wide table needs to scroll. */
      .container { position: relative; width: 100%; }
      /* A real <table> would foster-parent the <slot> out; a display:table div
         keeps the slot in place while still building a table box. */
      .table {
        display: table;
        width: 100%;
        caption-side: bottom;
        border-collapse: collapse;
        font-size: 0.875rem;
        line-height: 1.25rem;
      }
      slot { display: contents; }
    `,
  ];

  override render() {
    return html`<div class="container"><div class="table" role="table"><slot></slot></div></div>`;
  }
}

@Component.define()
export class ShadTableHeader extends Component("shad-table-header") {
  static styles = [tw, css`:host { display: table-header-group; } slot { display: contents; }`];
  override render() {
    return html`<slot></slot>`;
  }
}

@Component.define()
export class ShadTableBody extends Component("shad-table-body") {
  // The last body row drops its own border (see shad-table-row) — handled there
  // because outer-scope Tailwind preflight would otherwise win over a ::slotted
  // override here.
  static styles = [tw, css`:host { display: table-row-group; } slot { display: contents; }`];
  override render() {
    return html`<slot></slot>`;
  }
}

@Component.define()
export class ShadTableFooter extends Component("shad-table-footer") {
  static styles = [
    tw,
    css`
      :host { display: table-footer-group; background: hsl(var(--muted) / 0.5); font-weight: 500; }
      slot { display: contents; }
    `,
  ];
  override render() {
    return html`<slot></slot>`;
  }
}

@Component.define()
export class ShadTableRow extends Component("shad-table-row") {
  static styles = [
    tw,
    css`
      /* !important: outer-scope Tailwind preflight (* { border: 0 solid }) wins
         over an inner :host normal declaration, so structural box props must be
         important to survive. */
      :host {
        display: table-row;
        border-bottom: 1px solid hsl(var(--border)) !important;
        transition: background-color 0.15s ease;
      }
      /* Last BODY row drops its border (the card's edge separates it). Scoped to
         the body so header/footer rows keep theirs — self-contained so we don't
         fight the cross-shadow cascade from <shad-table-body>. */
      :host-context(shad-table-body):host(:last-child) { border-bottom: 0 !important; }
      :host(:hover) { background: hsl(var(--muted) / 0.5); }
      :host([selected]) { background: hsl(var(--muted)); }
      slot { display: contents; }
    `,
  ];

  // Reflected so [data-state=selected]-style hover/selection works from outside.
  @Component.prop({ attribute: true, reflect: true }) selected = false;

  override render() {
    return html`<slot></slot>`;
  }
}

@Component.define()
export class ShadTableHead extends Component("shad-table-head") {
  static styles = [
    tw,
    css`
      /* !important on padding: outer-scope Tailwind preflight zeroes it otherwise. */
      :host {
        display: table-cell;
        height: 2.5rem;
        padding: 0 0.5rem !important;
        text-align: start;
        vertical-align: middle;
        font-weight: 500;
        white-space: nowrap;
        color: hsl(var(--foreground));
      }
      :host([align="end"]) { text-align: end; }
      :host([align="center"]) { text-align: center; }
      slot { display: contents; }
    `,
  ];
  @Component.prop({ attribute: true, reflect: true }) align: "start" | "center" | "end" = "start";
  override render() {
    return html`<slot></slot>`;
  }
}

@Component.define()
export class ShadTableCell extends Component("shad-table-cell") {
  static styles = [
    tw,
    css`
      /* !important on padding: outer-scope Tailwind preflight zeroes it otherwise. */
      :host {
        display: table-cell;
        padding: 0.5rem !important;
        vertical-align: middle;
        white-space: nowrap;
      }
      :host([align="end"]) { text-align: end; }
      :host([align="center"]) { text-align: center; }
      slot { display: contents; }
    `,
  ];
  @Component.prop({ attribute: true, reflect: true }) align: "start" | "center" | "end" = "start";
  override render() {
    return html`<slot></slot>`;
  }
}

@Component.define()
export class ShadTableCaption extends Component("shad-table-caption") {
  static styles = [
    tw,
    css`:host { display: table-caption; margin-top: 1rem !important; color: hsl(var(--muted-foreground)); font-size: 0.875rem; } slot { display: contents; }`,
  ];
  override render() {
    return html`<slot></slot>`;
  }
}
