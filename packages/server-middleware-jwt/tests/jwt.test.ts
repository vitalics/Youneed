// Run: pnpm --filter @youneed/server-middleware-jwt test
import { Test, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { TestApplication } from "@youneed/test";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { createHmac, createSign, generateKeyPairSync, constants } from "node:crypto";
import { jwt } from "../src/index.ts";

const b64 = (b: Buffer | string): string => Buffer.from(b).toString("base64url");
const part = (o: unknown): string => b64(JSON.stringify(o));

// HS256 signer
function signHS(payload: Record<string, unknown>, secret: string, alg = "HS256"): string {
  const digest = "sha" + alg.slice(2);
  const head = part({ alg, typ: "JWT" });
  const body = part(payload);
  const sig = b64(createHmac(digest, secret).update(`${head}.${body}`).digest());
  return `${head}.${body}.${sig}`;
}

// RS256 signer
const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
function signRS(payload: Record<string, unknown>, kid?: string): string {
  const head = part({ alg: "RS256", typ: "JWT", kid });
  const body = part(payload);
  const s = createSign("sha256").update(`${head}.${body}`).sign(rsa.privateKey);
  return `${head}.${body}.${b64(s)}`;
}

// ES256 signer (ieee-p1363 raw r||s)
const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
function signES(payload: Record<string, unknown>): string {
  const head = part({ alg: "ES256", typ: "JWT" });
  const body = part(payload);
  const s = createSign("sha256").update(`${head}.${body}`).sign({ key: ec.privateKey, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64(s)}`;
}

const SECRET = "topsecret";
const now = Math.floor(Date.now() / 1000);
const baseClaims = { sub: "u1", iss: "auth.test", aud: "api" };

class JwtSuite extends Test({ name: "server-middleware-jwt" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41210";

  @Test.beforeAll() async start() {
    const rsaPub = rsa.publicKey.export({ format: "jwk" }) as Record<string, unknown>;
    const app = Application()
      .use("/hs", jwt({ secret: SECRET, issuer: "auth.test", audience: "api" }))
      .use("/rs", jwt({ publicKey: rsa.publicKey, algorithms: ["RS256"] }))
      .use("/jwks", jwt({ jwks: { keys: [{ ...rsaPub, kid: "k1", kty: "RSA" }] }, algorithms: ["RS256"] }))
      .use("/es", jwt({ publicKey: ec.publicKey, algorithms: ["ES256"] }))
      .use("/maybe", jwt({ secret: SECRET, optional: true }))
      .get("/hs", (ctx) => Response.json(ctx.state.user))
      .get("/rs", (ctx) => Response.json(ctx.state.user))
      .get("/jwks", (ctx) => Response.json(ctx.state.user))
      .get("/es", (ctx) => Response.json(ctx.state.user))
      .get("/maybe", (ctx) => Response.json({ user: ctx.state.user ?? null }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41210, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("HS256: valid token → 200 + claims") async hsOk() {
    const tok = signHS({ ...baseClaims, exp: now + 60 }, SECRET);
    const r = await fetch(`${this.base}/hs`, { headers: { authorization: `Bearer ${tok}` } });
    const b = (await r.json()) as { sub: string };
    expect(r.status === 200 && b.sub === "u1").toBeTruthy();
  }

  @Test.it("HS256: tampered signature → 401") async hsBadSig() {
    const tok = signHS({ ...baseClaims, exp: now + 60 }, "wrongsecret");
    const r = await fetch(`${this.base}/hs`, { headers: { authorization: `Bearer ${tok}` } });
    await r.body?.cancel();
    expect(r.status).toBe(401);
  }

  @Test.it("HS256: expired token → 401") async hsExpired() {
    const tok = signHS({ ...baseClaims, exp: now - 10 }, SECRET);
    const r = await fetch(`${this.base}/hs`, { headers: { authorization: `Bearer ${tok}` } });
    await r.body?.cancel();
    expect(r.status).toBe(401);
  }

  @Test.it("HS256: wrong issuer → 401") async hsIssuer() {
    const tok = signHS({ ...baseClaims, iss: "evil", exp: now + 60 }, SECRET);
    const r = await fetch(`${this.base}/hs`, { headers: { authorization: `Bearer ${tok}` } });
    await r.body?.cancel();
    expect(r.status).toBe(401);
  }

  @Test.it("alg confusion: HS token to an RS route → 401 (alg not allowed)") async algConfusion() {
    const tok = signHS({ ...baseClaims, exp: now + 60 }, SECRET);
    const r = await fetch(`${this.base}/rs`, { headers: { authorization: `Bearer ${tok}` } });
    await r.body?.cancel();
    expect(r.status).toBe(401);
  }

  @Test.it("RS256: valid token via publicKey → 200") async rsOk() {
    const tok = signRS({ ...baseClaims, exp: now + 60 });
    const r = await fetch(`${this.base}/rs`, { headers: { authorization: `Bearer ${tok}` } });
    const b = (await r.json()) as { sub: string };
    expect(r.status === 200 && b.sub === "u1").toBeTruthy();
  }

  @Test.it("JWKS: valid token resolved by kid → 200") async jwksOk() {
    const tok = signRS({ ...baseClaims, exp: now + 60 }, "k1");
    const r = await fetch(`${this.base}/jwks`, { headers: { authorization: `Bearer ${tok}` } });
    const b = (await r.json()) as { sub: string };
    expect(r.status === 200 && b.sub === "u1").toBeTruthy();
  }

  @Test.it("ES256: valid token via publicKey → 200") async esOk() {
    const tok = signES({ ...baseClaims, exp: now + 60 });
    const r = await fetch(`${this.base}/es`, { headers: { authorization: `Bearer ${tok}` } });
    const b = (await r.json()) as { sub: string };
    expect(r.status === 200 && b.sub === "u1").toBeTruthy();
  }

  @Test.it("malformed token → 401") async malformed() {
    const r = await fetch(`${this.base}/hs`, { headers: { authorization: "Bearer not.a.jwt.token" } });
    await r.body?.cancel();
    expect(r.status).toBe(401);
  }

  @Test.it("optional route: no token → 200 passthrough") async optional() {
    const r = await fetch(`${this.base}/maybe`);
    const b = (await r.json()) as { user: unknown };
    expect(r.status === 200 && b.user === null).toBeTruthy();
  }
}

void constants; // (kept for parity with PS* algorithms in src)
await TestApplication().addTests(JwtSuite).reporter(new ConsoleReporter()).run();
