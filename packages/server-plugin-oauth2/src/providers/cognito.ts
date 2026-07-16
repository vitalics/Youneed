// @youneed/server-plugin-oauth2/cognito  (AWS Cognito Hosted UI)
import { defineProvider, type OAuthProvider } from "../index.ts";

export interface CognitoOptions {
  clientId: string;
  clientSecret?: string;
  /** AWS region, e.g. `"eu-central-1"`. */
  region: string;
  /** Hosted UI domain prefix (the part before `.auth.<region>.amazoncognito.com`),
   *  or a full custom domain. */
  poolDomain: string;
  /** Scopes (default `["openid", "email", "profile"]`). */
  scopes?: string[];
  /** PKCE (default true). */
  pkce?: boolean;
}

/** A normalized Cognito profile. */
export interface CognitoProfile {
  id: string;
  email?: string;
  name?: string;
  username?: string;
  raw: Record<string, unknown>;
}

/** AWS Cognito (OIDC, Hosted UI) — `import { cognito } from "@youneed/server-plugin-oauth2/cognito"`. */
export function cognito(opts: CognitoOptions): OAuthProvider<CognitoProfile> {
  const base = opts.poolDomain.includes(".")
    ? `https://${opts.poolDomain.replace(/^https?:\/\//, "").replace(/\/$/, "")}`
    : `https://${opts.poolDomain}.auth.${opts.region}.amazoncognito.com`;
  return defineProvider<CognitoProfile>({
    name: "cognito",
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    authorizeUrl: `${base}/oauth2/authorize`,
    tokenUrl: `${base}/oauth2/token`,
    userInfoUrl: `${base}/oauth2/userInfo`,
    scopes: opts.scopes ?? ["openid", "email", "profile"],
    pkce: opts.pkce ?? true,
    profile(raw) {
      return {
        id: String(raw.sub),
        email: raw.email as string | undefined,
        name: (raw.name ?? raw["cognito:username"]) as string | undefined,
        username: raw["cognito:username"] as string | undefined,
        raw,
      };
    },
  });
}
