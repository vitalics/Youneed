// Component composition via of(): a component can return ANOTHER component
// (with typed props) — in a hole, as a list item, or as its whole render().

import { Component, html, css } from "@youneed/dom";

// A small presentational component — the reusable building block.
@Component.define()
class Pill extends Component("x-pill", {
  styles: css`
    :host { display:inline-block; }
    b { background:#eef2ff; color:#4338ca; border-radius:999px; padding:2px 10px;
        font:600 13px system-ui; }
  `,
}) {
  @Component.prop() label = "";
  @Component.prop() tone = "#4338ca";
  render() {
    return html`<b style="color:${this.tone}">${this.label}</b>`;
  }
}

// 1) Component IN A HOLE: ${Pill.of({…})} — typed props, no string tag.
@Component.define()
class TagRow extends Component("x-tagrow", {
  styles: css`:host{display:flex;gap:8px;align-items:center} span{color:#64748b;font:13px system-ui}`,
}) {
  @Component.prop() tags: string[] = ["new", "hot", "sale"];
  render() {
    return html`
      <span>in a hole →</span>
      ${this.tags.map((t) => Pill.of({ label: t }))}
    `;
  }
}

// 2) render() RETURNS A COMPONENT — full delegation (like a typed alias/wrapper).
@Component.define()
class StatusPill extends Component("x-status") {
  @Component.prop() ok = true;
  render() {
    return Pill.of({ label: this.ok ? "online" : "offline", tone: this.ok ? "#16a34a" : "#dc2626" });
  }
}

// 3) LIST of component instances via .map (repeat() is for TemplateResults).
@Component.define()
class PillList extends Component("x-pilllist", {
  styles: css`:host{display:flex;gap:6px;flex-wrap:wrap}`,
}) {
  @Component.prop() items: { id: number; name: string }[] = [];
  render() {
    return html`${this.items.map((i) => Pill.of({ label: i.name }))}`;
  }
}

@Component.define()
class ComposeRoot extends Component("compose-root", {
  styles: css`
    :host { display:block; font-family:system-ui; max-width:640px; }
    section { margin:14px 0; }
    h2 { font-size:14px; color:#334155; margin:0 0 6px; }
    button { font:600 13px system-ui; padding:5px 12px; border:1px solid #cbd5e1;
             border-radius:6px; background:#fff; cursor:pointer; }
  `,
}) {
  @Component.prop() ok = true;
  @Component.prop() people = [
    { id: 1, name: "Ada" },
    { id: 2, name: "Grace" },
  ];

  @Component.event() toggle() { this.ok = !this.ok; }
  @Component.event() add() {
    this.people = [...this.people, { id: Date.now(), name: "User " + (this.people.length + 1) }];
  }

  render() {
    return html`
      <section><h2>1 · component in a hole</h2><x-tagrow></x-tagrow></section>
      <section>
        <h2>2 · render() returns a component</h2>
        <x-status .ok=${this.ok}></x-status>
        <button @click=${this.toggle}>toggle</button>
      </section>
      <section>
        <h2>3 · list of components</h2>
        <x-pilllist .items=${this.people}></x-pilllist>
        <button @click=${this.add}>add</button>
      </section>
    `;
  }
}
