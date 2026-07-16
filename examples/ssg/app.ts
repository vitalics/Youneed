// Isomorphic component — rendered to HTML on the server (SSG) and hydrated on
// the client. Importing this module registers <counter-app>, so the SSR'd
// element upgrades and becomes interactive once the client bundle loads.

import { Component, html, css } from "@youneed/dom";

@Component.define()
export class CounterApp extends Component("counter-app") {
  static styles = css`
    :host {
      display: block;
      max-width: 28rem;
      margin: 3rem auto;
      padding: 1.5rem 2rem;
      border-radius: 12px;
      background: #fff;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.08);
      font-family: system-ui, -apple-system, sans-serif;
      color: #1b1b1f;
    }
    h1 {
      margin: 0 0 0.5rem;
      font-size: 1.4rem;
    }
    p {
      color: #555;
    }
    button {
      font-size: 1rem;
      padding: 0.5rem 1rem;
      border: 0;
      border-radius: 8px;
      background: #6750a4;
      color: #fff;
      cursor: pointer;
    }
    .count {
      font-variant-numeric: tabular-nums;
      font-weight: 700;
    }
  `;

  @Component.prop()
  count = 0;

  @Component.event()
  inc() {
    this.count++;
  }

  render() {
    return html`
      <h1>SSG + hydration demo</h1>
      <p>
        This markup was server-rendered (Declarative Shadow DOM); the client
        bundle hydrated it so the button works.
      </p>
      <p>count: <span class="count">${this.count}</span></p>
      <button @click=${this.inc}>increment</button>
    `;
  }
}
