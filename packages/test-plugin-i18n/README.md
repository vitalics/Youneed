# @youneed/test-plugin-i18n

Translation parity checks for [`@youneed/test`](../test). Catches the classic
i18n rot — a key added to `en` but forgotten in `de`, a stray key no other locale
has, or a `{placeholder}` that drifted between languages — before it ships.

```ts
import { Test, TestApplication, expect } from "@youneed/test";
import { assertParity, eachLocale } from "@youneed/test-plugin-i18n";
import { resources, i18n } from "./i18n.ts";

class I18n extends Test() {
  @Test.it("every locale is complete") complete() {
    assertParity(resources); // throws an AssertionError listing the gaps
  }

  @Test.it("greeting renders in every language") greet() {
    eachLocale(i18n, () => expect(i18n("greeting", { name: "x" })).toContain("x"));
  }
}
```

Or guard the **whole suite** up front with the plugin form — it runs the same
check in `setup`, failing the run before any test if a locale is incomplete:

```ts
import { i18nParityPlugin } from "@youneed/test-plugin-i18n";

TestApplication().addTests(I18n).use(i18nParityPlugin(resources)).run();
```

| API | meaning |
| --- | --- |
| `parity(resources, opts?)` | diff every locale against the base; returns a structured `ParityReport` |
| `assertParity(resources, opts?)` | throw an `AssertionError` listing the gaps if incomplete |
| `formatReport(report)` | render a `ParityReport` as a readable string |
| `eachLocale(i18n, fn)` | run `fn(locale)` per locale, restoring the original afterwards |
| `i18nParityPlugin(resources, opts?)` | `TestPlugin` that asserts parity in `setup` |

| option | default | meaning |
| --- | --- | --- |
| `base` | first locale | the locale every other is compared against |
| `checkPlaceholders` | `true` | treat `{placeholder}` differences as failures |
