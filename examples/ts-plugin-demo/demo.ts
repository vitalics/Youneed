// @youneed/ts-plugin showcase — open this file in VS Code or Zed (see README for
// the one-time editor setup) and you get, INSIDE the html`` templates:
//
//   - tag completion       — type `<` → suggests <todo-item>, <todo-app>, <status-pill>
//   - `.prop` completion    — type `<todo-item .` → suggests text, done
//   - `@event` completion   — type `<todo-item @` → suggests onToggle, onRemove, +DOM events
//   - JSDoc in the popup    — the /** … */ written on a @prop / @event declaration
//                             below shows up in the completion details panel
//   - hover (quick-info)    — hovering a .prop / @event binding shows its type +
//                             JSDoc; standard DOM events show a "standard …" + MDN note
//   - go-to-definition      — ⌘/Ctrl-click a tag / .prop / @event jumps to the
//                             component class / @Component.prop() / @Component.event()
//   - diagnostics           — wrong .prop = error squiggle, wrong @event = warning squiggle
//
// None of this needs a build step or runtime — it's all from the static source.
//
// NOTE on syntax COLORS: avoid a generic like `CustomEvent<boolean>` *inside* a
// ${…} hole — the editor's embedded-HTML grammar mistakes `<boolean>` for an HTML
// tag and mis-colors the rest of the template. (This is the editor's grammar, not
// this plugin, which treats ${…} as opaque.) Type the param without `<…>`, or
// pull the handler out into a method.
import { Component, css, html, type EventEmitter } from "@youneed/dom";
import { a11yProvider } from "@youneed/dom-provider-a11y";

/**
 * A single todo row: a checkbox, its label, and a remove button.
 * Emits `onToggle` when checked and `onRemove` when dismissed.
 *
 * @see https://example.com/docs/components/todo-item
 */
// ↑ Hovering <todo-item> shows this JSDoc, the @see link, AND a screenshot from
//   `preview/todo-item.png`. That image is REAL — `node generate-previews.mjs`
//   renders the component in headless Chromium (Playwright) and saves it; the
//   plugin auto-discovers `<previewDir>/<tag>.png` (option `previews`, on by
//   default). Use `@preview <url>` to override with an explicit image instead.
@Component.define()
class TodoItem extends Component("todo-item") {
  /** The todo's label text. */
  @Component.prop() text = "";
  /** Whether the todo is completed (reflected to the `done` attribute). */
  @Component.prop({ attribute: true }) done = false;

  /** Fired when the checkbox is toggled; detail is the new `done` value. */
  @Component.event("onToggle") toggle!: EventEmitter<boolean>; // exposed event
  /** Fired when the ✕ button is pressed and the item should be removed. */
  @Component.event({ name: "onRemove" }) removeEvt!: EventEmitter<void>; // opts form

  render() {
    return html`
      <li class=${this.done ? "done" : ""}>
        <input type="checkbox" .checked=${this.done} @change=${() => this.toggle(!this.done)} />
        <span>${this.text}</span>
        <button @click=${() => this.removeEvt()}>✕</button>
        <div>Some DIV</div>
      </li>
    `;
  }
}

/**
 * A small status pill — it animates on hover and themes its colors, and ships
 * BOTH adaptive variants, so the a11y CSS audit stays quiet.
 *
 * The provider is configured with `a11yProvider({ audit: true })`: run the live
 * preview (`node generate-previews.mjs --serve`) and open the browser console.
 * Delete either `@media` block below and the audit warns — flagging styles that
 * animate with no `prefers-reduced-motion` variant, or set colors without being
 * `color-scheme`-aware — with a link to the MDN docs.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
 */
@Component.define()
class StatusPill extends Component("status-pill", {
  providers: [a11yProvider({ audit: true })],
  styles: css`
    :host {
      color-scheme: light dark;
    }
    .pill {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 999px;
      background-color: #e6f0ff;
      color: #0b3d91;
      transition: transform 0.15s ease, background-color 0.15s ease;
    }
    .pill:hover {
      transform: translateY(-1px);
      background-color: #d0e2ff;
    }
    /* ❌ unused: '.legacy' is never referenced in this file → the dom audit's
       'unusedCss' flags it as an ERROR squiggle (remove it to clear the error). */
    .legacy {
      color: gray;
    }
    /* reduced-motion variant — drop this block and the audit flags the transition */
    @media (prefers-reduced-motion: reduce) {
      .pill {
        transition: none;
      }
    }
    /* color-scheme variant — drop this block and the audit flags the colors */
    @media (prefers-color-scheme: dark) {
      .pill {
        background-color: #14315e;
        color: #cfe0ff;
      }
    }
  `,
}) {
  /** The pill's label text. */
  @Component.prop() label = "Ready";
  render() {
    return html`<span class="pill">${this.label}</span>`;
  }
}

@Component.define()
class TodoApp extends Component("todo-app") {
  render() {
    // Bind variables (not inline string literals) inside ${…}: cleaner, and it
    // also sidesteps editor HTML-grammar quirks where a quote/`<` in a hole
    // mis-colors the rest of the template.
    const text = "Buy milk";
    const onToggle = (e: CustomEvent) => console.log(e.detail);
    const onRemove = () => console.log("removed");
    return html`
      <ul>
        <!-- a styled component from @youneed/dom-provider-a11y; .label autocompletes -->
        <status-pill .label=${"Inbox"}></status-pill>

        <!-- ✅ all valid: .text/.done are props, @onToggle/@onRemove are exposed events,
             @click is a common DOM event — no squiggles. -->
        <todo-item
          .text=${text}
          .done=${false}
          @onToggle=${onToggle}
          @onRemove=${onRemove}
          @click=${() => {}}
        ></todo-item>

        <!-- ❌ the plugin flags these in the editor (but tsc stays green — plugins
             are editor-only): -->

        <!-- error: 'txet' is not a declared prop of <todo-item> -->
        <!--<todo-item .txet=${text}></todo-item>-->

        <!-- warning: 'onTaggle' is not an exposed event of <todo-item> -->
        <!--<todo-item @onTaggle=${() => {}}></todo-item>-->
      </ul>
    `;
  }
}

