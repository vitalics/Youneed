// Run: pnpm --filter @youneed/server-middleware-authorization test
import { Test, expect, TestApplication } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import {
  authorization,
  createTokens,
  hmacAlgorithm,
  ed25519Algorithm,
  type SigningAlgorithm,
} from "../src/index.ts";

// A toy "custom algorithm" — a reversed-bytes XOR MAC. Stands in for "Кузнечик"
// or any национальный crypto suite: the package never inspects what it does.
function toyAlgorithm(secret: number): SigningAlgorithm<number> {
  const mac = (data: Uint8Array, key: number) => {
    let acc = key & 0xff;
    for (const b of data) acc = (acc ^ b ^ ((acc << 1) & 0xff)) & 0xff;
    return new Uint8Array([acc]);
  };
  return {
    name: "Toy",
    sign: (data, key) => mac(data, key),
    verify: (data, sig, key) => sig.length === 1 && sig[0] === mac(data, key)[0],
    generatePair: () => ({ privateKey: secret, publicKey: secret }),
  };
}

const tick = () => new Promise<void>((r) => setTimeout(r, 1));

// An async algorithm — sign/verify await (HSM / WebCrypto / DB latency). Proves
// the whole chain (sign → middleware verify) is await-safe.
function asyncToyAlgorithm(secret: number): SigningAlgorithm<number> {
  const base = toyAlgorithm(secret);
  return {
    name: "AsyncToy",
    sign: async (d, k) => (await tick(), base.sign(d, k)),
    verify: async (d, s, k) => (await tick(), base.verify(d, s, k)),
  };
}

const hmac = hmacAlgorithm("s3cret");
const ed = ed25519Algorithm();
const edPair = ed.generatePair!() as { privateKey: import("node:crypto").KeyObject; publicKey: import("node:crypto").KeyObject };
const toy = toyAlgorithm(0x5a);

const hmacTokens = createTokens({ algorithm: hmac, privateKey: null, issuer: "auth.test" });
const edTokens = createTokens({ algorithm: ed, privateKey: edPair.privateKey, publicKey: edPair.publicKey });
const toyTokens = createTokens({ algorithm: toy, privateKey: 0x5a });

const asyncToy = asyncToyAlgorithm(0x5a);
const asyncTokens = createTokens({ algorithm: asyncToy, privateKey: 0x5a });

// A "key store in a DB" — keyed by `kid`, resolved asynchronously per request.
const keyDb = new Map<string, number>([["k1", 0x5a], ["k2", 0x33]]);
const dbResolve = async (payload: Record<string, unknown>) => (await tick(), keyDb.get(payload.kid as string));

class AuthorizationSuite extends Test({ name: "server-middleware-authorization" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41230";

  @Test.beforeAll() async start() {
    const app = Application()
      .use("/hmac", authorization({ algorithm: hmac, issuer: "auth.test" }))
      .use("/ed", authorization({ algorithm: ed, key: edPair.publicKey }))
      .use("/toy", authorization({ prefix: "Token", algorithm: toy, key: 0x5a }))
      .use("/opaque", authorization({ verify: (t) => (t === "letmein" ? { id: 9 } : false) }))
      .use("/async", authorization({ algorithm: asyncToy, key: 0x5a }))
      .use("/db", authorization({ algorithm: toy, resolveKey: dbResolve }))
      .use("/maybe", authorization({ algorithm: hmac, optional: true }))
      .get("/hmac", (ctx) => Response.json(ctx.state.user))
      .get("/ed", (ctx) => Response.json(ctx.state.user))
      .get("/toy", (ctx) => Response.json(ctx.state.user))
      .get("/opaque", (ctx) => Response.json(ctx.state.user))
      .get("/async", (ctx) => Response.json(ctx.state.user))
      .get("/db", (ctx) => Response.json(ctx.state.user))
      .get("/maybe", (ctx) => Response.json({ user: ctx.state.user ?? null }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41230, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("HMAC algorithm: valid signed token → 200 + payload") async hmacOk() {
    const tok = await hmacTokens.sign({ sub: "u1" }, { expiresInSec: 60 });
    const r = await fetch(`${this.base}/hmac`, { headers: { authorization: `Bearer ${tok}` } });
    const b = (await r.json()) as { sub: string };
    expect(r.status === 200 && b.sub === "u1").toBeTruthy();
  }

  @Test.it("HMAC: tampered payload → 401") async hmacTampered() {
    const tok = await hmacTokens.sign({ sub: "u1" }, { expiresInSec: 60 });
    const bad = tok.replace(/^./, (c) => (c === "a" ? "b" : "a"));
    const r = await fetch(`${this.base}/hmac`, { headers: { authorization: `Bearer ${bad}` } });
    await r.body?.cancel();
    expect(r.status).toBe(401);
  }

  @Test.it("HMAC: expired token → 401") async hmacExpired() {
    const tok = await hmacTokens.sign({ sub: "u1" }, { expiresInSec: -10 });
    const r = await fetch(`${this.base}/hmac`, { headers: { authorization: `Bearer ${tok}` } });
    await r.body?.cancel();
    expect(r.status).toBe(401);
  }

  @Test.it("HMAC: wrong issuer → 401") async hmacIssuer() {
    const tok = await createTokens({ algorithm: hmac, privateKey: null }).sign({ sub: "u1", iss: "evil" });
    const r = await fetch(`${this.base}/hmac`, { headers: { authorization: `Bearer ${tok}` } });
    await r.body?.cancel();
    expect(r.status).toBe(401);
  }

  @Test.it("Ed25519 algorithm: round-trips sign → verify → 200") async edOk() {
    const tok = await edTokens.sign({ sub: "ed" });
    const r = await fetch(`${this.base}/ed`, { headers: { authorization: `Bearer ${tok}` } });
    const b = (await r.json()) as { sub: string };
    expect(r.status === 200 && b.sub === "ed").toBeTruthy();
  }

  @Test.it("custom 'Кузнечик'-style algorithm + custom prefix → 200") async toyOk() {
    const tok = await toyTokens.sign({ sub: "gost" });
    const r = await fetch(`${this.base}/toy`, { headers: { authorization: `Token ${tok}` } });
    const b = (await r.json()) as { sub: string };
    expect(r.status === 200 && b.sub === "gost").toBeTruthy();
  }

  @Test.it("custom algorithm: wrong key rejects → 401") async toyWrongKey() {
    const tok = await createTokens({ algorithm: toyAlgorithm(0x11), privateKey: 0x11 }).sign({ sub: "gost" });
    const r = await fetch(`${this.base}/toy`, { headers: { authorization: `Token ${tok}` } });
    await r.body?.cancel();
    expect(r.status).toBe(401);
  }

  @Test.it("async algorithm: awaited sign + verify → 200") async asyncOk() {
    const tok = await asyncTokens.sign({ sub: "async" });
    const r = await fetch(`${this.base}/async`, { headers: { authorization: `Bearer ${tok}` } });
    const b = (await r.json()) as { sub: string };
    expect(r.status === 200 && b.sub === "async").toBeTruthy();
  }

  @Test.it("async resolveKey: key fetched from 'DB' by kid → 200") async dbOk() {
    const tok = await toyTokens.sign({ sub: "u1", kid: "k1" }); // k1 → 0x5a
    const r = await fetch(`${this.base}/db`, { headers: { authorization: `Bearer ${tok}` } });
    const b = (await r.json()) as { sub: string };
    expect(r.status === 200 && b.sub === "u1").toBeTruthy();
  }

  @Test.it("async resolveKey: unknown kid → 401 (no key)") async dbNoKey() {
    const tok = await toyTokens.sign({ sub: "u1", kid: "nope" });
    const r = await fetch(`${this.base}/db`, { headers: { authorization: `Bearer ${tok}` } });
    await r.body?.cancel();
    expect(r.status).toBe(401);
  }

  @Test.it("opaque verify: known token → 200, principal set") async opaqueOk() {
    const r = await fetch(`${this.base}/opaque`, { headers: { authorization: "Bearer letmein" } });
    const b = (await r.json()) as { id: number };
    expect(r.status === 200 && b.id === 9).toBeTruthy();
  }

  @Test.it("opaque verify: unknown token → 401") async opaqueBad() {
    const r = await fetch(`${this.base}/opaque`, { headers: { authorization: "Bearer nope" } });
    await r.body?.cancel();
    expect(r.status).toBe(401);
  }

  @Test.it("no token + WWW-Authenticate challenge → 401") async noToken() {
    const r = await fetch(`${this.base}/hmac`);
    await r.body?.cancel();
    expect(r.status === 401 && (r.headers.get("www-authenticate") ?? "").includes("Bearer")).toBeTruthy();
  }

  @Test.it("optional route passes through with no token") async optional() {
    const r = await fetch(`${this.base}/maybe`);
    const b = (await r.json()) as { user: unknown };
    expect(r.status === 200 && b.user === null).toBeTruthy();
  }
}

await TestApplication().addTests(AuthorizationSuite).reporter(new ConsoleReporter()).run();
