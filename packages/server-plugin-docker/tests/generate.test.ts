// Run: pnpm --filter @youneed/server-plugin-docker test
import { Test, expect, TestApplication } from "@youneed/test";
import { ConsoleReporter } from "@youneed/test-reporter-console";
import { Application } from "@youneed/server";
import {
  dockerize,
  generateDockerfile,
  generateCompose,
  inferServices,
  mongoService,
  redisService,
  docker,
  type DockerInspect,
} from "../src/index.ts";

class DockerSuite extends Test({ name: "server-plugin-docker" }) {
  @Test.it("Dockerfile: port, expose, install + start command") dockerfile() {
    const df = generateDockerfile({ port: 8080, entry: "server.js" });
    expect(df.includes("EXPOSE 8080")).toBeTruthy();
    expect(df.includes("ENV NODE_ENV=production PORT=8080")).toBeTruthy();
    expect(df.includes("pnpm install --frozen-lockfile")).toBeTruthy();
    expect(df.includes(`CMD ${JSON.stringify(["node", "server.js"])}`)).toBeTruthy();
  }

  @Test.it("Dockerfile: ssr mode adds a build step + tsx entry start") ssr() {
    const df = generateDockerfile({ mode: "ssr", entry: "server.ts" });
    expect(df.includes("RUN pnpm build")).toBeTruthy();
    expect(df.includes(`CMD ${JSON.stringify(["pnpm", "tsx", "server.ts"])}`)).toBeTruthy();
  }

  @Test.it("inferServices: maps plugin inspect kinds to backing services") infer() {
    const services = inferServices([
      { name: "orm-nosql", info: { kind: "orm-nosql", store: "mongodb" } },
      { name: "orm-sql", info: { kind: "orm-sql", type: "mysql" } },
      { name: "kv", info: { kind: "kv", backend: "redis" } },
      { name: "pubsub", info: { kind: "pubsub", backend: "memory" } }, // no service
      { name: "jobs", info: { kind: "jobs" } }, // no service
    ]);
    expect(services.map((s) => s.name).sort()).toEqual(["mongo", "mysql", "redis"]);
  }

  @Test.it("inferServices: dedupes (two redis users → one service)") dedupe() {
    const services = inferServices([
      { name: "kv", info: { kind: "kv", backend: "redis" } },
      { name: "pubsub", info: { kind: "pubsub", backend: "redis" } },
    ]);
    expect(services.length).toBe(1);
    expect(services[0].name).toBe("redis");
  }

  @Test.it("compose: app + services, injected connection env, depends_on, volumes") compose() {
    const yml = generateCompose({ port: 3000, services: [mongoService(), redisService()] });
    expect(yml.includes("services:")).toBeTruthy();
    expect(yml.includes("app:")).toBeTruthy();
    expect(yml.includes("mongo:")).toBeTruthy();
    expect(yml.includes("image: mongo:7")).toBeTruthy();
    expect(yml.includes("MONGO_URL: mongodb://mongo:27017")).toBeTruthy(); // injected into app
    expect(yml.includes("REDIS_URL: redis://redis:6379")).toBeTruthy();
    expect(yml.includes("depends_on:")).toBeTruthy();
    expect(yml.includes("volumes:")).toBeTruthy();
    expect(yml.includes("mongo-data:")).toBeTruthy();
  }

  @Test.it("dockerize: returns all three artifacts + service list") artifacts() {
    const out = dockerize({ services: [mongoService()] });
    expect(out.dockerfile.length > 0 && out.compose.length > 0 && out.dockerignore.includes("node_modules")).toBeTruthy();
    expect(out.services).toEqual(["app", "mongo"]);
    expect(out.files.map((f) => f.name)).toEqual(["Dockerfile", "docker-compose.yml", ".dockerignore"]);
  }

  @Test.it("dockerignore: appends custom patterns (deduped)") ignoreExtra() {
    const di = dockerize({ dockerignore: ["tmp/", "node_modules", "*.local"] }).dockerignore;
    expect(di.includes("tmp/")).toBeTruthy();
    expect(di.includes("*.local")).toBeTruthy();
    // base entry "node_modules" not duplicated
    expect(di.split("\n").filter((l) => l === "node_modules").length).toBe(1);
  }

  @Test.it("outputs: emit only the Dockerfile") onlyDockerfile() {
    const out = dockerize({ outputs: ["dockerfile"] });
    expect(out.files.map((f) => f.name)).toEqual(["Dockerfile"]);
  }

  @Test.it("dockerfileName: custom Dockerfile filename") customName() {
    const out = dockerize({ dockerfileName: "Dockerfile.prod", outputs: ["dockerfile"] });
    expect(out.files[0].name).toBe("Dockerfile.prod");
    expect(out.files[0].kind).toBe("dockerfile");
  }

  @Test.it("plugin: inspect() returns kind=docker with generated files") pluginInspect() {
    const app = Application().get("/health", () => ({ ok: true })).plugin(docker({ port: 4000 }));
    const entry = app.topology().plugins.find((p) => p.name === "docker");
    const info = entry?.info as DockerInspect;
    expect(info.kind).toBe("docker");
    expect(info.dockerfile.includes("EXPOSE 4000")).toBeTruthy();
    expect(info.services).toEqual(["app"]);
  }
}

await TestApplication().addTests(DockerSuite).reporter(new ConsoleReporter()).run();
