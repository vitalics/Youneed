# @youneed/server-middleware-ip-filter

Allow / deny requests by client IP for [`@youneed/server`](../server). Supports
exact IPs and **CIDR ranges**, **IPv4 and IPv6** (including IPv4-mapped IPv6).
Zero dependencies.

```ts
import { Application } from "@youneed/server";
import { ipFilter } from "@youneed/server-middleware-ip-filter";
import { trustProxy } from "@youneed/server-middleware-trust-proxy";

// Allowlist — only these IPs/ranges may reach /admin (everything else 403):
app.use("/admin", ipFilter({ allow: ["10.0.0.0/8", "192.168.1.5", "2001:db8::/32"] }));

// Denylist — block known-bad ranges, everyone else passes:
app.use(ipFilter({ deny: ["203.0.113.0/24"] }));
```

## Precedence

1. A `deny` match **always blocks** (deny wins).
2. If `allow` is non-empty, anything **not** matched is blocked (default-deny).
3. Otherwise the request passes.

An unparseable client IP **fails closed** (blocked) whenever an allowlist is set.

## Behind a proxy

By default the client IP comes from [`trustProxy()`](../server-middleware-trust-proxy)'s
resolved address (`ctx.state.clientInfo.ip`) if present, else the socket's
`remoteAddress`. **Mount `trustProxy()` before `ipFilter()`** so spoofable
`X-Forwarded-For` hops are handled correctly — otherwise filter on the socket IP
only. Override entirely with the `ip` option.

## Options

| option | meaning |
| --- | --- |
| `allow` | Allowlist of CIDRs / exact IPs. Non-empty ⇒ default-deny. |
| `deny` | Denylist of CIDRs / exact IPs. A match always blocks. |
| `status` | Status for a blocked request (default `403`). |
| `message` | Body for a blocked request (default `{ error: "Forbidden" }`). |
| `ip` | Custom `(ctx) => string` client-IP extractor. |
