// Run: pnpm --filter @youneed/server-plugin-otp test
import { Test, expect, TestApplication } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { createServer, type Server } from "node:net";
import { otp, otpHandlers, type OtpChannel } from "../src/index.ts";
import { emailChannel } from "../src/email.ts";

// Capturing channel — records the last code sent to each recipient.
const sent: Record<string, string> = {};
const captureChannel: OtpChannel = { name: "test", send: (to, code) => void (sent[to] = code) };

// Injectable clock.
let clock = 1_700_000_000_000;

class OtpSuite extends Test({ name: "server-plugin-otp" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41300";

  @Test.beforeAll() async start() {
    const shared = {
      secret: "otp-secret",
      channels: { test: captureChannel },
      ttlSec: 300,
      maxAttempts: 3,
      resendCooldownSec: 60,
      now: () => clock,
      onVerify: (_ctx: unknown, info: { channel: string; to: string }) => Response.json({ verified: true, ...info }),
    };
    // Manual routing via otpHandlers — proves the handlers are routing-agnostic.
    const manual = otpHandlers({ ...shared, resendCooldownSec: 0 });
    const app = Application()
      .plugin(otp(shared)) // defaults → /otp/request, /otp/verify
      .plugin(otp({ ...shared, resendCooldownSec: 0, routes: { request: "/auth/code", verify: "/auth/code/check" } }))
      .post("/login/start", manual.request)
      .post("/login/finish", manual.verify);
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41300, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  #req(path: string, body: unknown) {
    return fetch(`${this.base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  }

  @Test.it("request: sends a 6-digit code, never returns it") async request() {
    const to = "a@x.dev";
    const r = await this.#req("/otp/request", { channel: "test", to });
    const b = (await r.json()) as { ok: boolean; expiresIn: number; code?: string };
    expect(r.status === 200 && b.ok && b.expiresIn === 300 && b.code === undefined && /^\d{6}$/.test(sent[to])).toBeTruthy();
  }

  @Test.it("verify: correct code → onVerify, then single-use (second fails)") async verify() {
    const to = "verify@x.dev";
    await this.#req("/otp/request", { channel: "test", to });
    const ok = await this.#req("/otp/verify", { channel: "test", to, code: sent[to] });
    const b = (await ok.json()) as { verified: boolean; channel: string; to: string };
    const again = await this.#req("/otp/verify", { channel: "test", to, code: sent[to] });
    await again.body?.cancel();
    expect(ok.status === 200 && b.verified && b.channel === "test" && b.to === to && again.status === 401).toBeTruthy();
  }

  @Test.it("verify: wrong code → 401") async wrong() {
    const to = "wrong@x.dev";
    await this.#req("/otp/request", { channel: "test", to });
    const r = await this.#req("/otp/verify", { channel: "test", to, code: "000000" });
    await r.body?.cancel();
    expect(r.status).toBe(401);
  }

  @Test.it("attempts: after maxAttempts wrong tries the challenge is locked (429)") async lockout() {
    const to = "lock@x.dev";
    await this.#req("/otp/request", { channel: "test", to });
    for (let i = 0; i < 3; i++) await (await this.#req("/otp/verify", { channel: "test", to, code: "111111" })).body?.cancel();
    // even the CORRECT code is now rejected
    const r = await this.#req("/otp/verify", { channel: "test", to, code: sent[to] });
    await r.body?.cancel();
    expect(r.status).toBe(429);
  }

  @Test.it("expiry: a code past its TTL → 401") async expiry() {
    const to = "exp@x.dev";
    await this.#req("/otp/request", { channel: "test", to });
    const code = sent[to];
    clock += 301_000; // advance past 300s TTL
    const r = await this.#req("/otp/verify", { channel: "test", to, code });
    await r.body?.cancel();
    clock -= 301_000;
    expect(r.status).toBe(401);
  }

  @Test.it("cooldown: a second request too soon → 429") async cooldown() {
    const to = "cool@x.dev";
    await (await this.#req("/otp/request", { channel: "test", to })).body?.cancel();
    const r = await this.#req("/otp/request", { channel: "test", to });
    await r.body?.cancel();
    expect(r.status === 429 && !!r.headers.get("retry-after")).toBeTruthy();
  }

  @Test.it("unknown channel → 400") async unknownChannel() {
    const r = await this.#req("/otp/request", { channel: "nope", to: "x@x.dev" });
    await r.body?.cancel();
    expect(r.status).toBe(400);
  }

  @Test.it("custom routes: full flow on overridden paths") async customRoutes() {
    const to = "custom@x.dev";
    const req = await this.#req("/auth/code", { channel: "test", to });
    await req.body?.cancel();
    const ver = await this.#req("/auth/code/check", { channel: "test", to, code: sent[to] });
    const b = (await ver.json()) as { verified: boolean };
    expect(req.status === 200 && ver.status === 200 && b.verified).toBeTruthy();
  }

  @Test.it("otpHandlers: full flow on hand-wired routes") async manualHandlers() {
    const to = "manual@x.dev";
    const req = await this.#req("/login/start", { channel: "test", to });
    await req.body?.cancel();
    const ver = await this.#req("/login/finish", { channel: "test", to, code: sent[to] });
    const b = (await ver.json()) as { verified: boolean };
    expect(req.status === 200 && ver.status === 200 && b.verified).toBeTruthy();
  }

  @Test.it("email channel: delivers the code over SMTP") async email() {
    // A tiny loopback SMTP server that captures the DATA payload.
    let resolveMsg!: (s: string) => void;
    const received = new Promise<string>((res) => (resolveMsg = res));
    const srv: Server = createServer((sock) => {
      sock.write("220 fake ESMTP\r\n");
      let buf = "";
      let inData = false;
      let data = "";
      sock.on("data", (d) => {
        buf += d.toString("utf8");
        let i: number;
        while ((i = buf.indexOf("\r\n")) !== -1) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 2);
          if (inData) {
            if (line === ".") {
              inData = false;
              sock.write("250 OK\r\n");
              resolveMsg(data);
            } else data += line + "\n";
            continue;
          }
          const u = line.toUpperCase();
          if (u.startsWith("DATA")) {
            sock.write("354 go\r\n");
            inData = true;
          } else if (u.startsWith("QUIT")) {
            sock.write("221 bye\r\n");
            sock.end();
          } else {
            sock.write("250 OK\r\n"); // EHLO/MAIL/RCPT
          }
        }
      });
    });
    await new Promise<void>((res) => srv.listen(42525, "127.0.0.1", res));

    const channel = emailChannel({ host: "127.0.0.1", port: 42525, from: "OTP <otp@x.dev>", subject: "Code", text: (c) => `Your code: ${c}` });
    await channel.send("user@x.dev", "424242", null as never);
    const msg = await received;
    await new Promise<void>((res) => srv.close(() => res()));

    expect(msg.includes("Your code: 424242") && msg.includes("Subject: Code") && msg.includes("To: user@x.dev")).toBeTruthy();
  }
}

await TestApplication().addTests(OtpSuite).reporter(new ConsoleReporter()).run();
