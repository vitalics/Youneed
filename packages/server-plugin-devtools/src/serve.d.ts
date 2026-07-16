import { type ServerPlugin, type GuardTrial } from "@youneed/server";
import { type AppLike } from "./core.ts";
type ServeApp = AppLike & {
    get(path: string, handler: () => unknown): unknown;
    post(path: string, handler: (ctx: any) => unknown): unknown;
    tryGuards(method: string, path: string, init?: {
        headers?: Record<string, string>;
        params?: Record<string, string>;
        query?: Record<string, string>;
        body?: unknown;
    }): Promise<GuardTrial[]>;
};
export interface ServeDevtoolsOptions {
    /** Mount prefix (default `/__devtools`). */
    path?: string;
    /** Display name for this server in the UI. */
    name?: string;
    /** Public URL of this server (shown + used in the OpenAPI `servers`). */
    url?: string;
    /** The security-relevant middleware you mounted (e.g. `["cors", "helmet",
     *  "rate-limit"]`) — overrides the app's best-effort names so the audit is
     *  accurate (mounted middleware are anonymous functions; names can't be inferred). */
    middleware?: string[];
}
/**
 * Mount the devtools UI + live-topology endpoint on `app`. Returns `app` for
 * chaining. Open `{path}` in a browser to inspect the running server.
 */
export declare function serveDevtools<A extends ServeApp>(app: A, opts?: ServeDevtoolsOptions): A;
/** Options for the {@link devtools} server plugin — the same knobs as
 *  {@link serveDevtools} (mount `path`, display `name`, public `url`, and the
 *  security-relevant `middleware` names). */
export type DevtoolsPluginOptions = ServeDevtoolsOptions;
/**
 * A first-class `@youneed/server` {@link ServerPlugin} that mounts the devtools
 * UI + live-topology endpoint, so you register it the idiomatic way:
 *
 *   app.plugin(devtools({ path: "/__devtools" }));
 *
 * `setup(app)` reuses {@link serveDevtools} to add the same three routes under
 * `path` (default `/__devtools`). DEV-ONLY: it exposes your full route topology
 * and schemas — only register it in development, or behind auth.
 */
export declare function devtools(opts?: DevtoolsPluginOptions): ServerPlugin;
export {};
