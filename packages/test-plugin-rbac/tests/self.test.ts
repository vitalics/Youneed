// Run: pnpm --filter @youneed/test-plugin-rbac test
import { Test, TestApplication, expect, AssertionError } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { owns, type RBAC } from "@youneed/rbac";
import { rbacFixture, subject, asSubject, expectCan, expectCannot, withRole } from "../src/index.ts";

const Rbac = rbacFixture((role) => {
  role("viewer").can("read", "post");
  role("editor")
    .inherits("viewer")
    .can(["create", "update"], "post")
    .can("delete", "post", owns("authorId"));
  role("admin").can("*", "*");
});

// ── subject() / asSubject() build the right Subject ────────────────────────────
class Subjects extends Test({ name: "subject builders" }) {
  @Test.it("subject(array) copies roles") array() {
    const s = subject(["editor", "viewer"]);
    expect(s.roles).toEqual(["editor", "viewer"]);
    expect(s.id).toBe(undefined);
    expect(s.attributes).toBe(undefined);
  }

  @Test.it("subject(string) wraps a single role") single() {
    expect(subject("admin").roles).toEqual(["admin"]);
  }

  @Test.it("subject(roles, extra) carries id + attributes") extra() {
    const s = subject(["editor"], { id: "u1", attributes: { plan: "pro" } });
    expect(s.id).toBe("u1");
    expect(s.attributes).toEqual({ plan: "pro" });
  }

  @Test.it("asSubject is identity for a real Subject") identity() {
    const s = { roles: ["viewer"], id: "u9" };
    expect(asSubject(s)).toBe(s);
  }
}

// ── expectCan / expectCannot pass + throw correctly ────────────────────────────
class Assertions extends Test({ name: "expectCan / expectCannot" }) {
  @Test.use(Rbac) rbac!: RBAC;

  @Test.it("expectCan passes when granted") canPass() {
    expectCan(this.rbac, subject(["editor"]), "update", "post"); // must not throw
    expectCan(this.rbac, subject(["editor"]), "read", "post"); // inherited from viewer
    expect(true).toBeTruthy();
  }

  @Test.it("expectCan throws AssertionError when denied") canThrow() {
    let err: unknown;
    try {
      expectCan(this.rbac, subject(["viewer"]), "delete", "post");
    } catch (e) {
      err = e;
    }
    expect(err instanceof AssertionError).toBeTruthy();
    expect(String((err as Error).message).includes("delete")).toBeTruthy();
    expect(String((err as Error).message).includes("NO_MATCH")).toBeTruthy();
  }

  @Test.it("expectCannot passes when denied") cannotPass() {
    expectCannot(this.rbac, subject(["viewer"]), "delete", "post"); // must not throw
    expect(true).toBeTruthy();
  }

  @Test.it("expectCannot throws AssertionError when granted") cannotThrow() {
    let err: unknown;
    try {
      expectCannot(this.rbac, subject(["admin"]), "delete", "anything");
    } catch (e) {
      err = e;
    }
    expect(err instanceof AssertionError).toBeTruthy();
    expect(String((err as Error).message).includes("granted")).toBeTruthy();
  }

  @Test.it("honours ownership conditions via instance") ownership() {
    const editor = subject(["editor"], { id: "u1" });
    expectCan(this.rbac, editor, "delete", "post", { authorId: "u1" }); // owns it
    expectCannot(this.rbac, editor, "delete", "post", { authorId: "u2" }); // not owner
  }
}

// ── withRole: applies inside, restores after (sync + async + on throw) ─────────
class WithRole extends Test({ name: "withRole" }) {
  @Test.use(Rbac) rbac!: RBAC;

  @Test.it("overrides an EXISTING role inside, restores prior def after") override() {
    // viewer originally can only read
    expectCannot(this.rbac, subject(["viewer"]), "delete", "post");
    withRole(this.rbac, { name: "viewer", permissions: [{ action: "delete", resource: "post" }] }, () => {
      expectCan(this.rbac, subject(["viewer"]), "delete", "post"); // granted inside
      expectCannot(this.rbac, subject(["viewer"]), "read", "post"); // overridden away inside
    });
    // restored to the ORIGINAL viewer definition
    expectCan(this.rbac, subject(["viewer"]), "read", "post");
    expectCannot(this.rbac, subject(["viewer"]), "delete", "post");
  }

  @Test.it("a NEW role is neutralized (grants nothing) after the block") newRole() {
    withRole(this.rbac, { name: "auditor", permissions: [{ action: "read", resource: "*" }] }, () => {
      expectCan(this.rbac, subject(["auditor"]), "read", "secret"); // granted inside
    });
    expectCannot(this.rbac, subject(["auditor"]), "read", "secret"); // gone after
  }

  @Test.it("async: awaited then restored") async asyncRestore() {
    let inside = false;
    await withRole(this.rbac, { name: "viewer", permissions: [{ action: "delete", resource: "post" }] }, async () => {
      await Promise.resolve();
      inside = this.rbac.can(subject(["viewer"]), "delete", "post");
    });
    expect(inside).toBeTruthy();
    expectCannot(this.rbac, subject(["viewer"]), "delete", "post"); // restored
    expectCan(this.rbac, subject(["viewer"]), "read", "post");
  }

  @Test.it("restores even when fn throws") onThrow() {
    let threw = false;
    try {
      withRole(this.rbac, { name: "viewer", permissions: [{ action: "delete", resource: "post" }] }, () => {
        throw new Error("boom");
      });
    } catch {
      threw = true;
    }
    expect(threw).toBeTruthy();
    expectCannot(this.rbac, subject(["viewer"]), "delete", "post"); // restored despite throw
    expectCan(this.rbac, subject(["viewer"]), "read", "post");
  }

  @Test.it("returns fn's value (sync)") returnsSync() {
    const r = withRole(this.rbac, { name: "viewer", permissions: [{ action: "x", resource: "y" }] }, () =>
      this.rbac.can(subject(["viewer"]), "x", "y"),
    );
    expect(r).toBeTruthy();
  }
}

// ── determinism: a role added in one test isn't visible in the next ────────────
// These two cases run in registration order. `a` grants viewer a new permission;
// `b` must see a pristine engine (viewer can't delete). If the fixture leaked,
// `b` would fail.
class Isolation extends Test({ name: "fixture isolation" }) {
  @Test.use(Rbac) rbac!: RBAC;

  @Test.it("a: setRole applies within the test") a() {
    expectCannot(this.rbac, subject(["viewer"]), "delete", "post"); // default
    this.rbac.setRole({ name: "viewer", permissions: [{ action: "delete", resource: "post" }] });
    expectCan(this.rbac, subject(["viewer"]), "delete", "post"); // mutated
  }

  @Test.it("b: the next test gets a fresh engine (setRole reset)") b() {
    // Would be granted if state leaked from `a`.
    expectCannot(this.rbac, subject(["viewer"]), "delete", "post");
    expectCan(this.rbac, subject(["viewer"]), "read", "post"); // original def intact
  }
}

// ── decorator-free injection via .get() also isolates per test ─────────────────
class GetIsolation extends Test({ name: "get() isolation" }) {
  rbac = Rbac.get();

  @Test.it("a: introduce a brand-new role") a() {
    this.rbac.setRole({ name: "hacker", permissions: [{ action: "*", resource: "*" }] });
    expectCan(this.rbac, subject(["hacker"]), "nuke", "prod");
  }

  @Test.it("b: the new role is gone on the fresh engine") b() {
    // A subject with only an unknown role has no permissions.
    expectCannot(this.rbac, subject(["hacker"]), "nuke", "prod");
  }
}

await TestApplication()
  .addTests(Subjects)
  .addTests(Assertions)
  .addTests(WithRole)
  .addTests(Isolation)
  .addTests(GetIsolation)
  .reporter(new ConsoleReporter())
  .run();
