// Run: pnpm --filter @youneed/rbac test
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createRBAC, RBAC, owns, attr } from "../src/index.ts";

const rbac = createRBAC((role) => {
  role("admin").can("*", "*");
  role("viewer").can("read", "post");
  role("editor")
    .inherits("viewer")
    .can(["create", "update"], "post")
    .can("delete", "post", owns("authorId"))
    .cannot("update", "post", attr("locked", true)); // can't edit locked posts
});

class RbacSuite extends Test({ name: "@youneed/rbac" }) {
  @Test.it("grants an explicit permission") grant() {
    expect(rbac.can({ roles: ["viewer"] }, "read", "post")).toBe(true);
  }

  @Test.it("denies when no rule matches (NO_MATCH)") noMatch() {
    const r = rbac.check({ roles: ["viewer"] }, "delete", "post");
    expect(r.granted).toBe(false);
    expect(r.reason).toBe("NO_MATCH");
  }

  @Test.it("wildcards: admin can do anything") admin() {
    expect(rbac.can({ roles: ["admin"] }, "delete", "user")).toBe(true);
    expect(rbac.can({ roles: ["admin"] }, "whatever", "anything")).toBe(true);
  }

  @Test.it("role inheritance composes permissions") inherit() {
    // editor inherits viewer → gets read
    expect(rbac.can({ roles: ["editor"] }, "read", "post")).toBe(true);
    expect(rbac.can({ roles: ["editor"] }, "create", "post")).toBe(true);
    expect(rbac.rolesOf({ roles: ["editor"] }).sort()).toEqual(["editor", "viewer"]);
  }

  @Test.it("ownership condition (owns) gates on the instance") ownership() {
    expect(rbac.can({ roles: ["editor"], id: "u1" }, "delete", "post", { authorId: "u1" })).toBe(true);
    expect(rbac.can({ roles: ["editor"], id: "u1" }, "delete", "post", { authorId: "u2" })).toBe(false);
  }

  @Test.it("explicit deny overrides allow") denyWins() {
    // editor can update post, but not a locked one
    expect(rbac.can({ roles: ["editor"] }, "update", "post", { locked: false })).toBe(true);
    const r = rbac.check({ roles: ["editor"] }, "update", "post", { locked: true });
    expect(r.granted).toBe(false);
    expect(r.reason).toBe("DENY");
  }

  @Test.it("attribute condition matches instance fields") attribute() {
    const r = createRBAC((role) => role("mod").can("delete", "comment", { flagged: true }));
    expect(r.can({ roles: ["mod"] }, "delete", "comment", { flagged: true })).toBe(true);
    expect(r.can({ roles: ["mod"] }, "delete", "comment", { flagged: false })).toBe(false);
  }

  @Test.it("permittedFields returns the union / * ") fields() {
    const r = createRBAC([
      { name: "u", permissions: [{ action: "update", resource: "user", fields: ["name", "bio"] }] },
      { name: "admin2", permissions: [{ action: "update", resource: "user", fields: ["*"] }] },
    ]);
    expect(r.permittedFields({ roles: ["u"] }, "update", "user")).toEqual(["name", "bio"]);
    expect(r.permittedFields({ roles: ["admin2"] }, "update", "user")).toBe("*");
  }

  @Test.it("cannot() is the negation") cannot() {
    expect(rbac.cannot({ roles: ["viewer"] }, "delete", "post")).toBe(true);
  }

  @Test.it("data-driven definitions work too (no builder)") dataForm() {
    const r = new RBAC([{ name: "svc", permissions: [{ action: ["read", "write"], resource: "metric" }] }]);
    expect(r.can({ roles: ["svc"] }, "write", "metric")).toBe(true);
    expect(r.can({ roles: ["svc"] }, "delete", "metric")).toBe(false);
  }

  @Test.it("inheritance cycles are safe") cycle() {
    const r = createRBAC([
      { name: "a", inherits: ["b"], permissions: [{ action: "x", resource: "y" }] },
      { name: "b", inherits: ["a"], permissions: [] },
    ]);
    expect(r.can({ roles: ["b"] }, "x", "y")).toBe(true); // b→a→(b cut)
    expect(r.rolesOf({ roles: ["a"] }).sort()).toEqual(["a", "b"]);
  }
}

await TestApplication().addTests(RbacSuite).reporter(new ConsoleReporter()).run();
