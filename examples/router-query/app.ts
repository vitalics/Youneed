// Query router demo: the route lives in a query param (?page=/users/1). Links use
// logical paths ("/users/1"); the router intercepts the clicks and rewrites the
// URL to ?page=… — no reload. Pages get route `params`/`query` as reactive props.

import { Component, html, css, repeat, type OnMount } from "@youneed/dom";
import { createRouter, type Router } from "@youneed/dom-router";

const pageStyles = css`
  :host { display: block; padding: 16px; border: 1px solid #d4d4d8; border-radius: 10px; font-family: system-ui, sans-serif; }
  h2 { margin: 0 0 8px; }
  a { color: #4f46e5; cursor: pointer; }
  .kv { font: 13px ui-monospace, Menlo, monospace; color: #52525b; }
`;

@Component.define()
class HomePage extends Component("home-page", { styles: pageStyles }) {
  render() {
    return html`
      <h2>🏠 Home</h2>
      <p>Each link rewrites <code>?page=…</code> — no reload.</p>
      <ul>
        ${repeat(
          [1, 2, 3],
          (id) => id,
          (id) => html`<li><a href="/users/${id}">User ${id}</a></li>`,
        )}
      </ul>
      <p><a href="/files/docs/readme.md">A nested file path →</a></p>
    `;
  }
}

@Component.define()
class UserPage extends Component("user-page", { styles: pageStyles }) {
  @Component.prop() params: Record<string, string> = {};
  @Component.prop() query: Record<string, string> = {};
  render() {
    return html`
      <h2>👤 User ${this.params.id}</h2>
      <div class="kv">params: ${JSON.stringify(this.params)} · query: ${JSON.stringify(this.query)}</div>
      <p>
        <a href="/users/${String(Number(this.params.id) + 1)}">next user →</a> · <a href="/">home</a>
      </p>
    `;
  }
}

@Component.define()
class FilesPage extends Component("files-page", { styles: pageStyles }) {
  @Component.prop() params: Record<string, string> = {};
  render() {
    return html`<h2>📁 Files</h2><div class="kv">wildcard path: ${this.params["*"] ?? ""}</div><p><a href="/">home</a></p>`;
  }
}

@Component.define()
class NotFound extends Component("not-found", { styles: pageStyles }) {
  @Component.prop() params: Record<string, string> = {};
  render() {
    return html`<h2>404</h2><p>no route for “${this.params["*"] ?? ""}”. <a href="/">home</a></p>`;
  }
}

@Component.define()
class RouterApp extends Component("router-app") implements OnMount {
  #router?: Router;
  onMount() {
    const outlet = this.shadowRoot!.querySelector("#outlet")!;
    this.#router = createRouter({
      outlet,
      mode: "query", // ?page=/users/1
      // Pass the component CLASS — type-checked + refactor-safe, and the router
      // registers it for you. (A tag string like "home-page" still works too.)
      routes: [
        { path: "/", component: HomePage },
        { path: "/users/:id", component: UserPage },
        { path: "/files/*", component: FilesPage },
        { path: "*", component: NotFound },
      ],
    });
    this.onCleanup(() => this.#router?.destroy());
  }
  render() {
    return html`
      <nav style="margin-bottom:14px;font-family:system-ui">
        <a href="/">Home</a> · <a href="/users/1">User 1</a> · <a href="/files/docs/readme.md">Files</a> ·
        <a href="/nope">Broken link</a>
      </nav>
      <div id="outlet"></div>
    `;
  }
}
