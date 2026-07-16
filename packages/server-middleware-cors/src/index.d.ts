import type { Middleware } from "@youneed/server";
export interface CorsOptions {
    /** Allowed origin(s): `"*"`, exact, list, predicate, or `true` to reflect. */
    origin?: string | string[] | boolean | ((origin: string) => boolean);
    methods?: string[];
    allowedHeaders?: string[];
    exposedHeaders?: string[];
    credentials?: boolean;
    maxAge?: number;
    preflightStatus?: number;
}
/** Cross-Origin Resource Sharing — sets ACA-* headers, answers preflight. */
export declare function cors(opts?: CorsOptions): Middleware;
