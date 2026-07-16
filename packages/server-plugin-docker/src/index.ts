// ── @youneed/server-plugin-docker — wrap a server / SSR app in Docker ─────────
//
// `app.plugin(docker())` is a build-time ServerPlugin: it generates a Dockerfile,
// a .dockerignore and a docker-compose.yml for THIS app — and the compose wires in
// the backing services the app actually uses (Mongo / MySQL / Postgres / Redis),
// inferred from the other mounted plugins' `inspect()`. Connection env is injected
// into the app service so the stack runs with one `docker compose up`.
//
//   const app = Application(...).plugin(orm).plugin(nosql).plugin(docker());
//   // emit the files, then exit (don't bind a port):
//   EMIT_DOCKER=1 tsx server.ts
//   // or eagerly: app.plugin(docker({ emit: true }))
//
// It also exposes the generated files via `inspect()`, so the devtools "Docker"
// tab can show + download them live. Plug it LAST so it sees the other plugins.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppBuilder, ServerPlugin } from "@youneed/server";
import { dockerize, inferServices, dedupeServices, type DockerOptions, type DockerArtifacts, type PluginEntry, type ServiceSpec } from "./generate.ts";

export * from "./generate.ts";

export interface DockerPluginOptions extends DockerOptions {
  /** Infer backing services from the app's mounted plugins (default true). */
  infer?: boolean;
  /** Directory to write the artifacts into (default cwd). */
  outDir?: string;
  /** Emit the files at startup regardless of the `EMIT_DOCKER` env (default false). */
  emit?: boolean;
  /** After emitting, take over the bind so the process doesn't start listening
   *  (default true — "emit and exit"). Set false to also run the server. */
  exitAfterEmit?: boolean;
}

/** Write the SELECTED artifacts (per `outputs`, with `dockerfileName`) into `dir`.
 *  Returns what was written. */
export function writeDocker(dir: string, opts: DockerOptions = {}): DockerArtifacts {
  const out = dockerize(opts);
  for (const f of out.files) writeFileSync(join(dir, f.name), f.content);
  return out;
}

/** The `inspect()` payload — devtools detects this plugin by `kind === "docker"`. */
export interface DockerInspect extends DockerArtifacts {
  kind: "docker";
}

/**
 * A build-time ServerPlugin that generates Docker artifacts for the app. Mount it
 * LAST (`app.plugin(...)` after your ORM / pubsub / kv plugins) so the inferred
 * compose services match what the app really uses.
 */
export function docker(opts: DockerPluginOptions = {}): ServerPlugin {
  let app: AppBuilder | undefined;
  let inspecting = false; // guard re-entrancy: inspect() → topology() → inspect()

  const collectPlugins = (): PluginEntry[] => {
    try {
      return (app?.topology().plugins ?? []) as PluginEntry[];
    } catch {
      return [];
    }
  };

  const resolvedOptions = (): DockerOptions => {
    const inferred = opts.infer === false ? [] : inferServices(collectPlugins().filter((p) => p.name !== "docker"));
    const services: ServiceSpec[] = dedupeServices([...inferred, ...(opts.services ?? [])]);
    return { ...opts, services };
  };

  const shouldEmit = (): boolean => opts.emit === true || process.env.EMIT_DOCKER != null;

  return {
    name: "docker",
    setup(a) {
      app = a;
    },
    beforeListen() {
      if (!shouldEmit()) return;
      const out = writeDocker(opts.outDir ?? process.cwd(), resolvedOptions());
      const svc = out.services.length > 1 ? ` (services: ${out.services.join(", ")})` : "";
      console.log(`[docker] wrote ${out.files.map((f) => f.name).join(", ")}${svc}`);
      // "Emit and exit": stop the process so open handles (DB sockets opened during
      // setup) don't keep it alive. Return false first as a fallback for runtimes
      // where exit is intercepted.
      if (opts.exitAfterEmit !== false) {
        process.exit(0);
      }
    },
    inspect(): DockerInspect | { kind: "docker"; recursive: true } {
      if (inspecting) return { kind: "docker", recursive: true }; // inner topology() call
      inspecting = true;
      try {
        return { kind: "docker", ...dockerize(resolvedOptions()) };
      } finally {
        inspecting = false;
      }
    },
  };
}
