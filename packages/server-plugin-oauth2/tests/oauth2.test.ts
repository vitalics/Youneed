// Run: pnpm --filter @youneed/server-plugin-oauth2 test
import { Test, expect, TestApplication } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application, Response } from "@youneed/server";
import type { HTTP } from "@youneed/server";
import { createHash, createHmac } from "node:crypto";
import { oauth2, defineProvider, type FetchLike } from "../src/index.ts";
import { github } from "../src/providers/github.ts";
import { facebook } from "../src/providers/facebook.ts";
import { yandex } from "../src/providers/yandex.ts";
import { vk } from "../src/providers/vk.ts";
import { keycloak } from "../src/providers/keycloak.ts";
import { auth0 } from "../src/providers/auth0.ts";
import { clerk } from "../src/providers/clerk.ts";
import { entra } from "../src/providers/entra.ts";
import { gitlab } from "../src/providers/gitlab.ts";
import { discord } from "../src/providers/discord.ts";
import { apple, appleClientSecret } from "../src/providers/apple.ts";
import { twitch } from "../src/providers/twitch.ts";
import { linkedin } from "../src/providers/linkedin.ts";
import { slack } from "../src/providers/slack.ts";
import { spotify } from "../src/providers/spotify.ts";
import { bitbucket } from "../src/providers/bitbucket.ts";
import { okta } from "../src/providers/okta.ts";
import { cognito } from "../src/providers/cognito.ts";
import { verifyTelegramLogin, telegramLogin } from "../src/providers/telegram.ts";

// Injected fetch — simulates the provider's token + userinfo endpoints (no network).
const fake: FetchLike = async (input) => {
  const url = String(input);
  // NB: web Response (globalThis) — `Response` from @youneed/server is the HttpResult builder.
  const J = (o: unknown, status = 200) =>
    new globalThis.Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
  if (url.includes("token.test/token") || url.includes("github.com/login/oauth/access_token"))
    return J({ access_token: "at_1", token_type: "bearer", expires_in: 3600 });
  if (url.includes("userinfo.test/me")) return J({ id: 7, email: "u7@x.dev", name: "User Seven" });
  if (url.includes("api.github.com/user/emails")) return J([{ email: "octo@x.dev", primary: true, verified: true }]);
  if (url.includes("api.github.com/user")) return J({ id: 42, login: "octocat", name: "Octo Cat", email: null });
  // facebook
  if (url.includes("graph.facebook.com") && url.includes("oauth/access_token")) return J({ access_token: "fb_at", token_type: "bearer", expires_in: 3600 });
  if (url.includes("graph.facebook.com") && url.includes("/me")) return J({ id: "fb1", name: "FB User", email: "fb@x.dev", picture: { data: { url: "https://pic/fb" } } });
  // yandex
  if (url.includes("oauth.yandex.ru/token")) return J({ access_token: "ya_at", token_type: "bearer", expires_in: 3600 });
  if (url.includes("login.yandex.ru/info")) return J({ id: "ya1", default_email: "ya@ya.ru", real_name: "Ya Name", login: "yalogin" });
  // vk — email arrives in the TOKEN response; profile via users.get
  if (url.includes("oauth.vk.com/access_token")) return J({ access_token: "vk_at", user_id: 555, email: "vk@x.dev", expires_in: 0 });
  if (url.includes("api.vk.com/method/users.get")) return J({ response: [{ id: 555, first_name: "Vlad", last_name: "K", photo_200: "https://pic/vk" }] });
  // keycloak (OIDC, realm-scoped)
  if (url.includes("/protocol/openid-connect/token")) return J({ access_token: "kc_at", token_type: "bearer", expires_in: 3600 });
  if (url.includes("/protocol/openid-connect/userinfo")) return J({ sub: "kc1", email: "kc@x.dev", name: "KC User", preferred_username: "kcuser" });
  // auth0
  if (url.includes("auth0.com/oauth/token")) return J({ access_token: "a0_at", token_type: "bearer", expires_in: 3600 });
  if (url.includes("auth0.com/userinfo")) return J({ sub: "auth0|1", email: "a0@x.dev", name: "A0 User", picture: "https://pic/a0" });
  // clerk
  if (url.includes("clerk") && url.includes("/oauth/token")) return J({ access_token: "ck_at", token_type: "bearer", expires_in: 3600 });
  if (url.includes("clerk") && url.includes("/oauth/userinfo")) return J({ sub: "clerk1", email: "ck@x.dev", name: "CK User", picture: "https://pic/ck" });
  // entra (Azure AD)
  if (url.includes("login.microsoftonline.com") && url.includes("/token")) return J({ access_token: "ms_at", token_type: "bearer", expires_in: 3600 });
  if (url.includes("graph.microsoft.com/oidc/userinfo")) return J({ sub: "ms1", email: "ms@x.dev", name: "MS User" });
  // gitlab
  if (url.includes("gitlab.com/oauth/token")) return J({ access_token: "gl_at", token_type: "bearer", expires_in: 3600 });
  if (url.includes("gitlab.com/oauth/userinfo")) return J({ sub: "gl1", email: "gl@x.dev", name: "GL User", nickname: "glnick", picture: "https://pic/gl" });
  // discord
  if (url.includes("discord.com/api/oauth2/token")) return J({ access_token: "dc_at", token_type: "bearer", expires_in: 3600 });
  if (url.includes("discord.com/api/users/@me")) return J({ id: "dc1", email: "dc@x.dev", username: "dcuser", global_name: "DC User", avatar: "abc" });
  // apple (token endpoint returns an id_token; no userinfo endpoint)
  if (url.includes("appleid.apple.com/auth/token")) return J({ access_token: "ap_at", token_type: "bearer", id_token: appleIdToken() });
  // twitch (token + Helix /users)
  if (url.includes("id.twitch.tv/oauth2/token")) return J({ access_token: "tw_at", token_type: "bearer", expires_in: 3600 });
  if (url.includes("api.twitch.tv/helix/users")) return J({ data: [{ id: "tw1", login: "twlogin", display_name: "TW User", email: "tw@x.dev", profile_image_url: "https://pic/tw" }] });
  // linkedin
  if (url.includes("linkedin.com/oauth/v2/accessToken")) return J({ access_token: "li_at", token_type: "bearer", expires_in: 3600 });
  if (url.includes("api.linkedin.com/v2/userinfo")) return J({ sub: "li1", email: "li@x.dev", name: "LI User", picture: "https://pic/li" });
  // slack
  if (url.includes("slack.com/api/openid.connect.token")) return J({ ok: true, access_token: "sl_at", token_type: "Bearer" });
  if (url.includes("slack.com/api/openid.connect.userInfo")) return J({ sub: "sl1", email: "sl@x.dev", name: "SL User", "https://slack.com/team_id": "T1" });
  // spotify
  if (url.includes("accounts.spotify.com/api/token")) return J({ access_token: "sp_at", token_type: "bearer", expires_in: 3600 });
  if (url.includes("api.spotify.com/v1/me")) return J({ id: "sp1", email: "sp@x.dev", display_name: "SP User", images: [{ url: "https://pic/sp" }] });
  // bitbucket (user + emails)
  if (url.includes("bitbucket.org/site/oauth2/access_token")) return J({ access_token: "bb_at", token_type: "bearer", expires_in: 3600 });
  if (url.includes("api.bitbucket.org/2.0/user/emails")) return J({ values: [{ email: "bb@x.dev", is_primary: true, is_confirmed: true }] });
  if (url.includes("api.bitbucket.org/2.0/user")) return J({ account_id: "bb1", display_name: "BB User", username: "bbuser", links: { avatar: { href: "https://pic/bb" } } });
  // okta
  if (url.includes("dev-1.okta.com/oauth2/v1/token")) return J({ access_token: "ok_at", token_type: "bearer", expires_in: 3600 });
  if (url.includes("dev-1.okta.com/oauth2/v1/userinfo")) return J({ sub: "ok1", email: "ok@x.dev", name: "OK User" });
  // cognito
  if (url.includes("amazoncognito.com/oauth2/token")) return J({ access_token: "cg_at", token_type: "bearer", expires_in: 3600 });
  if (url.includes("amazoncognito.com/oauth2/userInfo")) return J({ sub: "cg1", email: "cg@x.dev", name: "CG User", "cognito:username": "cguser" });
  return J({ error: "unexpected: " + url }, 400);
};

// Apple delivers identity in the id_token (we decode, don't re-verify).
const appleB64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const appleIdToken = () =>
  `${appleB64({ alg: "ES256", kid: "k1" })}.${appleB64({ sub: "001234.abcd", email: "user@privaterelay.appleid.com", email_verified: "true" })}.sig`;

// EC P-256 key for signing Apple's ES256 client_secret.
const appleKey = generateKeyPairSync("ec", { namedCurve: "P-256" });

// A valid Telegram Login Widget payload signed with a bot token.
function telegramData(botToken: string, fields: Record<string, string>): Record<string, string> {
  const checkString = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const secret = createHash("sha256").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(checkString).digest("hex");
  return { ...fields, hash };
}

// A user-defined provider built on the universal `defineProvider` (build-your-own).
const testProvider = defineProvider({
  name: "test",
  clientId: "cid",
  clientSecret: "sec",
  authorizeUrl: "https://provider.test/authorize",
  tokenUrl: "https://token.test/token",
  userInfoUrl: "https://userinfo.test/me",
  scopes: ["email"],
  pkce: true,
  profile: (raw) => ({ id: String(raw.id), email: raw.email, name: raw.name, raw }),
});

class OAuth2Suite extends Test({ name: "server-plugin-oauth2" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41290";

  tgToken = "12345:botsecret";

  @Test.beforeAll() async start() {
    const app = Application()
      .plugin(
        oauth2({
          secret: "s3kret",
          fetch: fake,
          providers: {
            test: testProvider,
            github: github({ clientId: "ghid", clientSecret: "ghsec" }),
            facebook: facebook({ clientId: "fbid", clientSecret: "fbsec" }),
            yandex: yandex({ clientId: "yaid", clientSecret: "yasec" }),
            vk: vk({ clientId: "vkid", clientSecret: "vksec" }),
            keycloak: keycloak({ clientId: "kcid", clientSecret: "kcsec", baseUrl: "https://kc.test", realm: "myrealm" }),
            auth0: auth0({ clientId: "a0id", clientSecret: "a0sec", domain: "tenant.auth0.com" }),
            clerk: clerk({ clientId: "ckid", clientSecret: "cksec", domain: "app.clerk.test" }),
            entra: entra({ clientId: "msid", clientSecret: "mssec", tenant: "common" }),
            gitlab: gitlab({ clientId: "glid", clientSecret: "glsec" }),
            discord: discord({ clientId: "dcid", clientSecret: "dcsec" }),
            twitch: twitch({ clientId: "twid", clientSecret: "twsec" }),
            linkedin: linkedin({ clientId: "liid", clientSecret: "lisec" }),
            slack: slack({ clientId: "slid", clientSecret: "slsec" }),
            spotify: spotify({ clientId: "spid", clientSecret: "spsec" }),
            bitbucket: bitbucket({ clientId: "bbid", clientSecret: "bbsec" }),
            okta: okta({ clientId: "okid", clientSecret: "oksec", domain: "dev-1.okta.com" }),
            cognito: cognito({ clientId: "cgid", clientSecret: "cgsec", region: "eu-central-1", poolDomain: "myapp" }),
          },
          onLogin: (_ctx, r) => Response.json({ provider: r.provider, profile: r.profile }),
        }),
      )
      // Apple: signed ES256 client_secret + response_mode=form_post (POST callback).
      .plugin(
        oauth2({
          secret: "s3kret",
          fetch: fake,
          cookieSameSite: "None",
          providers: {
            apple: apple({
              clientId: "com.acme.web",
              clientSecret: appleClientSecret({ teamId: "TEAM123", clientId: "com.acme.web", keyId: "KEY123", privateKey: appleKey.privateKey.export({ type: "pkcs8", format: "pem" }) as string }),
            }),
          },
          onLogin: (_ctx, r) => Response.json({ provider: r.provider, profile: r.profile }),
        }),
      )
      // Second instance with CUSTOM route paths (default routing stays as above).
      .plugin(
        oauth2({
          secret: "s3kret",
          fetch: fake,
          routes: { login: (p) => `/login/${p}`, callback: (p) => `/callback/${p}` },
          providers: { test: testProvider },
          onLogin: (_ctx, r) => Response.json({ provider: r.provider, profile: r.profile }),
        }),
      )
      .get("/auth/telegram/callback", telegramLogin({ botToken: this.tgToken, onLogin: (_ctx, user) => Response.json({ user }) }));
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41290, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  // Start the flow, returning the authorize redirect + the state cookie pair.
  async #begin(key: string) {
    const r = await fetch(`${this.base}/auth/${key}`, { redirect: "manual" });
    await r.body?.cancel();
    const location = r.headers.get("location") ?? "";
    const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0]; // oauth2_state=…
    const state = new URL(location).searchParams.get("state") ?? "";
    return { status: r.status, location, cookie, state };
  }

  @Test.it("login → 302 to authorize URL with PKCE + state + cookie") async login() {
    const { status, location, cookie, state } = await this.#begin("test");
    const u = new URL(location);
    expect(
      status === 302 &&
        u.origin + u.pathname === "https://provider.test/authorize" &&
        u.searchParams.get("client_id") === "cid" &&
        u.searchParams.get("code_challenge_method") === "S256" &&
        !!u.searchParams.get("code_challenge") &&
        state.length > 0 &&
        cookie.startsWith("oauth2_state="),
    ).toBeTruthy();
  }

  @Test.it("full flow: callback exchanges code → onLogin gets the profile") async callback() {
    const { cookie, state } = await this.#begin("test");
    const r = await fetch(`${this.base}/auth/test/callback?code=abc&state=${state}`, { headers: { cookie }, redirect: "manual" });
    const b = (await r.json()) as { provider: string; profile: { id: string; email: string } };
    expect(r.status === 200 && b.provider === "test" && b.profile.id === "7" && b.profile.email === "u7@x.dev").toBeTruthy();
  }

  @Test.it("callback: state mismatch → 401") async stateMismatch() {
    const { cookie } = await this.#begin("test");
    const r = await fetch(`${this.base}/auth/test/callback?code=abc&state=WRONG`, { headers: { cookie }, redirect: "manual" });
    await r.body?.cancel();
    expect(r.status).toBe(401);
  }

  @Test.it("callback: no state cookie → 401") async noCookie() {
    const { state } = await this.#begin("test");
    const r = await fetch(`${this.base}/auth/test/callback?code=abc&state=${state}`, { redirect: "manual" });
    await r.body?.cancel();
    expect(r.status).toBe(401);
  }

  @Test.it("github provider: login redirects to github.com authorize") async githubLogin() {
    const { location } = await this.#begin("github");
    const u = new URL(location);
    expect(u.origin + u.pathname === "https://github.com/login/oauth/authorize" && u.searchParams.get("client_id") === "ghid").toBeTruthy();
  }

  @Test.it("github provider: callback resolves login + primary email") async githubCallback() {
    const { cookie, state } = await this.#begin("github");
    const r = await fetch(`${this.base}/auth/github/callback?code=abc&state=${state}`, { headers: { cookie }, redirect: "manual" });
    const b = (await r.json()) as { profile: { login: string; email: string; id: string } };
    expect(b.profile.login === "octocat" && b.profile.email === "octo@x.dev" && b.profile.id === "42").toBeTruthy();
  }

  async #full(key: string) {
    const { cookie, state } = await this.#begin(key);
    const r = await fetch(`${this.base}/auth/${key}/callback?code=abc&state=${state}`, { headers: { cookie }, redirect: "manual" });
    return (await r.json()) as { provider: string; profile: { id: string; email?: string; name?: string } };
  }

  @Test.it("facebook provider: full flow → profile") async facebook() {
    const b = await this.#full("facebook");
    expect(b.profile.id === "fb1" && b.profile.email === "fb@x.dev" && b.profile.name === "FB User").toBeTruthy();
  }

  @Test.it("yandex provider: userinfo via OAuth scheme → profile") async yandex() {
    const b = await this.#full("yandex");
    expect(b.profile.id === "ya1" && b.profile.email === "ya@ya.ru" && b.profile.name === "Ya Name").toBeTruthy();
  }

  @Test.it("vk provider: email from token + name from users.get") async vk() {
    const b = await this.#full("vk");
    expect(b.profile.id === "555" && b.profile.email === "vk@x.dev" && b.profile.name === "Vlad K").toBeTruthy();
  }

  @Test.it("keycloak provider: realm-scoped login + OIDC profile") async keycloak() {
    const { location } = await this.#begin("keycloak");
    const b = await this.#full("keycloak");
    expect(location.startsWith("https://kc.test/realms/myrealm/protocol/openid-connect/auth") && b.profile.id === "kc1" && b.profile.email === "kc@x.dev").toBeTruthy();
  }

  @Test.it("auth0 provider: full flow → profile") async auth0() {
    const { location } = await this.#begin("auth0");
    const b = await this.#full("auth0");
    expect(location.startsWith("https://tenant.auth0.com/authorize") && b.profile.id === "auth0|1" && b.profile.email === "a0@x.dev").toBeTruthy();
  }

  @Test.it("clerk provider: full flow → profile") async clerk() {
    const { location } = await this.#begin("clerk");
    const b = await this.#full("clerk");
    expect(location.startsWith("https://app.clerk.test/oauth/authorize") && b.profile.id === "clerk1" && b.profile.email === "ck@x.dev").toBeTruthy();
  }

  @Test.it("entra provider: tenant-scoped login + Graph userinfo") async entra() {
    const { location } = await this.#begin("entra");
    const b = await this.#full("entra");
    expect(location.startsWith("https://login.microsoftonline.com/common/oauth2/v2.0/authorize") && b.profile.id === "ms1" && b.profile.email === "ms@x.dev").toBeTruthy();
  }

  @Test.it("gitlab provider: full flow → profile") async gitlab() {
    const { location } = await this.#begin("gitlab");
    const b = await this.#full("gitlab");
    expect(location.startsWith("https://gitlab.com/oauth/authorize") && b.profile.id === "gl1" && b.profile.email === "gl@x.dev").toBeTruthy();
  }

  @Test.it("discord provider: full flow → profile + avatar URL") async discord() {
    const b = await this.#full("discord");
    const avatar = (b.profile as { avatarUrl?: string }).avatarUrl ?? "";
    expect(b.profile.id === "dc1" && b.profile.email === "dc@x.dev" && avatar === "https://cdn.discordapp.com/avatars/dc1/abc.png").toBeTruthy();
  }

  @Test.it("apple provider: form_post POST callback + signed secret + id_token profile") async apple() {
    const login = await fetch(`${this.base}/auth/apple`, { redirect: "manual" });
    await login.body?.cancel();
    const u = new URL(login.headers.get("location") ?? "");
    const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
    const state = u.searchParams.get("state") ?? "";
    const r = await fetch(`${this.base}/auth/apple/callback`, {
      method: "POST",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code: "abc", state }).toString(),
      redirect: "manual",
    });
    const b = (await r.json()) as { provider: string; profile: { id: string; email: string } };
    expect(
      u.origin + u.pathname === "https://appleid.apple.com/auth/authorize" &&
        u.searchParams.get("response_mode") === "form_post" &&
        r.status === 200 &&
        b.profile.id === "001234.abcd" &&
        b.profile.email === "user@privaterelay.appleid.com",
    ).toBeTruthy();
  }

  @Test.it("twitch provider: Helix profile with Client-Id header") async twitch() {
    const b = await this.#full("twitch");
    expect(b.profile.id === "tw1" && b.profile.email === "tw@x.dev" && b.profile.name === "TW User").toBeTruthy();
  }

  @Test.it("linkedin provider: OIDC userinfo → profile") async linkedin() {
    const b = await this.#full("linkedin");
    expect(b.profile.id === "li1" && b.profile.email === "li@x.dev" && b.profile.name === "LI User").toBeTruthy();
  }

  @Test.it("slack provider: OIDC userinfo → profile") async slack() {
    const b = await this.#full("slack");
    expect(b.profile.id === "sl1" && b.profile.email === "sl@x.dev").toBeTruthy();
  }

  @Test.it("spotify provider: /v1/me → profile + avatar") async spotify() {
    const b = await this.#full("spotify");
    const avatar = (b.profile as { avatarUrl?: string }).avatarUrl ?? "";
    expect(b.profile.id === "sp1" && b.profile.email === "sp@x.dev" && avatar === "https://pic/sp").toBeTruthy();
  }

  @Test.it("bitbucket provider: user + primary email") async bitbucket() {
    const b = await this.#full("bitbucket");
    expect(b.profile.id === "bb1" && b.profile.email === "bb@x.dev" && b.profile.name === "BB User").toBeTruthy();
  }

  @Test.it("okta provider: domain-scoped login + OIDC profile") async okta() {
    const { location } = await this.#begin("okta");
    const b = await this.#full("okta");
    expect(location.startsWith("https://dev-1.okta.com/oauth2/v1/authorize") && b.profile.id === "ok1" && b.profile.email === "ok@x.dev").toBeTruthy();
  }

  @Test.it("cognito provider: hosted-UI login + OIDC profile") async cognito() {
    const { location } = await this.#begin("cognito");
    const b = await this.#full("cognito");
    expect(location.startsWith("https://myapp.auth.eu-central-1.amazoncognito.com/oauth2/authorize") && b.profile.id === "cg1" && b.profile.email === "cg@x.dev").toBeTruthy();
  }

  @Test.it("custom routes: login/callback at overridden paths, redirect_uri matches") async customRoutes() {
    const r = await fetch(`${this.base}/login/test`, { redirect: "manual" });
    await r.body?.cancel();
    const u = new URL(r.headers.get("location") ?? "");
    const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
    const state = u.searchParams.get("state") ?? "";
    const redirectUri = u.searchParams.get("redirect_uri") ?? "";
    const cb = await fetch(`${this.base}/callback/test?code=abc&state=${state}`, { headers: { cookie }, redirect: "manual" });
    const b = (await cb.json()) as { provider: string; profile: { id: string } };
    expect(r.status === 302 && redirectUri.endsWith("/callback/test") && cb.status === 200 && b.profile.id === "7").toBeTruthy();
  }

  @Test.it("telegram: verifyTelegramLogin accepts a valid signature, rejects a tampered one") telegramVerify() {
    const data = telegramData(this.tgToken, { id: "99", first_name: "Tg", auth_date: String(Math.floor(Date.now() / 1000)) });
    const ok = verifyTelegramLogin(this.tgToken, data);
    const bad = verifyTelegramLogin(this.tgToken, { ...data, first_name: "Hacked" });
    expect(ok?.id === 99 && ok?.firstName === "Tg" && bad === null).toBeTruthy();
  }

  @Test.it("telegram: login handler verifies the widget payload → onLogin") async telegramHandler() {
    const data = telegramData(this.tgToken, { id: "77", first_name: "Wid", auth_date: String(Math.floor(Date.now() / 1000)) });
    const qs = new URLSearchParams(data).toString();
    const r = await fetch(`${this.base}/auth/telegram/callback?${qs}`, { redirect: "manual" });
    const b = (await r.json()) as { user: { id: number; firstName: string } };
    expect(r.status === 200 && b.user.id === 77 && b.user.firstName === "Wid").toBeTruthy();
  }

  @Test.it("telegram: tampered payload → 401") async telegramTampered() {
    const data = telegramData(this.tgToken, { id: "77", first_name: "Wid", auth_date: String(Math.floor(Date.now() / 1000)) });
    const qs = new URLSearchParams({ ...data, first_name: "Evil" }).toString();
    const r = await fetch(`${this.base}/auth/telegram/callback?${qs}`, { redirect: "manual" });
    await r.body?.cancel();
    expect(r.status).toBe(401);
  }
}

// ── Госуслуги / ЕСИА (separate suite — its own signed flow) ──────────────────
import { generateKeyPairSync, createSign } from "node:crypto";
import { gosuslugi, EsiaClient } from "../src/providers/gosuslugi.ts";

const esiaKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");
// A self-signed RS256 id_token carrying the ЕСИА subject oid.
function esiaIdToken(clientId: string, oid: string): string {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ aud: clientId, "urn:esia:sbj": { "urn:esia:sbj:oid": oid } }));
  const sig = createSign("RSA-SHA256").update(`${head}.${payload}`).sign(esiaKeys.privateKey);
  return `${head}.${payload}.${b64url(sig)}`;
}

const ESIA_HOST = "https://esia.test";
const esiaFake: FetchLike = async (input) => {
  const url = String(input);
  const J = (o: unknown, status = 200) => new globalThis.Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
  if (url.includes("/aas/oauth2/te")) return J({ id_token: esiaIdToken("MY_SYS", "1000299261"), access_token: "esia_at", refresh_token: "esia_rt" });
  if (url.includes("/rs/prns/1000299261/ctts")) return J({ elements: [{ type: "EML", value: "USER@X.DEV", vrfStu: "VERIFIED" }] });
  if (url.includes("/rs/prns/1000299261")) return J({ firstName: "Иван", lastName: "Иванов", middleName: "Иванович", trusted: true });
  return J({ error: "unexpected: " + url }, 400);
};

class EsiaSuite extends Test({ name: "server-plugin-oauth2/gosuslugi" }) {
  #server!: HTTP;
  base = "http://127.0.0.1:41291";

  @Test.beforeAll() async start() {
    const app = Application().plugin(
      gosuslugi({
        host: ESIA_HOST,
        clientId: "MY_SYS",
        secret: "esia-cookie-secret",
        scope: ["openid", "email", "fullname"],
        sign: async (text) => `SIG(${text.length})`, // pluggable CryptoPro/HSM stand-in
        publicKey: esiaKeys.publicKey.export({ type: "spki", format: "pem" }) as string,
        fetch: esiaFake,
        onLogin: (_ctx, { profile }) => Response.json(profile),
      }),
    );
    this.#server = await new Promise<HTTP>((resolve) => {
      const h = app.listen(41291, () => resolve(h));
    });
  }
  @Test.afterAll() async stop() {
    await this.#server.close();
  }

  @Test.it("login: redirects to ЕСИА /ac with signed client_secret + state") async login() {
    const r = await fetch(`${this.base}/auth/esia`, { redirect: "manual" });
    await r.body?.cancel();
    const u = new URL(r.headers.get("location") ?? "");
    expect(
      r.status === 302 &&
        u.origin + u.pathname === `${ESIA_HOST}/aas/oauth2/ac` &&
        u.searchParams.get("client_id") === "MY_SYS" &&
        !!u.searchParams.get("client_secret") &&
        !!u.searchParams.get("timestamp") &&
        (u.searchParams.get("state") ?? "").length > 0,
    ).toBeTruthy();
  }

  @Test.it("full flow: code → tokens → id_token oid → profile") async callback() {
    const login = await fetch(`${this.base}/auth/esia`, { redirect: "manual" });
    await login.body?.cancel();
    const u = new URL(login.headers.get("location") ?? "");
    const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
    const state = u.searchParams.get("state") ?? "";
    const r = await fetch(`${this.base}/auth/esia/callback?code=xyz&state=${state}`, { headers: { cookie }, redirect: "manual" });
    const b = (await r.json()) as { id: string; firstName: string; email: { value: string; verified: boolean } };
    expect(r.status === 200 && b.id === "1000299261" && b.firstName === "Иван" && b.email.value === "user@x.dev" && b.email.verified).toBeTruthy();
  }

  @Test.it("callback: state mismatch → 401") async stateMismatch() {
    const login = await fetch(`${this.base}/auth/esia`, { redirect: "manual" });
    await login.body?.cancel();
    const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
    const r = await fetch(`${this.base}/auth/esia/callback?code=xyz&state=WRONG`, { headers: { cookie }, redirect: "manual" });
    await r.body?.cancel();
    expect(r.status).toBe(401);
  }

  @Test.it("EsiaClient.oidOf extracts the subject oid") oid() {
    const claims = { "urn:esia:sbj": { "urn:esia:sbj:oid": 42 } };
    expect(EsiaClient.oidOf(claims) === "42").toBeTruthy();
  }
}

await TestApplication().addTests(OAuth2Suite).addTests(EsiaSuite).reporter(new ConsoleReporter()).run();
