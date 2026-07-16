# @youneed/test-expect-extra

A richer `expect` for [`@youneed/test`](../test). Swap the import to get the core
matchers **plus** `toMatchObject`, `toBeInstanceOf`, `toBeCloseTo`, `toMatch`,
`toHaveProperty`, `toBeNaN`, `toBeGreaterThanOrEqual` / `toBeLessThanOrEqual`,
and async `resolves` / `rejects`. Reuses the core `AssertionError`.

```bash
pnpm add -D @youneed/test @youneed/test-expect-extra
```

```ts
import { expect } from "@youneed/test-expect-extra";

expect({ id: 1, name: "a", extra: true }).toMatchObject({ id: 1, name: "a" });
expect(0.1 + 0.2).toBeCloseTo(0.3);
expect({ user: { role: "admin" } }).toHaveProperty("user.role", "admin");

await expect(fetchUser()).resolves.toMatchObject({ id: 1 });
await expect(boom()).rejects.toThrow(/failed/);
```
