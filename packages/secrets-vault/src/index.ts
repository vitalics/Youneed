// ── @youneed/secrets-vault — HashiCorp Vault (KV v2) SecretsProvider ──────────
//
// A `SecretsProvider` for @youneed/secrets backed by HashiCorp Vault's KV v2
// engine. Pure `fetch` — no Vault SDK. Uses the token-auth header directly.
//   https://developer.hashicorp.com/vault/api-docs/secret/kv/kv-v2
//
//   import { createSecrets } from "@youneed/secrets";
//   import { vaultSecrets } from "@youneed/secrets-vault";
//
//   const secrets = createSecrets(vaultSecrets({
//     address: "https://vault:8200",
//     token: process.env.VAULT_TOKEN!,
//     mount: "secret",
//   }));
//   await secrets.require("db");         // reads secret/data/db
//   await secrets.get("db#password");    // a single field from that path

import type { SecretsProvider } from "@youneed/secrets";

export interface VaultSecretsOptions {
  /** Vault server address, e.g. `"https://vault:8200"` (no trailing slash needed). */
  address: string;
  /** Vault token — sent as the `X-Vault-Token` header. */
  token: string;
  /** KV v2 mount point. Default `"secret"`. */
  mount?: string;
  /** Vault Enterprise namespace — sent as the `X-Vault-Namespace` header. */
  namespace?: string;
  /** Injectable `fetch` (tests). Defaults to the global `fetch`. */
  fetch?: typeof globalThis.fetch;
  /** Abort the request after this many ms. */
  timeoutMs?: number;
}

/** A KV v2 read response: `{ data: { data: { ...fields }, metadata: {...} } }`. */
interface KvReadResponse {
  data?: { data?: Record<string, unknown> };
}

/** A LIST response: `{ data: { keys: [...] } }`. */
interface KvListResponse {
  data?: { keys?: string[] };
}

/**
 * A {@link SecretsProvider} over HashiCorp Vault KV v2.
 *
 * A `key` names a KV path under the mount (`get("db")` → `secret/data/db`).
 * If that path holds exactly a single `value` field, its string is returned;
 * otherwise the whole field map is returned as JSON. The `"path#field"` form
 * selects one field from the path.
 */
export function vaultSecrets(opts: VaultSecretsOptions): SecretsProvider {
  const address = opts.address.replace(/\/+$/, "");
  const mount = opts.mount ?? "secret";
  const doFetch = opts.fetch ?? globalThis.fetch;

  const headers = (): Record<string, string> => {
    const h: Record<string, string> = { "X-Vault-Token": opts.token };
    if (opts.namespace) h["X-Vault-Namespace"] = opts.namespace;
    return h;
  };

  const request = async (url: string, method: string): Promise<Response> => {
    const signal = opts.timeoutMs != null ? AbortSignal.timeout(opts.timeoutMs) : undefined;
    return doFetch(url, { method, headers: headers(), signal });
  };

  return {
    name: "vault",

    async get(key: string): Promise<string | undefined> {
      const hash = key.indexOf("#");
      const path = hash === -1 ? key : key.slice(0, hash);
      const field = hash === -1 ? undefined : key.slice(hash + 1);

      const res = await request(`${address}/v1/${mount}/data/${path}`, "GET");
      if (res.status === 404) return undefined;
      if (!res.ok) throw new Error(`vault: ${res.status} ${await res.text().catch(() => "")}`.trim());

      const body = (await res.json()) as KvReadResponse;
      const data = body.data?.data ?? {};

      if (field !== undefined) {
        const v = data[field];
        return v === undefined ? undefined : String(v);
      }

      const keys = Object.keys(data);
      if (keys.length === 1 && keys[0] === "value") return String(data.value);
      return JSON.stringify(data);
    },

    async list(): Promise<string[]> {
      const res = await request(`${address}/v1/${mount}/metadata?list=true`, "LIST");
      if (res.status === 404) return [];
      if (!res.ok) throw new Error(`vault: ${res.status} ${await res.text().catch(() => "")}`.trim());
      const body = (await res.json()) as KvListResponse;
      return (body.data?.keys ?? []).map((k) => k.replace(/\/+$/, ""));
    },

    async close(): Promise<void> {
      // no-op — fetch is stateless.
    },
  };
}
