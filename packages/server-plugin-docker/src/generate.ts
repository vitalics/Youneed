// Pure generators for the Docker artifacts — no fs, no @youneed/server import, so
// they're trivially testable. `dockerize(opts)` returns the file CONTENTS; the
// plugin (index.ts) writes them, and the devtools panel renders them.
//
// The compose file wires the app together with the backing services it actually
// uses — those are inferred from a mounted app's plugins (Mongo / MySQL / Postgres
// / Redis), or passed explicitly.

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

/** A backing service to add to docker-compose (a database, cache, broker…). */
export interface ServiceSpec {
  /** compose service key + hostname other services reach it by. */
  name: string;
  image: string;
  /** `"host:container"` port mappings. */
  ports?: string[];
  environment?: Record<string, string>;
  /** named volumes, `"vol:/path"`. */
  volumes?: string[];
  /** Env to inject INTO the app service so it can reach this service
   *  (e.g. `MONGO_URL=mongodb://mongo:27017`). */
  appEnv?: Record<string, string>;
}

export const mongoService = (): ServiceSpec => ({
  name: "mongo",
  image: "mongo:7",
  ports: ["27017:27017"],
  volumes: ["mongo-data:/data/db"],
  appEnv: { MONGO_URL: "mongodb://mongo:27017" },
});
export const mysqlService = (): ServiceSpec => ({
  name: "mysql",
  image: "mysql:8",
  ports: ["3306:3306"],
  environment: { MYSQL_ROOT_PASSWORD: "root", MYSQL_DATABASE: "app" },
  volumes: ["mysql-data:/var/lib/mysql"],
  appEnv: { MYSQL_HOST: "mysql", MYSQL_PORT: "3306", MYSQL_USER: "root", MYSQL_PASSWORD: "root", MYSQL_DB: "app" },
});
export const postgresService = (): ServiceSpec => ({
  name: "postgres",
  image: "postgres:16-alpine",
  ports: ["5432:5432"],
  environment: { POSTGRES_PASSWORD: "postgres", POSTGRES_DB: "app" },
  volumes: ["pg-data:/var/lib/postgresql/data"],
  appEnv: { DATABASE_URL: "postgres://postgres:postgres@postgres:5432/app" },
});
export const redisService = (): ServiceSpec => ({
  name: "redis",
  image: "redis:7-alpine",
  ports: ["6379:6379"],
  appEnv: { REDIS_URL: "redis://redis:6379" },
});

/** A plugin entry as seen in `app.topology().plugins` — name + its `inspect()`. */
export interface PluginEntry {
  name: string;
  info?: { kind?: string; [k: string]: unknown };
}

/** Infer the backing services an app needs from its mounted plugins' `inspect()`
 *  kinds (orm-nosql→mongo, orm-sql→mysql/postgres, pubsub/kv→redis/postgres). */
export function inferServices(plugins: PluginEntry[]): ServiceSpec[] {
  const out: ServiceSpec[] = [];
  const has = (n: string) => out.some((s) => s.name === n);
  const add = (s: ServiceSpec) => void (!has(s.name) && out.push(s));
  const matches = (v: unknown, re: RegExp) => typeof v === "string" && re.test(v);

  for (const p of plugins) {
    const info = p.info;
    if (!info?.kind) continue;
    switch (info.kind) {
      case "orm-nosql":
        if (matches(info.store, /mongo/i)) add(mongoService());
        break;
      case "orm-sql":
        if (matches(info.type, /mysql|maria/i)) add(mysqlService());
        else if (matches(info.type, /postgres|pg/i)) add(postgresService());
        break;
      case "pubsub":
      case "kv":
        if (matches(info.backend, /redis|valkey/i)) add(redisService());
        else if (matches(info.backend, /postgres/i)) add(postgresService());
        break;
    }
  }
  return out;
}

export interface DockerOptions {
  /** `"server"` (default) or `"ssr"` — ssr defaults to a build step + dist entry. */
  mode?: "server" | "ssr";
  /** App service name in compose (default `"app"`). */
  name?: string;
  /** Port the app listens on (default 3000). */
  port?: number;
  /** Node base-image tag (default `"22-alpine"`). */
  node?: string;
  /** Package manager (default `"pnpm"`). */
  packageManager?: PackageManager;
  /** Entry file to run (default `"dist/server.js"` for ssr, else `"server.js"`). */
  entry?: string;
  /** Build command, or `false` for none (default: ssr → `"<pm> run build"`, else false). */
  build?: string | false;
  /** Start command (default derived from entry + package manager). */
  start?: string;
  /** Extra env on the app service. */
  env?: Record<string, string>;
  /** Backing services (merged with inferred ones; deduped by name). */
  services?: ServiceSpec[];
  /** Filename for the generated Dockerfile (default `"Dockerfile"`). Use e.g.
   *  `"Dockerfile.prod"` to keep several side by side. */
  dockerfileName?: string;
  /** Extra patterns appended to the generated `.dockerignore` (deduped). */
  dockerignore?: string[];
  /** Which artifacts to generate (default all three). Pass `["dockerfile"]` to
   *  emit only the Dockerfile. */
  outputs?: DockerArtifactKind[];
}

/** The kinds of artifact this package can emit. */
export type DockerArtifactKind = "dockerfile" | "compose" | "dockerignore";

interface Resolved
  extends Required<Omit<DockerOptions, "build" | "start" | "env" | "services" | "dockerfileName" | "dockerignore" | "outputs">> {
  build: string | false;
  start: string;
  env: Record<string, string>;
  services: ServiceSpec[];
}

const pmInstall: Record<PackageManager, string> = {
  pnpm: "pnpm install --frozen-lockfile",
  npm: "npm ci",
  yarn: "yarn install --frozen-lockfile",
  bun: "bun install --frozen-lockfile",
};
const pmRunner: Record<PackageManager, string> = { pnpm: "pnpm", npm: "npm run", yarn: "yarn", bun: "bun run" };
const pmExec: Record<PackageManager, string> = { pnpm: "pnpm", npm: "npx", yarn: "yarn", bun: "bun" };
const lockfile: Record<PackageManager, string> = {
  pnpm: "pnpm-lock.yaml",
  npm: "package-lock.json",
  yarn: "yarn.lock",
  bun: "bun.lockb",
};

function resolve(opts: DockerOptions): Resolved {
  const mode = opts.mode ?? "server";
  const pm = opts.packageManager ?? "pnpm";
  const entry = opts.entry ?? (mode === "ssr" ? "dist/server.js" : "server.js");
  const build = opts.build ?? (mode === "ssr" ? `${pmRunner[pm]} build` : false);
  const start =
    opts.start ??
    (pm === "bun"
      ? `bun ${entry}`
      : entry.endsWith(".ts")
        ? `${pmExec[pm]} tsx ${entry}`
        : `node ${entry}`);
  return {
    mode,
    name: opts.name ?? "app",
    port: opts.port ?? 3000,
    node: opts.node ?? "22-alpine",
    packageManager: pm,
    entry,
    build,
    start,
    env: opts.env ?? {},
    services: dedupeServices(opts.services ?? []),
  };
}

export function dedupeServices(services: ServiceSpec[]): ServiceSpec[] {
  const seen = new Map<string, ServiceSpec>();
  for (const s of services) if (!seen.has(s.name)) seen.set(s.name, s);
  return [...seen.values()];
}

/** The generated `Dockerfile` (multi-stage-ish, package-manager aware). */
export function generateDockerfile(opts: DockerOptions = {}): string {
  const r = resolve(opts);
  const enableCorepack = r.packageManager !== "bun" && r.packageManager !== "npm";
  const base = r.packageManager === "bun" ? `oven/bun:1` : `node:${r.node}`;
  const lines: string[] = [
    "# syntax=docker/dockerfile:1",
    `# generated by @youneed/server-plugin-docker (mode: ${r.mode})`,
    `FROM ${base} AS runtime`,
    "WORKDIR /app",
    ...(enableCorepack ? ["RUN corepack enable"] : []),
    "",
    "# Install deps first for a cached layer.",
    `COPY package.json ${lockfile[r.packageManager]}* ./`,
    `RUN ${pmInstall[r.packageManager]} || ${pmInstall[r.packageManager].split(" ")[0]} install`,
    "",
    "# App source.",
    "COPY . .",
    ...(r.build ? ["", `RUN ${r.build}`] : []),
    "",
    `ENV NODE_ENV=production PORT=${r.port}`,
    `EXPOSE ${r.port}`,
    `CMD ${JSON.stringify(r.start.split(" "))}`,
    "",
  ];
  return lines.join("\n");
}

/** The generated `.dockerignore`. `extra` patterns are appended (deduped). */
export function generateDockerignore(extra: string[] = []): string {
  const base = [
    "node_modules",
    "dist",
    ".git",
    ".gitignore",
    "*.log",
    ".env",
    ".env.*",
    "Dockerfile",
    "docker-compose.yml",
    ".dockerignore",
    "coverage",
    ".DS_Store",
  ];
  return [...new Set([...base, ...extra]), ""].join("\n");
}

// ── a tiny, dependency-free YAML emitter (only what compose needs) ─────────────
function yamlScalar(v: string): string {
  return /^[\w./:@-]+$/.test(v) ? v : JSON.stringify(v);
}
function yamlMap(obj: Record<string, string>, indent: string): string[] {
  return Object.keys(obj).map((k) => `${indent}${k}: ${yamlScalar(obj[k])}`);
}
function yamlList(items: string[], indent: string): string[] {
  return items.map((i) => `${indent}- ${yamlScalar(i)}`);
}

/** The generated `docker-compose.yml`: the app + every inferred/declared service.
 *  Connection env for each service is injected into the app so it just works. */
export function generateCompose(opts: DockerOptions = {}): string {
  const r = resolve(opts);
  const appEnv: Record<string, string> = { PORT: String(r.port), ...r.env };
  for (const s of r.services) Object.assign(appEnv, s.appEnv ?? {});

  const out: string[] = ["# generated by @youneed/server-plugin-docker", "services:"];

  // app service
  out.push(`  ${r.name}:`);
  out.push("    build: .");
  out.push(`    ports:`, ...yamlList([`${r.port}:${r.port}`], "      "));
  out.push("    environment:", ...yamlMap(appEnv, "      "));
  if (r.services.length) {
    out.push("    depends_on:", ...yamlList(r.services.map((s) => s.name), "      "));
  }
  out.push("    restart: unless-stopped");

  // backing services
  for (const s of r.services) {
    out.push(`  ${s.name}:`);
    out.push(`    image: ${s.image}`);
    if (s.ports?.length) out.push("    ports:", ...yamlList(s.ports, "      "));
    if (s.environment && Object.keys(s.environment).length) out.push("    environment:", ...yamlMap(s.environment, "      "));
    if (s.volumes?.length) out.push("    volumes:", ...yamlList(s.volumes, "      "));
    out.push("    restart: unless-stopped");
  }

  // named volumes
  const volumes = r.services.flatMap((s) => (s.volumes ?? []).map((v) => v.split(":")[0])).filter((v) => !v.startsWith("/") && !v.startsWith("."));
  const uniqueVols = [...new Set(volumes)];
  if (uniqueVols.length) {
    out.push("volumes:");
    for (const v of uniqueVols) out.push(`  ${v}:`);
  }
  out.push("");
  return out.join("\n");
}

/** A generated file: its resolved on-disk name + content. */
export interface GeneratedFile {
  kind: DockerArtifactKind;
  /** Resolved filename (honours `dockerfileName`). */
  name: string;
  content: string;
}

export interface DockerArtifacts {
  dockerfile: string;
  dockerignore: string;
  compose: string;
  /** Names of the services in the compose (the app + backing services). */
  services: string[];
  /** The SELECTED files (per `outputs`) with resolved names — what gets written. */
  files: GeneratedFile[];
}

/** Generate the Docker artifacts (file CONTENTS). `outputs` selects which files;
 *  `dockerfileName` renames the Dockerfile; `dockerignore` appends extra patterns.
 *  The three content fields are always populated (for the devtools view); `files`
 *  is the SELECTED set written to disk. */
export function dockerize(opts: DockerOptions = {}): DockerArtifacts {
  const r = resolve(opts);
  const dockerfile = generateDockerfile(opts);
  const dockerignore = generateDockerignore(opts.dockerignore);
  const compose = generateCompose(opts);
  const selected = opts.outputs ?? ["dockerfile", "compose", "dockerignore"];
  const all: GeneratedFile[] = [
    { kind: "dockerfile", name: opts.dockerfileName ?? "Dockerfile", content: dockerfile },
    { kind: "compose", name: "docker-compose.yml", content: compose },
    { kind: "dockerignore", name: ".dockerignore", content: dockerignore },
  ];
  return {
    dockerfile,
    dockerignore,
    compose,
    services: [r.name, ...r.services.map((s) => s.name)],
    files: all.filter((f) => selected.includes(f.kind)),
  };
}
