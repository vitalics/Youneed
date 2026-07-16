// NestJS (platform-express). Needs legacy decorators + emitDecoratorMetadata —
// the orchestrator runs it via `tsx --tsconfig apps/nest.tsconfig.json`.
import "reflect-metadata";
import { Module, Controller, Get, Header } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { HELLO, JSON_PAYLOAD, PORT } from "./shared.mjs";

@Controller()
class AppController {
  @Get("health")
  health() {
    return { ok: true };
  }

  @Get("text")
  @Header("Content-Type", "text/plain; charset=utf-8")
  text() {
    return HELLO;
  }

  @Get("json")
  json() {
    return JSON_PAYLOAD;
  }
}

@Module({ controllers: [AppController] })
class AppModule {}

const app = await NestFactory.create(AppModule, { logger: false });
await app.listen(PORT, "127.0.0.1");
console.log(`[nest] listening on ${PORT}`);
