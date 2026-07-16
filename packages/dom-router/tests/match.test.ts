// Router matcher self-test. Run: pnpm --filter @youneed/dom-router test
import { registerDOM } from "@youneed/dom/register";
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import {
  createMatcher,
  createRouter,
  outlet,
  OUTLET_MARKER,
  OUTLET_SELECTOR,
  type ComponentConstructor,
} from "../src/dom-router.ts";

registerDOM();

const match = createMatcher([
  { path: "/", component: "home" },
  { path: "/users/:id", component: "user" },
  { path: "/users/:id/posts/:postId", component: "post" },
  { path: "/files/*", component: "files" },
  { path: "*", component: "not-found" },
]);

class MatcherTest extends Test({ name: "router matcher" }) {
  @Test.it("matches a static route") staticRoute() {
    expect(match("/")?.route.component).toBe("home");
  }
  @Test.it("extracts a single param") singleParam() {
    expect(match("/users/42")?.params.id).toBe("42");
  }
  @Test.it("decodes a param value") decodeParam() {
    expect(match("/users/a%20b")?.params.id).toBe("a b");
  }
  @Test.it("extracts multiple params") multipleParams() {
    const m = match("/users/7/posts/99");
    expect(m?.params.id).toBe("7");
    expect(m?.params.postId).toBe("99");
  }
  @Test.it("captures the rest with a wildcard") wildcard() {
    expect(match("/files/a/b/c.txt")?.params["*"]).toBe("a/b/c.txt");
  }
  @Test.it("parses the query string") query() {
    expect(match("/users/5?tab=orders")?.query.tab).toBe("orders");
  }
  @Test.it("strips the query off the path before matching params") stripsQuery() {
    expect(match("/users/5?tab=orders")?.params.id).toBe("5");
  }
  @Test.it("falls through to a catch-all for unknown paths") catchAll() {
    expect(match("/nope/here")?.route.component).toBe("not-found");
  }
  @Test.it("returns undefined when nothing matches (no catch-all)") noMatch() {
    const strict = createMatcher([{ path: "/", component: "home" }]);
    expect(strict("/missing")).toBeUndefined();
  }
}

// `component` accepts a component CLASS (resolved by its static tagName), not
// just a tag string. A real route component is a custom element; this structural
// stub only carries the static `tagName` the matcher reads, so it's cast to the
// expected constructor type (it's never instantiated).
class WidgetPage {
  static tagName = "widget-page";
}
const Widget = WidgetPage as unknown as ComponentConstructor;
const classMatch = createMatcher([
  { path: "/w", component: Widget },
  { path: "/s", component: "string-tag" },
]);

class ComponentResolutionTest extends Test({ name: "router component resolution" }) {
  @Test.it("resolves a string component to its own tag") stringTag() {
    expect(classMatch("/s")?.route.tag).toBe("string-tag");
  }
  @Test.it("resolves a class component to its static tagName") classTag() {
    expect(classMatch("/w")?.route.tag).toBe("widget-page");
  }
  @Test.it("preserves the original component reference") preservesRef() {
    expect(classMatch("/w")?.route.component).toBe(Widget);
  }
}

// The outlet hole: `outlet()` emits the marker; `createRouter` accepts a
// selector and mounts the matched component into that element (partial routing).
class OutletTest extends Test({ name: "router outlet" }) {
  @Test.it("outlet() emits a marker matching OUTLET_SELECTOR") marker() {
    expect(outlet()).toBe(OUTLET_MARKER);
    const host = document.createElement("div");
    host.innerHTML = outlet();
    expect(host.querySelector(OUTLET_SELECTOR)).not.toBeNull();
  }
  @Test.it("createRouter resolves a selector outlet and mounts into it") selector() {
    document.body.innerHTML = `<header>nav</header>${outlet()}<footer>foot</footer>`;
    const router = createRouter({
      outlet: OUTLET_SELECTOR,
      mode: "hash",
      routes: [{ path: "/", component: "home-x" }],
    });
    const slot = document.querySelector(OUTLET_SELECTOR)!;
    expect(slot.firstElementChild?.tagName.toLowerCase()).toBe("home-x");
    // Shell siblings around the outlet are untouched.
    expect(document.querySelector("header")?.textContent).toBe("nav");
    router.destroy();
  }
  @Test.it("throws when the selector outlet is missing") missing() {
    let msg = "";
    try {
      createRouter({ outlet: "#no-such-outlet", routes: [{ path: "/", component: "x-y" }] });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg.includes("outlet not found")).toBe(true);
  }
}

await TestApplication()
  .addTests(MatcherTest, ComponentResolutionTest, OutletTest)
  .reporter(new ConsoleReporter())
  .run();
