// @youneed/server middleware — Cross-Origin Resource Sharing.
// Sets the Access-Control-Allow-* headers and answers CORS preflight requests.
import { Response, vary } from "@youneed/server";
/** Cross-Origin Resource Sharing — sets ACA-* headers, answers preflight. */
export function cors(opts = {}) {
    const methods = (opts.methods ?? ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "QUERY"]).join(",");
    const resolveOrigin = (origin) => {
        const rule = opts.origin ?? "*";
        if (rule === true)
            return origin || "*";
        if (rule === "*")
            return opts.credentials ? origin || "*" : "*";
        if (typeof rule === "string")
            return rule;
        if (Array.isArray(rule))
            return rule.includes(origin) ? origin : "";
        if (typeof rule === "function")
            return rule(origin) ? origin : "";
        return "";
    };
    return (ctx, next) => {
        const req = ctx.request;
        const res = ctx.response;
        const origin = req.headers.origin ?? "";
        const allow = resolveOrigin(origin);
        if (allow) {
            res.setHeader("Access-Control-Allow-Origin", allow);
            if (allow !== "*")
                res.setHeader("Vary", vary(res, "Origin"));
        }
        if (opts.credentials)
            res.setHeader("Access-Control-Allow-Credentials", "true");
        if (opts.exposedHeaders?.length)
            res.setHeader("Access-Control-Expose-Headers", opts.exposedHeaders.join(","));
        // Preflight: short-circuit before routing (no matching route needed).
        if (req.method === "OPTIONS" && req.headers["access-control-request-method"]) {
            res.setHeader("Access-Control-Allow-Methods", methods);
            res.setHeader("Access-Control-Allow-Headers", opts.allowedHeaders?.join(",") ??
                req.headers["access-control-request-headers"] ??
                "*");
            if (opts.maxAge !== undefined)
                res.setHeader("Access-Control-Max-Age", String(opts.maxAge));
            return Response({ status: opts.preflightStatus ?? 204 });
        }
        return next();
    };
}
