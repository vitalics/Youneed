import { setTimeout } from "node:timers/promises";
import {
  Application,
  Controller,
  File,
  HttpError,
  Response,
  respondAs,
  t,
  trace,
  createCache, // response cache stays in core
} from "@youneed/server";
import type { Context, Guard, Infer, SerializeKind } from "@youneed/server";
// Middlewares now ship as separate @youneed/server-middleware-* packages.
import { requestLogger } from "@youneed/server-middleware-request-logger";
import { helmet } from "@youneed/server-middleware-helmet";
import { cors } from "@youneed/server-middleware-cors";
import { compression } from "@youneed/server-middleware-compression";
import { rateLimit } from "@youneed/server-middleware-rate-limit";
import { csrf } from "@youneed/server-middleware-csrf";

// ============================================================
// Demo controllers / module (return-value style)
// ============================================================

const CatSchema = t
  .object({
    name: t.string().meta({ description: "Cat's call name", example: "Fluffy" }),
    age: t.number().meta({ description: "Age in years", example: 5 }),
    breed: t.string().meta({ example: "Persian" }),
  })
  .meta({ title: "Cat", description: "A cat in the registry" });
type Cat = Infer<typeof CatSchema>;

class HealthController extends Controller("/health") {
  // A real owned resource: a heartbeat timer that must be cleared on shutdown,
  // otherwise it keeps the event loop (and the process) alive.
  #beats = 0;
  #timer = setInterval(() => this.#beats++, 1000);

  @Controller.get()
  async check() {
    return this.Response.json({
      status: "ok",
      beats: this.#beats,
      timestamp: new Date().toISOString(),
    });
  }

  // Called by the framework when the server is disposed (LIFO across
  // controllers). Use `[Symbol.dispose]` instead for purely synchronous cleanup.
  async [Symbol.asyncDispose]() {
    clearInterval(this.#timer);
    await Promise.resolve(); // e.g. await a DB pool / open connections closing
    console.log(`HealthController disposed after ${this.#beats} beats`);
  }
}

// A guard is just a function over the request context. It can read headers,
// use `trace`, throw an HttpError for a custom status, or return false for 403.
const requireApiKey: Guard = (ctx) => {
  if (ctx.request.headers["x-api-key"] !== "secret") {
    throw new HttpError(401, { error: "Missing or invalid API key" });
  }
};

const denyReserved: Guard = (ctx) => {
  // Per-method guard: runs after the controller-level one, sees typed params.
  return ctx.params.name !== "admin";
};

class CatsController extends Controller("/cats", { guards: [requireApiKey] }) {
  #cats: Cat[] = [
    { name: "Whiskers", age: 3, breed: "Siamese" },
    { name: "Fluffy", age: 5, breed: "Persian" },
  ];

  @Controller.get()
  async findAll() {
    return this.#cats; // plain value -> JSON
  }

  @Controller.guard(denyReserved)
  @Controller.get("/:name", {
    params: t.object({ name: t.string() }),
    response: { 200: CatSchema },
  })
  async findByName(ctx: Context) {
    const name = ctx.params.name;
    await Promise.resolve(); // simulate async work
    // `trace` recovers requestId from async context — ctx wasn't passed to it
    trace(`looking up cat "${name}"`);
    const cat = this.#cats.find((c) => c.name === name);
    // throw with any status code — the "any status" invariant
    if (!cat) throw new HttpError(404, { error: "Cat not found" });
    return cat;
  }

  // Input is validated against CatSchema (422 on mismatch); the 201 response
  // is validated too. No manual checks, no boilerplate.
  @Controller.post({
    body: CatSchema,
    response: { 201: CatSchema },
  })
  async create(ctx: Context) {
    const cat = ctx.body as Cat;
    this.#cats.push(cat);
    return this.Response.json(cat, { status: 201 });
  }
}

class FileController extends Controller("/file") {
  @Controller.get()
  handle() {
    return this.Response.text("Some text");
  }
}

// A domain object that owns its serialization across formats (real FIX tags,
// XML attributes, etc.) — the headline use of the Symbol.toSerialize protocol.
class Quote {
  constructor(
    readonly symbol: string,
    readonly bid: number,
    readonly ask: number,
  ) {}

  [Symbol.toSerialize](_value: unknown, kind: SerializeKind): unknown {
    switch (kind) {
      case "json":
        return { symbol: this.symbol, bid: this.bid, ask: this.ask };
      case "fix":
        return `55=${this.symbol}|132=${this.bid}|133=${this.ask}`;
      case "xml":
        return `<quote symbol="${this.symbol}"><bid>${this.bid}</bid><ask>${this.ask}</ask></quote>`;
      default:
        return JSON.stringify(this);
    }
  }
}

const makeQuote = (): Quote => new Quote("EURUSD", 1.0832, 1.0834);

// ============================================================
// Bootstrap (fluent, Elysia-style)
// ============================================================

function newBootstrap() {
  // Cache the (cheap, but illustrative) quote for a few seconds per URL.
  const quoteCache = createCache({ ttl: 5_000 });

  const app = Application(HealthController, CatsController, FileController)
    // ── Global middleware: wrap routing, so they cover every request
    //    (incl. 404s and CORS preflight), in registration order. ──
    .use(requestLogger()) // METHOD url status durationms [requestId]
    .use(helmet()) // CSP, HSTS, nosniff, frameguard, …
    .use(cors({ origin: "*", credentials: false })) // answers OPTIONS preflight
    .use(compression({ threshold: 256 })) // gzip/br when the client accepts it
    // ── Scoped middleware: only the matching path prefix. ──
    .use("/cats", rateLimit({ max: 100, windowMs: 60_000 })) // per-group throttle
    .use("/quote", quoteCache.middleware()) // cache the quote endpoints
    .use("/secure", csrf()) // double-submit CSRF for the /secure group
    .get("/asset", File("src/server.ts")) // static file as a constant route
    // /quote negotiates by Accept; the explicit variants always force a format
    .get("/quote", () => makeQuote()) // try Accept: application/xml | application/fix
    .get("/quote_json", respondAs(makeQuote, "json"))
    .get("/quote_xml", respondAs(makeQuote, "xml"))
    .get("/quote_fix", respondAs(makeQuote, "fix"))
    // Typed query: `req.query.limit` is inferred as number, `q` as string.
    // (If inference broke, `limit: number` below would be a type error.)
    .get(
      "/search",
      (ctx) => {
        const limit: number = ctx.query.limit;
        return { q: ctx.query.q, limit, results: [] as string[] };
      },
      { query: t.object({ q: t.string(), limit: t.number() }) },
    )
    .get("/realtime", async function* () {
      // streamed response (chunked)
      yield "tick 1\n";
      yield "tick 2\n";
    })
    .ws("/realtime", {
      message(ws, msg) {
        ws.send("something " + msg);
        if (msg === "1") ws.close();
      },
      schema: { message: t.string(), response: t.string() },
    })
    .ws("/realtime2", {
      async *message(_ws, msg) {
        yield msg + " something";
      },
      schema: { message: t.string(), response: t.string() },
    })
    .sse("/clock", {
      // generator form: yield events, the stream closes when it's done
      async *open() {
        const IDS = [1, 2, 3];
        for (const i of IDS) {
          yield { event: "tick", id: String(i), data: { n: i } };
          await setTimeout(1000); // pause between ticks — don't yield the result
        }
      },
      schema: { event: t.object({ n: t.number() }) },
    })
    // CSRF demo: GET issues the token (read it from `csrf` cookie / this body),
    // then echo it back in `x-csrf-token` on the POST or it's rejected with 403.
    .get("/secure/token", (ctx) => Response.json({ csrf: ctx.state.csrf }))
    .post("/secure/echo", (ctx) => Response.json({ echoed: ctx.body }))
    .openapi({ title: "Cats API", version: "1.0.0" }) // -> GET /openapi.json
    .asyncapi({ title: "Cats Realtime", version: "1.0.0" }); // -> GET /asyncapi.json

  const server = app.listen(3005, (ctx) => {
    console.log(`HTTP server listening on port ${ctx.port?.toString()}`);
    console.log("  GET  /health");
    console.log("  GET  /cats          GET /cats/:name      POST /cats");
    console.log("  GET  /file          GET /asset           GET /realtime (stream)");
    console.log("  GET  /quote (Accept)  /quote_json  /quote_xml  /quote_fix");
    console.log("  WS   /realtime      WS  /realtime2        SSE /clock");
    console.log("  GET  /openapi.json  GET /asyncapi.json");
  });

  // Graceful shutdown: close the socket and dispose every controller. The same
  // teardown happens automatically with `await using server = app.listen(...)`
  // when the binding goes out of scope.
  process.once("SIGINT", async () => {
    console.log("\nSIGINT — shutting down…");
    await server[Symbol.asyncDispose]();
    // No process.exit needed: with the socket closed and every controller's
    // resources released, the event loop drains and the process exits on its own.
  });
}

newBootstrap();
