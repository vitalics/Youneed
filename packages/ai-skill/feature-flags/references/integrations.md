# Feature-flags integrations — server / dom / ssr / cli / test

Each integration derives an `EvaluationContext` from its surface and exposes a scoped
`this.flags` (or equivalent). All share one engine you pass in, so an override made anywhere
is visible everywhere in the run.

## Server — `@youneed/server-plugin-feature-flags`

Request-scoped `this.flags` (context from the in-flight request) + control/bootstrap routes
+ devtools tab.

```ts
import { createFlags, featureFlags, flagsProvider } from "@youneed/server-plugin-feature-flags";

const flags = createFlags([{ key: "new-checkout", defaultValue: false, rollout: 20 }]);
const ctxOf = (ctx: Context) => ({ targetingKey: ctx.state.user?.id, attributes: { plan: ctx.state.user?.plan } });

class CheckoutController extends Controller("/checkout", { providers: [flagsProvider(flags, { context: ctxOf })] }) {
  @Controller.get() index() {
    if (this.flags.isEnabled("new-checkout")) return { ui: "v2" };
    return { ui: "v1", variant: this.flags.variant("pricing") };
  }
}
Application(CheckoutController).plugin(featureFlags(flags)).listen(3000);
```
`flagsProvider(engine, { context })` gives request-scoped `this.flags`; the `featureFlags(engine)`
plugin adds control + client-bootstrap routes, dev override toggles, and the devtools tab.

## DOM — `@youneed/dom-provider-feature-flags`

Evaluate in a template; re-render on flag change (override / source reload).

```ts
import { provideFlags, flags, flagged, featureFlagsProvider } from "@youneed/dom-provider-feature-flags";

provideFlags(createFlags([{ key: "new-dashboard", defaultValue: false }]));

// app-wide functional form; opt into reactivity per component:
class Dashboard extends Component() {
  constructor() { super(); flagged(this); }               // re-render on every flag change
  render() { return when(flags().isEnabled("new-dashboard"), () => html`<new-ui></new-ui>`); }
}

// scoped provider (recommended) — this.flags against the provider's context, auto re-render:
class Card extends Component("x-card", { providers: [featureFlagsProvider(engine, { context: () => ({ targetingKey: uid }) })] }) {
  render() { return when(this.flags.isEnabled("new-dashboard"), () => html`<new-ui></new-ui>`); }
}
```
`flags()` returns the app-wide engine; `flagged(this)` subscribes + `requestUpdate()` on
change (auto-unsubscribes on disconnect). `featureFlagsProvider` bundles both.

## SSR — `@youneed/ssr-plugin-feature-flags`

An SSR module for `@youneed/server-plugin-ssr`. Server-evaluates per request and injects the
snapshot into `<head>` so the client hydrates identical values (no defs shipped, no flash).

```ts
import { ssr } from "@youneed/server-plugin-ssr";
import { featureFlags } from "@youneed/ssr-plugin-feature-flags";

app.plugin(ssr({
  origin: "https://example.com",
  modules: [featureFlags(flags, { context: (req) => ({ targetingKey: req.cookies?.uid, attributes: { plan: req.plan } }) })],
}));
```
Like structured-data (and unlike robots/sitemap/rss/llms, which serve their own routes), it
embeds output in the document `<head>`.

## CLI — `@youneed/cli-plugin-feature-flags`

A `flags` command (list / inspect / override at runtime) + middleware adding `this.flags`.

```ts
import { featureFlags, flagsMiddleware } from "@youneed/cli-plugin-feature-flags";

class Deploy extends Command({ name: "deploy", middleware: [flagsMiddleware(flags)] }) {
  execute() { if (this.flags.isEnabled("beta")) console.log("beta path"); }
}
Application({ name: "ops", commands: [Deploy], plugins: [featureFlags(flags)] }).run();
```
An override from the `flags` command is visible to every command in the run (shared engine).

## Test — `@youneed/test-plugin-feature-flags`

Fresh engine per case (overrides wiped between tests → no order-dependence).

```ts
import { flagsFixture, withFlags, expectFlag } from "@youneed/test-plugin-feature-flags";

const Flags = flagsFixture([{ key: "new-checkout", defaultValue: false }]);

class Checkout extends Test() {
  @Test.use(Flags) flags!: FeatureFlags;                  // …or: flags = Flags.get()

  @Test.it("off by default") off() { expect(this.flags.isEnabled("new-checkout")).toBeFalsy(); }
  @Test.it("forced on for THIS test") on() { this.flags.override("new-checkout", true); expectFlag(this.flags, "new-checkout"); }
  @Test.it("scoped override restores") scoped() {
    withFlags(this.flags, { "new-checkout": true }, () => expectFlag(this.flags, "new-checkout"));
    expect(this.flags.isEnabled("new-checkout")).toBeFalsy();
  }
}
```
`flagsFixture(defs)` is `"test"`-scoped; `withFlags(engine, overrides, fn)` forces values for
one block; `expectFlag(engine, key)` asserts enabled.
