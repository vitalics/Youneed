// Run: pnpm --filter @youneed/server-plugin-rbac test
// Exercises the pure helpers, the request-scoped provider facade, the guard
// factory, and the plugin routes via a fake AppBuilder that captures handlers —
// no real HTTP server.
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { createRBAC, owns } from "@youneed/rbac";
import { rbac, rbacProvider, requestRBAC, authorize, authorizeWith, defaultSubject, subjectFromQuery, rolesMatrix } from "../src/index.ts";

// A small role graph reused across cases.
function engine() {
  return createRBAC((role) => {
    role("admin").can("*", "*");
    role("editor").inherits("viewer").can(["create", "update"], "post").can("delete", "post", owns("authorId"));
    role("viewer").can("read", "post");
  });
}

// A tiny fake AppBuilder that captures the routes a plugin's setup() registers.
type Handler = (ctx: any) => any;
function fakeApp() {
  const routes = new Map<string, Handler>();
  return {
    get: (path: string, h: Handler) => routes.set(`GET ${path}`, h),
    post: (path: string, h: Handler) => routes.set(`POST ${path}`, h),
    use: () => {},
    call(method: string, path: string, ctx: any = {}) {
      const h = routes.get(`${method} ${path}`);
      if (!h) throw new Error(`no route ${method} ${path}`);
      return h(ctx);
    },
    routes,
  };
}
// Response.json returns a HttpResult descriptor in this framework — read its body.
function readJson(res: any): any {
  if (res && typeof res === "object" && "body" in res) {
    return typeof res.body === "string" ? JSON.parse(res.body) : res.body;
  }
  return res;
}

class RbacSuite extends Test({ name: "@youneed/server-plugin-rbac" }) {
  @Test.it("defaultSubject reads roles/id off ctx.state.user (defensive)") subjectDerive() {
    const s = defaultSubject({ state: { user: { id: 7, roles: ["editor"], plan: "pro" } } } as any);
    expect(s.roles).toEqual(["editor"]);
    expect(s.id).toBe("7");
    expect((s.attributes as any).plan).toBe("pro");
    // anonymous request ⇒ empty roles, never throws
    expect(defaultSubject({} as any).roles).toEqual([]);
    // single `role` string is accepted too
    expect(defaultSubject({ user: { role: "admin" } } as any).roles).toEqual(["admin"]);
  }

  @Test.it("requestRBAC checks against the supplied request context") facade() {
    // A fake request; the resolver runs only when a context is present.
    const ctx = { state: { user: { id: "u1", roles: ["editor"] } } } as any;
    const rf = requestRBAC(engine(), (c: any) => ({ roles: c.state.user.roles, id: c.state.user.id }), ctx);
    expect(rf.can("update", "post")).toBe(true);
    expect(rf.can("read", "post")).toBe(true); // inherited from viewer
    expect(rf.can("delete", "post", { authorId: "u1" })).toBe(true); // owns
    expect(rf.can("delete", "post", { authorId: "u2" })).toBe(false); // not owner
    expect(rf.cannot("publish", "post")).toBe(true);
    expect(rf.check("update", "post").reason).toBe("ALLOW");
    expect(rf.subject.roles).toEqual(["editor"]);
  }

  @Test.it("rbacProvider installs this.can / this.rbac / this.subject") provider() {
    const eng = engine();
    const p = rbacProvider(eng, { subject: () => ({ roles: ["viewer"] }) });
    const instance: any = {};
    p.install(instance);
    expect(typeof instance.can).toBe("function");
    expect(instance.rbac).toBe(eng);
    // No active request context here → resolver receives undefined ctx, but the
    // provider's facade resolves lazily; with no request the subject falls back to
    // { roles: [] }, so a viewer-only grant is not present.
    expect(instance.can("read", "post")).toBe(false); // no request ctx ⇒ empty subject
    expect(instance.subject.roles).toEqual([]);
  }

  @Test.it("authorize() denies without the role and allows with it") guardDecision() {
    const authz = authorizeWith(engine());
    const guard = authz("update", "post");
    // guard signature: (ctx) => MaybePromise<boolean | void>; false ⇒ 403
    const asViewer = { state: { user: { roles: ["viewer"] } } } as any;
    const asEditor = { state: { user: { roles: ["editor"] } } } as any;
    return Promise.all([guard(asViewer), guard(asEditor)]).then(([viewer, editor]) => {
      expect(viewer).toBe(false); // viewer may not update ⇒ 403
      expect(editor).toBe(true); // editor may update
    });
  }

  @Test.it("authorize() resolves the resource instance for ownership guards") async guardInstance() {
    const authz = authorizeWith(engine());
    const guard = authz("delete", "post", { instance: (ctx: any) => ({ authorId: ctx.params.id }) });
    const ownCtx = { state: { user: { roles: ["editor"], id: "u1" } }, params: { id: "u1" } } as any;
    const otherCtx = { state: { user: { roles: ["editor"], id: "u1" } }, params: { id: "u2" } } as any;
    expect(await guard(ownCtx)).toBe(true); // owns the post
    expect(await guard(otherCtx)).toBe(false); // not the owner ⇒ 403
  }

  @Test.it("bare authorize() without an engine fails closed (500)") async guardNoEngine() {
    const guard = authorize("update", "post");
    let threw = false;
    try {
      await guard({ state: {} } as any);
    } catch (e: any) {
      threw = true;
      expect(e.status).toBe(500);
    }
    expect(threw).toBe(true);
  }

  @Test.it("subjectFromQuery parses roles csv, id, and subject JSON") querySubject() {
    const a = subjectFromQuery({ roles: "editor, viewer ", id: "u1" });
    expect(a.roles).toEqual(["editor", "viewer"]);
    expect(a.id).toBe("u1");
    const b = subjectFromQuery({ subject: JSON.stringify({ roles: ["admin"], id: "x" }) });
    expect(b.roles).toEqual(["admin"]);
    expect(b.id).toBe("x");
    expect(subjectFromQuery(undefined).roles).toEqual([]);
  }

  @Test.it("rolesMatrix serializes roles JSON-safe (predicate condition flattened)") matrix() {
    const m = rolesMatrix(engine());
    const editor = m.find((r) => r.name === "editor")!;
    expect(editor.inherits).toEqual(["viewer"]);
    const del = editor.permissions.find((p) => p.action.includes("delete"))!;
    expect(del.condition).toBe("predicate"); // owns() → not a raw function
    expect(del.effect).toBe("allow");
  }

  @Test.it("GET /roles returns the role matrix") rolesRoute() {
    const app = fakeApp();
    rbac(engine()).setup!(app as any);
    const out = readJson(app.call("GET", "/__rbac/roles"));
    expect(out.roles.map((r: any) => r.name).sort()).toEqual(["admin", "editor", "viewer"]);
  }

  @Test.it("GET /check runs an ad-hoc access check (the devtools tester)") checkRoute() {
    const app = fakeApp();
    rbac(engine()).setup!(app as any);
    const denied = readJson(app.call("GET", "/__rbac/check", { query: { roles: "viewer", action: "update", resource: "post" } }));
    expect(denied.granted).toBe(false);
    expect(denied.reason).toBe("NO_MATCH");
    const allowed = readJson(app.call("GET", "/__rbac/check", { query: { roles: "editor", action: "update", resource: "post" } }));
    expect(allowed.granted).toBe(true);
    expect(allowed.reason).toBe("ALLOW");
    // ownership check via instance JSON
    const owned = readJson(
      app.call("GET", "/__rbac/check", { query: { subject: JSON.stringify({ roles: ["editor"], id: "u1" }), action: "delete", resource: "post", instance: JSON.stringify({ authorId: "u1" }) } }),
    );
    expect(owned.granted).toBe(true);
    // missing action/resource ⇒ 400
    const bad = app.call("GET", "/__rbac/check", { query: { roles: "editor" } }) as any;
    expect(bad.status).toBe(400);
  }

  @Test.it("GET /subject echoes the request's resolved subject") subjectRoute() {
    const app = fakeApp();
    rbac(engine(), { subject: (c: any) => ({ roles: c.state.user.roles, id: c.state.user.id }) }).setup!(app as any);
    const out = readJson(app.call("GET", "/__rbac/subject", { state: { user: { roles: ["admin"], id: "root" } } }));
    expect(out.roles).toEqual(["admin"]);
    expect(out.id).toBe("root");
  }

  @Test.it("inspect() reports kind + roleCount + endpoints") inspect() {
    const info = rbac(engine()).inspect!() as any;
    expect(info.kind).toBe("rbac");
    expect(info.roleCount).toBe(3);
    expect(info.endpoints.check).toBe("/__rbac/check");
  }

  @Test.it("exposeDevtools:false mounts no routes") noDevtools() {
    const app = fakeApp();
    rbac(engine(), { exposeDevtools: false }).setup!(app as any);
    expect(app.routes.size).toBe(0);
  }
}

await TestApplication().addTests(RbacSuite).reporter(new ConsoleReporter()).run();
