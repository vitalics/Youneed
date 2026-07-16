// Run: pnpm --filter @youneed/server-middleware-webhook-signature test
import { Test, expect, TestApplication } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { createHmac } from "node:crypto";
import { webhookSignature, verifyWebhookSignature } from "../src/index.ts";
import stripe from "../src/stripe.ts";
import github from "../src/github.ts";
import shopify from "../src/shopify.ts";

const hex = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("hex");
const b64 = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("base64");
const now = () => Math.floor(Date.now() / 1000);

// A user-defined provider built on the generic builder — with an ASYNC parse
// (simulating signature parsing that hops to another service).
function acme(secret: string) {
  return webhookSignature({
    secret,
    header: "x-acme-signature",
    async parse(value) {
      await Promise.resolve();
      return { signatures: [value.replace(/^v1=/, "")] };
    },
  });
}

class WebhookSuite extends Test({ name: "server-middleware-webhook-signature" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41360";

  @Test.beforeAll() async start() {
    const app = Application()
      .use("/github", github("ghsecret"))
      .use("/stripe", stripe("whsec"))
      .use("/shopify", shopify("shopsecret"))
      .use("/acme", acme("acmesecret"))
      .post("/github", () => Response.json({ ok: true }))
      .post("/stripe", () => Response.json({ ok: true }))
      .post("/shopify", () => Response.json({ ok: true }))
      .post("/acme", () => Response.json({ ok: true }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41360, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("verifyWebhookSignature: pure validation (no Context)") async pure() {
    const body = '{"event":"ping"}';
    const opts = { secret: "s3cret", header: "x-signature", prefix: "sha256=" };
    const good = await verifyWebhookSignature(opts, { rawBody: body, headers: { "x-signature": `sha256=${hex("s3cret", body)}` } });
    const bad = await verifyWebhookSignature(opts, { rawBody: body + "x", headers: { "x-signature": `sha256=${hex("s3cret", body)}` } });
    const missing = await verifyWebhookSignature(opts, { rawBody: body, headers: {} });
    expect(good.valid && !bad.valid && bad.reason === "signature mismatch" && missing.reason === "missing signature header").toBeTruthy();
  }

  @Test.it("github: valid sha256= signature → 200") async githubOk() {
    const body = JSON.stringify({ action: "opened" });
    const r = await fetch(`${this.base}/github`, { method: "POST", headers: { "x-hub-signature-256": `sha256=${hex("ghsecret", body)}` }, body });
    await r.body?.cancel();
    expect(r.status).toBe(200);
  }

  @Test.it("github: tampered body → 401") async githubBad() {
    const body = JSON.stringify({ action: "opened" });
    const r = await fetch(`${this.base}/github`, { method: "POST", headers: { "x-hub-signature-256": `sha256=${hex("ghsecret", body)}` }, body: body + "!" });
    await r.body?.cancel();
    expect(r.status).toBe(401);
  }

  @Test.it("stripe: valid t.body signature → 200") async stripeOk() {
    const body = JSON.stringify({ id: "evt_1" });
    const t = now();
    const r = await fetch(`${this.base}/stripe`, { method: "POST", headers: { "stripe-signature": `t=${t},v1=${hex("whsec", `${t}.${body}`)}` }, body });
    await r.body?.cancel();
    expect(r.status).toBe(200);
  }

  @Test.it("stripe: stale timestamp → 401 (replay protection)") async stripeReplay() {
    const body = JSON.stringify({ id: "evt_1" });
    const t = now() - 10_000;
    const r = await fetch(`${this.base}/stripe`, { method: "POST", headers: { "stripe-signature": `t=${t},v1=${hex("whsec", `${t}.${body}`)}` }, body });
    await r.body?.cancel();
    expect(r.status).toBe(401);
  }

  @Test.it("shopify: valid base64 signature → 200") async shopifyOk() {
    const body = JSON.stringify({ id: 1 });
    const r = await fetch(`${this.base}/shopify`, { method: "POST", headers: { "x-shopify-hmac-sha256": b64("shopsecret", body) }, body });
    await r.body?.cancel();
    expect(r.status).toBe(200);
  }

  @Test.it("custom provider with async parse → 200") async acmeOk() {
    const body = JSON.stringify({ hi: true });
    const r = await fetch(`${this.base}/acme`, { method: "POST", headers: { "x-acme-signature": `v1=${hex("acmesecret", body)}` }, body });
    await r.body?.cancel();
    expect(r.status).toBe(200);
  }

  @Test.it("missing header → 401") async missing() {
    const r = await fetch(`${this.base}/github`, { method: "POST", body: "{}" });
    await r.body?.cancel();
    expect(r.status).toBe(401);
  }
}

await TestApplication().addTests(WebhookSuite).reporter(new ConsoleReporter()).run();
