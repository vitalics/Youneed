// ── @youneed/server-plugin-rbac — RBAC authorization for @youneed/server ──────
//
// Wraps a `@youneed/rbac` engine into a `ServerPlugin`, a GUARD factory, and a
// controller PROVIDER. The plugin mounts introspection routes (list roles, an
// ad-hoc access checker, the current request's resolved subject) plus an
// `inspect()` for the devtools RBAC tab. The guard `authorize(action, resource)`
// gates a handler (403 on deny). The provider contributes a REQUEST-SCOPED
// `this.can` / `this.rbac` / `this.subject` to a controller: `this.can(...)`
// checks against the Subject derived from the in-flight request via `opts.subject`.
//
//   const rbac = createRBAC((role) => {
//     role("admin").can("*", "*");
//     role("editor").can(["create", "update"], "post").can("delete", "post", owns("authorId"));
//     role("viewer").can("read", "post");
//   });
//
//   // per-request subject: read the authenticated principal off ctx.state.user
//   const app = Application(PostController).plugin(rbac(engine));
//
//   const authorize = authorizeWith(engine); // bind the engine once
//
//   class PostController extends Controller("/posts", {
//     providers: [rbacProvider(engine)],
//   }) {
//     @Controller.guard(authorize("update", "post"))
//     @Controller.put("/:id")
//     update() { /* only reached if the subject may update a post */ }
//
//     @Controller.get()
//     list() {
//       if (this.can("read", "post")) return this.repo.all();
//       return [];
//     }
//   }

import { HttpError, Response, context as currentContext } from "@youneed/server";
import type { Context, ControllerProvider, Guard, ServerPlugin } from "@youneed/server";
import { RBAC, type Subject, type Action, type Resource, type AccessResult } from "@youneed/rbac";

export * from "@youneed/rbac"; // RBAC, createRBAC, owns, attr, types — for convenience

/** Derives the acting {@link Subject} from the in-flight request (e.g. from the
 *  authenticated principal on `ctx.state.user`). */
export type SubjectResolver = (ctx: Context) => Subject;

/**
 * The default {@link SubjectResolver}: read the authenticated principal from
 * `ctx.user` or `ctx.state.user` (where auth middleware parks it) and shape it
 * into a `Subject`. Defensive — an anonymous request yields `{ roles: [] }`.
 */
export const defaultSubject: SubjectResolver = (ctx) => {
  // Be defensive: ctx may be a minimal fake in tests; user may live on either spot.
  const user = (ctx as { user?: unknown })?.user ?? (ctx?.state?.user as unknown) ?? undefined;
  const u = (user ?? {}) as { roles?: unknown; role?: unknown; id?: unknown };
  const roles = Array.isArray(u.roles) ? (u.roles as string[]) : typeof u.role === "string" ? [u.role] : [];
  const subject: Subject = { roles };
  if (typeof u.id === "string" || typeof u.id === "number") subject.id = String(u.id);
  if (user && typeof user === "object") subject.attributes = user as Record<string, unknown>;
  return subject;
};

/** Resolve the acting {@link Subject} for the current (or a supplied) request. */
function resolveSubject(resolve: SubjectResolver, ctx?: Context): Subject {
  const c = ctx ?? currentContext();
  return c ? resolve(c) : { roles: [] };
}

// ── controller provider — `this.can` / `this.rbac` / `this.subject` ───────────

/** The request-bound RBAC API contributed by {@link rbacProvider}. Methods check
 *  against the CURRENT request's derived {@link Subject} — no need to pass one. */
export interface RequestRBAC {
  /** May the current subject perform `action` on `resource` (optionally this `instance`)? */
  can(action: Action, resource: Resource, instance?: Record<string, unknown>): boolean;
  /** Negation of {@link RequestRBAC.can}. */
  cannot(action: Action, resource: Resource, instance?: Record<string, unknown>): boolean;
  /** Full {@link AccessResult} (granted + reason + deciding role) for debugging. */
  check(action: Action, resource: Resource, instance?: Record<string, unknown>): AccessResult;
  /** Fields the subject may touch for an allowed `action`×`resource` (`"*"` = all). */
  permittedFields(action: Action, resource: Resource): string[] | "*";
  /** The engine itself (unbound — pass an explicit subject). */
  readonly engine: RBAC;
  /** The {@link Subject} resolved from the current request. */
  readonly subject: Subject;
}

/** Options shared by the provider, guard, and plugin. */
export interface RbacOptions {
  /** Derive the acting {@link Subject} for each request. Default {@link defaultSubject}. */
  subject?: SubjectResolver;
}

/** Build the request-bound {@link RequestRBAC} facade over an engine + resolver.
 *  Exported (pure) so it can be tested with a fake request context. */
export function requestRBAC(engine: RBAC, resolve: SubjectResolver = defaultSubject, ctx?: Context): RequestRBAC {
  const subj = (): Subject => resolveSubject(resolve, ctx);
  return {
    can: (action, resource, instance) => engine.can(subj(), action, resource, instance),
    cannot: (action, resource, instance) => engine.cannot(subj(), action, resource, instance),
    check: (action, resource, instance) => engine.check(subj(), action, resource, instance),
    permittedFields: (action, resource) => engine.permittedFields(subj(), action, resource),
    engine,
    get subject() {
      return subj();
    },
  };
}

/**
 * A controller provider that contributes `this.can` / `this.cannot` / `this.check`
 * / `this.permittedFields`, plus `this.rbac` (the engine) and `this.subject` (the
 * request's resolved subject). Mirrors `ormProvider`/`flagsProvider`: it extends
 * the controller instance with private, typed members. The subject is read lazily
 * per call via async-local storage, so one installed provider serves every request.
 *
 *   class Posts extends Controller("/posts", {
 *     providers: [rbacProvider(rbac)],
 *   }) { … if (this.can("update", "post", post)) … }
 */
export function rbacProvider(
  engine: RBAC,
  options: RbacOptions = {},
): ControllerProvider<{
  readonly can: RequestRBAC["can"];
  readonly cannot: RequestRBAC["cannot"];
  readonly check: RequestRBAC["check"];
  readonly permittedFields: RequestRBAC["permittedFields"];
  readonly rbac: RBAC;
  readonly subject: Subject;
}> {
  const resolve = options.subject ?? defaultSubject;
  const facade = requestRBAC(engine, resolve);
  return {
    install(instance) {
      const def = (key: string, value: unknown) => Object.defineProperty(instance, key, { configurable: true, value });
      def("can", facade.can);
      def("cannot", facade.cannot);
      def("check", facade.check);
      def("permittedFields", facade.permittedFields);
      def("rbac", engine);
      // `subject` is a live getter — resolved per access against the current request.
      Object.defineProperty(instance, "subject", { configurable: true, get: () => facade.subject });
    },
  };
}

// ── guard factory — `authorize(action, resource)` ────────────────────────────

/** Options for {@link authorize}. */
export interface AuthorizeOptions extends RbacOptions {
  /** Resolve the concrete resource instance to check ownership/attribute conditions
   *  against (e.g. load the entity by `ctx.params.id`). May be async. */
  instance?: (ctx: Context) => Record<string, unknown> | Promise<Record<string, unknown> | undefined> | undefined;
}

/**
 * A GUARD factory: gates a handler by `engine.can(subject, action, resource, instance?)`.
 * Matches the `@youneed/server` guard contract — `(ctx) => boolean` — returning
 * `false` (→ 403) when denied, `true` when allowed. Use on controllers:
 *
 *   @Controller.guard(authorize("update", "post", { instance: (ctx) => loadPost(ctx.params.id) }))
 *   @Controller.put("/:id")
 *   update() { … }
 *
 * The subject is derived via `opts.subject` (default {@link defaultSubject}); the
 * resource instance, if any, via `opts.instance`.
 */
export function authorize(action: Action, resource: Resource, opts: AuthorizeOptions & { engine?: RBAC } = {}): Guard {
  const resolve = opts.subject ?? defaultSubject;
  return async (ctx: Context): Promise<boolean> => {
    // The engine is normally captured by `authorizeWith(engine)`; a bare
    // `authorize(...)` without an engine can't decide → fail closed.
    const engine = opts.engine;
    if (!engine) throw new HttpError(500, { error: "rbac: authorize() used without an engine — use authorizeWith(engine)" });
    const subject = resolve(ctx);
    const instance = opts.instance ? await opts.instance(ctx) : undefined;
    return engine.can(subject, action, resource, instance);
  };
}

/**
 * Bind an engine so `authorize(...)` calls need not carry it. Returns an
 * `authorize`-shaped factory closed over `engine` (+ default subject resolver).
 *
 *   const authorize = authorizeWith(rbac);
 *   @Controller.guard(authorize("update", "post"))
 */
export function authorizeWith(engine: RBAC, base: RbacOptions = {}) {
  return (action: Action, resource: Resource, opts: AuthorizeOptions = {}): Guard =>
    authorize(action, resource, { subject: base.subject, ...opts, engine });
}

// ── ServerPlugin ──────────────────────────────────────────────────────────────

/** Options for {@link rbac}. */
export interface RbacPluginOptions extends RbacOptions {
  /** Internal route prefix (default `"/__rbac"`). */
  basePath?: string;
  /** Mount the devtools introspection routes (default true). */
  exposeDevtools?: boolean;
}

/** The `inspect()` payload — devtools detects the engine by `kind === "rbac"`. */
export interface RbacInspect {
  kind: "rbac";
  roleCount: number;
  endpoints: { roles: string; check: string; subject: string };
}

/** Parse `subject=<json>` or `roles=<csv>` (+ optional `id`) query params into a
 *  {@link Subject}. Exported (pure) for the devtools tester + tests. */
export function subjectFromQuery(query: Record<string, string> | undefined): Subject {
  const q = query ?? {};
  if (q.subject) {
    try {
      const parsed = JSON.parse(q.subject) as Partial<Subject>;
      return { roles: Array.isArray(parsed.roles) ? parsed.roles : [], id: parsed.id, attributes: parsed.attributes };
    } catch {
      /* fall through to roles csv */
    }
  }
  const roles = q.roles ? q.roles.split(",").map((r) => r.trim()).filter(Boolean) : [];
  const subject: Subject = { roles };
  if (q.id) subject.id = q.id;
  return subject;
}

/** Parse the optional `instance=<json>` query param (the check tester). */
function instanceFromQuery(query: Record<string, string> | undefined): Record<string, unknown> | undefined {
  const raw = query?.instance;
  if (!raw) return undefined;
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** Roles serialized JSON-safe for the devtools matrix (`when` predicates dropped). */
export function rolesMatrix(engine: RBAC) {
  return engine.roles().map((r) => ({
    name: r.name,
    inherits: r.inherits ?? [],
    permissions: r.permissions.map((p) => ({
      action: Array.isArray(p.action) ? p.action : [p.action],
      resource: Array.isArray(p.resource) ? p.resource : [p.resource],
      effect: p.effect ?? "allow",
      fields: p.fields,
      // Describe the condition shape without leaking a function.
      condition: p.when ? "predicate" : p.conditions ? p.conditions : undefined,
    })),
  }));
}

/**
 * Mount an {@link RBAC} engine as a ServerPlugin: exposes introspection routes
 * under `basePath` and an `inspect()` for the devtools RBAC tab. Register the
 * matching {@link rbacProvider} on controllers that read `this.can`, and use
 * {@link authorizeWith}`(engine)` to build route guards.
 */
export function rbac(engine: RBAC, opts: RbacPluginOptions = {}): ServerPlugin & { engine: RBAC } {
  const basePath = (opts.basePath ?? "/__rbac").replace(/\/$/, "");
  const resolve = opts.subject ?? defaultSubject;
  const endpoints = {
    roles: `${basePath}/roles`,
    check: `${basePath}/check`,
    subject: `${basePath}/subject`,
  };

  return {
    name: "rbac",
    engine,
    setup(app) {
      if (opts.exposeDevtools === false) return;

      // Roles + permission matrix (devtools table source of truth).
      const listing = () => Response.json({ roles: rolesMatrix(engine) });
      app.get(basePath, () => listing()); // GET / (basePath root)
      app.get(endpoints.roles, () => listing());

      // Ad-hoc access check for the devtools tester:
      //   /check?roles=editor,viewer&action=update&resource=post&instance={"authorId":"u1"}
      //   /check?subject={"roles":["editor"],"id":"u1"}&action=update&resource=post
      app.get(endpoints.check, (ctx: Context) => {
        const q = ctx.query;
        const action = q?.action;
        const resource = q?.resource;
        if (!action || !resource) return Response.json({ error: "action and resource are required" }, { status: 400 });
        const subject = subjectFromQuery(q);
        const instance = instanceFromQuery(q);
        const result = engine.check(subject, action, resource, instance);
        return Response.json({ subject, action, resource, instance, ...result });
      });

      // The current request's resolved subject (debug).
      app.get(endpoints.subject, (ctx: Context) => Response.json(resolveSubject(resolve, ctx)));
    },
    inspect(): RbacInspect {
      // Sync — topology never awaits. The panel fetches live roles/checks over the
      // routes above.
      return { kind: "rbac", roleCount: engine.roles().length, endpoints };
    },
  };
}
