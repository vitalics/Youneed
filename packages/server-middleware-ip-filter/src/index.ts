// ── @youneed/server-middleware-ip-filter — IP allow/deny (CIDR) ──────────────
//
// Gate requests by client IP — an allowlist, a denylist, or both. Supports exact
// IPs and CIDR ranges, IPv4 and IPv6 (incl. IPv4-mapped IPv6). Resolve the client
// IP behind a proxy by mounting `trustProxy()` first (this reads its result).
//
//   import { Application } from "@youneed/server";
//   import { ipFilter } from "@youneed/server-middleware-ip-filter";
//
//   app.use("/admin", ipFilter({ allow: ["10.0.0.0/8", "192.168.1.5"] })); // only these
//   app.use(ipFilter({ deny: ["203.0.113.0/24"] }));                       // block abusers
//
// Precedence: a `deny` match always blocks; if `allow` is non-empty, anything
// NOT matched is blocked (default-deny); otherwise it passes.

import { HttpError } from "@youneed/server";
import type { Context, Middleware } from "@youneed/server";

export interface IpFilterOptions {
  /** Allowlist (CIDR or exact IP). When non-empty, only matching IPs pass. */
  allow?: string[];
  /** Denylist (CIDR or exact IP). A match always blocks. */
  deny?: string[];
  /** Status for a blocked request (default 403). */
  status?: number;
  /** Body for a blocked request (default `{ error: "Forbidden" }`). */
  message?: unknown;
  /** Custom client-IP extractor. Default: `trustProxy()`'s resolved IP (from
   *  `ctx.state.clientInfo`) if present, else the socket's `remoteAddress`. */
  ip?: (ctx: Context) => string;
}

interface Cidr {
  bytes: Uint8Array; // network address bytes (4 or 16)
  prefix: number; // prefix length in bits
}

// ── IP parsing → canonical bytes (4 for IPv4, 16 for IPv6) ───────────────────
function ipv4Bytes(ip: string): Uint8Array | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const out = new Uint8Array(4);
  for (let i = 0; i < 4; i++) {
    const n = Number(parts[i]);
    if (!Number.isInteger(n) || n < 0 || n > 255 || !/^\d+$/.test(parts[i])) return null;
    out[i] = n;
  }
  return out;
}

function ipv6Bytes(ip: string): Uint8Array | null {
  let str = ip.split("%")[0]; // strip zone id (fe80::1%eth0)
  // Embedded IPv4 tail (::ffff:1.2.3.4) → expand to two hextets.
  const v4 = str.match(/(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const b = ipv4Bytes(v4[2]);
    if (!b) return null;
    str = `${v4[1]}${((b[0] << 8) | b[1]).toString(16)}:${((b[2] << 8) | b[3]).toString(16)}`;
  }
  const halves = str.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(":") : []) : null;
  const groups: string[] = tail
    ? [...head, ...Array(8 - head.length - tail.length).fill("0"), ...tail]
    : head;
  if (groups.length !== 8) return null;
  const out = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    const n = parseInt(groups[i] || "0", 16);
    if (Number.isNaN(n) || n < 0 || n > 0xffff) return null;
    out[i * 2] = n >> 8;
    out[i * 2 + 1] = n & 0xff;
  }
  return out;
}

/** Parse an IP to canonical bytes, normalizing IPv4-mapped IPv6 (::ffff:a.b.c.d)
 *  down to its 4-byte IPv4 form so v4 rules match v4-mapped clients. */
function ipBytes(ip: string): Uint8Array | null {
  if (ip.includes(":")) {
    const b = ipv6Bytes(ip);
    if (b && b.subarray(0, 12).every((x, i) => (i < 10 ? x === 0 : x === 0xff))) return b.subarray(12); // ::ffff:v4 → v4
    return b;
  }
  return ipv4Bytes(ip);
}

function parseCidr(spec: string): Cidr | null {
  const slash = spec.indexOf("/");
  const addr = slash === -1 ? spec : spec.slice(0, slash);
  const bytes = ipBytes(addr.trim());
  if (!bytes) return null;
  const prefix = slash === -1 ? bytes.length * 8 : Number(spec.slice(slash + 1));
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > bytes.length * 8) return null;
  return { bytes, prefix };
}

function inCidr(ip: Uint8Array, cidr: Cidr): boolean {
  if (ip.length !== cidr.bytes.length) return false; // different family
  const full = cidr.prefix >> 3;
  for (let i = 0; i < full; i++) if (ip[i] !== cidr.bytes[i]) return false;
  const rem = cidr.prefix & 7;
  if (rem) {
    const mask = 0xff << (8 - rem);
    if ((ip[full] & mask) !== (cidr.bytes[full] & mask)) return false;
  }
  return true;
}

const matchesAny = (ip: Uint8Array, cidrs: Cidr[]): boolean => cidrs.some((c) => inCidr(ip, c));

// Default IP source: trustProxy's resolved client IP (ctx.state.clientInfo) or the socket.
function defaultIp(ctx: Context): string {
  const info = ctx.state.clientInfo as { ip?: string } | undefined;
  return info?.ip ?? ctx.request.socket?.remoteAddress ?? "";
}

/**
 * Gate requests by client IP. `deny` always blocks; a non-empty `allow` makes it
 * default-deny (only listed IPs/ranges pass). Mount `trustProxy()` first if the
 * app is behind a proxy, so the real client IP is used.
 */
export function ipFilter(opts: IpFilterOptions = {}): Middleware {
  const allow = (opts.allow ?? []).map(parseCidr).filter((c): c is Cidr => c !== null);
  const deny = (opts.deny ?? []).map(parseCidr).filter((c): c is Cidr => c !== null);
  const status = opts.status ?? 403;
  const message = opts.message ?? { error: "Forbidden" };
  const getIp = opts.ip ?? defaultIp;

  return async (ctx, next) => {
    const ip = ipBytes(getIp(ctx));
    const blocked =
      !ip || // unparseable IP → fail closed
      matchesAny(ip, deny) || // explicit deny wins
      (allow.length > 0 && !matchesAny(ip, allow)); // allowlist → default-deny
    if (blocked) throw new HttpError(status, message);
    return next();
  };
}
