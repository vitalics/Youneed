// Route matching speed: our createMatcher vs regexparam (a popular path matcher).
// Run: pnpm --filter @youneed/dom-router bench
import { parse } from "regexparam";
import { createMatcher, type RouteDef } from "../src/dom-router.ts";
import { bench, report } from "../../bench-util.mjs";

const routes: RouteDef[] = [
  { path: "/", component: "home" },
  { path: "/about", component: "about" },
  { path: "/users/:id", component: "user" },
  { path: "/users/:id/posts/:postId", component: "post" },
  { path: "/files/*", component: "files" },
  { path: "*", component: "not-found" },
];

// Representative request mix exercised each iteration.
const paths = ["/", "/about", "/users/42", "/users/7/posts/99", "/files/a/b/c.txt", "/missing/page"];

// Our matcher.
const ours = createMatcher(routes);

// Equivalent matcher built on regexparam.
const rx = routes.map((r) => {
  if (r.path === "*") return { component: r.component, keys: ["*"], pattern: /^.*$/ };
  const { keys, pattern } = parse(r.path);
  return { component: r.component, keys, pattern };
});
function rxMatch(path: string) {
  for (const r of rx) {
    const m = r.pattern.exec(path);
    if (m) {
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1] ?? "")));
      return { component: r.component, params };
    }
  }
  return undefined;
}

const matchAll = (fn: (p: string) => unknown) => () => {
  for (const p of paths) fn(p);
};

report("router — match a 6-path request mix against a 6-route table", [
  bench("@youneed/dom-router", matchAll(ours), { batch: 1000 }),
  bench("regexparam", matchAll(rxMatch), { batch: 1000 }),
]);
