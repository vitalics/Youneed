// Shared page components — imported by BOTH the server (bin-pages.ts, to SSR the
// declarative shadow DOM) AND the client (client.ts, to define + hydrate them in
// the browser). Defining them client-side is what upgrades the SSR'd
// <home-app>/<about-app>/<blog-app> elements into real components — which is also
// what makes them show up in the devtools Components tree.

import { Component, css, html } from "@youneed/dom";

@Component.define()
export class HomeApp extends Component("home-app") {
  static styles = css`
    a {
      font: 600 18px system-ui, sans-serif;
    }
  `;
  override render() {
    return html`<main>
      <h1>Home</h1>
      <nav><a href="/about">About →</a> · <a href="/blog">Blog</a></nav>
    </main>`;
  }
}

@Component.define()
export class AboutApp extends Component("about-app") {
  override render() {
    return html`<main><h1>About</h1><a href="/">← Home</a></main>`;
  }
}

@Component.define()
export class BlogApp extends Component("blog-app") {
  override render() {
    return html`<main>
      <h1>Blog</h1>
      <ul>
        <li>Launching youneed SSR</li>
        <li>Streaming with renderToStream</li>
      </ul>
      <a href="/">← Home</a>
    </main>`;
  }
}

@Component.define()
export class NotFoundApp extends Component("not-found-app") {
  override render() {
    return html`<main><h1>404 — Not Found</h1><a href="/">← Home</a></main>`;
  }
}

@Component.define()
export class ErrorApp extends Component("error-app") {
  override render() {
    return html`<main><h1>500 — Something broke</h1><a href="/">← Home</a></main>`;
  }
}
