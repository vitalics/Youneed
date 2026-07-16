import { Component, html, css } from "@youneed/dom";

export interface User {
  id: string;
  name: string;
  visits: number;
}

@Component.define()
export class UserView extends Component("user-view", {
  styles: css`
    :host { display:block; font-family: system-ui, sans-serif; max-width: 420px; }
    h1 { margin: 0 0 12px; }
    input { font: 14px system-ui; padding: 6px 8px; border:1px solid #cbd5e1; border-radius:6px; }
    button { font: 600 14px system-ui; padding: 6px 14px; border:none; border-radius:6px;
             background:#4f46e5; color:#fff; cursor:pointer; }
    a { color:#4f46e5; }
    .meta { color:#64748b; font: 13px ui-monospace, Menlo, monospace; }
  `,
}) {
  // Props arrive from the server (SSR) and are re-applied on the client by
  // hydrate() — same component, same data, no refetch.
  @Component.prop() user!: User;

  render() {
    return html`
      <h1>👤 ${this.user.name}</h1>
      <p class="meta">id ${this.user.id} · ${this.user.visits} visits</p>
      <form method="POST" action="/users/${this.user.id}">
        <input name="name" value=${this.user.name} aria-label="name" />
        <button>Rename</button>
      </form>
      <p><a href="/users/${this.user.id}/stats">stats JSON →</a> · <a href="/users/1">user 1</a> · <a href="/users/2">user 2</a></p>
    `;
  }
}
