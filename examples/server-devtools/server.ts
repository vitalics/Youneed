// Server devtools — a LIVE server wired with the devtools plugin.
//
// Run:  pnpm examples:serve:server-devtools   (builds the UI bundle, then this)
// Open: http://localhost:3000/__devtools
//
// The devtools UI is the unified <youneed-devtools> shell over the universal
// @youneed/devtools-protocol (CDP-style: JSON-RPC 2.0 over WebSocket). It
// introspects THIS running app live — no hand-written topology. Endpoints:
//   • {path}           — the unified shell (a tab per advertised domain)
//   • {path}/json      — hub discovery (the target list)
//   • {path}/ws        — the server target: Topology, Network, Log domains
//   • {path}/register  — front-bridge: a browser page connects OUT and registers a
//                        `Components` target (bridgeComponents) so the SAME shell
//                        inspects front + back together
// Domains on the server target:
//   • Topology — routes + schemas, OWASP audit (grade), OpenAPI, try-a-guard
//   • Network  — live request waterfall (mounted by default)
//   • Log      — live log stream (push via the plugin's handle)
// The orm-sql / pubsub / jobs plugins below still surface via Topology (plugins).
import {
  Application,
  Controller,
  HttpError,
  guardWithDocumentation,
  withDocumentation,
  t,
  type Context,
} from "@youneed/server";
import { cors } from "@youneed/server-middleware-cors";
import { helmet } from "@youneed/server-middleware-helmet";
import { rateLimit } from "@youneed/server-middleware-rate-limit";
import { jobs } from "@youneed/server-plugin-jobs";
import { createQueue, queue } from "@youneed/server-plugin-queue";
import { graphql } from "@youneed/server-plugin-graphql";
import { storage, MemoryStorage } from "@youneed/server-plugin-storage";
import { mailer, type MailTransport } from "@youneed/server-plugin-mailer";
import { grpc } from "@youneed/server-plugin-grpc";
import { otlp } from "@youneed/server-plugin-otlp";
import { featureFlags } from "@youneed/server-plugin-feature-flags";
import { createFlags } from "@youneed/feature-flags";
import { rbac } from "@youneed/server-plugin-rbac";
import { createRBAC, owns } from "@youneed/rbac";
import { secrets } from "@youneed/server-plugin-secrets";
import { createSecrets, MemorySecrets } from "@youneed/secrets";
import { createPubSub, pubsub } from "@youneed/server-plugin-pubsub";
import { createKV, kv } from "@youneed/server-plugin-kv";
import { devtools } from "@youneed/server-plugin-devtools/serve";
import { Table, Orm, getRepository, ormProvider } from "@youneed/orm-sql";
import { Collection, Nosql, getCollectionRepository } from "@youneed/orm-nosql";
import { mongoAdapter } from "@youneed/orm-adapter-mongo";
import { docker } from "@youneed/server-plugin-docker";

const UserSchema = t.object({ name: t.string(), email: t.string() });

// A real (in-memory SQLite) ORM, mounted as a ServerPlugin below — its schema +
// live query log power the devtools "Database" tab (Encore-style DB monitor).
class UsersTable extends Table("users") {
  @Table.primaryGeneratedColumn() id!: number;
  @Table.field("string") name!: string;
  @Table.field("string", { unique: true }) email!: string;
}

// `devtools: true` mounts the dev-only data browser (Encore-style DB studio) at
// /__orm — the "Database" tab becomes interactive (browse / SQL console / edit).
const orm = await Orm({ type: "sqlite", database: ":memory:", tables: [UsersTable], synchronize: true, devtools: true });
const usersRepo = getRepository(UsersTable);
await usersRepo.insert({ name: "Ada", email: "ada@x.dev" });
await usersRepo.insert({ name: "Linus", email: "linus@x.dev" });
await usersRepo.insert({ name: "Grace", email: "grace@x.dev" });

// A document store (in-memory) alongside the SQL ORM — its schema + live op log
// power the devtools "NoSQL" tab (Mongo-Compass-style studio). `devtools: true`
// mounts the dev-only data browser at /__nosql (browse / JSON find / insert / edit).
class Note extends Collection("notes") {
  @Collection.id() id!: string;
  @Collection.field("string") title!: string;
  @Collection.field("string") body!: string;
  @Collection.field("array", { optional: true }) tags?: string[];
  @Collection.field("date") createdAt!: Date;
}
// Defaults to the in-memory store; set MONGO_URL to drive the SAME devtools tab
// over a real MongoDB (via @youneed/orm-adapter-mongo). Start one with:
//   docker run --rm -p 27017:27017 mongo:7
const nosql = process.env.MONGO_URL
  ? await Nosql({ adapter: mongoAdapter, url: process.env.MONGO_URL, database: process.env.MONGO_DB ?? "youneed_demo", collections: [Note], synchronize: true, devtools: true })
  : await Nosql({ type: "memory", collections: [Note], synchronize: true, devtools: true });
const notesRepo = getCollectionRepository(Note);
if ((await notesRepo.count()) === 0) {
  await notesRepo.insertMany([
    { title: "Welcome", body: "First note", tags: ["intro"], createdAt: new Date() },
    { title: "Roadmap", body: "Ship the NoSQL ORM", tags: ["plan", "orm"], createdAt: new Date() },
  ]);
}

// A DOCUMENTED guard via the factory helper — its doc shows in the topology, the
// Catalog/OpenAPI (x-guards + description), and is runnable from the Guards page.
const requireAuth = guardWithDocumentation(
  (ctx: Context): boolean => {
    if (!ctx.request.headers["authorization"]) throw new HttpError(401, { error: "Unauthorized" });
    return true;
  },
  { name: "requireAuth", description: "Requires an Authorization: Bearer token" },
);

// A plain guard we'll document INLINE at the decorator with `withDocumentation`.
const isOwner = (ctx: Context): boolean => {
  if (ctx.params.id === "0") return true; // demo: only id 0 is "owned"
  throw new HttpError(403, { error: "Forbidden" });
};

// `ormProvider` adds a PRIVATE `this.orm` to the controller — `this.orm.users` is
// the typed repository, autocompleted. A provider differs from a guard/middleware:
// it EXTENDS the instance instead of just gating/transforming the request.
class UsersController extends Controller("/users", {
  providers: [ormProvider(orm, { repositories: { users: usersRepo } })],
}) {
  @Controller.get()
  list() {
    return this.orm.users.find();
  }

  // Two guards: a shared documented one + an inline-documented one (decorator form).
  @Controller.guard(requireAuth)
  @Controller.guard(withDocumentation(isOwner, { name: "isOwner", description: "Caller must own the record" }))
  @Controller.get("/:id", {
    params: t.object({ id: t.string() }),
    response: { 200: UserSchema },
  })
  async byId(ctx: Context) {
    return (
      (await this.orm.users.findOne({ id: Number(ctx.params.id) })) ??
      this.Response.json({ error: "not found" }, { status: 404 })
    );
  }

  @Controller.guard(requireAuth)
  @Controller.post({ body: UserSchema, response: { 201: UserSchema } })
  async create(ctx: Context) {
    const user = ctx.body as { name: string; email: string };
    return this.Response.json(await this.orm.users.insert(user), { status: 201 });
  }
}

// Pub/Sub bus — the devtools "Pub/Sub" tab lists its channels and can publish to
// them live. A demo subscriber so a channel shows up with activity out of the box.
const bus = createPubSub();
void bus.subscribe("notifications", (msg) => console.log("[notifications]", msg));

// KV store — the devtools "KV" tab (Infra card + flow node) shows read/write
// counts and a live key browser. Seed a few keys so it has data out of the box;
// the heartbeat job below bumps a counter so the stats move while you watch.
const store = createKV();
await store.set("feature:new-dashboard", "enabled");
await store.set("session:demo", JSON.stringify({ user: "Ada" }), { ttl: 3600 });

// A durable background job queue — its jobs table powers the devtools "Queue" tab.
// `email` succeeds; `flaky` always throws so it retries then dead-letters (DLQ).
const demoQueue = createQueue({ concurrency: 2, maxAttempts: 3, backoff: () => 2000 })
  .register("email", async (p: { to: string }) => {
    await new Promise((r) => setTimeout(r, 300));
    console.log(`[queue] sent email to ${p.to}`);
  })
  .register("flaky", () => {
    throw new Error("upstream unavailable");
  });
await demoQueue.add("email", { to: "ada@x.dev" });
await demoQueue.add("email", { to: "grace@x.dev" }, { delayMs: 60_000 }); // stays "delayed"
await demoQueue.add("flaky", {});

// GraphQL endpoint — its SDL + recent ops power the devtools "GraphQL" tab.
const gqlSchema = /* GraphQL */ `
  type Query { hello(name: String): String, add(a: Int!, b: Int!): Int }
`;
const gqlRoot = {
  hello: ({ name }: { name?: string }) => `hello, ${name ?? "world"}`,
  add: ({ a, b }: { a: number; b: number }) => a + b,
};

// Object storage (in-memory) — its browser powers the devtools "Storage" tab.
const store2 = new MemoryStorage();
await store2.put("readme.txt", "hello from @youneed/server-plugin-storage", { contentType: "text/plain" });
await store2.put("data/config.json", JSON.stringify({ ok: true }), { contentType: "application/json" });

// A log transport for the mailer demo (no real SMTP) — powers the "Mailer" tab.
const logMail: MailTransport = {
  name: "log",
  async send(msg) {
    console.log(`[mail] → ${Array.isArray(msg.to) ? msg.to.join(", ") : msg.to}: ${msg.subject}`);
    return { id: `log-${Date.now()}` };
  },
};

// Feature flags — their evaluation + dev toggles power the devtools "Feature Flags" tab.
const flags = createFlags([
  { key: "new-dashboard", description: "roll out the redesigned dashboard", defaultValue: false, rollout: 30 },
  { key: "checkout", description: "checkout experiment", defaultValue: "control", variants: { control: "control", fast: "fast" }, rules: [{ attributes: { plan: "pro" }, variant: "fast" }] },
  { key: "maintenance-banner", defaultValue: false },
]);

// RBAC — roles + permissions power the devtools "RBAC" tab (matrix + check tester).
const access = createRBAC((role) => {
  role("admin").can("*", "*");
  role("viewer").can("read", "post");
  role("editor").inherits("viewer").can(["create", "update"], "post").can("delete", "post", owns("authorId"));
});

// Secrets — names + masked presence power the devtools "Secrets" tab (values never shown).
const vault = createSecrets(new MemorySecrets({ STRIPE_KEY: "sk_live_abc123xyz789", DATABASE_URL: "postgres://app:pw@db:5432/app", JWT_SECRET: "supersecretsigningkey" }));

const app = Application(UsersController)
  // The ORM is a ServerPlugin — its inspect() feeds the devtools "Database" tab.
  .plugin(orm)
  // The document store is also a ServerPlugin — feeds the devtools "NoSQL" tab.
  .plugin(nosql)
  .use(cors())
  .use(helmet())
  .use(rateLimit())
  .get("/health", () => ({ ok: true }))
  // A self-hosted OTLP/HTTP receiver so the demo exports to itself (no external
  // collector needed) — the OTLP tab then shows real exported spans.
  .post("/v1/traces", () => ({ partialSuccess: {} }))
  // OTLP trace export — installs tracing, batches spans, ships them (here to the
  // self-receiver above). Adds the devtools "OTLP" tab.
  .plugin(otlp({ endpoint: "http://localhost:3000", serviceName: "demo-api", flushMs: 1000 }))
  .ws("/live", { message: (sock, data) => sock.send(data) })
  // Background jobs — surfaced on the devtools "Infra" page (name + next run).
  .plugin(
    jobs({
      jobs: [
        { name: "cleanup-sessions", schedule: "0 */6 * * *", handler: () => {} },
        // Publishes to the bus + bumps a KV counter every 30s, so the Pub/Sub and
        // KV tabs both show live traffic.
        {
          name: "heartbeat",
          schedule: { every: 30_000 },
          handler: async () => {
            await bus.publish("notifications", `heartbeat ${new Date().toISOString()}`);
            await store.incr("metrics:heartbeats");
          },
        },
      ],
    }),
  )
  // Durable job queue — adds the "Queue" tab (jobs table + enqueue/retry/remove).
  .plugin(queue(demoQueue))
  // GraphQL — adds the "GraphQL" tab (playground + SDL + recent ops).
  .plugin(graphql({ schema: gqlSchema, rootValue: gqlRoot }))
  // Object storage — adds the "Storage" tab (object browser + upload/delete).
  .plugin(storage(store2))
  // Mailer — adds the "Mailer" tab (compose + recent sends).
  .plugin(mailer(logMail))
  // Feature flags — adds the "Feature Flags" tab (evaluate + dev override toggles).
  .plugin(featureFlags(flags))
  // RBAC — adds the "RBAC" tab (roles×permissions matrix + a check tester).
  .plugin(rbac(access))
  // Secrets — adds the "Secrets" tab (names + masked health; values never exposed).
  .plugin(secrets(vault))
  // gRPC — its own HTTP/2 server on :50051; adds the "gRPC" tab (services + call tester).
  .plugin(
    grpc({
      protoPath: `${import.meta.dirname}/../../packages/server-plugin-grpc/tests/fixtures/greeter.proto`,
      package: "greet",
      services: {
        Greeter: {
          SayHello: (call: { request: { name?: string } }, cb: (e: unknown, r?: unknown) => void) => cb(null, { message: `hi ${call.request.name ?? "world"}` }),
        },
      },
    }),
  )
  // Pub/Sub plugin — adds the "Pub/Sub" tab (channels + a message sender).
  .plugin(pubsub(bus))
  // KV plugin — adds the "KV" tab (read/write stats + a live key browser).
  .plugin(kv(store))
  // The devtools UI as a first-class server plugin (idiomatic; was serveDevtools).
  .plugin(
    devtools({
      name: "demo-api",
      url: "http://localhost:3000",
      // Mounted middleware are anonymous functions → declare the security-relevant
      // ones so the OWASP audit (Catalog page) is accurate.
      middleware: ["cors", "helmet", "rate-limit"],
    }),
  )
  // Docker plugin (mounted LAST so it sees the others): adds the devtools "Docker"
  // tab with the generated Dockerfile + docker-compose.yml. The compose infers its
  // backing services from the plugins above — run with MONGO_URL and it wires a
  // `mongo` service in. Emit the files (and exit) with:
  //   EMIT_DOCKER=1 tsx examples/server-devtools/server.ts
  .plugin(docker({ mode: "server", entry: "server.ts", outDir: import.meta.dirname }));

app.listen(3000, () => {
  console.log("server-devtools demo → http://localhost:3000/__devtools");
  console.log("  hub json            → http://localhost:3000/__devtools/json");
  // Front-bridge: in a browser page (dev), register it with this hub so the
  // unified shell gets a "Components" tab for the page alongside the server:
  //   import { installDevtools } from "@youneed/devtools";
  //   import { bridgeComponents } from "@youneed/devtools/protocol";
  //   installDevtools();
  //   bridgeComponents("ws://localhost:3000/__devtools/register", { title: document.title });
});
