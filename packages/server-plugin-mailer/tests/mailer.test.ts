// Run: pnpm --filter @youneed/server-plugin-mailer test
// Unit tests — a fake in-memory transport, the SigV4 signer, and the SMTP MIME
// builder. NO network / sockets are opened.
import { Test, TestApplication, expect } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { TrackedTransport, type MailMessage, type MailResult, type MailTransport } from "../src/index.ts";
import { buildMime } from "../src/smtp.ts";
import { signV4 } from "../src/ses.ts";

/** A fake transport that records every message it is asked to send. */
class FakeTransport implements MailTransport {
  readonly name = "fake";
  readonly sends: MailMessage[] = [];
  fail = false;
  async send(msg: MailMessage): Promise<MailResult> {
    if (this.fail) throw new Error("boom");
    this.sends.push(msg);
    return { id: `fake-${this.sends.length}`, accepted: Array.isArray(msg.to) ? msg.to : [msg.to] };
  }
}

class MailerSuite extends Test({ name: "@youneed/server-plugin-mailer" }) {
  @Test.it("records recent sends + increments the sent count") async tracksSends() {
    const fake = new FakeTransport();
    const t = new TrackedTransport(fake);
    const res = await t.send({ to: "ada@x.dev", subject: "hi", text: "hello" });
    expect(res.id).toBe("fake-1");
    expect(fake.sends.length).toBe(1);
    expect(t.sent).toBe(1);
    expect(t.failed).toBe(0);
    const recent = t.recent();
    expect(recent.length).toBe(1);
    expect(recent[0].to).toBe("ada@x.dev");
    expect(recent[0].subject).toBe("hi");
    expect(recent[0].ok).toBe(true);
  }

  @Test.it("records a failure without incrementing sent") async tracksFailure() {
    const fake = new FakeTransport();
    fake.fail = true;
    const t = new TrackedTransport(fake);
    let caught: Error | undefined;
    try {
      await t.send({ to: "x@y.dev", subject: "no" });
    } catch (e) {
      caught = e as Error;
    }
    expect(caught?.message).toBe("boom");
    expect(t.sent).toBe(0);
    expect(t.failed).toBe(1);
    const rec = t.recent()[0];
    expect(rec.ok).toBe(false);
    expect(rec.error).toBe("boom");
  }

  @Test.it("joins multiple recipients in the recorded `to`") async multiRecipient() {
    const fake = new FakeTransport();
    const t = new TrackedTransport(fake);
    const res = await t.send({ to: ["a@x.dev", "b@x.dev"], subject: "team", text: "hi" });
    expect(res.accepted).toEqual(["a@x.dev", "b@x.dev"]);
    expect(t.recent()[0].to).toBe("a@x.dev, b@x.dev");
    // the underlying transport still receives the array
    expect(fake.sends[0].to).toEqual(["a@x.dev", "b@x.dev"]);
  }

  @Test.it("caps the recent ring buffer") async ringBuffer() {
    const fake = new FakeTransport();
    const t = new TrackedTransport(fake, { recent: 3 });
    for (let i = 0; i < 5; i++) await t.send({ to: `u${i}@x.dev`, subject: `s${i}`, text: "x" });
    const recent = t.recent();
    expect(recent.length).toBe(3);
    expect(recent.map((r) => r.subject)).toEqual(["s2", "s3", "s4"]);
    expect(t.sent).toBe(5);
  }

  // ── SigV4 signer (SES) — no network ──────────────────────────────────────────

  @Test.it("signV4 builds the right canonical request + Authorization shape") sigv4() {
    const sig = signV4({
      method: "POST",
      host: "email.us-east-1.amazonaws.com",
      path: "/v2/email/outbound-emails",
      service: "ses",
      region: "us-east-1",
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
      payload: '{"a":1}',
      now: new Date("2015-08-30T12:36:00Z"),
    });
    // deterministic date fields
    expect(sig.amzDate).toBe("20150830T123600Z");
    expect(sig.dateStamp).toBe("20150830");
    expect(sig.credentialScope).toBe("20150830/us-east-1/ses/aws4_request");
    // headers signed, in sorted order
    expect(sig.signedHeaders).toBe("host;x-amz-content-sha256;x-amz-date");
    // canonical request: METHOD \n PATH \n QUERY \n headers... \n signedHeaders \n payloadHash
    const lines = sig.canonicalRequest.split("\n");
    expect(lines[0]).toBe("POST");
    expect(lines[1]).toBe("/v2/email/outbound-emails");
    expect(lines[2]).toBe(""); // no query
    expect(sig.canonicalRequest).toContain("host:email.us-east-1.amazonaws.com");
    expect(sig.canonicalRequest).toContain("x-amz-date:20150830T123600Z");
    // string-to-sign header + Authorization header shape
    expect(sig.stringToSign.split("\n")[0]).toBe("AWS4-HMAC-SHA256");
    expect(sig.authorization).toContain("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/ses/aws4_request");
    expect(sig.authorization).toContain("SignedHeaders=host;x-amz-content-sha256;x-amz-date");
    const signaturePart = sig.authorization.split("Signature=")[1] ?? "";
    expect(/^[0-9a-f]{64}$/.test(signaturePart)).toBe(true);
    expect(signaturePart).toBe(sig.signature);
  }

  @Test.it("signV4 is deterministic + includes the session token when present") sigv4Deterministic() {
    const input = {
      method: "POST",
      host: "email.eu-west-1.amazonaws.com",
      path: "/v2/email/outbound-emails",
      service: "ses",
      region: "eu-west-1",
      accessKeyId: "AKID",
      secretAccessKey: "SECRET",
      sessionToken: "TOKEN123",
      payload: "{}",
      now: new Date("2020-01-02T03:04:05Z"),
    };
    const a = signV4(input);
    const b = signV4(input);
    expect(a.signature).toBe(b.signature);
    expect(a.signedHeaders).toBe("host;x-amz-content-sha256;x-amz-date;x-amz-security-token");
    expect(a.canonicalRequest).toContain("x-amz-security-token:TOKEN123");
  }

  // ── SMTP MIME builder — no socket ────────────────────────────────────────────

  @Test.it("buildMime emits To/Subject and an html body") mimeHtml() {
    const mime = buildMime({ to: "ada@x.dev", subject: "Hello", html: "<b>hi</b>" }, "no-reply@acme.dev");
    expect(mime).toContain("From: no-reply@acme.dev");
    expect(mime).toContain("To: ada@x.dev");
    expect(mime).toContain("Subject: Hello");
    expect(mime).toContain("Content-Type: text/html; charset=utf-8");
    expect(mime).toContain("<b>hi</b>");
  }

  @Test.it("buildMime joins recipients + emits Cc; text+html → multipart/alternative") mimeMulti() {
    const mime = buildMime(
      { to: ["a@x.dev", "b@x.dev"], cc: "c@x.dev", subject: "Team", text: "plain", html: "<p>rich</p>" },
      "sender@acme.dev",
    );
    expect(mime).toContain("To: a@x.dev, b@x.dev");
    expect(mime).toContain("Cc: c@x.dev");
    expect(mime).toContain("multipart/alternative");
    expect(mime).toContain("text/plain");
    expect(mime).toContain("text/html");
    expect(mime).toContain("plain");
    expect(mime).toContain("<p>rich</p>");
  }
}

await TestApplication().addTests(MailerSuite).reporter(new ConsoleReporter()).run();
